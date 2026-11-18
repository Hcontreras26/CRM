import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * #218, tanda 4 · Análisis IA con «Todos» o una empresa (Diego, 04/11/2026):
 * los informes de todos sus campus, cada uno con el suyo.
 *
 * Y el hueco que salió al mirarlo: generar no pasaba por `projectAccess`, así
 * que cualquiera con «Generar» hacía el informe de un campus de otra empresa
 * —con la clave de Anthropic de ese campus—, y el detalle y el PDF de un
 * informe se abrían con cualquier id.
 *
 *   npx vitest run tests/analisisIaTodos218.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const { errorHandler } = await import('../src/shared/middleware/errorHandler.js');
const { default: modulo } = await import('../src/modules/reports-ia/index.js');

const app = express();
app.use(express.json());
app.use(modulo.prefix, modulo.router);
app.use(errorHandler);
const request = supertest(app);

const MARCA = `RIA${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const one = async (sql, p) => (await q(sql, p))[0];
const ids = { users: [], projects: [], issuers: [], informes: {} };
let CEDIA; let PSIKO; let FONO; let ICT; let ADMIN; let SUPER;

const como = (u) => ({ Authorization: `Bearer ${jwt.sign({ userId: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '10m' })}` });
const pedir = (u, ruta) => request.get(ruta).set(como(u));
const mios = (res) => res.body.data.filter((r) => ids.informes.todos.includes(r.id));
const campusDe = (filas) => [...new Set(filas.map((r) => r.project_id))].sort();

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
  ids.informes.todos = [];
  for (const c of [PSIKO, FONO, ICT]) {
    const r = await one(`INSERT INTO reports (project_id, periodo, content, metadata, generated_by) VALUES ($1, '2026-10', 'informe', '{}', $2) RETURNING id`, [c, SUPER.id]);
    ids.informes[c] = r.id;
    ids.informes.todos.push(r.id);
  }
}, 60000);

afterAll(async () => {
  await q('DELETE FROM reports WHERE id = ANY($1::uuid[])', [ids.informes.todos]);
  await q('DELETE FROM user_projects WHERE user_id = ANY($1::int[])', [ids.users]);
  await q('DELETE FROM users WHERE id = ANY($1::int[])', [ids.users]);
  await q('DELETE FROM projects WHERE id = ANY($1::int[])', [ids.projects]);
  await q('DELETE FROM invoice_issuers WHERE id = ANY($1::int[])', [ids.issuers]);
  await pool.end();
});

describe('#218 · GET /reports-ia/ambito', () => {
  it('con «Todos», un admin ve los informes de sus campus, cada uno con su campus', async () => {
    const res = await pedir(ADMIN, '/api/reports-ia/ambito');
    expect(res.status).toBe(200);
    expect(campusDe(mios(res))).toEqual([PSIKO, FONO].sort());
    expect(mios(res).find((r) => r.project_id === FONO).proyecto_nombre).toBe(`${MARCA} fono`);
  });

  it('con una empresa, los de esa empresa; el de otra empresa no se cuela ni pidiéndolo', async () => {
    expect(campusDe(mios(await pedir(ADMIN, `/api/reports-ia/ambito?issuerId=${CEDIA}`)))).toEqual([PSIKO, FONO].sort());
    expect(mios(await pedir(ADMIN, `/api/reports-ia/ambito?projectIds=${ICT}`)).some((r) => r.project_id === ICT)).toBe(false);
  });

  it('el superadmin ve también los de otras empresas', async () => {
    expect(campusDe(mios(await pedir(SUPER, '/api/reports-ia/ambito')))).toEqual([PSIKO, FONO, ICT].sort());
  });

  it('«ambito» no se confunde con un campus: la lista de uno sigue igual', async () => {
    const res = await pedir(ADMIN, `/api/reports-ia/${PSIKO}`);
    expect(res.status).toBe(200);
    expect(campusDe(mios(res))).toEqual([PSIKO]);
  });
});

describe('#218 · el hueco: el informe de un campus ajeno', () => {
  it('el detalle de uno ajeno da 404, como si no existiera; el suyo, sí', async () => {
    expect((await pedir(ADMIN, `/api/reports-ia/detail/${ids.informes[ICT]}`)).status).toBe(404);
    expect((await pedir(ADMIN, `/api/reports-ia/detail/${ids.informes[PSIKO]}`)).status).toBe(200);
    expect((await pedir(SUPER, `/api/reports-ia/detail/${ids.informes[ICT]}`)).status).toBe(200);
  });

  it('el PDF de uno ajeno, tampoco', async () => {
    const res = await request.post(`/api/reports-ia/${ids.informes[ICT]}/export-pdf`).set(como(ADMIN));
    expect(res.status).toBe(404);
  });

  it('generar el de un campus de otra empresa da 403, antes de gastar nada', async () => {
    const res = await request.post(`/api/reports-ia/${ICT}/generate`).set(como(ADMIN)).send({ periodo: '2026-10' });
    expect(res.status).toBe(403);
  });
});
