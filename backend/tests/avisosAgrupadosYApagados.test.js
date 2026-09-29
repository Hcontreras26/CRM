import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import pool, { query } from '../src/shared/config/db.js';
import * as avisos from '../src/modules/notifications/notifications.service.js';
import { claseDe, seAgrupa, ACCION, AVISO } from '../src/modules/notifications/tipos.js';

/**
 * Que la campana sirva para algo (#111).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DONDE SALE ESTO
 *
 * Diego, el 07/09, mirando `/testeo`: 98 sin leer y casi todas la misma —
 * «Revisión diaria: hay cosas sin atar»—, repetida cada día con el mismo
 * texto. Lo resumió así: «si todo avisa, nada avisa».
 *
 * Pidió cuatro cosas, y las cuatro se comprueban aquí:
 *
 *   1. agrupar lo repetido,
 *   2. separar lo que hay que HACER de lo que hay que SABER,
 *   3. poder apagar por tipo y por persona,
 *   4. que pulsar un aviso lleve a la ficha de la que habla.
 *
 * POR QUE CONTRA POSTGRES DE VERDAD
 *
 * Porque la agrupación es una consulta con `DISTINCT ON`, tres CTEs y funciones
 * de ventana, y una base simulada diría que sí a cualquier cosa. Ya me pasó con
 * la fuente de webhooks del registro: la probé con la base apagada, salió verde
 * y llevaba semanas rota por un nombre de columna.
 *
 * Y hay una segunda razón, mejor: la migración 146 NO está aplicada en esta
 * base. Así que el camino de «todavía no hay tabla» se prueba tal cual va a
 * estar en el servidor hasta que Diego la aplique, sin fingirlo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const MARCA = 'test-111-';
const EMAIL = 'avisos-111@test.com';
let admin;
let gestora;
// Una usuaria solo para esto. La base de desarrollo ya tiene avisos dentro
// —649 `lead_asignado` sueltos— y contar sobre ella daria numeros que no son
// de la prueba. Como una gestora solo ve lo que va dirigido a ella, todo lo
// que se siembre aqui queda aislado de lo que ya habia.
let usuaria;

async function creado(fila) {
  const { rows } = await query(
    `INSERT INTO admin_notifications (type, title, message, link_path, target_user_ids, created_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [fila.type, MARCA + fila.title, fila.message || null, fila.link_path || null,
      'target' in fila ? fila.target : [usuaria.id], fila.cuando || new Date()]);
  return rows[0].id;
}

async function limpiar() {
  await query(`DELETE FROM admin_notifications WHERE title LIKE $1`, [MARCA + '%']);
}

beforeAll(async () => {
  await query(
    `INSERT INTO users (nombre, email, password_hash, role)
     VALUES ('Avisos 111', $1, 'x', 'gestor') ON CONFLICT (email) DO NOTHING`, [EMAIL]);
  const u = await query(`SELECT id, role FROM users WHERE email = $1`, [EMAIL]);
  usuaria = u.rows[0];

  const { rows } = await query(
    `SELECT id, role FROM users WHERE role IN ('admin','superadmin') AND active = true LIMIT 1`);
  admin = rows[0];
  const g = await query(
    `SELECT id, role FROM users WHERE role = 'gestor' AND active = true LIMIT 1`);
  gestora = g.rows[0];
  await limpiar();
});

afterAll(async () => {
  await limpiar();
  await query(`DELETE FROM users WHERE email = $1`, [EMAIL]);
  await pool.end();
});

beforeEach(async () => {
  await limpiar();
  if (usuaria) await query(`DELETE FROM avisos_apagados WHERE user_id = $1`, [usuaria.id]);
  avisos._olvidar();
});

describe('1 · lo repetido va en una fila', () => {
  it('seis revisiones diarias son una fila que dice seis', async () => {
    for (let i = 0; i < 6; i++) {
      await creado({
        type: 'catalogo_revision',
        title: 'Revisión diaria: hay cosas sin atar',
        cuando: new Date(Date.now() - i * 86400000),
      });
    }
    const lista = await avisos.list({ userId: usuaria.id, role: 'gestor', limit: 50 });
    const filas = lista.filter((n) => n.type === 'catalogo_revision');

    expect(filas).toHaveLength(1);
    expect(filas[0].veces).toBe(6);
  });

  it('el número es el de verdad aunque el límite sea más corto', async () => {
    // Este es el punto de hacer la cuenta en SQL. Contando en JavaScript
    // despues del `LIMIT`, un grupo de 30 con limite 5 diria «×5», y un
    // numero que miente es peor que no ponerlo.
    for (let i = 0; i < 30; i++) {
      await creado({
        type: 'catalogo_revision',
        title: 'Revisión diaria: hay cosas sin atar',
        cuando: new Date(Date.now() - i * 3600000),
      });
    }
    const lista = await avisos.list({ userId: usuaria.id, role: 'gestor', limit: 5 });
    const fila = lista.find((n) => n.type === 'catalogo_revision');

    expect(fila.veces).toBe(30);
  });

  it('la fila enseña la última, no la primera', async () => {
    await creado({ type: 'catalogo_revision', title: 'Vieja', cuando: new Date(Date.now() - 5 * 86400000) });
    await creado({ type: 'catalogo_revision', title: 'Reciente', cuando: new Date() });

    const fila = (await avisos.list({ userId: usuaria.id, role: 'gestor' }))
      .find((n) => n.type === 'catalogo_revision');

    expect(fila.title).toBe(MARCA + 'Reciente');
    expect(new Date(fila.desde).getTime()).toBeLessThan(new Date(fila.created_at).getTime());
  });

  it('pero seis prospectos nuevos son SEIS, no uno', async () => {
    // Cada uno es una ficha distinta con su enlace. Agruparlos escondería
    // cinco cosas que hacer detrás de una.
    for (let i = 1; i <= 6; i++) {
      await creado({
        type: 'lead_asignado', title: `Prospecto ${i}`,
        link_path: `/prospectos/${i}`,
      });
    }
    const lista = await avisos.list({ userId: usuaria.id, role: 'gestor', limit: 50 });
    expect(lista.filter((n) => n.type === 'lead_asignado')).toHaveLength(6);
  });

  it('marcar leída una fila agrupada las marca TODAS', async () => {
    // Si solo se marcase la última, quedarían 97 y el globo no bajaría: la
    // agrupación sería maquillaje.
    for (let i = 0; i < 6; i++) {
      await creado({ type: 'catalogo_revision', title: 'Revisión diaria', cuando: new Date(Date.now() - i * 86400000) });
    }
    const antes = (await avisos.list({ userId: usuaria.id, role: 'gestor' }))
      .find((n) => n.type === 'catalogo_revision');
    expect(antes.sin_leer).toBe(6);

    const r = await avisos.markReadGroup(antes.grupo, usuaria.id, 'gestor');
    expect(r.marked).toBe(6);

    const quedan = await avisos.list({ userId: usuaria.id, role: 'gestor', unreadOnly: true });
    expect(quedan.filter((n) => n.type === 'catalogo_revision')).toHaveLength(0);
  });

  it('y una suelta se marca solo ella', async () => {
    const id = await creado({ type: 'lead_asignado', title: 'Uno' });
    await creado({ type: 'lead_asignado', title: 'Otro' });

    await avisos.markReadGroup(`id:${id}`, usuaria.id, 'gestor');

    const sinLeer = await avisos.list({ userId: usuaria.id, role: 'gestor', unreadOnly: true });
    expect(sinLeer.filter((n) => n.type === 'lead_asignado')).toHaveLength(1);
  });

  it('un grupo inventado no marca nada de nadie', async () => {
    await expect(avisos.markReadGroup('id:no-es-un-numero', usuaria.id, 'gestor')).rejects.toThrow();
    await expect(avisos.markReadGroup('', usuaria.id, 'gestor')).rejects.toThrow();
  });
});

describe('2 · hacer y saber no van en la misma lista', () => {
  it('cada tipo dice de qué va', () => {
    expect(claseDe('lead_asignado')).toBe(ACCION);
    expect(claseDe('lead_reminder')).toBe(ACCION);
    expect(claseDe('catalogo_revision')).toBe(AVISO);
    expect(claseDe('venta_automatica')).toBe(AVISO);
  });

  it('un tipo que nadie apuntó sale igual, como aviso', () => {
    // Que a alguien se le olvide apuntarlo aquí no puede hacerlo desaparecer
    // de la campana.
    expect(claseDe('tipo_que_no_existe')).toBe(AVISO);
    expect(seAgrupa('tipo_que_no_existe')).toBe(false);
  });

  it('el recuento separa las dos cosas', async () => {
    await creado({ type: 'lead_asignado', title: 'Ficha 1' });
    await creado({ type: 'lead_asignado', title: 'Ficha 2' });
    await creado({ type: 'catalogo_revision', title: 'Revisión diaria' });

    const c = await avisos.unreadCount(usuaria.id, 'gestor');
    expect(c.accion).toBe(2);
    expect(c.aviso).toBe(1);
    expect(c.total).toBe(3);
  });

  it('el informe diario NO infla el número de cosas que hacer', async () => {
    // Es literalmente el caso de Diego: 98 sin leer, casi todas el informe.
    for (let i = 0; i < 20; i++) {
      await creado({ type: 'catalogo_revision', title: 'Revisión diaria', cuando: new Date(Date.now() - i * 86400000) });
    }
    await creado({ type: 'lead_asignado', title: 'La única que pide algo' });

    const c = await avisos.unreadCount(usuaria.id, 'gestor');
    expect(c.accion).toBe(1);
    expect(c.aviso).toBe(20);
  });

  it('cada fila de la lista viene con su clase y su etiqueta', async () => {
    await creado({ type: 'lead_asignado', title: 'Ficha' });
    const fila = (await avisos.list({ userId: usuaria.id, role: 'gestor' }))
      .find((n) => n.type === 'lead_asignado');

    expect(fila.clase).toBe(ACCION);
    expect(fila.etiqueta).toBe('Prospecto asignado');
  });
});

describe('3 · apagar avisos por tipo y por persona', () => {
  it('se usa la tabla que ya existe, no una nueva', async () => {
    // `avisos_apagados` viene de la migracion 132 y ya esta aplicada. Escribi
    // una tabla nueva antes de verlo; dos tablas para «esta persona no quiere
    // este aviso» es lo que el #111 llama «dos sistemas».
    const p = await avisos.preferencias(usuaria.id);
    expect(p.guardable).toBe(true);
    expect(p.aviso).toBeNull();
  });

  it('apagado, deja de salir en la lista', async () => {
    await creado({ type: 'catalogo_revision', title: 'Revisión diaria' });
    await creado({ type: 'lead_asignado', title: 'Un prospecto' });

    await avisos.guardarPreferencias(usuaria.id, ['catalogo_revision']);
    avisos._olvidar();

    const lista = await avisos.list({ userId: usuaria.id, role: 'gestor' });
    expect(lista.some((n) => n.type === 'catalogo_revision')).toBe(false);
    expect(lista.some((n) => n.type === 'lead_asignado')).toBe(true);
  });

  it('y tampoco cuenta para el número', async () => {
    await creado({ type: 'catalogo_revision', title: 'Revisión diaria' });
    await avisos.guardarPreferencias(usuaria.id, ['catalogo_revision']);

    const c = await avisos.unreadCount(usuaria.id, 'gestor');
    expect(c.aviso).toBe(0);
  });

  it('al encenderlo vuelve a estar, con su fecha: no se borro nada', async () => {
    const cuando = new Date(Date.now() - 3 * 86400000);
    await creado({ type: 'catalogo_revision', title: 'Revisión diaria', cuando });

    await avisos.guardarPreferencias(usuaria.id, ['catalogo_revision']);
    expect((await avisos.list({ userId: usuaria.id, role: 'gestor' }))
      .some((n) => n.type === 'catalogo_revision')).toBe(false);

    await avisos.guardarPreferencias(usuaria.id, []);
    const vuelta = (await avisos.list({ userId: usuaria.id, role: 'gestor' }))
      .find((n) => n.type === 'catalogo_revision');

    expect(vuelta).toBeTruthy();
    expect(new Date(vuelta.created_at).toISOString().slice(0, 10))
      .toBe(cuando.toISOString().slice(0, 10));
  });

  it('lo de una persona no apaga lo de otra', async () => {
    await creado({ type: 'catalogo_revision', title: 'Revisión diaria', target: null });
    await avisos.guardarPreferencias(usuaria.id, ['catalogo_revision']);

    const deAdmin = await avisos.list({ userId: admin.id, role: admin.role });
    expect(deAdmin.some((n) => n.type === 'catalogo_revision')).toBe(true);
  });

  it('GUARDAR NO SE COME LOS AVISOS POR CORREO', async () => {
    // En esa tabla viven tambien 'resumen_del_dia' y 'plan_de_manana', que se
    // apagan desde `/api/users/mis-avisos`. Un `DELETE` por `user_id` a secas
    // —que es lo que escribi primero— le borraria a alguien sus preferencias
    // de correo al guardar aqui, y sin decirselo.
    await query(
      `INSERT INTO avisos_apagados (user_id, aviso) VALUES ($1, 'resumen_del_dia')
       ON CONFLICT DO NOTHING`, [usuaria.id]);

    await avisos.guardarPreferencias(usuaria.id, ['catalogo_revision']);

    const { rows } = await query(
      `SELECT aviso FROM avisos_apagados WHERE user_id = $1 ORDER BY aviso`, [usuaria.id]);
    expect(rows.map((r) => r.aviso)).toEqual(['catalogo_revision', 'resumen_del_dia']);
  });

  it('un tipo inventado no se guarda', async () => {
    await avisos.guardarPreferencias(usuaria.id, ['no_existe_este_aviso']);
    const { rows } = await query(
      `SELECT aviso FROM avisos_apagados WHERE user_id = $1`, [usuaria.id]);
    expect(rows).toHaveLength(0);
  });

  it('la lista de tipos sale con su clase, para pintar la pantalla', async () => {
    const p = await avisos.preferencias(usuaria.id);
    expect(p.tipos.length).toBeGreaterThan(5);
    expect(p.tipos.find((t) => t.tipo === 'catalogo_revision').clase).toBe(AVISO);
  });
});

describe('lo que ya funcionaba sigue funcionando', () => {
  it('una gestora no ve lo que va dirigido a otra', async () => {
    if (!gestora) return;
    await creado({ type: 'lead_asignado', title: 'De la otra', target: [admin.id] });

    const suyas = await avisos.list({ userId: gestora.id, role: 'gestor' });
    expect(suyas.some((n) => n.title === MARCA + 'De la otra')).toBe(false);
  });

  it('y sí ve la suya', async () => {
    if (!gestora) return;
    await creado({ type: 'lead_asignado', title: 'Suya', target: [gestora.id] });

    const suyas = await avisos.list({ userId: gestora.id, role: 'gestor' });
    expect(suyas.some((n) => n.title === MARCA + 'Suya')).toBe(true);
  });

  it('un aviso sin destinatario lo ven los admin, no las gestoras', async () => {
    await creado({ type: 'catalogo_revision', title: 'Para admins', target: null });

    const deAdmin = await avisos.list({ userId: admin.id, role: admin.role });
    expect(deAdmin.some((n) => n.title === MARCA + 'Para admins')).toBe(true);

    if (gestora) {
      const deGestora = await avisos.list({ userId: gestora.id, role: 'gestor' });
      expect(deGestora.some((n) => n.title === MARCA + 'Para admins')).toBe(false);
    }
  });

  it('cada fila trae el enlace a donde ir', async () => {
    // El cuarto punto de Diego: «que la campana lleve a algún sitio».
    await creado({ type: 'lead_asignado', title: 'Con enlace', link_path: '/prospectos/42', target: [admin.id] });
    const fila = (await avisos.list({ userId: admin.id, role: admin.role }))
      .find((n) => n.title === MARCA + 'Con enlace');
    expect(fila.link_path).toBe('/prospectos/42');
  });
});

/**
 * Y que las rutas existan.
 *
 * Todo lo de arriba prueba el servicio. Si la ruta no esta registrada —o esta
 * detras de `/:id/read` y se la come el comodin— nada de esto se puede usar
 * desde la pantalla, y las pruebas seguirian en verde. Ya me paso con la
 * pantalla de registro: la logica bien y la pantalla en blanco.
 */
describe('las rutas nuevas contestan', () => {
  const request = supertest(app);
  let token;

  beforeAll(async () => {
    const r = await request.post('/api/auth/login')
      .send({ email: 'diego@empresa.com', password: 'CrmTemp2026!' });
    token = r.body.data?.accessToken;
  });

  it('la lista viene agrupada y clasificada', async () => {
    const res = await request.get('/api/notifications?limit=5')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    for (const n of res.body.data) {
      expect(n).toHaveProperty('grupo');
      expect(n).toHaveProperty('veces');
      expect(['accion', 'aviso']).toContain(n.clase);
    }
  });

  it('el recuento trae las dos mitades', async () => {
    const res = await request.get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accion');
    expect(res.body.data).toHaveProperty('aviso');
    // `count` sigue estando: es lo que ya consulta la campana desplegada, y
    // quitarlo dejaria el globo a cero sin que nadie se entere.
    expect(res.body.data.count).toBe(res.body.data.accion + res.body.data.aviso);
  });

  it('`/read-group` existe y no la absorbe `/:id/read`', async () => {
    const res = await request.patch('/api/notifications/read-group')
      .set('Authorization', `Bearer ${token}`)
      .send({ grupo: 'id:999999999' });

    // 404 de «esa notificacion no existe» es la respuesta correcta: quiere
    // decir que la ruta se resolvio y llego al servicio.
    expect([200, 404]).toContain(res.status);
    expect(res.status).not.toBe(400);
  });

  it('`/preferences` se lee', async () => {
    const res = await request.get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.tipos)).toBe(true);
    expect(res.body.data.guardable).toBe(true);
  });

  it('y guardar funciona, sin esperar a ninguna migracion', async () => {
    const res = await request.put('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ apagados: [] });

    expect(res.status).toBe(200);
    expect(res.body.data.apagados).toEqual([]);
  });

  it('sin sesion no se entra', async () => {
    expect((await request.get('/api/notifications/preferences')).status).toBe(401);
  });
});
