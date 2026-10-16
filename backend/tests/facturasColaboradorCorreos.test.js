import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

// Nada sale de verdad: Brevo y R2, simulados.
vi.mock('../src/shared/services/brevo.service.js', () => ({
  sendEmail: vi.fn(async () => ({ sent: true })),
}));
vi.mock('../src/shared/services/r2.service.js', () => ({
  uploadToR2: vi.fn(async (key) => key),
  getFromR2: vi.fn(),
  deleteFromR2: vi.fn(),
}));

import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';
import { sendEmail } from '../src/shared/services/brevo.service.js';
import { prepararYMandar, recordar, huella } from '../src/modules/facturas-colaborador/facturas.service.js';
import { runFacturasColaborador, enMadrid } from '../src/jobs/facturasColaboradorJob.js';

/**
 * Facturas de colaboradores (#202) · los correos, contra la base.
 *
 * Ficha de Diego (07/10): con FACTURAS_COLABORADOR_CORREOS_ACTIVOS apagado,
 * `sendEmail` no se llama nunca; encendido (con `sendEmail` simulado), sale el
 * correo correcto a la persona correcta.
 *
 * Julio de 2026: cada fichero de pruebas prepara su propio mes (se ejecutan a la vez).
 *
 *   cd backend && npx vitest run tests/facturasColaboradorCorreos.test.js
 */

// R2 «configurado» con valores de prueba: así almacen.js (revisión del 10/10) usa el
// R2 simulado de arriba también en la CI, que no tiene R2. El camino del disco lo
// prueba facturasColaboradorRevision.test.js.
process.env.CLOUDFLARE_R2_ACCOUNT_ID = 'cuenta-de-prueba';
process.env.CLOUDFLARE_R2_ACCESS_KEY = 'clave-de-prueba';
process.env.CLOUDFLARE_R2_BUCKET = 'cubo-de-prueba';

const request = supertest(app);
const MARCA = `FCCOR${Date.now().toString(36)}`;
const PERIODO = '2026-07-01';
const API = '/api/facturas-colaborador';
const PDF = Buffer.from('%PDF-1.4\n% factura de prueba\n');

const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);
const one = async (sql, params) => (await q(sql, params))[0];

let empresa;
let campus;   // el campus de la empresa: su marca (logo y remitente) va en los correos
let laura;
let admin;
let tokenAdmin;
const CORTA = MARCA; // la razón social empieza por la marca: «FCCOR… Formación, S.L.»

const correosA = (email) => sendEmail.mock.calls.map((c) => c[0]).filter((c) => c.to[0].email === email);
const encender = () => { process.env.FACTURAS_COLABORADOR_CORREOS_ACTIVOS = 'true'; };
const apagar = () => { delete process.env.FACTURAS_COLABORADOR_CORREOS_ACTIVOS; };

/** El enlace que lleva el botón del correo: …/factura-colaborador/<código>. */
const enlaceDelCorreo = (c) => c.htmlContent.match(/factura-colaborador\/([A-Za-z0-9_-]{43})/)[1];

beforeAll(async () => {
  apagar();
  empresa = await one(
    'INSERT INTO invoice_issuers (razon_social, nif, direccion) VALUES ($1, $2, $3) RETURNING id',
    [`${MARCA} Formación, S.L.`, `B${Date.now().toString().slice(-8)}`, 'Calle Mayor, 1']);
  campus = await one(
    `INSERT INTO projects (nombre, slug, webhook_api_key, sociedad_emisora_id, logo_url, remitente_no_contestar)
     VALUES ($1, $2, $3, $4, 'https://logo.prueba/marca.png', 'noresponder@marca.prueba') RETURNING id`,
    [`${MARCA} Campus`, `${MARCA.toLowerCase()}-c`, `${MARCA}-key`, empresa.id]);
  laura = await one(
    `INSERT INTO colaboradores (nombre, email, area, alta_desde, baja_desde)
     VALUES ($1, $2, 'desarrollo', '2026-07-01', '2026-08-01') RETURNING id, nombre, email`,
    [`${MARCA} Laura`, `laura_${MARCA.toLowerCase()}@test.local`]);
  await q('INSERT INTO colaborador_empresas (colaborador_id, issuer_id, importe_acordado) VALUES ($1, $2, 600)',
    [laura.id, empresa.id]);
  admin = await one(`INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', 'superadmin') RETURNING id`,
    [`${MARCA} super`, `super_${MARCA.toLowerCase()}@test.local`]);
  tokenAdmin = jwt.sign({ userId: admin.id, role: 'superadmin', roles_extra: [], customRoleId: null },
    process.env.JWT_SECRET, { expiresIn: '1h' });
});

afterEach(() => apagar());

afterAll(async () => {
  apagar();
  await q(`DELETE FROM facturas_colaborador_registro
            WHERE colaborador_id = $1
               OR factura_id IN (SELECT id FROM facturas_colaborador WHERE colaborador_id = $1)`, [laura.id]);
  await q(`DELETE FROM admin_notifications WHERE type = 'factura_colaborador'
            AND (metadata->>'factura_id')::int IN (SELECT id FROM facturas_colaborador WHERE colaborador_id = $1)`, [laura.id]);
  await q('DELETE FROM facturas_colaborador WHERE colaborador_id = $1', [laura.id]);
  await q('DELETE FROM colaboradores WHERE id = $1', [laura.id]);
  await q('DELETE FROM users WHERE id = $1', [admin.id]);
  await q('DELETE FROM projects WHERE id = $1', [campus.id]);
  await q('DELETE FROM invoice_issuers WHERE id = $1', [empresa.id]);
  await pool.end();
});

const fila = () => one(
  `SELECT id, enviado_at FROM facturas_colaborador WHERE colaborador_id = $1 AND periodo = $2 AND anulada_at IS NULL`,
  [laura.id, PERIODO]);

describe('facturas de colaboradores (#202) · correos apagados (por defecto)', () => {
  it('se prepara el mes, pero no se llama a Brevo y queda «sin enviar»', async () => {
    sendEmail.mockClear();
    await prepararYMandar(PERIODO);
    expect(correosA(laura.email)).toHaveLength(0);
    const f = await fila();
    expect(f.enviado_at).toBeNull();
    const reenviar = await request.post(`${API}/facturas/${f.id}/reenviar`).set({ Authorization: `Bearer ${tokenAdmin}` });
    expect(reenviar.status).toBe(200);
    expect(correosA(laura.email)).toHaveLength(0);
  });

  it('el recordatorio no se manda, ni cambia el enlace', async () => {
    const antes = await one('SELECT token_hash FROM facturas_colaborador WHERE id = $1', [(await fila()).id]);
    const r = await recordar(PERIODO);
    expect(r.recordados).toBe(0);
    const despues = await one('SELECT token_hash FROM facturas_colaborador WHERE id = $1', [(await fila()).id]);
    expect(despues.token_hash).toBe(antes.token_hash);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('facturas de colaboradores (#202) · correos encendidos', () => {
  let enlace;

  it('reenviar manda el enlace nuevo a la persona correcta, y queda «enviado»', async () => {
    encender();
    sendEmail.mockClear();
    const f = await fila();
    const res = await request.post(`${API}/facturas/${f.id}/reenviar`).set({ Authorization: `Bearer ${tokenAdmin}` });
    expect(res.status).toBe(200);

    const [c] = correosA(laura.email);
    expect(c.to).toEqual([{ email: laura.email, name: laura.nombre }]);
    expect(c.subject).toBe(`Tu factura de julio para ${CORTA} · 600,00 €`);
    expect(c.fromName).toBe(`${CORTA} · Facturación`);
    expect(c.htmlContent).toContain('Servicios de desarrollo web · julio 2026');
    expect(c.htmlContent).toContain('Calle Mayor, 1');
    expect(c.htmlContent).toContain('Subir mi factura de julio');
    // Con la marca de la empresa: su logo en la cabecera y su campus para el remitente de Brevo.
    expect(c.projectId).toBe(campus.id);
    expect(c.htmlContent).toContain('https://logo.prueba/marca.png');

    // El enlace del correo es el que vale: su huella es la de la fila.
    enlace = enlaceDelCorreo(c);
    const guardada = await one('SELECT token_hash, enviado_at FROM facturas_colaborador WHERE id = $1', [f.id]);
    expect(guardada.token_hash).toBe(huella(enlace));
    // En la base no está el enlace: ni la semilla ni la huella lo son.
    const { token_semilla: semilla } = await one('SELECT token_semilla FROM facturas_colaborador WHERE id = $1', [f.id]);
    expect([semilla, guardada.token_hash]).not.toContain(enlace);
    expect(guardada.enviado_at).not.toBeNull();
    expect((await request.get(`${API}/enlace/${enlace}`)).body.data.estado).toBe('abierto');
  });

  it('el recordatorio del día 5 lleva el mismo enlace, y no se repite', async () => {
    encender();
    sendEmail.mockClear();
    // Solo los suyos: en la base puede haber otros colaboradores (de otras pruebas, o a mano).
    await recordar(PERIODO);
    expect(correosA(laura.email)).toHaveLength(1);
    const [c] = correosA(laura.email);
    expect(c.subject).toBe(`Falta tu factura de julio para ${CORTA}`);
    expect(enlaceDelCorreo(c)).toBe(enlace);
    expect((await request.get(`${API}/enlace/${enlace}`)).status).toBe(200);

    sendEmail.mockClear();
    await recordar(PERIODO);
    expect(correosA(laura.email)).toHaveLength(0);
  });

  it('al subir la factura le llega el acuse, con la copia adjunta', async () => {
    encender();
    sendEmail.mockClear();
    const res = await request.post(`${API}/enlace/${enlace}`)
      .field('importe', '600').field('numero_factura', 'F-2026-07').attach('archivo', PDF, 'factura-julio.pdf');
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    // Sale justo después de responder (revisión del 10/10): se espera a que llegue.
    await vi.waitFor(() => expect(correosA(laura.email)).toHaveLength(1));
    const [c] = correosA(laura.email);
    expect(c.subject).toBe(`Factura recibida · julio 2026 · ${CORTA}`);
    expect(c.htmlContent).toContain(res.body.data.recibida.numero_recepcion);
    expect(c.attachment).toHaveLength(1);
    expect(Buffer.from(c.attachment[0].content, 'base64').equals(PDF)).toBe(true);
  });

  it('si Brevo falla, la factura queda «no enviado»', async () => {
    encender();
    const f = await fila();
    // La de julio ya está recibida: se anula para tener una nueva que mandar.
    // Brevo no lanza un error: contesta {sent:false} (así lo hace sendEmail de verdad).
    sendEmail.mockResolvedValueOnce({ sent: false, reason: 'HTTP_400' });
    const res = await request.post(`${API}/facturas/${f.id}/anular`).set({ Authorization: `Bearer ${tokenAdmin}` })
      .send({ motivo: 'Prueba de fallo de envío' });
    expect(res.status).toBe(200);
    const estado = await request.get(`${API}/mes?periodo=2026-07`).set({ Authorization: `Bearer ${tokenAdmin}` });
    const nueva = estado.body.data.facturas.find((x) => x.id === res.body.data.nueva);
    expect(nueva.estado).toBe('no_enviado');
    const motivo = await one(`SELECT detalle->>'motivo' AS m FROM facturas_colaborador_registro WHERE factura_id = $1 AND evento = 'no_enviado'`, [nueva.id]);
    expect(motivo.m).toBe('HTTP_400');
  });

  it('y si el envío lanza un error, también', async () => {
    encender();
    const f = await fila();
    sendEmail.mockRejectedValueOnce(new Error('Brevo caído'));
    expect((await request.post(`${API}/facturas/${f.id}/reenviar`).set({ Authorization: `Bearer ${tokenAdmin}` })).status).toBe(200);
    const linea = await one(`SELECT detalle->>'motivo' AS m FROM facturas_colaborador_registro
                             WHERE factura_id = $1 AND evento = 'no_enviado' ORDER BY id DESC LIMIT 1`, [f.id]);
    expect(linea.m).toBe('Brevo caído');
  });

  it('tras un «No enviado», reenviar con los correos apagados lo deja «sin enviar»', async () => {
    const f = await fila();
    apagar();
    expect((await request.post(`${API}/facturas/${f.id}/reenviar`).set({ Authorization: `Bearer ${tokenAdmin}` })).status).toBe(200);
    const estado = await request.get(`${API}/mes?periodo=2026-07`).set({ Authorization: `Bearer ${tokenAdmin}` });
    expect(estado.body.data.facturas.find((x) => x.id === f.id).estado).toBe('sin_enviar');
  });

  it('un recordatorio que Brevo no aceptó no se reintenta en cada vuelta', async () => {
    encender();
    const f = await fila();
    sendEmail.mockClear();
    sendEmail.mockResolvedValueOnce({ sent: false, reason: 'HTTP_500' });
    await recordar(PERIODO);
    expect(correosA(laura.email)).toHaveLength(1);
    expect(await one(`SELECT 1 AS si FROM facturas_colaborador_registro
                        WHERE factura_id = $1 AND evento = 'no_enviado' AND detalle->>'recordatorio' = 'true'`, [f.id])).toBeTruthy();
    sendEmail.mockClear();
    await recordar(PERIODO);
    expect(correosA(laura.email)).toHaveLength(0);
  });
});

describe('facturas de colaboradores (#202) · la tarea del mes', () => {
  it('las 10:00 de Madrid, también en horario de verano y de invierno', () => {
    expect(enMadrid(new Date('2026-07-31T08:00:00Z'))).toMatchObject({ dia: 31, hora: 10 });
    expect(enMadrid(new Date('2026-12-05T09:00:00Z'))).toMatchObject({ dia: 5, hora: 10 });
  });

  it('el último día del mes a las 10:00 prepara el mes; a otra hora u otro día, nada', async () => {
    expect((await runFacturasColaborador({ ahora: new Date('2026-07-31T07:00:00Z') })).omitido).toBe('fuera de hora');
    expect((await runFacturasColaborador({ ahora: new Date('2026-07-30T08:00:00Z') })).omitido).toBe('no toca hoy');
    const r = await runFacturasColaborador({ ahora: new Date('2026-07-31T08:00:00Z') });
    expect(r.tarea).toBe('mes');
    // Si el servidor arrancó a las 10:45, la vuelta de las 10:45 lo hace igual.
    expect((await runFacturasColaborador({ ahora: new Date('2026-07-31T08:45:00Z') })).tarea).toBe('mes');
  });

  it('el día 5 a las 10:00 toca el recordatorio del mes anterior', async () => {
    const r = await runFacturasColaborador({ ahora: new Date('2026-08-05T08:00:00Z') });
    expect(r.tarea).toBe('recordatorio');
  });
});
