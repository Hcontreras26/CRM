import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * CRM#1034 · Eliminar una factura EMITIDA por error.
 *
 * Norma de Diego (19/11/2026): anular una factura es su abono; borrarla, solo si
 * se emitió por error. Con su permiso (`facturas.eliminar_por_error`), su motivo,
 * y solo si no se ha enviado, no tiene cobro y es la última de su serie. Si no,
 * 409 NO_SE_PUEDE_ELIMINAR diciendo que se anule. Queda en el Registro.
 *
 *   npx vitest run tests/eliminarPorError1034.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const { default: modulo } = await import('../src/modules/invoices/index.js');
const { errorHandler } = await import('../src/shared/middleware/errorHandler.js');
const { olvidarPermisos } = await import('../src/modules/permissions/permissions.service.js');
const { motivoParaNoEliminarPorError } = await import('../src/modules/invoices/invoices.model.js');

const app = express();
app.use(express.json());
app.use(modulo.prefix, modulo.router);
app.use(errorHandler);
const request = supertest(app);

const MARCA = `EE1034${Date.now().toString(36)}`;
const SERIE = `D${Date.now().toString(36).slice(-6)}`;
const ANO = new Date().getFullYear();
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const one = async (sql, p) => (await q(sql, p))[0];
const ids = { users: [], projects: [] };
let P; let ADMIN; let GESTORA;

const como = (u) => ({ Authorization: `Bearer ${jwt.sign({ userId: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '10m' })}` });
const factura = (id) => one('SELECT * FROM invoices WHERE id = $1', [id]);
const eliminar = (id, u, body = { motivo: 'Duplicada por error' }) =>
  request.post(`/api/invoices/${id}/eliminar-por-error`).set(como(u)).send(body);

async function nueva({ numero, estado = 'emitida', sentAt = null, fechaPago = null, tipo = 'normal', rectificaId = null }) {
  const r = await one(
    `INSERT INTO invoices (project_id, ano, serie, numero, codigo, tipo, estado, fecha_emision, sent_at, fecha_pago,
                           cliente_nombre, cliente_nif, cliente_direccion, cliente_ciudad, cliente_cp, cliente_pais,
                           items, base_imponible, iva_pct, iva_importe, total, rectifica_id, motivo_rectificacion)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE, $8, $9, $10, 'X1234567L', 'Calle 1', 'Madrid', '28001', 'España',
             '[{"descripcion":"Curso","cantidad":1,"precio_unitario":100}]'::jsonb, 100, 21, 21, 121, $11, $12)
     RETURNING id`,
    [P, ANO, SERIE, numero, `${SERIE}-${ANO}/${String(numero).padStart(4, '0')}`, tipo, estado, sentAt, fechaPago,
     `${MARCA} Cliente`, rectificaId, rectificaId ? 'Abono de prueba' : null]);
  return r.id;
}

async function conPermiso(user, permitido, fn) {
  await q(`INSERT INTO user_permission_overrides (user_id, resource, action, allowed) VALUES ($1, 'facturas', 'eliminar_por_error', $2)
           ON CONFLICT (user_id, resource, action) DO UPDATE SET allowed = $2`, [user.id, permitido]);
  olvidarPermisos();
  try { await fn(); } finally {
    await q(`DELETE FROM user_permission_overrides WHERE user_id = $1 AND resource = 'facturas' AND action = 'eliminar_por_error'`, [user.id]);
    olvidarPermisos();
  }
}

beforeAll(async () => {
  P = (await one(
    `INSERT INTO projects (nombre, slug, webhook_api_key, factura_serie_default) VALUES ($1, $2, $3, $4) RETURNING id`,
    [`${MARCA} campus`, `${MARCA.toLowerCase()}-a`, `${MARCA}-k`, SERIE])).id;
  ids.projects.push(P);
  const persona = async (n, role) => {
    const u = await one(`INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, role`,
      [`${MARCA} ${n}`, `${n}@${MARCA.toLowerCase()}.test`, role]);
    ids.users.push(u.id);
    await q('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [u.id, P]);
    return u;
  };
  ADMIN = await persona('admin', 'admin');
  GESTORA = await persona('gestora', 'gestor');
  await q(`INSERT INTO invoice_sequences (project_id, ano, serie, ultimo_numero) VALUES ($1, $2, $3, 0)`, [P, ANO, SERIE]);
}, 60000);

afterAll(async () => {
  for (const [sql, v] of [
    ['DELETE FROM user_activity_log WHERE user_id = ANY($1::int[])', ids.users],
    ['DELETE FROM user_permission_overrides WHERE user_id = ANY($1::int[])', ids.users],
    ['DELETE FROM invoices WHERE project_id = ANY($1::int[]) AND rectifica_id IS NOT NULL', ids.projects],
    ['DELETE FROM invoices WHERE project_id = ANY($1::int[])', ids.projects],
    ['DELETE FROM invoice_sequences WHERE project_id = ANY($1::int[])', ids.projects],
    ['DELETE FROM user_projects WHERE user_id = ANY($1::int[])', ids.users],
    ['DELETE FROM users WHERE id = ANY($1::int[])', ids.users],
    ['DELETE FROM projects WHERE id = ANY($1::int[])', ids.projects],
  ]) {
    try { await q(sql, [v]); } catch { /* sigue limpiando */ }
  }
  await pool.end();
}, 60000);

describe('#1034 · la regla, sola', () => {
  const emitida = { tipo: 'normal', estado: 'emitida', numero: 5, codigo: 'A/0005' };
  it('la última, sin enviar ni cobrar: se puede', () => {
    expect(motivoParaNoEliminarPorError(emitida, { ultimoDeLaSerie: 5 })).toBeNull();
  });
  it('enviada, cobrada, con abono, abono o no la última: no, y dice que se anule', () => {
    expect(motivoParaNoEliminarPorError({ ...emitida, sent_at: '2026-11-20' }, { ultimoDeLaSerie: 5 })).toMatch(/envi/);
    expect(motivoParaNoEliminarPorError({ ...emitida, estado: 'enviada' }, { ultimoDeLaSerie: 5 })).toMatch(/envi/);
    expect(motivoParaNoEliminarPorError({ ...emitida, estado: 'pagada' }, { ultimoDeLaSerie: 5 })).toMatch(/cobro/);
    expect(motivoParaNoEliminarPorError({ ...emitida, payment_id: 7 }, { ultimoDeLaSerie: 5 })).toMatch(/cobro/);
    expect(motivoParaNoEliminarPorError(emitida, { ultimoDeLaSerie: 6 })).toMatch(/última.*Anúlala/s);
    expect(motivoParaNoEliminarPorError({ ...emitida, anulada_at: '2026-11-20' }, { ultimoDeLaSerie: 5 })).toMatch(/abono/);
    expect(motivoParaNoEliminarPorError(emitida, { ultimoDeLaSerie: 5, tieneAbono: true })).toMatch(/abono/);
    expect(motivoParaNoEliminarPorError({ ...emitida, tipo: 'rectificativa' }, { ultimoDeLaSerie: 5 })).toMatch(/abono/);
  });
  it('un borrador o una proforma no van por aquí', () => {
    expect(motivoParaNoEliminarPorError({ ...emitida, estado: 'borrador', numero: null })).toMatch(/papelera/);
    expect(motivoParaNoEliminarPorError({ ...emitida, tipo: 'proforma' })).toMatch(/papelera/);
  });
});

describe('#1034 · POST /:id/eliminar-por-error', () => {
  // La serie: 1 (enviada), 2 (cobrada), 3 (la buena, la que se borra) .
  let ENVIADA; let COBRADA; let ULTIMA;

  beforeAll(async () => {
    ENVIADA = await nueva({ numero: 1, estado: 'enviada', sentAt: new Date() });
    COBRADA = await nueva({ numero: 2, estado: 'pagada', fechaPago: '2026-11-20' });
    ULTIMA = await nueva({ numero: 3 });
    await q('UPDATE invoice_sequences SET ultimo_numero = 3 WHERE project_id = $1 AND ano = $2 AND serie = $3', [P, ANO, SERIE]);
  });

  it('sin el permiso: 403, también la gestora con «Anular y abonar» (de serie no lo trae)', async () => {
    const r = await eliminar(ULTIMA, GESTORA);
    expect(r.status).toBe(403);
    expect(await factura(ULTIMA)).toBeTruthy();
  });

  it('al admin, quitándoselo: 403', async () => {
    await conPermiso(ADMIN, false, async () => {
      const r = await eliminar(ULTIMA, ADMIN);
      expect(r.status).toBe(403);
    });
    expect(await factura(ULTIMA)).toBeTruthy();
  });

  it('sin motivo: 400 y sigue ahí', async () => {
    for (const body of [{}, { motivo: '' }, { motivo: '  a ' }]) {
      const r = await eliminar(ULTIMA, ADMIN, body);
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
    expect(await factura(ULTIMA)).toBeTruthy();
  });

  it('enviada: 409 NO_SE_PUEDE_ELIMINAR, dice que se anule', async () => {
    const r = await eliminar(ENVIADA, ADMIN);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('NO_SE_PUEDE_ELIMINAR');
    expect(r.body.error).toMatch(/Anúlala/);
    expect(await factura(ENVIADA)).toBeTruthy();
  });

  it('cobrada: 409', async () => {
    const r = await eliminar(COBRADA, ADMIN);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/cobro/);
    expect(await factura(COBRADA)).toBeTruthy();
  });

  it('no es la última de su serie: 409, no deja huecos', async () => {
    const sinEnviar = await nueva({ numero: 4 });
    await nueva({ numero: 5 });
    const r = await eliminar(sinEnviar, ADMIN);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/última/);
    expect(await factura(sinEnviar)).toBeTruthy();
    // Se quedan: la 5 es ahora la última y se borra en el siguiente caso.
  });

  it('con abono: 409', async () => {
    const ultima = (await one('SELECT id FROM invoices WHERE project_id = $1 AND numero = 5 AND serie = $2', [P, SERIE])).id;
    const abono = await one(
      `INSERT INTO invoices (project_id, ano, serie, numero, codigo, tipo, estado, fecha_emision, cliente_nombre, cliente_nif,
                             cliente_direccion, cliente_ciudad, cliente_cp, cliente_pais,
                             items, base_imponible, iva_pct, iva_importe, total, rectifica_id, motivo_rectificacion)
       VALUES ($1, $2, $3, 1, $4, 'rectificativa', 'emitida', CURRENT_DATE, 'X', 'X1234567L', 'Calle 1', 'Madrid', '28001', 'España',
               '[]'::jsonb, -100, 21, -21, -121, $5, 'Prueba')
       RETURNING id`, [P, ANO, `R${SERIE.slice(1)}`, `R-${SERIE}-${ANO}/0001`, ultima]);
    const r = await eliminar(ultima, ADMIN);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/abono/);
    await q('DELETE FROM invoices WHERE id = $1', [abono.id]);
  });

  it('la última, sin enviar ni cobrar, con motivo: se borra, el contador baja y queda en el Registro', async () => {
    const ultima = (await one('SELECT id, codigo FROM invoices WHERE project_id = $1 AND numero = 5 AND serie = $2', [P, SERIE]));
    await q('UPDATE invoice_sequences SET ultimo_numero = 5 WHERE project_id = $1 AND ano = $2 AND serie = $3', [P, ANO, SERIE]);
    const r = await eliminar(ultima.id, ADMIN, { motivo: 'Emitida dos veces' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ id: ultima.id, codigo: ultima.codigo });
    expect(await factura(ultima.id)).toBeFalsy();
    const seq = await one('SELECT ultimo_numero FROM invoice_sequences WHERE project_id = $1 AND ano = $2 AND serie = $3', [P, ANO, SERIE]);
    expect(Number(seq.ultimo_numero)).toBe(4);
    const apunte = await one(
      `SELECT * FROM user_activity_log WHERE user_id = $1 AND action = 'factura.eliminar_por_error' ORDER BY id DESC LIMIT 1`, [ADMIN.id]);
    expect(apunte.details).toMatchObject({
      invoice_id: ultima.id, codigo: ultima.codigo, numero: 5, serie: SERIE, motivo: 'Emitida dos veces', project_id: P,
    });
  });

  it('una gestora con el permiso por excepción: sí, la de su campus', async () => {
    const id = (await one('SELECT id FROM invoices WHERE project_id = $1 AND numero = 4 AND serie = $2', [P, SERIE])).id;
    await conPermiso(GESTORA, true, async () => {
      const r = await eliminar(id, GESTORA);
      expect(r.status, JSON.stringify(r.body)).toBe(200);
    });
    expect(await factura(id)).toBeFalsy();
  });

  it('una que no existe: 404', async () => {
    const r = await eliminar(999999999, ADMIN);
    expect(r.status).toBe(404);
  });
});
