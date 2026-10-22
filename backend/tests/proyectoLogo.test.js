import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

/**
 * El logo de un proyecto (#222), contra la base de verdad y el disco.
 *
 * En los servidores de MultiCRM no hay R2: las subidas van al disco
 * (localStorage.service, UPLOADS_DIR). Aquí el disco es una carpeta temporal,
 * que se fija ANTES de cargar la app (el servicio lee UPLOADS_DIR al importarse).
 *
 *   cd backend && npx vitest run tests/proyectoLogo.test.js
 */

const DISCO = await fs.mkdtemp(path.join(os.tmpdir(), 'crm-logos-'));
process.env.UPLOADS_DIR = DISCO;
const { default: app } = await import('../src/app.js');
const { default: pool } = await import('../src/shared/config/db.js');

const request = supertest(app);
const MARCA = `LOGO_${Date.now().toString(36)}`;
const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);

// Un PNG de 1×1 px de verdad.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

let proyecto;
let sinLogo;
let superadmin;
let token;

beforeAll(async () => {
  [proyecto] = await q(
    `INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
    [`${MARCA} Con logo`, `${MARCA.toLowerCase()}-con`, `${MARCA}-con`]
  );
  [sinLogo] = await q(
    `INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
    [`${MARCA} Sin logo`, `${MARCA.toLowerCase()}-sin`, `${MARCA}-sin`]
  );
  // Un admin de estos dos campus, no un superadmin: un superadmin activo en la
  // base compartida entra en los avisos que calculan otras pruebas a la vez
  // (certifexDiplomas cuenta todos los superadmin activos) y las rompe.
  [superadmin] = await q(
    `INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', 'admin') RETURNING id, email`,
    [`${MARCA} admin`, `admin_${MARCA.toLowerCase()}@test.local`]
  );
  await q(`INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2), ($1, $3)`, [superadmin.id, proyecto.id, sinLogo.id]);
  token = jwt.sign(
    { userId: superadmin.id, email: superadmin.email, role: 'admin', roles_extra: [], customRoleId: null },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
});

afterAll(async () => {
  await q('DELETE FROM user_projects WHERE user_id = $1', [superadmin.id]);
  await q('DELETE FROM projects WHERE id = ANY($1::int[])', [[proyecto.id, sinLogo.id]]);
  await q('DELETE FROM users WHERE id = $1', [superadmin.id]);
  await pool.end();
  await fs.rm(DISCO, { recursive: true, force: true });
});

describe('subir el logo, sin R2: va al disco', () => {
  it('lo guarda en UPLOADS_DIR y deja logo_url apuntando a la ruta pública', async () => {
    const res = await request.post(`/api/projects/${proyecto.id}/logo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.logo_url).toMatch(new RegExp(`^/api/projects/${proyecto.id}/logo\\?v=\\d+$`));

    const [fila] = await q('SELECT logo_key FROM projects WHERE id = $1', [proyecto.id]);
    expect(fila.logo_key).toMatch(/^logos\/project-\d+-[0-9a-f]+\.png$/);
    const enDisco = await fs.readFile(path.join(DISCO, fila.logo_key));
    expect(enDisco.equals(PNG)).toBe(true);
  });

  it('sin sesión no se sube (401)', async () => {
    const res = await request.post(`/api/projects/${proyecto.id}/logo`)
      .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(res.status).toBe(401);
  });
});

describe('leer el logo: público, para un <img>', () => {
  it('existe: 200, con su tipo de imagen y el archivo tal cual, sin sesión', async () => {
    const res = await request.get(`/api/projects/${proyecto.id}/logo`).buffer(true)
      .parse((r, cb) => { const t = []; r.on('data', (c) => t.push(c)); r.on('end', () => cb(null, Buffer.concat(t))); });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(Number(res.headers['content-length'])).toBe(PNG.length);
    expect(res.body.equals(PNG)).toBe(true);
  });

  it('el archivo ya no está en el disco (lo que pasa en producción): 404 limpio, sin cuerpo', async () => {
    const [fila] = await q('SELECT logo_key FROM projects WHERE id = $1', [proyecto.id]);
    await fs.rm(path.join(DISCO, fila.logo_key));
    const res = await request.get(`/api/projects/${proyecto.id}/logo`);
    expect(res.status).toBe(404);
    expect(res.text || '').toBe('');
  });

  it('el proyecto no tiene logo: 404 limpio', async () => {
    const res = await request.get(`/api/projects/${sinLogo.id}/logo`);
    expect(res.status).toBe(404);
    expect(res.text || '').toBe('');
  });

  it('un proyecto que no existe: 404; un id que no es número: 400', async () => {
    expect((await request.get('/api/projects/999999999/logo')).status).toBe(404);
    expect((await request.get('/api/projects/abc/logo')).status).toBe(400);
  });
});
