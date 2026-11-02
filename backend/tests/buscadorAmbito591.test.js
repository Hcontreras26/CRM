import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * #591 · El buscador (Ctrl K) contra la ruta de verdad: `GET /api/leads?search=`.
 *
 * Lo que no debe pasar nunca: que una gestora encuentre el prospecto de otra.
 * Y lo que tiene que funcionar: sin acentos, teléfonos con espacios, y
 * «Todos» / una empresa arriba (projectIds sin projectId).
 *
 *   npx vitest run tests/buscadorAmbito591.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const { default: modulo } = await import('../src/modules/leads/index.js');
const { errorHandler } = await import('../src/shared/middleware/errorHandler.js');

const app = express();
app.use(express.json());
app.use(modulo.prefix, modulo.router);
app.use(errorHandler);
const request = supertest(app);

const MARCA = `BUS${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const ids = { users: [], projects: [], leads: [] };
let P; let OTRO; let ADMIN; let GESTORA; let OTRA_GESTORA; let SOPORTE;
let DE_GESTORA; let DE_OTRA; let DEL_OTRO_CAMPUS;

const como = (u) => ({ Authorization: `Bearer ${jwt.sign({ userId: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '10m' })}` });
const buscar = (u, ambito, texto) => request.get(`/api/leads?${ambito}&search=${encodeURIComponent(texto)}&limit=20&includeConverted=1`).set(como(u));
const idsDe = (r) => r.body.data.map((l) => l.id);

async function persona(n, role, campus = []) {
  const [u] = await q(
    `INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, role`,
    [`${MARCA} ${n}`, `${n.toLowerCase()}@${MARCA.toLowerCase()}.test`, role]);
  ids.users.push(u.id);
  for (const c of campus) await q(`INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)`, [u.id, c]);
  return u;
}
async function lead(projectId, nombre, telefono, responsableId = null) {
  const [l] = await q(
    `INSERT INTO leads (project_id, nombre, email, telefono, responsable_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [projectId, nombre, `${Math.random().toString(36).slice(2, 9)}@lead.${MARCA.toLowerCase()}.test`, telefono, responsableId]);
  ids.leads.push(l.id);
  return l.id;
}

beforeAll(async () => {
  await q('CREATE EXTENSION IF NOT EXISTS unaccent');
  const proy = async (c) => {
    const [p] = await q(`INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
      [`${MARCA} ${c}`, `${MARCA.toLowerCase()}-${c}`, `${MARCA}-key-${c}`]);
    ids.projects.push(p.id);
    return p.id;
  };
  P = await proy('a'); OTRO = await proy('b');
  ADMIN = await persona('ADMIN', 'admin', [P]);
  GESTORA = await persona('GESTORA', 'gestor', [P]);
  OTRA_GESTORA = await persona('OTRAGESTORA', 'gestor', [P]);
  SOPORTE = await persona('SOPORTE', 'soporte');
  DE_GESTORA = await lead(P, `${MARCA} Diana González`, '+34626276414', GESTORA.id);
  DE_OTRA = await lead(P, `${MARCA} José Pérez`, '34 676836952', OTRA_GESTORA.id);
  DEL_OTRO_CAMPUS = await lead(OTRO, `${MARCA} Lucía Gómez`, '+34611000000');
}, 60000);

afterAll(async () => {
  await q(`DELETE FROM leads WHERE id = ANY($1::int[])`, [ids.leads]);
  await q(`DELETE FROM user_projects WHERE user_id = ANY($1::int[])`, [ids.users]);
  await q(`DELETE FROM users WHERE id = ANY($1::int[])`, [ids.users]);
  await q(`DELETE FROM projects WHERE id = ANY($1::int[])`, [ids.projects]);
  await pool.end();
}, 60000);

describe('lo que encuentra cada uno', () => {
  it('sin acentos: «gonzalez» encuentra a «González» y «jose» a «José»', async () => {
    expect(idsDe(await buscar(ADMIN, `projectId=${P}`, `${MARCA} diana gonzalez`))).toEqual([DE_GESTORA]);
    expect(idsDe(await buscar(ADMIN, `projectId=${P}`, `${MARCA} jose`))).toEqual([DE_OTRA]);
  });

  it('teléfono con espacios: «626 27 64 14» encuentra «+34626276414», y al revés', async () => {
    expect(idsDe(await buscar(ADMIN, `projectId=${P}`, '626 27 64 14'))).toContain(DE_GESTORA);
    expect(idsDe(await buscar(ADMIN, `projectId=${P}`, '+34 676 836 952'))).toContain(DE_OTRA);
  });

  it('una gestora que busca el prospecto de otra gestora: 0 resultados', async () => {
    const r = await buscar(GESTORA, `projectId=${P}`, `${MARCA} jose`);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([]);
    expect(idsDe(await buscar(GESTORA, `projectId=${P}`, `${MARCA} diana gonzalez`))).toEqual([DE_GESTORA]);
  });

  it('«Todos» o una empresa: projectIds sin projectId responde 200', async () => {
    const r = await buscar(ADMIN, `projectIds=${P}`, `${MARCA}`);
    expect(r.status).toBe(200);
    expect(idsDe(r).sort()).toEqual([DE_GESTORA, DE_OTRA].sort());
  });
});

// Que un admin no busque en campus que no son suyos es de la PR aparte
// fix/ambito-listas (tests/leadsAmbito.test.js): aquí solo el buscador.
describe('soporte', () => {
  it('ve todos los campus', async () => {
    expect(idsDe(await buscar(SOPORTE, `projectId=${OTRO}`, `${MARCA}`))).toEqual([DEL_OTRO_CAMPUS]);
  });
});
