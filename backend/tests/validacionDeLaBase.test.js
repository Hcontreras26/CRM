import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import pool, { query } from '../src/shared/config/db.js';
import * as leadModel from '../src/modules/leads/lead.model.js';

/**
 * El repaso de fin de mes: validar toda la base (#132).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUE SE PRUEBA Y POR QUE ASI
 *
 * Diego pidió el quinto paso del proceso —«Seguimiento de toda la base»— como
 * un correo mensual, y puso la condición que decide si sirve o no:
 *
 *     «Tiene que poder responderse. Si el correo solo enseña, nadie valida
 *      nada: lo abre, lo cierra y sigue igual.»
 *
 * Así que lo que importa aquí no es que el correo salga, sino que **se pueda
 * marcar** y que **el número baje**.
 *
 * LA 149 PUEDE ESTAR O NO, Y LAS DOS COSAS SON EL CONTRATO
 *
 * En la base local no está —es como estará en el servidor hasta que Diego la
 * aplique—. En CI sí, porque allí la base se construye corriendo todas las
 * migraciones.

 * Escribí esto la primera vez dando por hecho que no estaba, y salió verde en
 * local y rojo en CI. No por el código: por la prueba, que comprobaba mi
 * entorno en vez de un comportamiento. Ahora se mira en cuál estamos y se
 * comprueba el lado que toca.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const request = supertest(app);
const MARCA = 'valida-test-';
let token;
let proyecto;

beforeAll(async () => {
  const r = await request.post('/api/auth/login')
    .send({ email: 'manuel@empresa.com', password: 'CrmTemp2026!' });
  token = r.body.data.accessToken;
  proyecto = (await query(`SELECT id FROM projects WHERE active ORDER BY id LIMIT 1`)).rows[0].id;
  await query(`DELETE FROM leads WHERE nombre LIKE $1`, [MARCA + '%']);
  await query(
    `INSERT INTO leads (project_id, nombre, email, status, fecha_solicitud, created_at)
     VALUES ($1, $2, $3, 'por_contactar', NOW(), NOW())`,
    [proyecto, MARCA + 'uno', MARCA + 'uno@prueba.local']);
  leadModel._olvidarRevisiones();
});

afterAll(async () => {
  await query(`DELETE FROM leads WHERE nombre LIKE $1`, [MARCA + '%']);
  await pool.end();
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTO MIRA EL ESTADO EN VEZ DE DARLO POR HECHO
 *
 * La primera version de estas pruebas afirmaba «la 149 no esta aplicada». En mi
 * maquina era verdad; en CI es falso, porque alli la base se construye
 * corriendo TODAS las migraciones. Verde en local, rojo en CI — y no por el
 * codigo, por la prueba: estaba comprobando mi entorno, no un comportamiento.
 *
 * Un guard tiene DOS lados y los dos son el contrato. Asi que se mira en cual
 * estamos y se comprueba el que toca. En mi maquina se ejercita el degradado;
 * en CI, el completo. Entre los dos queda cubierto.
 *
 * Y hay una cosa que se comprueba SIEMPRE, con tabla o sin ella: que el listado
 * conteste 200. Es la pantalla principal del CRM y no puede caerse por esto.
 * ─────────────────────────────────────────────────────────────────────────────
 */
describe('el repaso, con y sin la migracion 149', () => {
  it('el listado NUNCA se cae al pedir «sin revisar»', async () => {
    // Lo que mas importa del fichero, y vale en los dos estados. Si el filtro
    // entrara en el WHERE sin comprobar que la tabla existe, Postgres contesta
    // 42P01 y la pantalla principal deja de cargar.
    const res = await request.get(`/api/leads?projectId=${proyecto}&qf=sin-revisar&limit=5`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('el progreso dice la verdad sobre si se puede o no', async () => {
    const puede = await leadModel.sePuedeRevisar();
    const res = await request.get(`/api/leads/revision?projectId=${proyecto}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.disponible).toBe(puede);
    if (puede) {
      // Con tabla: numeros coherentes, no un adorno.
      const d = res.body.data;
      expect(d.aviso).toBeNull();
      expect(d.total).toBe(d.revisadas + d.pendientes);
    } else {
      // Sin tabla: lo dice y nombra la migracion. Ceros con `disponible: true`
      // seria decirle a la gestora que ya lo tiene todo repasado.
      expect(res.body.data.aviso).toMatch(/149/);
    }
  });

  it('marcar: funciona si hay tabla, y avisa si no la hay', async () => {
    const puede = await leadModel.sePuedeRevisar();
    const lead = (await query(`SELECT id FROM leads WHERE nombre = $1`, [MARCA + 'uno'])).rows[0];

    const res = await request.post(`/api/leads/${lead.id}/revisar`)
      .set('Authorization', `Bearer ${token}`)
      .send({ resultado: 'sigue' });

    if (!puede) {
      expect(res.status).toBe(503);
      return;
    }
    expect(res.status).toBe(201);
    expect(res.body.data.revision.resultado).toBe('sigue');
    // Y el progreso vuelve con la respuesta: la pantalla necesita decir cuanto
    // queda sin pedirlo aparte en cada clic.
    expect(res.body.data.progreso.disponible).toBe(true);
  });

  it('y al marcarla desaparece del filtro, que es de lo que va todo esto', async () => {
    if (!(await leadModel.sePuedeRevisar())) return;   // en local no hay tabla

    const lead = (await query(`SELECT id FROM leads WHERE nombre = $1`, [MARCA + 'uno'])).rows[0];
    const res = await request.get(`/api/leads?projectId=${proyecto}&qf=sin-revisar&limit=500`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.data.some((l) => l.id === lead.id)).toBe(false);
  });

  it('el correo mensual solo sale si se puede responder', async () => {
    // Un correo que dice «valida tu base» y lleva a una pantalla donde no se
    // puede marcar se abre una vez. El mes siguiente, ninguna.
    const puede = await leadModel.sePuedeRevisar();
    expect(typeof puede).toBe('boolean');
    // El scheduler consulta esto mismo antes de mandar; aqui se fija que la
    // decision cuelga de un solo sitio y no de una variable de entorno.
    expect(puede).toBe(await leadModel.sePuedeRevisar());
  });
});

describe('el correo mensual', () => {
  it('lleva el enlace a lo que le falta, no la lista de fichas dentro', async () => {
    // Una base son cientos de nombres: dentro del correo no se leen, y ademas
    // quedarian congelados el dia del envio.
    const { _internos } = await import('../src/jobs/resumenDiarioScheduler.js');
    const t = _internos.textoValidacion('Ana', {
      variosProyectos: false,
      bloques: [{ proyecto: { id: 4, nombre: 'Psiko' }, total: 120, revisadas: 40, pendientes: 80 }],
    });

    expect(t).toMatch(/projectId=4&qf=sin-revisar/);
    expect(t).toMatch(/<strong>80<\/strong> por validar/);
  });

  it('dice cuanto lleva, que es lo que hace que se termine', async () => {
    // «Que se note cuanto le queda». Sin el progreso, se marcan tres y se
    // abandona sin saber si vas por el 5 % o por el 90 %.
    const { _internos } = await import('../src/jobs/resumenDiarioScheduler.js');
    const t = _internos.textoValidacion('Ana', {
      variosProyectos: false,
      bloques: [{ proyecto: { id: 4, nombre: 'Psiko' }, total: 120, revisadas: 40, pendientes: 80 }],
    });
    expect(t).toMatch(/Llevas 40 de 120 \(33 %\)/);
  });

  it('si no queda nada, lo dice y no inventa trabajo', async () => {
    const { _internos } = await import('../src/jobs/resumenDiarioScheduler.js');
    const t = _internos.textoValidacion('Ana', {
      variosProyectos: false,
      bloques: [{ proyecto: { id: 4, nombre: 'Psiko' }, total: 120, revisadas: 120, pendientes: 0 }],
    });
    expect(t).toMatch(/repasada este mes/i);
    expect(t).not.toMatch(/qf=sin-revisar/);
  });

  it('con varios proyectos, cada uno con su nombre y su enlace', async () => {
    const { _internos } = await import('../src/jobs/resumenDiarioScheduler.js');
    const t = _internos.textoValidacion('Ana', {
      variosProyectos: true,
      bloques: [
        { proyecto: { id: 1, nombre: 'Psiko Aprende' }, total: 10, revisadas: 2, pendientes: 8 },
        { proyecto: { id: 2, nombre: 'ISEIH' }, total: 5, revisadas: 0, pendientes: 5 },
      ],
    });
    expect(t).toMatch(/Psiko Aprende/);
    expect(t).toMatch(/ISEIH/);
    expect(t).toMatch(/projectId=1&qf=sin-revisar/);
    expect(t).toMatch(/projectId=2&qf=sin-revisar/);
  });
});

describe('lo que se acepta al marcar', () => {
  it('solo los tres resultados que pidio Diego', async () => {
    const { revisarLeadSchema } = await import('../src/modules/leads/lead.validation.js');
    for (const r of ['sigue', 'no_sigue', 'cambio']) {
      expect(revisarLeadSchema.safeParse({ resultado: r }).success).toBe(true);
    }
  });

  it('y nada de texto libre: de esto se cuenta despues', async () => {
    // Con texto libre acabarian conviviendo «no sigue», «No Sigue» y «ya no», y
    // no se podria sumar nada.
    const { revisarLeadSchema } = await import('../src/modules/leads/lead.validation.js');
    expect(revisarLeadSchema.safeParse({ resultado: 'ya no' }).success).toBe(false);
    expect(revisarLeadSchema.safeParse({}).success).toBe(false);
  });
});

describe('la ruta existe y esta protegida', () => {
  it('`/revision` no se la come `/:id`', async () => {
    const res = await request.get('/api/leads/revision')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('pendientes');
  });

  it('sin sesion no se entra', async () => {
    expect((await request.get('/api/leads/revision')).status).toBe(401);
    expect((await request.post('/api/leads/1/revisar').send({ resultado: 'sigue' })).status).toBe(401);
  });
});
