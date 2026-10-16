import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';

/**
 * Facturas de colaboradores (#202) · la lista de colaboradores, contra la base.
 *
 * Dos empresas (A y B), un campus de cada una y una persona de cada rol. El
 * admin de A solo ve a quien factura a A, y de él solo lo de A; el super admin
 * lo ve todo; gestora y colaborador no entran. Lo borra todo al final.
 *
 *   npm --prefix backend run db:preparar
 *   cd backend && npx vitest run tests/facturasColaboradorLista.test.js
 */

const request = supertest(app);
const MARCA = `FCTEST_${Date.now().toString(36)}`;

const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);
const one = async (sql, params) => (await q(sql, params))[0];

const U = {};
const T = {};
const E = {};       // empresas: A y B
const P = {};       // campus: A y B
const creados = []; // colaboradores, para borrarlos al final

function token(user, projectId) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, roles_extra: [], customRoleId: null, activeProjectId: projectId },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
}

async function crearPersona(clave, role, campus) {
  const u = await one(
    `INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3)
     RETURNING id, nombre, email, role`,
    [`${MARCA} ${clave}`, `${clave}_${MARCA.toLowerCase()}@test.local`, role],
  );
  for (const p of campus) {
    await q('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [u.id, p.id]);
  }
  U[clave] = u;
  T[clave] = token(u, campus[0]?.id ?? P.A.id);
}

const como = (clave) => ({ Authorization: `Bearer ${T[clave]}` });
const API = '/api/facturas-colaborador';

async function alta(clave, body) {
  const res = await request.post(`${API}/colaboradores`).set(como(clave)).send(body);
  if (res.status === 201) creados.push(res.body.data.id);
  return res;
}

beforeAll(async () => {
  for (const k of ['A', 'B']) {
    E[k] = await one(
      `INSERT INTO invoice_issuers (razon_social, nif) VALUES ($1, $2) RETURNING id`,
      [`${MARCA} Empresa ${k}`, `B${k}${Date.now().toString().slice(-7)}`],
    );
    P[k] = await one(
      `INSERT INTO projects (nombre, slug, webhook_api_key, sociedad_emisora_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [`${MARCA} Campus ${k}`, `${MARCA.toLowerCase()}-${k.toLowerCase()}`, `${MARCA}-key-${k}`, E[k].id],
    );
  }
  await crearPersona('super', 'superadmin', []);
  await crearPersona('adminA', 'admin', [P.A]);
  await crearPersona('gestora', 'gestor', [P.A]);
  await crearPersona('colaborador', 'colaborador', []);
});

afterAll(async () => {
  if (creados.length) {
    // Las otras pruebas preparan meses a la vez: las filas que les toquen también se borran.
    await q(`DELETE FROM facturas_colaborador_registro
              WHERE colaborador_id = ANY($1::int[])
                 OR factura_id IN (SELECT id FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[]))`, [creados]);
    await q(`DELETE FROM admin_notifications WHERE type = 'factura_colaborador'
              AND (metadata->>'factura_id')::int IN (SELECT id FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[]))`, [creados]);
    await q('DELETE FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[])', [creados]);
    await q('DELETE FROM colaboradores WHERE id = ANY($1::int[])', [creados]);
  }
  const ids = Object.values(U).map((u) => u.id);
  await q('DELETE FROM user_projects WHERE user_id = ANY($1::int[])', [ids]);
  await q('DELETE FROM users WHERE id = ANY($1::int[])', [ids]);
  await q('DELETE FROM projects WHERE id = ANY($1::int[])', [Object.values(P).map((p) => p.id)]);
  await q('DELETE FROM invoice_issuers WHERE id = ANY($1::int[])', [Object.values(E).map((e) => e.id)]);
  await pool.end();
});

describe('facturas de colaboradores (#202) · quién entra', () => {
  it('una gestora no ve la lista', async () => {
    const res = await request.get(`${API}/colaboradores`).set(como('gestora'));
    expect(res.status).toBe(403);
  });

  it('un colaborador no ve la lista de administración', async () => {
    const res = await request.get(`${API}/colaboradores`).set(como('colaborador'));
    expect(res.status).toBe(403);
  });

  it('sin sesión, 401', async () => {
    const res = await request.get(`${API}/colaboradores`);
    expect(res.status).toBe(401);
  });
});

describe('facturas de colaboradores (#202) · la lista', () => {
  let laura;   // factura a A y a B
  let pedro;   // solo a B

  it('el super admin da de alta a quien factura a dos empresas, y queda en el registro', async () => {
    const res = await alta('super', {
      nombre: `${MARCA} Laura Pérez`, email: ` Laura@Prueba.LOCAL `, area: 'seo',
      empresas: [{ issuer_id: E.A.id, importe_acordado: 600 }, { issuer_id: E.B.id, importe_acordado: 300 }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    laura = res.body.data;
    expect(laura.email).toBe('laura@prueba.local');
    expect(laura.empresas.map((e) => e.issuer_id).sort()).toEqual([E.A.id, E.B.id].sort());

    const reg = await q('SELECT evento, user_id FROM facturas_colaborador_registro WHERE colaborador_id = $1', [laura.id]);
    expect(reg).toEqual([{ evento: 'alta', user_id: U.super.id }]);
  });

  it('sin ninguna empresa no se puede dar de alta', async () => {
    const res = await alta('super', { nombre: `${MARCA} Sin empresa`, email: 'sin@prueba.local', area: 'seo', empresas: [] });
    expect(res.status).toBe(400);
  });

  it('el admin de A ve a Laura, pero de sus empresas solo A', async () => {
    const res = await request.get(`${API}/colaboradores`).set(como('adminA'));
    expect(res.status).toBe(200);
    const ella = res.body.data.find((c) => c.id === laura.id);
    expect(ella).toBeTruthy();
    expect(ella.empresas.map((e) => e.issuer_id)).toEqual([E.A.id]);
    // Y se le avisa antes: también factura a una empresa que este admin no lleva.
    expect(ella.compartido).toBe(true);
    const comoSuper = (await request.get(`${API}/colaboradores/${laura.id}`).set(como('super'))).body.data;
    expect(comoSuper.compartido).toBe(false);
  });

  it('el admin de A no puede dar de alta a nadie en la empresa B', async () => {
    const res = await alta('adminA', {
      nombre: `${MARCA} Pedro`, email: 'pedro@prueba.local', area: 'desarrollo',
      empresas: [{ issuer_id: E.B.id }],
    });
    expect(res.status).toBe(403);
  });

  it('el admin de A no ve a quien solo factura a B, ni por su id', async () => {
    const res = await alta('super', {
      nombre: `${MARCA} Pedro`, email: 'pedro@prueba.local', area: 'desarrollo',
      empresas: [{ issuer_id: E.B.id }],
    });
    expect(res.status).toBe(201);
    pedro = res.body.data;

    const lista = await request.get(`${API}/colaboradores`).set(como('adminA'));
    expect(lista.body.data.some((c) => c.id === pedro.id)).toBe(false);
    expect((await request.get(`${API}/colaboradores/${pedro.id}`).set(como('adminA'))).status).toBe(404);
    expect((await request.patch(`${API}/colaboradores/${pedro.id}`).set(como('adminA')).send({ notas: 'x' })).status).toBe(404);
    expect((await request.get(`${API}/colaboradores?issuerId=${E.B.id}`).set(como('adminA'))).status).toBe(403);
  });

  it('con una empresa en la cabecera, solo quienes le facturan (Diego, 10/10: «son por EMPRESA»)', async () => {
    const deB = await request.get(`${API}/colaboradores?issuerId=${E.B.id}`).set(como('super'));
    expect(deB.status).toBe(200);
    const mios = deB.body.data.filter((c) => c.nombre.startsWith(MARCA));
    expect(mios.map((c) => c.id)).toContain(pedro.id);
    expect(mios.every((c) => c.empresas.some((e) => e.issuer_id === E.B.id))).toBe(true);
    const deA = await request.get(`${API}/colaboradores?issuerId=${E.A.id}`).set(como('super'));
    expect(deA.body.data.some((c) => c.id === pedro.id)).toBe(false);
  });

  it('si el admin de A cambia las empresas de Laura, la B se queda como estaba', async () => {
    const res = await request.patch(`${API}/colaboradores/${laura.id}`).set(como('adminA'))
      .send({ empresas: [{ issuer_id: E.A.id, importe_acordado: 650 }] });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const filas = await q(
      'SELECT issuer_id, importe_acordado::float AS importe FROM colaborador_empresas WHERE colaborador_id = $1 ORDER BY issuer_id',
      [laura.id],
    );
    expect(filas).toEqual([
      { issuer_id: E.A.id, importe: 650 },
      { issuer_id: E.B.id, importe: 300 },
    ].sort((a, b) => a.issuer_id - b.issuer_id));

    const cambio = await one(
      `SELECT detalle FROM facturas_colaborador_registro WHERE colaborador_id = $1 AND evento = 'cambio'`, [laura.id]);
    // Solo la de A (la B no es suya). Desde la segunda parte lleva también cómo cobra.
    expect(cambio.detalle.empresas.despues).toMatchObject([{ issuer_id: E.A.id, importe_acordado: 650 }]);
  });

  it('nadie se queda sin empresa: quitarle la única da error', async () => {
    const solo = await alta('adminA', {
      nombre: `${MARCA} Ana`, email: 'ana@prueba.local', area: 'contenido',
      empresas: [{ issuer_id: E.A.id }],
    });
    expect(solo.status).toBe(201);
    const res = await request.patch(`${API}/colaboradores/${solo.body.data.id}`).set(como('adminA')).send({ empresas: [] });
    expect(res.status).toBe(400);
  });

  it('Laura factura también a B: el admin de A no cambia sus datos ni la da de baja', async () => {
    const correo = await request.patch(`${API}/colaboradores/${laura.id}`).set(como('adminA')).send({ email: 'otra@prueba.local' });
    expect(correo.status).toBe(403);
    expect(correo.body.error).toMatch(/los cambia el super admin/);
    expect((await request.post(`${API}/colaboradores/${laura.id}/baja`).set(como('adminA')).send({ desde: '2026-11' })).status).toBe(403);

    // La pantalla manda la ficha entera: si los datos llegan igual, solo cambia lo de su empresa.
    const ficha = await request.patch(`${API}/colaboradores/${laura.id}`).set(como('adminA')).send({
      nombre: laura.nombre, email: laura.email, area: 'seo', empresas: [{ issuer_id: E.A.id, importe_acordado: 660 }],
    });
    expect(ficha.status, JSON.stringify(ficha.body)).toBe(200);
    expect((await one('SELECT email FROM colaboradores WHERE id = $1', [laura.id])).email).toBe('laura@prueba.local');
  });

  it('el usuario del CRM que se le pone tiene que tener el rol colaborador', async () => {
    const mal = await request.patch(`${API}/colaboradores/${laura.id}`).set(como('super')).send({ user_id: U.gestora.id });
    expect(mal.status).toBe(400);
    // Colaborador solo como rol añadido tampoco: el servidor le daría 403 en «Mi factura».
    await q(`UPDATE users SET roles_extra = ARRAY['colaborador']::user_role[] WHERE id = $1`, [U.gestora.id]);
    expect((await request.patch(`${API}/colaboradores/${laura.id}`).set(como('super')).send({ user_id: U.gestora.id })).status).toBe(400);
    const bien = await request.patch(`${API}/colaboradores/${laura.id}`).set(como('super')).send({ user_id: U.colaborador.id });
    expect(bien.status, JSON.stringify(bien.body)).toBe(200);
    expect(bien.body.data.user_id).toBe(U.colaborador.id);
  });

  it('una baja para un mes que no ha llegado no lo quita todavía; no se repite, y se puede volver', async () => {
    const res = await request.post(`${API}/colaboradores/${laura.id}/baja`).set(como('super')).send({ desde: '2099-01' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.activo).toBe(true);
    expect(res.body.data.baja_desde).toBe('2099-01');

    const otra = await request.post(`${API}/colaboradores/${laura.id}/baja`).set(como('super')).send({ desde: '2099-02' });
    expect(otra.status).toBe(409);

    const vuelve = await request.post(`${API}/colaboradores/${laura.id}/alta`).set(como('super')).send({ desde: '2026-12' });
    expect(vuelve.status, JSON.stringify(vuelve.body)).toBe(200);
    expect(vuelve.body.data).toMatchObject({ activo: true, baja_desde: null, alta_desde: '2026-12' });

    // Y una baja desde un mes ya pasado, sí, en el acto.
    const ya = await request.post(`${API}/colaboradores/${laura.id}/baja`).set(como('super')).send({ desde: '2026-01' });
    expect(ya.body.data.activo).toBe(false);
  });

  it('el historial, al admin de A, sin lo acordado con la empresa B', async () => {
    // Solo los cambios de la ficha. Los otros ficheros de pruebas preparan su mes
    // para TODOS los activos (como la tarea de verdad) y, si coinciden en el tiempo,
    // a Laura le cae una factura de ese mes con su «recordatorio».
    const deLaFicha = (filas) => filas.filter((r) => ['alta', 'baja', 'cambio'].includes(r.evento));
    const reg = await request.get(`${API}/colaboradores/${laura.id}/registro`).set(como('adminA'));
    const ficha = deLaFicha(reg.body.data);
    expect(ficha.map((r) => r.evento)).toEqual(['baja', 'alta', 'baja', 'cambio', 'cambio', 'cambio', 'alta']);
    const alta = ficha[ficha.length - 1];
    expect(alta.detalle.empresas.map((e) => e.issuer_id)).toEqual([E.A.id]);

    const todo = deLaFicha((await request.get(`${API}/colaboradores/${laura.id}/registro`).set(como('super'))).body.data);
    const altaSuper = todo[todo.length - 1];
    expect(altaSuper.detalle.empresas.map((e) => e.issuer_id).sort()).toEqual([E.A.id, E.B.id].sort());
  });

  it('la búsqueda con «%» o «_» busca ese carácter, no cualquier cosa', async () => {
    await alta('super', {
      nombre: `${MARCA} SEO 100% local`, email: 'cien@prueba.local', area: 'seo',
      empresas: [{ issuer_id: E.A.id }],
    });
    const res = await request.get(`${API}/colaboradores?estado=todos&q=${encodeURIComponent('%')}`).set(como('super'));
    expect(res.status).toBe(200);
    const mios = res.body.data.filter((c) => c.nombre.startsWith(MARCA));
    expect(mios.map((c) => c.nombre)).toEqual([`${MARCA} SEO 100% local`]);
  });
});

// Segunda parte (#202, «Añadido 01/10 (tarde)»): cómo cobra de cada empresa.
// Entran en 2030: los meses que preparan los otros ficheros no los alcanzan.
describe('facturas de colaboradores (#202) · cómo cobra cada uno', () => {
  const ficha = (nombre, empresas) => ({
    nombre: `${MARCA} ${nombre}`, email: `${nombre.toLowerCase().replace(/\W/g, '')}_${MARCA.toLowerCase()}@test.local`,
    area: 'seo', alta_desde: '2030-01', empresas,
  });

  it('fijo, por hora y por proyecto, con su IVA e IRPF', async () => {
    const res = await alta('super', ficha('Modalidades', [
      { issuer_id: E.A.id, modalidad: 'fijo', importe_fijo: 600, iva_pct: 21, irpf_pct: 15 },
      { issuer_id: E.B.id, modalidad: 'hora', tarifa_hora: 22, iva_pct: 0, irpf_pct: 0 },
    ]));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const [a, b] = [E.A.id, E.B.id].map((i) => res.body.data.empresas.find((e) => e.issuer_id === i));
    expect(a).toMatchObject({ modalidad: 'fijo', importe_fijo: 600, tarifa_hora: null, iva_pct: 21, irpf_pct: 15 });
    // El 0 vale: «0 % si factura desde fuera».
    expect(b).toMatchObject({ modalidad: 'hora', tarifa_hora: 22, importe_fijo: null, iva_pct: 0, irpf_pct: 0 });
  });

  it('con modalidad, sin IVA o IRPF, o sin su importe o tarifa, no se guarda', async () => {
    const casos = [
      [{ modalidad: 'fijo', importe_fijo: 600, irpf_pct: 15 }, 'IVA'],
      [{ modalidad: 'fijo', importe_fijo: 600, iva_pct: 21 }, 'IRPF'],
      [{ modalidad: 'fijo', iva_pct: 21, irpf_pct: 15 }, 'importe fijo'],
      [{ modalidad: 'hora', iva_pct: 21, irpf_pct: 15 }, 'tarifa'],
      [{ modalidad: 'proyecto', iva_pct: 21, irpf_pct: 15 }, 'tarifa'],
      [{ modalidad: 'mensual', iva_pct: 21, irpf_pct: 15 }, 'Modalidad'],
      [{ modalidad: 'hora', tarifa_hora: 22, iva_pct: 121, irpf_pct: 15 }, 'porcentaje'],
    ];
    for (const [cobra, texto] of casos) {
      const res = await alta('super', ficha('Mal', [{ issuer_id: E.A.id, ...cobra }]));
      expect(res.status, JSON.stringify(cobra)).toBe(400);
      expect(JSON.stringify(res.body), JSON.stringify(cobra)).toContain(texto);
    }
  });

  it('solo se guarda lo de su modalidad, y sin modalidad nada (como en la primera parte)', async () => {
    const res = await alta('super', ficha('Limpia', [
      { issuer_id: E.A.id, modalidad: 'proyecto', importe_fijo: 999, tarifa_hora: 30, iva_pct: 21, irpf_pct: 15 },
      { issuer_id: E.B.id, importe_acordado: 250, importe_fijo: 999, iva_pct: 21 },
    ]));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const [a, b] = [E.A.id, E.B.id].map((i) => res.body.data.empresas.find((e) => e.issuer_id === i));
    expect(a).toMatchObject({ modalidad: 'proyecto', tarifa_hora: 30, importe_fijo: null });
    expect(b).toMatchObject({ modalidad: null, importe_fijo: null, tarifa_hora: null, iva_pct: null, irpf_pct: null, importe_acordado: 250 });
  });

  it('el admin cambia cómo cobra de su empresa, aunque también facture a otra, y queda en el historial', async () => {
    const c = (await alta('super', ficha('Compartida', [
      { issuer_id: E.A.id, modalidad: 'hora', tarifa_hora: 20, iva_pct: 21, irpf_pct: 15 },
      { issuer_id: E.B.id, modalidad: 'fijo', importe_fijo: 300, iva_pct: 21, irpf_pct: 15 },
    ]))).body.data;
    const res = await request.patch(`${API}/colaboradores/${c.id}`).set(como('adminA')).send({
      empresas: [{ issuer_id: E.A.id, modalidad: 'hora', tarifa_hora: 25, iva_pct: 21, irpf_pct: 15 }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // La de B, que no es suya, sigue igual.
    const todas = (await request.get(`${API}/colaboradores/${c.id}`).set(como('super'))).body.data.empresas;
    expect(todas.find((e) => e.issuer_id === E.A.id).tarifa_hora).toBe(25);
    expect(todas.find((e) => e.issuer_id === E.B.id)).toMatchObject({ modalidad: 'fijo', importe_fijo: 300 });

    const reg = (await request.get(`${API}/colaboradores/${c.id}/registro`).set(como('adminA'))).body.data;
    const cambio = reg.find((l) => l.evento === 'cambio');
    expect(cambio.detalle.empresas.antes[0].tarifa_hora).toBe(20);
    expect(cambio.detalle.empresas.despues[0].tarifa_hora).toBe(25);
  });
});
