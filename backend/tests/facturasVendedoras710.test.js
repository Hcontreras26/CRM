import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/shared/services/brevo.service.js', () => ({
  sendEmail: vi.fn(async () => ({ sent: true })),
}));
vi.mock('../src/shared/services/r2.service.js', () => ({
  uploadToR2: vi.fn(async (key) => key),
  getFromR2: vi.fn(),
  deleteFromR2: vi.fn(),
}));
vi.mock('../src/shared/services/localStorage.service.js', () => ({
  saveLocal: vi.fn(async (k) => k),
  getLocal: vi.fn(async (k) => ({ buffer: Buffer.from(`%PDF-1.4 ${k}`), size: 8 })),
}));
vi.mock('../src/shared/utils/presignedUrl.js', () => ({
  generatePresignedUrl: vi.fn(async (key) => `https://r2.test/${key}?firmado`),
}));

import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';
import { armarCorreoDelMes, conceptoSugerido } from '../src/modules/facturas-colaborador/facturas.emails.js';

/**
 * CRM#710 · Las vendedoras con su factura del mes, como los colaboradores.
 *
 * - Entra quien tenga ficha de vendedora (la lista explícita): su ficha le da a
 *   ELLA «Subir su factura» por excepción, nunca a su rol entero. Una gestora
 *   sin ficha sigue sin «Mi factura»; un super admin no puede ser vendedora.
 * - «Vendedoras / Colaboradores»: las listas y los totales se filtran por tipo.
 * - Diego, 18/11: «la gestora pone su monto y luego la empresa valida y hace el
 *   pago». Solo se paga una validada; «Por pagar» enseña solo las validadas.
 *
 * Su mes es abril de 2026, y todo se crea aquí mismo.
 */

process.env.CLOUDFLARE_R2_ACCOUNT_ID = 'cuenta-de-prueba';
process.env.CLOUDFLARE_R2_ACCESS_KEY = 'clave-de-prueba';
process.env.CLOUDFLARE_R2_BUCKET = 'cubo-de-prueba';

const request = supertest(app);
const API = '/api/facturas-colaborador';
const MARCA = `FCVEN_${Date.now().toString(36)}`;
const PERIODO = '2026-04-01';

const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);
const one = async (sql, params) => (await q(sql, params))[0];

const E = {};
const P = {};
const U = {};
const T = {};
const C = [];

function token(user, projectId) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, roles_extra: [], customRoleId: null, activeProjectId: projectId },
    process.env.JWT_SECRET, { expiresIn: '1h' },
  );
}
const como = (clave) => ({ Authorization: `Bearer ${T[clave]}` });

async function crearPersona(clave, role, campus) {
  const u = await one(
    `INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, email, role`,
    [`${MARCA} ${clave}`, `${clave}_${MARCA.toLowerCase()}@test.local`, role]);
  for (const p of campus) await q('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [u.id, p.id]);
  U[clave] = u;
  T[clave] = token(u, campus[0]?.id ?? P.A.id);
}

/** Una factura de abril ya subida, sin validar. */
async function recibida(colaboradorId, empresa, importe) {
  return (await one(
    `INSERT INTO facturas_colaborador (colaborador_id, issuer_id, periodo, subida_at, numero_recepcion, importe, numero_factura)
     VALUES ($1, $2, $3, NOW(), $4, $5, 'F-1') RETURNING id`,
    [colaboradorId, empresa.id, PERIODO, `REC-V${(Date.now() % 1e7)}-${colaboradorId}`, importe])).id;
}

const fichaVendedora = (clave, extra = {}) => ({
  nombre: `${MARCA} ficha ${clave}`, email: `ficha_${clave}_${MARCA.toLowerCase()}@test.local`,
  tipo: 'vendedora', user_id: U[clave].id,
  // Variable (Diego, 18/11): sin modalidad ni importe acordado; lo pone su factura.
  empresas: [{ issuer_id: E.A.id }],
  ...extra,
});

let colaboradorExterno;
let fichaGestora;

beforeAll(async () => {
  for (const k of ['A']) {
    E[k] = await one('INSERT INTO invoice_issuers (razon_social, nif) VALUES ($1, $2) RETURNING id, razon_social',
      [`${MARCA}${k} Empresa`, `B${k}${Date.now().toString().slice(-7)}`]);
    P[k] = await one(
      `INSERT INTO projects (nombre, slug, webhook_api_key, sociedad_emisora_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [`${MARCA} Campus ${k}`, `${MARCA.toLowerCase()}-${k.toLowerCase()}`, `${MARCA}-key-${k}`, E[k].id]);
  }
  await crearPersona('super', 'superadmin', []);
  await crearPersona('adminA', 'admin', [P.A]);
  await crearPersona('gestora', 'gestor', [P.A]);
  await crearPersona('otraGestora', 'gestor', [P.A]);
  await crearPersona('colab', 'colaborador', []);
  colaboradorExterno = (await one(
    `INSERT INTO colaboradores (nombre, email, area) VALUES ($1, $2, 'seo') RETURNING id`,
    [`${MARCA} externo`, `externo_${MARCA.toLowerCase()}@test.local`])).id;
  C.push(colaboradorExterno);
  await q('INSERT INTO colaborador_empresas (colaborador_id, issuer_id) VALUES ($1, $2)', [colaboradorExterno, E.A.id]);
});

afterAll(async () => {
  const ids = Object.values(U).map((u) => u.id);
  await q(`DELETE FROM facturas_colaborador_registro WHERE colaborador_id = ANY($1::int[])
              OR factura_id IN (SELECT id FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[]))`, [C]);
  await q('DELETE FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[])', [C]);
  await q('DELETE FROM colaboradores WHERE id = ANY($1::int[])', [C]);
  await q('DELETE FROM permisos_registro WHERE usuario_id = ANY($1::int[])', [ids]);
  await q('DELETE FROM user_permission_overrides WHERE user_id = ANY($1::int[])', [ids]);
  await q('DELETE FROM user_projects WHERE user_id = ANY($1::int[])', [ids]);
  await q('DELETE FROM users WHERE id = ANY($1::int[])', [ids]);
  await q('DELETE FROM projects WHERE id = ANY($1::int[])', [Object.values(P).map((p) => p.id)]);
  await q('DELETE FROM invoice_issuers WHERE id = ANY($1::int[])', [Object.values(E).map((e) => e.id)]);
  await pool.end();
});

describe('la ficha de la vendedora (CRM#710)', () => {
  it('una gestora sin ficha no tiene «Mi factura»', async () => {
    const res = await request.get(`${API}/mias`).set(como('gestora'));
    expect(res.status).toBe(403);
    const me = await request.get('/api/auth/me').set(como('gestora'));
    expect(me.body.data.user.factura_propia).toBe(false);
  });

  it('un super admin no puede ser vendedora (las excepciones no tienen sección de factura)', async () => {
    const res = await request.post(`${API}/colaboradores`).set(como('super')).send(fichaVendedora('super'));
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error).toContain('gestora o una comercial');
  });

  it('un colaborador no puede ser vendedora', async () => {
    const res = await request.post(`${API}/colaboradores`).set(como('super')).send(fichaVendedora('colab'));
    expect(res.status).toBe(400);
  });

  it('con su ficha, ella (y solo ella) recibe «Subir su factura», y queda en el registro de permisos', async () => {
    const res = await request.post(`${API}/colaboradores`).set(como('adminA')).send(fichaVendedora('gestora'));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    fichaGestora = res.body.data.id;
    C.push(fichaGestora);
    expect(res.body.data.tipo).toBe('vendedora');
    // Variable: sin modalidad ni importe acordado.
    expect(res.body.data.empresas[0]).toMatchObject({ issuer_id: E.A.id, modalidad: null, importe_acordado: null });

    const exc = await q(
      `SELECT user_id, allowed FROM user_permission_overrides
        WHERE resource = 'facturas_colaborador' AND action = 'subir' AND user_id = ANY($1::int[])`,
      [[U.gestora.id, U.otraGestora.id]]);
    expect(exc).toEqual([{ user_id: U.gestora.id, allowed: true }]);
    const reg = await q(`SELECT clave, origen, quien_id FROM permisos_registro WHERE usuario_id = $1`, [U.gestora.id]);
    expect(reg).toEqual([{ clave: 'facturas_colaborador.subir', origen: 'ficha_vendedora', quien_id: U.adminA.id }]);

    expect((await request.get(`${API}/mias`).set(como('gestora'))).status).toBe(200);
    // La otra gestora, sin ficha, sigue fuera: no es el rol.
    expect((await request.get(`${API}/mias`).set(como('otraGestora'))).status).toBe(403);
    const me = await request.get('/api/auth/me').set(como('gestora'));
    expect(me.body.data.user.factura_propia).toBe(true);
    expect(me.body.data.permissions['facturas_colaborador.subir']).toBe(true);
  });

  it('una sola ficha de vendedora por persona: sus empresas van dentro', async () => {
    const res = await request.post(`${API}/colaboradores`).set(como('adminA')).send(fichaVendedora('gestora', { nombre: `${MARCA} otra ficha` }));
    expect(res.status).toBe(409);
  });

  it('si alguien le quitó el permiso a propósito, la ficha no se lo devuelve', async () => {
    await q(`INSERT INTO user_permission_overrides (user_id, resource, action, allowed) VALUES ($1, 'facturas_colaborador', 'subir', false)`,
      [U.otraGestora.id]);
    const res = await request.post(`${API}/colaboradores`).set(como('adminA')).send(fichaVendedora('otraGestora'));
    expect(res.status).toBe(201);
    C.push(res.body.data.id);
    const fila = await one(`SELECT allowed FROM user_permission_overrides WHERE user_id = $1 AND resource = 'facturas_colaborador' AND action = 'subir'`,
      [U.otraGestora.id]);
    expect(fila.allowed).toBe(false);
  });
});

describe('«Vendedoras / Colaboradores» en las listas y los totales', () => {
  let deLaVendedora;
  let delExterno;
  beforeAll(async () => {
    deLaVendedora = await recibida(fichaGestora, E.A, 300);
    delExterno = await recibida(colaboradorExterno, E.A, 500);
  });

  it('la lista de fichas', async () => {
    const solo = async (tipo) => (await request.get(`${API}/colaboradores`).query({ tipo, issuerId: E.A.id }).set(como('adminA'))).body.data.map((c) => c.id);
    expect(await solo('vendedora')).not.toContain(colaboradorExterno);
    expect(await solo('vendedora')).toContain(fichaGestora);
    expect(await solo('colaborador')).toEqual([colaboradorExterno]);
  });

  it('«Del mes», con sus totales', async () => {
    const mes = async (tipo) => (await request.get(`${API}/mes`).query({ periodo: '2026-04', issuerId: E.A.id, ...(tipo ? { tipo } : {}) }).set(como('adminA'))).body.data;
    const v = await mes('vendedora');
    expect(v.facturas.map((f) => f.id)).toEqual([deLaVendedora]);
    expect(v.facturas[0].tipo).toBe('vendedora');
    expect(v.resumen.importe_recibido).toBe(300);
    const c = await mes('colaborador');
    expect(c.facturas.map((f) => f.id)).toEqual([delExterno]);
    expect(c.resumen.importe_recibido).toBe(500);
    expect((await mes()).resumen.importe_recibido).toBe(800);
  });

  it('las pestañas', async () => {
    const r = await request.get(`${API}/facturas`).query({ vista: 'historial', issuerId: E.A.id, tipo: 'vendedora' }).set(como('adminA'));
    expect(r.body.data.facturas.map((f) => f.id)).toEqual([deLaVendedora]);
    expect(r.body.data.resumen.importe).toBe(300);
  });

  it('un tipo que no existe se rechaza', async () => {
    const r = await request.get(`${API}/facturas`).query({ vista: 'historial', tipo: 'gestora' }).set(como('adminA'));
    expect(r.status).toBe(400);
  });
});

describe('validar antes de pagar (Diego, 18/11)', () => {
  let id;
  const pagar = (ids) => request.post(`${API}/facturas/pagar`).set(como('adminA'))
    .field('ids', ids.join(',')).field('fecha', '2026-05-05').field('forma_pago', 'transferencia');
  const vista = async (v) => (await request.get(`${API}/facturas`).query({ vista: v, issuerId: E.A.id, tipo: 'vendedora' }).set(como('adminA')))
    .body.data.facturas.map((f) => f.id);

  beforeAll(async () => {
    id = (await one(`SELECT id FROM facturas_colaborador WHERE colaborador_id = $1 AND anulada_at IS NULL`, [fichaGestora])).id;
  });

  it('recibida y sin validar: sale en «Por validar», no en «Por pagar», y no se puede pagar', async () => {
    expect(await vista('por_validar')).toEqual([id]);
    expect(await vista('por_pagar')).toEqual([]);
    const res = await pagar([id]);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_VALIDADA');
  });

  it('la base tampoco deja una pagada sin validar', async () => {
    await expect(q("UPDATE facturas_colaborador SET pagada_at = '2026-05-05' WHERE id = $1", [id])).rejects.toThrow(/chk_fc_pagada_validada/);
  });

  it('una gestora no valida', async () => {
    expect((await request.post(`${API}/facturas/${id}/validar`).set(como('gestora'))).status).toBe(403);
  });

  it('la empresa la valida: pasa a «Por pagar», queda en el registro y ya se paga', async () => {
    const res = await request.post(`${API}/facturas/${id}/validar`).set(como('adminA'));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await one('SELECT validada_por FROM facturas_colaborador WHERE id = $1', [id])).validada_por).toBe(U.adminA.id);
    expect((await q(`SELECT 1 FROM facturas_colaborador_registro WHERE factura_id = $1 AND evento = 'validada'`, [id]))).toHaveLength(1);
    expect(await vista('por_validar')).toEqual([]);
    expect(await vista('por_pagar')).toEqual([id]);
    expect((await request.post(`${API}/facturas/${id}/validar`).set(como('adminA'))).status).toBe(409);
    const pago = await pagar([id]);
    expect(pago.status, JSON.stringify(pago.body)).toBe(200);
    // «Mi factura» de la gestora: validada y pagada.
    const mia = (await request.get(`${API}/mias`).set(como('gestora'))).body.data.find((f) => f.id === id);
    expect(mia).toMatchObject({ validada: true, pago: { pagada_at: '2026-05-05', forma_pago: 'transferencia' } });
  });

  it('una que no se ha recibido no se valida', async () => {
    const sin = (await one(
      `INSERT INTO facturas_colaborador (colaborador_id, issuer_id, periodo) VALUES ($1, $2, '2026-03-01') RETURNING id`,
      [fichaGestora, E.A.id])).id;
    const res = await request.post(`${API}/facturas/${sin}/validar`).set(como('adminA'));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NO_RECIBIDA');
  });
});

describe('los correos de la vendedora', () => {
  it('el concepto sugerido es el de una comercial', () => {
    expect(conceptoSugerido('otra', '2026-04-01', 'vendedora')).toBe('Servicios comerciales · abril 2026');
    expect(conceptoSugerido('seo', '2026-04-01')).toBe('Servicios de SEO · abril 2026');
  });

  it('la factura devuelta lleva el motivo en el correo del enlace nuevo', () => {
    const f = {
      periodo: '2026-04-01', razon_social: 'CEDIA Investigación', colaborador_nombre: 'Lucía', area: 'otra', tipo: 'vendedora',
      importe_esperado: null, caduca_at: null,
    };
    const c = armarCorreoDelMes({ f, token: 'x'.repeat(43), nuevo: true, devuelta: 'El NIF no es el de la empresa' });
    expect(c.htmlContent).toContain('El NIF no es el de la empresa');
    expect(c.htmlContent).toContain('Servicios comerciales');
    // Variable: sin «Importe acordado».
    expect(c.htmlContent).not.toContain('Importe acordado');
  });
});
