import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// R2 simulado: estas pruebas no suben nada a ningún almacén.
vi.mock('../src/shared/services/r2.service.js', () => ({
  uploadToR2: vi.fn(async (key) => key),
  getFromR2: vi.fn(),
  deleteFromR2: vi.fn(),
}));
vi.mock('../src/shared/utils/presignedUrl.js', () => ({
  generatePresignedUrl: vi.fn(async (key) => `https://r2.prueba/${key}?firma=15min`),
}));

import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';
import { prepararMes } from '../src/modules/facturas-colaborador/facturas.service.js';

/**
 * Facturas de colaboradores (#202) · «Mi factura», contra la base.
 *
 * Laura y Pedro tienen usuario con el rol colaborador. Cada uno ve y sube solo
 * lo suyo, y lo de administración les da 403 (ficha de Diego, 07/10).
 *
 *   cd backend && npx vitest run tests/facturasColaboradorMias.test.js
 */

// R2 «configurado» con valores de prueba: así almacen.js (revisión del 10/10) usa el
// R2 simulado de arriba también en la CI, que no tiene R2. El camino del disco lo
// prueba facturasColaboradorRevision.test.js.
process.env.CLOUDFLARE_R2_ACCOUNT_ID = 'cuenta-de-prueba';
process.env.CLOUDFLARE_R2_ACCESS_KEY = 'clave-de-prueba';
process.env.CLOUDFLARE_R2_BUCKET = 'cubo-de-prueba';

const request = supertest(app);
const MARCA = `FCMIA_${Date.now().toString(36)}`;
// Agosto: cada fichero de pruebas prepara su propio mes (se ejecutan a la vez).
const PERIODO = '2026-08-01';
const API = '/api/facturas-colaborador';
const PDF = Buffer.from('%PDF-1.4\n% factura de prueba\n');

const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);
const one = async (sql, params) => (await q(sql, params))[0];

const U = {};
const T = {};
const C = {};
let empresa;
let campus;

async function crearPersona(clave, role) {
  const u = await one(
    `INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3)
     RETURNING id, nombre, email, role`,
    [`${MARCA} ${clave}`, `${clave}_${MARCA.toLowerCase()}@test.local`, role],
  );
  if (role === 'gestor') await q('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [u.id, campus.id]);
  U[clave] = u;
  T[clave] = jwt.sign(
    { userId: u.id, email: u.email, role, roles_extra: [], customRoleId: null, activeProjectId: campus.id },
    process.env.JWT_SECRET, { expiresIn: '1h' },
  );
}

const como = (clave) => ({ Authorization: `Bearer ${T[clave]}` });

const subir = (clave, id, numero = 'F-1', nombre = 'factura.pdf') => request.post(`${API}/mias/${id}`).set(como(clave))
  .field('importe', '450').field('numero_factura', numero).attach('archivo', PDF, nombre);

beforeAll(async () => {
  empresa = await one('INSERT INTO invoice_issuers (razon_social, nif) VALUES ($1, $2) RETURNING id',
    [`${MARCA} Empresa`, `B${Date.now().toString().slice(-8)}`]);
  campus = await one(
    `INSERT INTO projects (nombre, slug, webhook_api_key, sociedad_emisora_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [`${MARCA} Campus`, `${MARCA.toLowerCase()}-c`, `${MARCA}-key`, empresa.id]);

  await crearPersona('laura', 'colaborador');
  await crearPersona('pedro', 'colaborador');
  await crearPersona('gestora', 'gestor');

  for (const clave of ['laura', 'pedro']) {
    C[clave] = await one(
      `INSERT INTO colaboradores (nombre, email, area, user_id, alta_desde, baja_desde)
       VALUES ($1, $2, 'seo', $3, '2026-08-01', '2026-09-01') RETURNING id`,
      [`${MARCA} ${clave}`, `${clave}_${MARCA.toLowerCase()}@test.local`, U[clave].id]);
    await q('INSERT INTO colaborador_empresas (colaborador_id, issuer_id, importe_acordado) VALUES ($1, $2, 450)',
      [C[clave].id, empresa.id]);
  }
  await prepararMes(PERIODO);
});

afterAll(async () => {
  const cs = Object.values(C).map((c) => c.id);
  await q(`DELETE FROM facturas_colaborador_registro
            WHERE colaborador_id = ANY($1::int[])
               OR factura_id IN (SELECT id FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[]))`, [cs]);
  await q(`DELETE FROM admin_notifications WHERE type = 'factura_colaborador'
            AND (metadata->>'factura_id')::int IN (SELECT id FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[]))`, [cs]);
  await q('DELETE FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[])', [cs]);
  await q('DELETE FROM colaboradores WHERE id = ANY($1::int[])', [cs]);
  const ids = Object.values(U).map((u) => u.id);
  await q('DELETE FROM user_projects WHERE user_id = ANY($1::int[])', [ids]);
  await q('DELETE FROM users WHERE id = ANY($1::int[])', [ids]);
  await q('DELETE FROM projects WHERE id = $1', [campus.id]);
  await q('DELETE FROM invoice_issuers WHERE id = $1', [empresa.id]);
  await pool.end();
});

describe('facturas de colaboradores (#202) · «Mi factura»', () => {
  let deLaura;
  let dePedro;

  it('cada colaborador ve sus meses, y no los de otro', async () => {
    const res = await request.get(`${API}/mias`).set(como('laura'));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ periodo: '2026-08', estado: 'sin_enviar', importe_acordado: 450 });
    deLaura = res.body.data[0].id;
    // Su enlace (ficha de Diego: «sus meses, su enlace…»), y es el que vale.
    const codigo = res.body.data[0].enlace.match(/factura-colaborador\/([A-Za-z0-9_-]{43})$/)[1];
    expect((await request.get(`${API}/enlace/${codigo}`)).body.data.periodo).toBe('2026-08');
    dePedro = (await request.get(`${API}/mias`).set(como('pedro'))).body.data[0].id;
    expect(dePedro).not.toBe(deLaura);
  });

  it('no puede subir la factura de otro colaborador, ni ver su archivo', async () => {
    expect((await subir('laura', dePedro)).status).toBe(404);
    expect((await request.get(`${API}/mias/${dePedro}/archivo`).set(como('laura'))).status).toBe(404);
  });

  it('sube la suya desde «Mi factura», una sola vez', async () => {
    const res = await subir('laura', deLaura, 'F-1', 'Factura_Peña.pdf');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    // Con su ñ: multer lo lee como Latin-1 y llegaba «PeÃ±a».
    expect(res.body.data.recibida.archivo).toBe('Factura_Peña.pdf');
    expect(res.body.data.estado).toBe('recibida');
    expect(res.body.data.recibida.numero_recepcion).toMatch(/^REC-2026-08-\d{4}$/);

    const otra = await subir('laura', deLaura, 'F-2');
    expect(otra.status).toBe(409);
    expect(otra.body.error || otra.body.message).toMatch(/Ya subiste la factura de agosto de 2026/);

    const reg = await one(`SELECT user_id FROM facturas_colaborador_registro WHERE factura_id = $1 AND evento = 'recibida'`, [deLaura]);
    expect(reg.user_id).toBe(U.laura.id);
  });

  it('ve su archivo con un enlace firmado', async () => {
    const res = await request.get(`${API}/mias/${deLaura}/archivo`).set(como('laura'));
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/firma=15min$/);
  });

  it('con el rol colaborador, lo de administración da 403', async () => {
    for (const ruta of ['/mes?periodo=2026-08', '/colaboradores', '/empresas', `/facturas/${deLaura}/archivo`]) {
      expect((await request.get(`${API}${ruta}`).set(como('laura'))).status, ruta).toBe(403);
    }
  });

  it('una gestora no tiene «Mi factura»', async () => {
    expect((await request.get(`${API}/mias`).set(como('gestora'))).status).toBe(403);
  });
});
