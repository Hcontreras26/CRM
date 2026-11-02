import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * #591 · Tareas y consultas, sin acentos, como las personas.
 *
 * Se vio probando el buscador (Ctrl K) en local: un colaborador escribía
 * «campana de otono» y no le salía su tarea «Revisar campaña de otoño»; un
 * tutor, «maria» y no salía «María». La búsqueda de las dos rutas era un ILIKE
 * a secas. Ahora va con `unaccent`, como `GET /api/leads` (migración 235).
 *
 *   npx vitest run tests/buscadorSinAcentos591.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const { default: tareas } = await import('../src/modules/tasks/index.js');
const { default: consultas } = await import('../src/modules/consultas/index.js');
const { errorHandler } = await import('../src/shared/middleware/errorHandler.js');

const app = express();
app.use(express.json());
app.use(tareas.prefix, tareas.router);
app.use(consultas.prefix, consultas.router);
app.use(errorHandler);
const request = supertest(app);

const MARCA = `SAC${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const ids = { users: [], projects: [], tasks: [], consultas: [] };
let P; let COLAB; let TUTOR; let TAREA; let CONSULTA;
const como = (u) => ({ Authorization: `Bearer ${jwt.sign({ userId: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '10m' })}` });

async function persona(n, role) {
  const [u] = await q(`INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, role`,
    [`${MARCA} ${n}`, `${n.toLowerCase()}@${MARCA.toLowerCase()}.test`, role]);
  ids.users.push(u.id);
  await q(`INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)`, [u.id, P]);
  return u;
}

beforeAll(async () => {
  await q('CREATE EXTENSION IF NOT EXISTS unaccent');
  [{ id: P }] = await q(`INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
    [`${MARCA} a`, `${MARCA.toLowerCase()}-a`, `${MARCA}-key`]);
  ids.projects.push(P);
  COLAB = await persona('Colab', 'colaborador');
  TUTOR = await persona('Tutor', 'tutor');
  [{ id: TAREA }] = await q(`INSERT INTO tasks (title, created_by, assigned_to, project_id) VALUES ($1, $2, $2, $3) RETURNING id`,
    [`${MARCA} Revisar campaña de otoño`, COLAB.id, P]);
  ids.tasks.push(TAREA);
  [{ id: CONSULTA }] = await q(`INSERT INTO consultas (project_id, alumno_nombre, curso_nombre, tutor_id) VALUES ($1, $2, 'Diplomado en Neuropsicología', $3) RETURNING id`,
    [P, `${MARCA} María Núñez`, TUTOR.id]);
  ids.consultas.push(CONSULTA);
}, 60000);

afterAll(async () => {
  await q(`DELETE FROM consultas WHERE id = ANY($1::int[])`, [ids.consultas]);
  await q(`DELETE FROM tasks WHERE id = ANY($1::int[])`, [ids.tasks]);
  await q(`DELETE FROM user_projects WHERE user_id = ANY($1::int[])`, [ids.users]);
  await q(`DELETE FROM users WHERE id = ANY($1::int[])`, [ids.users]);
  await q(`DELETE FROM projects WHERE id = ANY($1::int[])`, [ids.projects]);
  await pool.end();
}, 60000);

const lista = (r) => (Array.isArray(r.body.data) ? r.body.data : r.body.data?.consultas || []);

describe('tareas, sin acentos', () => {
  it('«campana de otono» encuentra «campaña de otoño»', async () => {
    const r = await request.get(`/api/tasks?search=${encodeURIComponent(`${MARCA} revisar campana de otono`)}`).set(como(COLAB));
    expect(r.status).toBe(200);
    expect(lista(r).map((t) => t.id)).toEqual([TAREA]);
  });

  it('con el acento, también', async () => {
    const r = await request.get(`/api/tasks?search=${encodeURIComponent('campaña de otoño')}`).set(como(COLAB));
    expect(lista(r).map((t) => t.id)).toContain(TAREA);
  });
});

describe('consultas del tutor, sin acentos', () => {
  it('«maria nunez» encuentra «María Núñez»', async () => {
    const r = await request.get(`/api/consultas/mias?buscar=${encodeURIComponent(`${MARCA} maria nunez`)}`).set(como(TUTOR));
    expect(r.status).toBe(200);
    expect(lista(r).map((c) => c.id)).toEqual([CONSULTA]);
  });

  it('y por el curso: «neuropsicologia»', async () => {
    const r = await request.get('/api/consultas/mias?buscar=neuropsicologia').set(como(TUTOR));
    expect(lista(r).map((c) => c.id)).toContain(CONSULTA);
  });
});
