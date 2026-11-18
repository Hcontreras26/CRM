import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * #218, tanda 4 · Integraciones con «Todos» o una empresa (Diego, 04/11/2026):
 * el estado de cada campus en una lista, solo para ver.
 *
 * `GET /api/integrations/estado`. Lo que importa:
 *   · cada uno ve SUS campus (un admin, los suyos; con una empresa, los de esa
 *     empresa que sean suyos; superadmin, todos);
 *   · nunca sale una clave, ni cifrada ni enmascarada, ni la configuración;
 *   · un campus sin nada conectado sale igual: «sin configurar» es un estado.
 *
 *   npx vitest run tests/integracionesEstado218.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const { errorHandler } = await import('../src/shared/middleware/errorHandler.js');
const { default: modulo } = await import('../src/modules/integrations/index.js');

const app = express();
app.use(express.json());
app.use(modulo.prefix, modulo.router);
app.use(errorHandler);
const request = supertest(app);

const MARCA = `INT${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const one = async (sql, p) => (await q(sql, p))[0];
const ids = { users: [], projects: [], issuers: [] };
let CEDIA; let PSIKO; let FONO; let ICT; let ADMIN; let SUPER; let GESTORA;

const como = (u) => ({ Authorization: `Bearer ${jwt.sign({ userId: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '10m' })}` });
const pedir = (u, ruta) => request.get(ruta).set(como(u));
const nombres = (res) => res.body.data.map((c) => c.id);

beforeAll(async () => {
  const empresa = async (n) => { const e = await one('INSERT INTO invoice_issuers (razon_social, nif) VALUES ($1, $2) RETURNING id', [`${MARCA} ${n}`, `B${n}${Date.now().toString().slice(-6)}`]); ids.issuers.push(e.id); return e.id; };
  const campus = async (n, issuer) => { const p = await one(`INSERT INTO projects (nombre, slug, webhook_api_key, sociedad_emisora_id) VALUES ($1, $2, $3, $4) RETURNING id`, [`${MARCA} ${n}`, `${MARCA.toLowerCase()}-${n}`, `${MARCA}-k-${n}`, issuer]); ids.projects.push(p.id); return p.id; };
  CEDIA = await empresa('cedia');
  const ictess = await empresa('ictess');
  PSIKO = await campus('psiko', CEDIA); FONO = await campus('fono', CEDIA); ICT = await campus('ict', ictess);
  const persona = async (n, role, suyos) => {
    const u = await one(`INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, role`, [`${MARCA} ${n}`, `${n}@${MARCA.toLowerCase()}.test`, role]);
    ids.users.push(u.id);
    for (const c of suyos) await q('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [u.id, c]);
    return u;
  };
  ADMIN = await persona('admin', 'admin', [PSIKO, FONO]);
  SUPER = await persona('super', 'superadmin', []);
  GESTORA = await persona('gestora', 'gestor', [PSIKO]);
  // PSIKO: Stripe conectado y Brevo con error. FONO: nada. ICT: Stripe conectado.
  const conexion = (p, prov, estado) => q(
    `INSERT INTO project_integrations (project_id, provider, active, encrypted_value, iv, auth_tag, config_public, last_test_status, last_test_at)
     VALUES ($1, $2, true, 'cifrado-secreto', 'iv', 'tag', '{"url":"https://campus.secreto"}', $3, NOW())`, [p, prov, estado]);
  await conexion(PSIKO, 'stripe', 'success');
  await conexion(PSIKO, 'brevo', 'error');
  await conexion(ICT, 'stripe', 'success');
}, 60000);

afterAll(async () => {
  await q('DELETE FROM project_integrations WHERE project_id = ANY($1::int[])', [ids.projects]);
  await q('DELETE FROM user_projects WHERE user_id = ANY($1::int[])', [ids.users]);
  await q('DELETE FROM users WHERE id = ANY($1::int[])', [ids.users]);
  await q('DELETE FROM projects WHERE id = ANY($1::int[])', [ids.projects]);
  await q('DELETE FROM invoice_issuers WHERE id = ANY($1::int[])', [ids.issuers]);
  await pool.end();
});

describe('#218 · GET /integrations/estado', () => {
  it('con «Todos», un admin ve solo sus campus, también el que no tiene nada conectado', async () => {
    const res = await pedir(ADMIN, '/api/integrations/estado');
    expect(res.status).toBe(200);
    expect(nombres(res).sort()).toEqual([PSIKO, FONO].sort());
    expect(res.body.data.find((c) => c.id === FONO).integraciones).toEqual([]);
  });

  it('dice qué está conectado y cómo fue la última prueba', async () => {
    const res = await pedir(ADMIN, '/api/integrations/estado');
    const psiko = res.body.data.find((c) => c.id === PSIKO);
    const de = (p) => psiko.integraciones.find((i) => i.provider === p);
    expect(de('stripe')).toMatchObject({ has_secret: true, last_test_status: 'success' });
    expect(de('brevo')).toMatchObject({ has_secret: true, last_test_status: 'error' });
    expect(de('stripe').last_test_at).toBeTruthy();
  });

  it('nunca saca la clave ni la configuración', async () => {
    const res = await pedir(SUPER, '/api/integrations/estado');
    const texto = JSON.stringify(res.body);
    expect(texto).not.toContain('cifrado-secreto');
    expect(texto).not.toContain('campus.secreto');
    for (const c of res.body.data) {
      for (const i of c.integraciones) {
        expect(Object.keys(i).sort()).toEqual(['has_secret', 'last_test_at', 'last_test_status', 'provider']);
      }
    }
  });

  it('con una empresa, los de esa empresa que son suyos', async () => {
    const res = await pedir(ADMIN, `/api/integrations/estado?issuerId=${CEDIA}`);
    expect(nombres(res).sort()).toEqual([PSIKO, FONO].sort());
  });

  it('el campus de otra empresa no se le cuela ni pidiéndolo', async () => {
    const res = await pedir(ADMIN, `/api/integrations/estado?projectIds=${ICT}`);
    expect(nombres(res)).not.toContain(ICT);
  });

  it('el superadmin ve también los de otras empresas', async () => {
    const res = await pedir(SUPER, '/api/integrations/estado');
    expect(nombres(res)).toEqual(expect.arrayContaining([PSIKO, FONO, ICT]));
  });

  it('sin «Ver integraciones», 403', async () => {
    const res = await pedir(GESTORA, '/api/integrations/estado');
    expect(res.status).toBe(403);
  });

  it('no la confunde con un proveedor: `/stripe` sigue pidiendo su campus', async () => {
    const res = await pedir(ADMIN, '/api/integrations/stripe');
    expect(res.status).toBe(400);
  });
});
