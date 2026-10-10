import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/shared/services/brevo.service.js', () => ({
  sendEmail: vi.fn(async () => ({ sent: true })),
}));
// R2 simulado: aquí no se sube nada de verdad.
vi.mock('../src/shared/services/r2.service.js', () => ({
  uploadToR2: vi.fn(async (key) => key),
  getFromR2: vi.fn(),
  deleteFromR2: vi.fn(),
}));
vi.mock('../src/shared/utils/presignedUrl.js', () => ({
  generatePresignedUrl: vi.fn(async (key) => `https://r2.test/${key}?firmado`),
}));

import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';
import { sendEmail } from '../src/shared/services/brevo.service.js';
import { uploadToR2 } from '../src/shared/services/r2.service.js';

/**
 * Facturas de colaboradores (#202, segunda parte) · «Marcar pagada».
 *
 * Del «Añadido 01/10 (tarde)»: la fecha, la forma de pago y, si se quiere, el
 * justificante; una o varias a la vez; solo un admin; se puede deshacer con
 * motivo; todo al registro; y el aviso al colaborador («Tu factura de … está
 * pagada · 636,00 € · transferencia del 05/10»), con los correos apagados
 * salvo que se enciendan.
 *
 * Su mes es mayo de 2026, y las facturas se crean aquí mismo: los otros
 * ficheros, que corren a la vez, no las tocan.
 */

const request = supertest(app);
const API = '/api/facturas-colaborador';
const MARCA = `FCPAG_${Date.now().toString(36)}`;
const PERIODO = '2026-05-01';
const PDF = Buffer.from('%PDF-1.4\n% justificante de prueba\n');

const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);
const one = async (sql, params) => (await q(sql, params))[0];

const E = {};
const P = {};
const U = {};
const T = {};
const F = {};       // facturas por clave
const C = [];       // colaboradores, para borrarlos

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

/** Una factura de mayo; `recibida` = ya subida (con su número de recepción). */
async function factura(clave, empresa, { recibida = true, importe = 636 } = {}) {
  const c = await one(
    `INSERT INTO colaboradores (nombre, email, area) VALUES ($1, $2, 'seo') RETURNING id`,
    [`${MARCA} ${clave}`, `${clave}_${MARCA.toLowerCase()}@test.local`]);
  C.push(c.id);
  await q('INSERT INTO colaborador_empresas (colaborador_id, issuer_id) VALUES ($1, $2)', [c.id, empresa.id]);
  F[clave] = (await one(
    `INSERT INTO facturas_colaborador (colaborador_id, issuer_id, periodo, subida_at, numero_recepcion, importe, numero_factura)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [c.id, empresa.id, PERIODO, recibida ? new Date() : null,
      recibida ? `REC-P${(Date.now() % 1e7)}-${C.length}` : null, recibida ? importe : null, recibida ? `F-${clave}` : null])).id;
}

const pagar = (clave, campos, archivo = null) => {
  const r = request.post(`${API}/facturas/pagar`).set(como(clave));
  for (const [k, v] of Object.entries(campos)) r.field(k, v);
  if (archivo) r.attach('justificante', archivo, 'justificante transferencia.pdf');
  return r;
};
const fila = (id) => one(
  `SELECT to_char(pagada_at, 'YYYY-MM-DD') AS pagada_at, pagada_por, forma_pago, justificante, referencia_pago
     FROM facturas_colaborador WHERE id = $1`, [id]);
const registro = (id, evento) => q(
  'SELECT detalle, user_id FROM facturas_colaborador_registro WHERE factura_id = $1 AND evento = $2 ORDER BY id', [id, evento]);

beforeAll(async () => {
  for (const k of ['A', 'B']) {
    E[k] = await one('INSERT INTO invoice_issuers (razon_social, nif) VALUES ($1, $2) RETURNING id, razon_social',
      [`${MARCA}${k} Empresa`, `B${k}${Date.now().toString().slice(-7)}`]);
    P[k] = await one(
      `INSERT INTO projects (nombre, slug, webhook_api_key, sociedad_emisora_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [`${MARCA} Campus ${k}`, `${MARCA.toLowerCase()}-${k.toLowerCase()}`, `${MARCA}-key-${k}`, E[k].id]);
  }
  await crearPersona('super', 'superadmin', []);
  await crearPersona('adminA', 'admin', [P.A]);
  await crearPersona('gestora', 'gestor', [P.A]);
  await crearPersona('colaborador', 'colaborador', []);
  await factura('laura', E.A);
  await factura('ana', E.A);
  await factura('sinSubir', E.A, { recibida: false });
  await factura('deB', E.B);
  await factura('aviso', E.A);
});

afterAll(async () => {
  delete process.env.FACTURAS_COLABORADOR_CORREOS_ACTIVOS;
  await q(`DELETE FROM facturas_colaborador_registro WHERE factura_id IN (SELECT id FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[]))`, [C]);
  await q('DELETE FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[])', [C]);
  await q('DELETE FROM colaboradores WHERE id = ANY($1::int[])', [C]);
  const ids = Object.values(U).map((u) => u.id);
  await q('DELETE FROM user_projects WHERE user_id = ANY($1::int[])', [ids]);
  await q('DELETE FROM users WHERE id = ANY($1::int[])', [ids]);
  await q('DELETE FROM projects WHERE id = ANY($1::int[])', [Object.values(P).map((p) => p.id)]);
  await q('DELETE FROM invoice_issuers WHERE id = ANY($1::int[])', [Object.values(E).map((e) => e.id)]);
  await pool.end();
});

describe('facturas de colaboradores (#202) · marcar pagada', () => {
  const datos = (ids) => ({ ids: ids.join(','), fecha: '2026-06-05', forma_pago: 'transferencia' });

  it('solo un admin: la gestora y el colaborador no pueden', async () => {
    expect((await pagar('gestora', datos([F.laura]))).status).toBe(403);
    expect((await pagar('colaborador', datos([F.laura]))).status).toBe(403);
    expect((await fila(F.laura)).pagada_at).toBeNull();
  });

  it('una o varias a la vez, con fecha, forma, referencia y justificante; todo al registro', async () => {
    uploadToR2.mockClear();
    const res = await pagar('adminA', { ...datos([F.laura, F.ana]), referencia_pago: 'TRF-0605' }, PDF);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    for (const id of [F.laura, F.ana]) {
      expect(await fila(id)).toMatchObject({
        pagada_at: '2026-06-05', pagada_por: U.adminA.id, forma_pago: 'transferencia', referencia_pago: 'TRF-0605',
      });
      const [r] = await registro(id, 'pagada');
      expect(r.user_id).toBe(U.adminA.id);
      expect(r.detalle).toMatchObject({
        fecha: '2026-06-05', forma_pago: 'transferencia', referencia_pago: 'TRF-0605',
        justificante: 'justificante transferencia.pdf', importe: 636, junto_con: 2,
      });
    }
    // Un justificante para el pago entero, subido una vez.
    expect(uploadToR2).toHaveBeenCalledTimes(1);
    expect((await fila(F.laura)).justificante).toBe((await fila(F.ana)).justificante);
  });

  it('dos veces no: «Ya está pagada»', async () => {
    const res = await pagar('adminA', datos([F.laura]));
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Ya está pagada');
  });

  it('solo se paga una factura recibida', async () => {
    const res = await pagar('adminA', datos([F.sinSubir]));
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Solo se paga una factura recibida');
    expect((await fila(F.sinSubir)).pagada_at).toBeNull();
  });

  it('el admin de A no paga lo de B, ni junto a una suya', async () => {
    expect((await pagar('adminA', datos([F.deB]))).status).toBe(404);
    expect((await pagar('adminA', datos([F.deB, F.aviso]))).status).toBe(404);
    expect((await fila(F.aviso)).pagada_at).toBeNull();
  });

  it('lo que no vale se rechaza: fecha futura, forma inventada, archivo que no es PDF ni foto', async () => {
    const futura = await pagar('adminA', { ...datos([F.aviso]), fecha: '2099-01-01' });
    expect(futura.status).toBe(400);
    expect(JSON.stringify(futura.body)).toContain('posterior a hoy');
    expect((await pagar('adminA', { ...datos([F.aviso]), forma_pago: 'cheque' })).status).toBe(400);
    const txt = await pagar('adminA', datos([F.aviso]), Buffer.from('hola, soy un texto'));
    expect(txt.status).toBe(400);
    expect((await fila(F.aviso)).pagada_at).toBeNull();
  });

  it('el justificante, con enlace firmado; sin justificante, 404', async () => {
    const res = await request.get(`${API}/facturas/${F.laura}/justificante`).set(como('adminA'));
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/^https:\/\/r2\.test\/facturas-colaborador\/pagos\/2026-06\//);
    expect((await request.get(`${API}/facturas/${F.sinSubir}/justificante`).set(como('adminA'))).status).toBe(404);
  });

  it('una pagada no se anula sin deshacer antes el pago', async () => {
    const res = await request.post(`${API}/facturas/${F.ana}/anular`).set(como('adminA')).send({ motivo: 'Se equivocó' });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('deshaz el pago');
  });

  it('se deshace con motivo: vuelve a «por pagar» y lo que había queda en el registro', async () => {
    expect((await request.post(`${API}/facturas/${F.ana}/deshacer-pago`).set(como('adminA')).send({})).status).toBe(400);
    const res = await request.post(`${API}/facturas/${F.ana}/deshacer-pago`).set(como('adminA')).send({ motivo: 'Era otra transferencia' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await fila(F.ana)).toMatchObject({ pagada_at: null, pagada_por: null, forma_pago: null, justificante: null, referencia_pago: null });
    const [r] = await registro(F.ana, 'pago_deshecho');
    expect(r.detalle).toMatchObject({
      motivo: 'Era otra transferencia', antes: { fecha: '2026-06-05', forma_pago: 'transferencia', referencia_pago: 'TRF-0605' },
    });
    expect((await request.post(`${API}/facturas/${F.ana}/deshacer-pago`).set(como('adminA')).send({ motivo: 'otra vez' })).status).toBe(409);
  });

  it('el aviso al colaborador: apagado no sale; encendido sale el de Diego, a él, y queda en el registro', async () => {
    sendEmail.mockClear();
    delete process.env.FACTURAS_COLABORADOR_CORREOS_ACTIVOS;
    expect((await pagar('adminA', datos([F.ana]))).status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(await registro(F.ana, 'aviso_pago')).toHaveLength(0);

    process.env.FACTURAS_COLABORADOR_CORREOS_ACTIVOS = 'true';
    expect((await pagar('adminA', { ...datos([F.aviso]), fecha: '2026-06-05' })).status).toBe(200);
    delete process.env.FACTURAS_COLABORADOR_CORREOS_ACTIVOS;
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const correo = sendEmail.mock.calls[0][0];
    expect(correo.to).toEqual([{ email: `aviso_${MARCA.toLowerCase()}@test.local`, name: `${MARCA} aviso` }]);
    expect(correo.subject).toBe(`Tu factura de mayo para ${MARCA}A está pagada · 636,00 € · transferencia del 05/06`);
    expect(await registro(F.aviso, 'aviso_pago')).toHaveLength(1);
  });
});
