import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * Una factura, solo para quien trabaja en su campus.
 *
 * `GET /:id`, `/:id/pdf`, `/:id/send`, `/:id/cancel`, `/:id/emitir`… trabajaban
 * con el id de la URL sin mirar el campus: la factura de otro campus, con los
 * datos fiscales de su cliente, estaba a un número de distancia.
 *
 *   npx vitest run tests/facturasAmbito.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const { default: modulo } = await import('../src/modules/invoices/index.js');
const { errorHandler } = await import('../src/shared/middleware/errorHandler.js');

const app = express();
app.use(express.json());
app.use(modulo.prefix, modulo.router);
app.use(errorHandler);
const request = supertest(app);

const MARCA = `FAM${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const ids = { users: [], projects: [], leads: [], conversions: [], invoices: [] };
let P; let OTRO; let SUPER; let ADMIN; let ADMIN_OTRO; let GESTORA_OTRO; let FACTURA; let LEAD; let VENTA;
const como = (u) => ({ Authorization: `Bearer ${jwt.sign({ userId: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '10m' })}` });

async function persona(n, role, campus = []) {
  const [u] = await q(`INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, role`,
    [`${MARCA} ${n}`, `${n.toLowerCase()}@${MARCA.toLowerCase()}.test`, role]);
  ids.users.push(u.id);
  for (const c of campus) await q(`INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)`, [u.id, c]);
  return u;
}

beforeAll(async () => {
  const proy = async (c) => {
    const [p] = await q(`INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
      [`${MARCA} ${c}`, `${MARCA.toLowerCase()}-${c}`, `${MARCA}-key-${c}`]);
    ids.projects.push(p.id);
    return p.id;
  };
  P = await proy('a'); OTRO = await proy('b');
  SUPER = await persona('SUPER', 'superadmin');
  ADMIN = await persona('ADMIN', 'admin', [P]);
  ADMIN_OTRO = await persona('ADMINOTRO', 'admin', [OTRO]);
  GESTORA_OTRO = await persona('GESTORAOTRO', 'gestor', [OTRO]);
  const [l] = await q(`INSERT INTO leads (project_id, nombre, email, telefono) VALUES ($1, $2, $3, '+34600111222') RETURNING id`,
    [P, `${MARCA} Ana`, `ana@lead.${MARCA.toLowerCase()}.test`]);
  LEAD = l.id; ids.leads.push(l.id);
  const [v] = await q(`INSERT INTO conversions (lead_id, project_id, producto_contratado, importe_total, importe_pagado, fecha_conversion) VALUES ($1, $2, 'x', 500, 100, CURRENT_DATE) RETURNING id`, [LEAD, P]);
  VENTA = v.id; ids.conversions.push(v.id);
  const [f] = await q(
    `INSERT INTO invoices (project_id, ano, numero, codigo, cliente_nombre, cliente_nif, cliente_direccion, cliente_ciudad, cliente_cp, cliente_pais, items, base_imponible, total, lead_id, conversion_id)
     VALUES ($1, 2026, 987654, $2, $3, 'X1234567L', 'Calle 1', 'Madrid', '28001', 'España', '[]'::jsonb, 100, 121, $4, $5) RETURNING id`,
    [P, `${MARCA}-1`, `${MARCA} Cliente`, LEAD, VENTA]);
  FACTURA = f.id; ids.invoices.push(f.id);
}, 60000);

afterAll(async () => {
  await q(`DELETE FROM invoices WHERE id = ANY($1::int[])`, [ids.invoices]);
  await q(`DELETE FROM conversions WHERE id = ANY($1::int[])`, [ids.conversions]);
  await q(`DELETE FROM leads WHERE id = ANY($1::int[])`, [ids.leads]);
  await q(`DELETE FROM user_projects WHERE user_id = ANY($1::int[])`, [ids.users]);
  await q(`DELETE FROM users WHERE id = ANY($1::int[])`, [ids.users]);
  await q(`DELETE FROM projects WHERE id = ANY($1::int[])`, [ids.projects]);
  await pool.end();
}, 60000);

describe('quien sí', () => {
  it.each([['superadmin', () => SUPER], ['admin del campus', () => ADMIN]])('%s la ve', async (_n, quien) => {
    const r = await request.get(`/api/invoices/${FACTURA}`).set(como(quien()));
    expect(r.status).toBe(200);
    expect(r.body.data.id).toBe(FACTURA);
  });

  it('las ventas de su campus, con sus facturas', async () => {
    const r = await request.get(`/api/invoices/by-conversion/${VENTA}`).set(como(ADMIN));
    expect(r.status).toBe(200);
  });
});

describe('quien no', () => {
  it.each([['un admin de otro campus', () => ADMIN_OTRO], ['una gestora de otro campus', () => GESTORA_OTRO]])('%s: 403 en leer, PDF, enviar, cobrar, anular, emitir, borrar, y crear', async (_n, quien) => {
    const h = como(quien());
    const intentos = [
      request.get(`/api/invoices/${FACTURA}`).set(h),
      request.get(`/api/invoices/${FACTURA}/pdf`).set(h),
      request.post(`/api/invoices/${FACTURA}/send`).set(h).send({}),
      request.post(`/api/invoices/${FACTURA}/mark-paid`).set(h).send({}),
      request.post(`/api/invoices/${FACTURA}/cancel`).set(h).send({}),
      request.post(`/api/invoices/${FACTURA}/emitir`).set(h).send({}),
      request.post(`/api/invoices/${FACTURA}/rectificar`).set(h).send({}),
      request.delete(`/api/invoices/${FACTURA}`).set(h),
      request.get(`/api/invoices/by-conversion/${VENTA}`).set(h),
      request.get(`/api/invoices/lead-fiscal/${LEAD}`).set(h),
      request.post('/api/invoices').set(h).send({ projectId: P, conversionId: VENTA, leadId: LEAD }),
    ];
    for (const r of await Promise.all(intentos)) expect(r.status).toBe(403);
    const [f] = await q(`SELECT estado FROM invoices WHERE id = $1`, [FACTURA]);
    expect(f.estado).toBe('emitida');
  });

  it('una factura que no existe: 404; un id que no es número, no es 403', async () => {
    expect((await request.get('/api/invoices/999999999').set(como(ADMIN))).status).toBe(404);
    expect((await request.get('/api/invoices/abc').set(como(ADMIN))).status).not.toBe(403);
  });

  it('las empresas emisoras, plantillas y regímenes no son de un campus y siguen igual', async () => {
    expect((await request.get('/api/invoices/issuers').set(como(ADMIN_OTRO))).status).toBe(200);
  });
});

/*
 * La LISTA y las CIFRAS. Acotaban el detalle pero no el listado: con el
 * `projectId` de otro campus, la lista y `/stats` lo daban todo; y un admin,
 * con `issuerId`, las facturas de toda la empresa aunque solo llevara uno de
 * sus campus. Lo vio la revisión del buscador (#591).
 */
describe('la lista y las cifras, solo de sus campus', () => {
  const ids = (r) => r.body.data.map((f) => f.id);
  let EMPRESA;
  beforeAll(async () => {
    [{ id: EMPRESA }] = await q('INSERT INTO invoice_issuers (razon_social, nif) VALUES ($1, $2) RETURNING id', [`${MARCA} EMPRESA`, `${MARCA}-E`]);
    await q('UPDATE invoices SET issuer_id = $1 WHERE id = $2', [EMPRESA, FACTURA]);
  });
  afterAll(async () => {
    await q('UPDATE invoices SET issuer_id = NULL WHERE id = $1', [FACTURA]);
    await q('DELETE FROM invoice_issuers WHERE id = $1', [EMPRESA]);
  });

  it('el admin del campus la encuentra por su número', async () => {
    const r = await request.get(`/api/invoices?projectId=${P}&search=987654`).set(como(ADMIN));
    expect(r.status).toBe(200);
    expect(ids(r)).toEqual([FACTURA]);
  });

  it('un admin de otro campus: 403 en la lista y en las cifras', async () => {
    expect((await request.get(`/api/invoices?projectId=${P}`).set(como(ADMIN_OTRO))).status).toBe(403);
    expect((await request.get(`/api/invoices/stats?projectId=${P}`).set(como(ADMIN_OTRO))).status).toBe(403);
  });

  it('una gestora de otro campus: 403', async () => {
    expect((await request.get(`/api/invoices?projectId=${P}`).set(como(GESTORA_OTRO))).status).toBe(403);
  });

  it('por empresa: el admin ve las de sus campus, no las de los demás campus de la empresa', async () => {
    expect(ids(await request.get(`/api/invoices?issuerId=${EMPRESA}`).set(como(ADMIN)))).toEqual([FACTURA]);
    const otro = await request.get(`/api/invoices?issuerId=${EMPRESA}`).set(como(ADMIN_OTRO));
    expect(otro.status).toBe(200);
    expect(otro.body.data).toEqual([]);
    const cifras = await request.get(`/api/invoices/stats?issuerId=${EMPRESA}`).set(como(ADMIN_OTRO));
    expect(cifras.body.data.total).toBe(0);
  });

  it('el superadmin, en cualquier campus y empresa', async () => {
    expect(ids(await request.get(`/api/invoices?projectId=${P}&search=987654`).set(como(SUPER)))).toEqual([FACTURA]);
    expect(ids(await request.get(`/api/invoices?issuerId=${EMPRESA}`).set(como(SUPER)))).toEqual([FACTURA]);
  });
});
