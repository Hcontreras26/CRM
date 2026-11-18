import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * Equipo comercial: las fugas que encontró el QA del 09/11/2026 (CRM#704 /
 * CRM-ISEIE#415).
 *
 * Una administradora que lleva equipo (la LÍDER) ve lo suyo y lo de sus
 * gestoras, no lo del campus entero. Una administradora sin equipo (ADMIN) lo
 * sigue viendo todo, y una gestora, como siempre. Una prueba por fuga, con
 * las rutas de verdad.
 *
 * GEMELO de CRM-ISEIE: allí estos mismos casos están repartidos entre
 * `equipoComercialFugas.test.js` (PR #418) y `equipoComercialExtras.test.js`
 * (los recortes que el 360 hizo de más y ISEIE copió después). Lo que solo
 * existe en ISEIE (`/users/activity-log`) no está aquí; lo que solo hace el
 * 360 (EQUIPO_PROPIO, LLEVA_EQUIPO, los sin responsable a 0) va marcado.
 *
 * Contra la base LOCAL (tests/setup.js):
 *   npx vitest run tests/equipoComercialFugas.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const { errorHandler } = await import('../src/shared/middleware/errorHandler.js');
const { usuarioObjetivo } = await import('../src/modules/whatsapp/chat.controller.js');
const { alcanceDeLider } = await import('../src/shared/utils/roles.js');
const { olvidarPermisos } = await import('../src/modules/permissions/permissions.service.js');
const MODULOS = ['auth', 'users', 'projects', 'accounting', 'invoices', 'whatsapp', 'permissions',
  'reports', 'proceso', 'convocatorias', 'conversions', 'commissions', 'sales', 'widget', 'asignacion'];
const modulos = await Promise.all(MODULOS.map((m) => import(`../src/modules/${m}/index.js`).then((x) => x.default)));

const app = express();
app.use(express.json());
for (const m of modulos) app.use(m.prefix, m.router);
app.use(errorHandler);
const request = supertest(app);

const MARCA = `EQF${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const one = async (sql, p) => (await q(sql, p))[0];
const ids = { users: [], projects: [], issuers: [], leads: [], ventas: [], gastos: [] };

let EMPRESA; let A; let B;
let SUPER; let LIDER; let ADMIN; let G1; let G2; let GF;
const L = {}; const V = {}; const PAGO = {}; const F = {};

const como = (u) => ({ Authorization: `Bearer ${jwt.sign({ userId: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '10m' })}` });
const pedir = (u, ruta) => request.get(ruta).set(como(u));
const ok = (r) => { expect(r.status, JSON.stringify(r.body)).toBe(200); return r.body.data; };
const idsDe = (lista, campo = 'id') => (lista || []).map((x) => Number(x[campo]));

async function persona(n, role, campus = []) {
  const u = await one(
    `INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, role`,
    [`${MARCA} ${n}`, `${n}@${MARCA.toLowerCase()}.test`, role]);
  ids.users.push(u.id);
  for (const c of campus) await q('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [u.id, c]);
  return u;
}

async function prospecto(clave, responsable, campus = A) {
  const l = await one(
    `INSERT INTO leads (project_id, nombre, email, telefono, responsable_id)
     VALUES ($1, $2, $3, '+34600111222', $4) RETURNING id`,
    [campus, `${MARCA} ${clave}`, `${clave.toLowerCase()}@lead.${MARCA.toLowerCase()}.test`, responsable?.id ?? null]);
  L[clave] = l.id; ids.leads.push(l.id);
  return l.id;
}

// Un prospecto con su venta (500, de su gestora), un cobro de hoy (100) y, si
// se dice, una factura emitida (por un importe distinto de 100: si no, la cola
// daría el cobro por facturado).
async function venta(clave, gestora, { total = 500, factura = null, numero = null } = {}) {
  const leadId = await prospecto(clave, gestora);
  const v = await one(
    `INSERT INTO conversions (lead_id, project_id, producto_contratado, importe_total, importe_pagado,
                              vendedora_id, fecha_conversion)
     VALUES ($1, $2, 'Curso', $3, 100, $4, CURRENT_DATE) RETURNING id`, [leadId, A, total, gestora?.id ?? null]);
  V[clave] = v.id; ids.ventas.push(v.id);
  const p = await one(
    'INSERT INTO conversion_payments (conversion_id, importe, fecha) VALUES ($1, 100, CURRENT_DATE) RETURNING id', [v.id]);
  PAGO[clave] = p.id;
  if (factura != null) {
    const f = await one(
      `INSERT INTO invoices (project_id, ano, cliente_nombre, cliente_nif, cliente_direccion, cliente_ciudad,
                             cliente_cp, cliente_pais, items, base_imponible, total, conversion_id, lead_id,
                             estado, tipo, fecha_emision, serie, numero, codigo)
       VALUES ($1, EXTRACT(YEAR FROM CURRENT_DATE)::int, $2, 'X', 'X', 'X', 'X', 'ES', '[]', $3, $3, $4, $5,
               'emitida', 'normal', CURRENT_DATE, 'ZQ', $6, $7) RETURNING id`,
      [A, `${MARCA} ${clave}`, factura, v.id, leadId, numero, `${MARCA}-${numero}`]);
    F[clave] = f.id;
  }
}

beforeAll(async () => {
  const e = await one('INSERT INTO invoice_issuers (razon_social, nif) VALUES ($1, $2) RETURNING id',
    [`${MARCA} empresa`, `B9${Date.now().toString().slice(-7)}`]);
  ids.issuers.push(e.id); EMPRESA = e.id;
  const campus = async (n) => {
    const p = await one(
      `INSERT INTO projects (nombre, slug, webhook_api_key, sociedad_emisora_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [`${MARCA} ${n}`, `${MARCA.toLowerCase()}-${n}`, `${MARCA}-key-${n}`, EMPRESA]);
    ids.projects.push(p.id); return p.id;
  };
  A = await campus('a'); B = await campus('b');

  SUPER = await persona('super', 'superadmin');
  LIDER = await persona('lider', 'admin', [A, B]);    // lleva a G1 y G2
  ADMIN = await persona('admin', 'admin', [A, B]);    // sin equipo: todo
  G1 = await persona('guno', 'gestor', [A]);
  G2 = await persona('gdos', 'gestor', [B]);
  GF = await persona('gfuera', 'gestor', [A]);        // de fuera del equipo

  await venta('L1', G1, { factura: 120, numero: 1 });
  await venta('LF', GF, { factura: 300, numero: 2 });
  await prospecto('L0', null);                        // sin responsable
  const g = await one(
    `INSERT INTO expenses (project_id, concepto, importe, fecha, categoria)
     VALUES ($1, $2, 50, CURRENT_DATE, 'otros') RETURNING id`, [A, `${MARCA} gasto`]);
  ids.gastos.push(g.id);
  // Una comisión de cada venta para su gestora.
  await q(`INSERT INTO commissions (conversion_id, user_id, importe_base, pct, importe_comision)
           VALUES ($1, $2, 100, 10, 10), ($3, $4, 100, 10, 10)`, [V.L1, G1.id, V.LF, GF.id]);
  await q(`INSERT INTO user_activity_log (user_id, action, details) VALUES ($1, 'login', '{}'), ($2, 'login', '{}')`,
    [G1.id, GF.id]).catch(() => {});

  // El equipo lo pone el super admin, por la ruta de verdad.
  const r = await request.put(`/api/users/${LIDER.id}/equipo-comercial`).set(como(SUPER))
    .send({ gestoraIds: [G1.id, G2.id] });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
}, 60000);

afterAll(async () => {
  const quita = (sql, p) => q(sql, p).catch(() => {});
  await quita('DELETE FROM equipo_comercial WHERE lider_id = ANY($1::int[]) OR gestora_id = ANY($1::int[])', [ids.users]);
  await quita('DELETE FROM permisos_registro WHERE usuario_id = ANY($1::int[]) OR quien_id = ANY($1::int[])', [ids.users]);
  await quita('DELETE FROM user_permission_overrides WHERE user_id = ANY($1::int[])', [ids.users]);
  await quita('DELETE FROM user_activity_log WHERE user_id = ANY($1::int[])', [ids.users]);
  await quita('DELETE FROM asignacion_decisiones WHERE project_id = ANY($1::int[])', [ids.projects]);
  await quita('DELETE FROM widget_pulsaciones WHERE project_id = ANY($1::int[])', [ids.projects]);
  await quita('DELETE FROM invoices WHERE project_id = ANY($1::int[])', [ids.projects]);
  await quita('DELETE FROM invoice_sequences WHERE project_id = ANY($1::int[])', [ids.projects]);
  await quita('DELETE FROM expenses WHERE id = ANY($1::int[])', [ids.gastos]);
  await quita('DELETE FROM commissions WHERE conversion_id = ANY($1::int[])', [ids.ventas]);
  await quita('DELETE FROM conversion_vendedoras WHERE conversion_id = ANY($1::int[])', [ids.ventas]);
  await quita('DELETE FROM lead_interactions WHERE lead_id = ANY($1::int[])', [ids.leads]);
  await quita('DELETE FROM conversion_payments WHERE conversion_id = ANY($1::int[])', [ids.ventas]);
  await quita('DELETE FROM conversions WHERE id = ANY($1::int[])', [ids.ventas]);
  await quita('DELETE FROM leads WHERE id = ANY($1::int[])', [ids.leads]);
  await quita('DELETE FROM user_projects WHERE user_id = ANY($1::int[])', [ids.users]);
  await quita('DELETE FROM users WHERE id = ANY($1::int[])', [ids.users]);
  await quita('DELETE FROM projects WHERE id = ANY($1::int[])', [ids.projects]);
  await quita('DELETE FROM invoice_issuers WHERE id = ANY($1::int[])', [ids.issuers]);
  await pool.end();
}, 60000);

describe('0 · alcanceDeLider', () => {
  it('la líder: ella y sus gestoras; la admin sin equipo, una gestora y el super admin: null', async () => {
    const yo = (u) => ({ userId: u.id, role: u.role });
    expect(await alcanceDeLider(yo(LIDER))).toEqual([LIDER.id, ...[G1.id, G2.id].sort((a, b) => a - b)]);
    expect(await alcanceDeLider(yo(ADMIN))).toBeNull();
    expect(await alcanceDeLider(yo(G1))).toBeNull();
    expect(await alcanceDeLider(yo(SUPER))).toBeNull();
  });
});

describe('1 · «Último lead de cada gestora» (GET /api/projects/:id/ultimo-lead)', () => {
  const ultimo = async (u, ruta = `/api/projects/${A}/ultimo-lead`) => ok(await pedir(u, ruta));

  it('la líder ve a su equipo y no a la de fuera, ni los prospectos sin responsable', async () => {
    const d = await ultimo(LIDER);
    const vistas = idsDe(d.gestoras);
    expect(vistas).not.toContain(GF.id);
    expect(JSON.stringify(d)).not.toContain(`${MARCA} LF`);
    expect(d.sin_responsable).toBe(0);              // solo en el 360
    // Con la empresa arriba («Todos» de esa empresa), igual.
    const empresa = await ultimo(LIDER, `/api/projects/-1/ultimo-lead?issuerId=${EMPRESA}`);
    expect(idsDe(empresa.gestoras)).not.toContain(GF.id);
  });

  it('la admin sin equipo y una gestora, como siempre: también la de fuera', async () => {
    const admin = await ultimo(ADMIN);
    expect(idsDe(admin.gestoras)).toContain(GF.id);
    expect(admin.sin_responsable).toBeGreaterThanOrEqual(1);
    expect(idsDe((await ultimo(G1)).gestoras)).toContain(GF.id);
  });
});

describe('2 · Finanzas › Dashboard (GET /api/accounting/dashboard)', () => {
  const dash = async (u, extra = `projectId=${A}`) =>
    ok(await pedir(u, `/api/accounting/dashboard?from=2000-01-01&to=2999-12-31&${extra}`));

  it('la líder: cobrado, contratado, facturado y por cobrar de su equipo; sin egresos ni balance', async () => {
    const d = await dash(LIDER);
    expect(d.ingresos.total_cobrado).toBe(100);
    expect(d.ingresos.total_facturado).toBe(500);
    expect(d.ingresos.total_emitido).toBe(120);
    expect(idsDe(d.cuentas_por_cobrar)).toEqual([V.L1]);
    expect(d.cuentas_por_cobrar_resumen).toMatchObject({ num: 1, total: 400 });
    expect(d.egresos).toMatchObject({ total: 0, num_egresos: 0, por_categoria: [] });
    expect(d.balance).toBeNull();
    expect(d.solo_administracion).toEqual(['egresos', 'balance']);
    expect(d.trend.egresos).toEqual([]);
  });

  it('con la empresa arriba, igual de recortado', async () => {
    const d = await dash(LIDER, `issuerId=${EMPRESA}`);
    expect(d.ingresos.total_cobrado).toBe(100);
    expect(idsDe(d.cuentas_por_cobrar)).not.toContain(V.LF);
  });

  it('una venta compartida con alguien de fuera cuenta solo la parte de su equipo (como Ventas)', async () => {
    await venta('LS', G1, { total: 200 });
    await q(`INSERT INTO conversion_vendedoras (conversion_id, user_id, porcentaje) VALUES ($1, $2, 50), ($1, $3, 50)`,
      [V.LS, G1.id, GF.id]);
    try {
      const d = await dash(LIDER);
      expect(d.ingresos.total_cobrado).toBe(150);          // 100 + la mitad de 100
      expect(d.ingresos.total_facturado).toBe(600);        // 500 + la mitad de 200
      expect(d.cuentas_por_cobrar_resumen).toMatchObject({ num: 2, total: 450 });
    } finally {
      await q('DELETE FROM conversion_vendedoras WHERE conversion_id = $1', [V.LS]);
      await q('DELETE FROM conversion_payments WHERE conversion_id = $1', [V.LS]);
      await q('DELETE FROM conversions WHERE id = $1', [V.LS]);
    }
  });

  it('la admin sin equipo: todo el campus, con egresos y balance', async () => {
    const d = await dash(ADMIN);
    expect(d.ingresos.total_cobrado).toBe(200);
    expect(d.ingresos.total_emitido).toBe(420);
    expect(idsDe(d.cuentas_por_cobrar).sort()).toEqual([V.L1, V.LF].sort());
    expect(d.egresos.total).toBeGreaterThanOrEqual(50);
    expect(d.balance).toBeCloseTo(200 - d.egresos.total, 2);
    expect(d.solo_administracion).toEqual([]);
  });
});

describe('3 · Facturas: tarjetas y factura por id, como la lista', () => {
  const tarjetas = async (u) => Number(ok(await pedir(u, `/api/invoices/stats?projectId=${A}`)).total_facturado);

  it('las tarjetas: la líder, las de su equipo; una gestora, las suyas; la admin, todas', async () => {
    expect(await tarjetas(LIDER)).toBe(120);
    expect(await tarjetas(G1)).toBe(120);
    expect(await tarjetas(ADMIN)).toBe(420);
  });

  it('la factura de una gestora de fuera por id: 403 a la líder (ficha y PDF) y a otra gestora', async () => {
    expect((await pedir(LIDER, `/api/invoices/${F.LF}`)).status).toBe(403);
    expect((await pedir(LIDER, `/api/invoices/${F.LF}/pdf`)).status).toBe(403);
    expect((await pedir(G1, `/api/invoices/${F.LF}`)).status).toBe(403);
    expect((await pedir(G1, `/api/invoices/${F.LF}/pdf`)).status).toBe(403);
  });

  it('la de su equipo, sí; y la admin y la dueña, la suya', async () => {
    expect((await pedir(LIDER, `/api/invoices/${F.L1}`)).status).toBe(200);
    expect((await pedir(G1, `/api/invoices/${F.L1}`)).status).toBe(200);
    expect((await pedir(ADMIN, `/api/invoices/${F.LF}`)).status).toBe(200);
    expect((await pedir(GF, `/api/invoices/${F.LF}`)).status).toBe(200);
  });
});

describe('4 · Cola de facturación (GET /api/invoices/facturacion-al-dia)', () => {
  const cola = async (u) => ok(await pedir(u, `/api/invoices/facturacion-al-dia?projectId=${A}`));

  it('la líder: los cobros de su equipo y los sin gestora; la admin, todos', async () => {
    await venta('L0V', null);                             // un cobro que no es de nadie
    const d = await cola(LIDER);
    const suyos = idsDe(d.cola, 'payment_id');
    expect(suyos).toEqual(expect.arrayContaining([PAGO.L1, PAGO.L0V]));
    expect(suyos).not.toContain(PAGO.LF);
    expect(d.pagos_sin_factura).toBe(2);
    expect(d.importe_sin_factura).toBe(200);
    expect(idsDe((await cola(ADMIN)).cola, 'payment_id')).toEqual(expect.arrayContaining([PAGO.L1, PAGO.LF, PAGO.L0V]));
  });

  it('con «Emitir desde la cola»: un cobro de fuera, 403 FUERA_DE_TU_EQUIPO; mover la fecha, 403 LLEVA_EQUIPO', async () => {
    await q(`INSERT INTO user_permission_overrides (user_id, resource, action, allowed) VALUES ($1, 'facturas', 'cola', true)
             ON CONFLICT (user_id, resource, action) DO UPDATE SET allowed = true`, [LIDER.id]);
    olvidarPermisos();
    const fuera = await request.post('/api/invoices/cola/generar').set(como(LIDER))
      .send({ projectId: A, paymentId: PAGO.LF, forzar: true });
    expect(fuera.status, JSON.stringify(fuera.body)).toBe(403);
    expect(fuera.body.code).toBe('FUERA_DE_TU_EQUIPO');
    const corte = await request.put('/api/invoices/facturacion-al-dia').set(como(LIDER))
      .send({ projectId: A, alDiaHasta: '2000-01-01' });
    expect(corte.status, JSON.stringify(corte.body)).toBe(403);
    expect(corte.body.code).toBe('LLEVA_EQUIPO');   // solo en el 360
    expect(await q('SELECT 1 FROM invoices WHERE payment_id = $1', [PAGO.LF])).toHaveLength(0);
  });
});

describe('5 · WhatsApp', () => {
  const usuarios = async (u) => idsDe(ok(await pedir(u, '/api/whatsapp/usuarios')));
  const objetivo = (u, usuarioId) => usuarioObjetivo({
    user: { userId: u.id, role: u.role }, query: { usuarioId: String(usuarioId) }, body: {}, ip: '127.0.0.1' });

  it('el selector: la líder, ella y su equipo; la admin sin equipo, todo el campus', async () => {
    const deLaLider = await usuarios(LIDER);
    expect(deLaLider).toEqual(expect.arrayContaining([LIDER.id, G1.id, G2.id]));
    expect(deLaLider).not.toContain(GF.id);
    expect(deLaLider).not.toContain(ADMIN.id);
    expect(await usuarios(ADMIN)).toEqual(expect.arrayContaining([G1.id, G2.id, GF.id, LIDER.id]));
  });

  it('la sesión de una gestora de fuera: 403 FUERA_DE_TU_EQUIPO (función y ruta); la admin, sí', async () => {
    await expect(objetivo(LIDER, GF.id)).rejects.toMatchObject({ statusCode: 403, code: 'FUERA_DE_TU_EQUIPO' });
    const r = await request.get(`/api/whatsapp/chats?usuarioId=${GF.id}`).set(como(LIDER));
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('FUERA_DE_TU_EQUIPO');
    // A las de su equipo no se las corta por el equipo (lo que diga su WhatsApp, aparte).
    const dentro = await objetivo(LIDER, G1.id).catch((e) => e);
    expect(dentro?.code).not.toBe('FUERA_DE_TU_EQUIPO');
    const admin = await objetivo(ADMIN, GF.id).catch((e) => e);
    expect(admin?.code).not.toBe('FUERA_DE_TU_EQUIPO');
  });

  it('la actividad por persona (GET /api/whatsapp/actividad): la líder no ve la fila de la de fuera', async () => {
    const d = ok(await pedir(LIDER, `/api/whatsapp/actividad?projectId=${A}`));
    expect(idsDe(d.filas)).not.toContain(GF.id);
    expect(ok(await pedir(ADMIN, `/api/whatsapp/actividad?projectId=${A}`))).toHaveProperty('filas');
  });
});

describe('6 · La pantalla: /auth/me y los desplegables de gestora', () => {
  const me = async (u) => {
    const d = ok(await pedir(u, '/api/auth/me'));
    return { lleva_equipo: d.user.lleva_equipo, alcance_comercial: d.alcance_comercial };
  };
  const lista = async (u, extra = '') => idsDe(ok(await pedir(u, `/api/users?limit=100&projectId=${A}${extra}`)));

  it('/auth/me: la líder lleva equipo y dice su alcance; la admin sin equipo y una gestora, no', async () => {
    const lider = await me(LIDER);
    expect(lider.lleva_equipo).toBe(true);
    expect([...lider.alcance_comercial].sort()).toEqual([LIDER.id, G1.id, G2.id].sort());
    for (const u of [ADMIN, G1]) expect(await me(u)).toMatchObject({ lleva_equipo: false, alcance_comercial: null });
  });

  it('GET /api/users?alcance=comercial: la líder, ella y su equipo; la admin, todo; sin el parámetro, como siempre', async () => {
    const deLaLider = await lista(LIDER, '&alcance=comercial');
    expect(deLaLider).toContain(G1.id);
    expect(deLaLider).not.toContain(GF.id);
    expect(deLaLider).not.toContain(ADMIN.id);
    expect(await lista(ADMIN, '&alcance=comercial')).toEqual(expect.arrayContaining([GF.id, LIDER.id]));
    expect(await lista(LIDER)).toEqual(expect.arrayContaining([GF.id, ADMIN.id]));
  });

  it('un valor desconocido de alcance: 400', async () => {
    expect((await pedir(LIDER, '/api/users?alcance=todo')).status).toBe(400);
  });
});

describe('7 · Repartir una venta (GET/PUT /api/conversions/:id/reparto)', () => {
  const candidatas = async (u) => idsDe(ok(await pedir(u, `/api/conversions/${V.L1}/reparto`)).candidatas);

  it('la líder: las candidatas son ella y su equipo; la admin, todo el campus', async () => {
    const deLaLider = await candidatas(LIDER);
    expect(deLaLider).toContain(G1.id);
    expect(deLaLider).not.toContain(GF.id);
    expect(await candidatas(ADMIN)).toContain(GF.id);
  });

  it('la líder no le da parte a una de fuera: 403 FUERA_DE_TU_EQUIPO y no se guarda', async () => {
    const r = await request.put(`/api/conversions/${V.L1}/reparto`).set(como(LIDER))
      .send({ partes: [{ user_id: G1.id, porcentaje: 50 }, { user_id: GF.id, porcentaje: 50 }] });
    expect(r.status, JSON.stringify(r.body)).toBe(403);
    expect(r.body.code).toBe('FUERA_DE_TU_EQUIPO');
    expect(await q('SELECT 1 FROM conversion_vendedoras WHERE conversion_id = $1', [V.L1])).toHaveLength(0);
  });
});

describe('8 · Comisiones (GET /api/commissions y /stats)', () => {
  const comisiones = async (u, extra = '') => idsDe(ok(await pedir(u, `/api/commissions?projectId=${A}${extra}`)), 'user_id');

  it('la líder, las de su equipo (pedir a una de fuera no ensancha nada); la admin, todas', async () => {
    expect(await comisiones(LIDER)).toEqual([G1.id]);
    expect(await comisiones(LIDER, `&userId=${GF.id}`)).toEqual([G1.id]);
    expect((await comisiones(ADMIN)).sort()).toEqual([G1.id, GF.id].sort());
  });

  it('los totales: la líder, los de su equipo; la admin, los de todas', async () => {
    const t = async (u) => Number(ok(await pedir(u, `/api/commissions/stats?projectId=${A}`)).total);
    expect(await t(LIDER)).toBe(10);
    expect(await t(ADMIN)).toBe(20);
  });
});
describe('9 · Informes', () => {
  // Con el rango puesto: por defecto es «este mes» en hora local, y la base
  // puede ir ya por el día siguiente (UTC).
  const puesto = (u, extra = '') => pedir(u, `/api/informes/mi-puesto?projectId=${A}&from=2000-01-01&to=2999-12-31${extra}`);

  it('«mi puesto»: el de una gestora de fuera, 403; el de una de su equipo, sí', async () => {
    const r = await puesto(LIDER, `&gestoraId=${GF.id}`);
    expect(r.status, JSON.stringify(r.body)).toBe(403);
    expect(r.body.code).toBe('FUERA_DE_TU_EQUIPO');
    expect((await puesto(LIDER, `&gestoraId=${G1.id}`)).status).toBe(200);
  });

  it('«mi puesto»: la tabla de la líder, solo su equipo y sin los totales del campus; la de la admin, todas', async () => {
    const deLaLider = ok(await puesto(LIDER));
    const filas = idsDe(deLaLider.tabla, 'user_id');
    expect(filas).not.toContain(GF.id);
    expect(deLaLider.total).toBeNull();
    expect(deLaLider.sin_gestora).toBeNull();
    const deLaAdmin = ok(await puesto(ADMIN));
    expect(idsDe(deLaAdmin.tabla, 'user_id')).toEqual(expect.arrayContaining([G1.id, GF.id]));
  });

  it('overview: el reparto por gestora, solo su equipo', async () => {
    const nombres = (d) => (d.leads_por_gestor || []).map((g) => g.gestor);
    const deLaLider = nombres(ok(await pedir(LIDER, `/api/informes/overview?projectId=${A}`)));
    expect(deLaLider).toContain(`${MARCA} guno`);
    expect(deLaLider).not.toContain(`${MARCA} gfuera`);
    expect(nombres(ok(await pedir(ADMIN, `/api/informes/overview?projectId=${A}`)))).toContain(`${MARCA} gfuera`);
  });

  it('ventas sin formación (GET /api/ventas/sin-formacion): la líder, las de su equipo', async () => {
    const ventas = async (u) => idsDe(ok(await pedir(u, `/api/ventas/sin-formacion?projectId=${A}`)).filas);
    const deLaLider = await ventas(LIDER);
    expect(deLaLider).toContain(V.L1);
    expect(deLaLider).not.toContain(V.LF);
    expect(await ventas(ADMIN)).toEqual(expect.arrayContaining([V.L1, V.LF]));
  });
});

describe('9b · Aviso de cobros sin factura, pulsaciones del widget y decisiones de Make', () => {
  const permitir = async (u, resource, action) => {
    await q(`INSERT INTO user_permission_overrides (user_id, resource, action, allowed) VALUES ($1, $2, $3, true)
             ON CONFLICT (user_id, resource, action) DO UPDATE SET allowed = true`, [u.id, resource, action]);
    olvidarPermisos();
  };

  it('informes/aviso-sin-factura: la líder, los cobros sin factura de su equipo; la admin, todos', async () => {
    await venta('LN1', G1);
    await venta('LNF', GF);
    const aviso = async (u) => idsDe(ok(await pedir(u,
      `/api/informes/aviso-sin-factura?projectId=${A}&from=2000-01-01&to=2999-12-31`)).detalle);
    const deLaLider = await aviso(LIDER);
    expect(deLaLider).toContain(V.LN1);
    expect(deLaLider).not.toContain(V.LNF);
    expect(await aviso(ADMIN)).toEqual(expect.arrayContaining([V.LN1, V.LNF]));
  });

  it('widget/pulsaciones: por gestora, la líder solo ve a su equipo', async () => {
    await q('INSERT INTO widget_pulsaciones (project_id, user_id, pagina) VALUES ($1, $2, $4), ($1, $3, $4)',
      [A, G1.id, GF.id, `${MARCA}-pagina`]);
    await permitir(LIDER, 'widget', 'view');
    await permitir(ADMIN, 'widget', 'view');
    const porGestora = async (u) => idsDe(ok(await pedir(u,
      `/api/widget/pulsaciones?projectId=${A}&from=2000-01-01&to=2999-12-31`)).porGestora);
    const deLaLider = await porGestora(LIDER);
    expect(deLaLider).toContain(G1.id);
    expect(deLaLider).not.toContain(GF.id);
    expect(await porGestora(ADMIN)).toEqual(expect.arrayContaining([G1.id, GF.id]));
  });

  it('asignacion/decisiones: la líder, las de su equipo; reenviar una de fuera, 403', async () => {
    const dec = async (uid, gestora) => (await one(
      `INSERT INTO asignacion_decisiones (project_id, uid, escenario, responsable_id, lead_id, datos, estado)
       VALUES ($1, $2, 1, $3, $4, '{}'::jsonb, 'fallido') RETURNING id`,
      [A, `${MARCA}-${uid}`, gestora.id, gestora === G1 ? L.L1 : L.LF])).id;
    await dec('d1', G1);
    const fuera = await dec('df', GF);
    for (const u of [LIDER, ADMIN]) {
      await permitir(u, 'webhooks_salientes', 'view');
      await permitir(u, 'webhooks_salientes', 'edit');
    }
    const deQuien = async (u) => idsDe(ok(await pedir(u, `/api/asignacion/decisiones?project_id=${A}`)), 'responsable_id');
    const deLaLider = await deQuien(LIDER);
    expect(deLaLider).toContain(G1.id);
    expect(deLaLider).not.toContain(GF.id);
    expect(await deQuien(ADMIN)).toEqual(expect.arrayContaining([G1.id, GF.id]));
    const r = await request.post(`/api/asignacion/decisiones/${fuera}/reenviar`).set(como(LIDER));
    expect(r.status, JSON.stringify(r.body)).toBe(403);
  });
});

describe('10 · Proceso y convocatorias de un prospecto por id', () => {
  it('uno de fuera: 403 a la líder y a otra gestora; el suyo y la admin, sí', async () => {
    expect((await pedir(LIDER, `/api/proceso/lead/${L.LF}`)).status).toBe(403);
    expect((await pedir(LIDER, `/api/convocatorias/lead/${L.LF}`)).status).toBe(403);
    expect((await pedir(G1, `/api/proceso/lead/${L.LF}`)).status).toBe(403);
    expect((await pedir(LIDER, `/api/proceso/lead/${L.L1}`)).status).not.toBe(403);
    expect((await pedir(ADMIN, `/api/proceso/lead/${L.LF}`)).status).not.toBe(403);
  });
});

describe('11 · Sin escalada', () => {
  const equipoDeLaLider = async () => (await q(
    'SELECT gestora_id FROM equipo_comercial WHERE lider_id = $1 ORDER BY gestora_id', [LIDER.id])).map((f) => f.gestora_id);
  const excepcionDe = (u) => q(
    `SELECT 1 FROM user_permission_overrides WHERE user_id = $1 AND resource = 'equipos' AND action = 'gestionar'`, [u.id]);

  it('no se da «equipos.gestionar» a sí misma por excepción: 403', async () => {
    const r = await request.put(`/api/permissions/personas/${LIDER.id}/excepciones`).set(como(LIDER))
      .send({ cambios: { 'equipos.gestionar': true } });
    expect(r.status, JSON.stringify(r.body)).toBe(403);
    expect(await excepcionDe(LIDER)).toHaveLength(0);
  });

  it('ni a una gestora suya, por la ficha (403 NO_LO_TIENES) ni por la clave', async () => {
    const r = await request.put(`/api/permissions/personas/${G1.id}/excepciones`).set(como(LIDER))
      .send({ cambios: { 'equipos.gestionar': true } });
    expect(r.status, JSON.stringify(r.body)).toBe(403);
    expect(r.body.code).toBe('NO_LO_TIENES');
    const c = await request.put(`/api/permissions/claves/equipos.gestionar/personas/${G1.id}`).set(como(LIDER))
      .send({ permitido: true });
    expect([400, 403]).toContain(c.status);
    expect(await excepcionDe(G1)).toHaveLength(0);
  });

  it('no cambia su propio equipo; ni aunque le den «equipos.gestionar» (403 EQUIPO_PROPIO)', async () => {
    const antes = await equipoDeLaLider();
    const sin = await request.put(`/api/users/${LIDER.id}/equipo-comercial`).set(como(LIDER))
      .send({ gestoraIds: [G1.id, G2.id, GF.id] });
    expect(sin.status).toBe(403);
    await q(`INSERT INTO user_permission_overrides (user_id, resource, action, allowed) VALUES ($1, 'equipos', 'gestionar', true)
             ON CONFLICT (user_id, resource, action) DO UPDATE SET allowed = true`, [LIDER.id]);
    olvidarPermisos();
    try {
      const con = await request.put(`/api/users/${LIDER.id}/equipo-comercial`).set(como(LIDER))
        .send({ gestoraIds: [G1.id, G2.id, GF.id] });
      expect(con.status, JSON.stringify(con.body)).toBe(403);
      expect(con.body.code).toBe('EQUIPO_PROPIO'); // solo en el 360
    } finally {
      await q(`DELETE FROM user_permission_overrides WHERE user_id = $1 AND resource = 'equipos'`, [LIDER.id]);
      olvidarPermisos();
    }
    expect(await equipoDeLaLider()).toEqual(antes);
  });

  it('ni se sube el rol a super admin o a soporte', async () => {
    const r = await request.patch(`/api/users/${LIDER.id}`).set(como(LIDER)).send({ role: 'superadmin' });
    expect([400, 403], JSON.stringify(r.body)).toContain(r.status);
    const s = await request.patch(`/api/users/${LIDER.id}`).set(como(LIDER)).send({ roles_extra: ['soporte'] });
    expect(s.status, JSON.stringify(s.body)).toBe(403);
    const u = await one('SELECT role::text AS role, roles_extra::text[] AS extra FROM users WHERE id = $1', [LIDER.id]);
    expect(u.role).toBe('admin');
    expect(u.extra || []).not.toContain('soporte');
  });
});

describe('12 · «Emitir hasta» (POST /api/invoices/cola/emitir-hasta)', () => {
  it('emite la cola ENTERA del campus: a la líder, 403 FUERA_DE_TU_EQUIPO y no se emite nada', async () => {
    const r = await request.post('/api/invoices/cola/emitir-hasta').set(como(LIDER))
      .send({ projectId: A, hasta: '2999-12-31' });
    expect(r.status, JSON.stringify(r.body)).toBe(403);
    expect(r.body.code).toBe('FUERA_DE_TU_EQUIPO');
    expect(await q('SELECT 1 FROM invoices WHERE payment_id = ANY($1::int[])', [[PAGO.L1, PAGO.LF, PAGO.L0V]])).toHaveLength(0);
  });
});
