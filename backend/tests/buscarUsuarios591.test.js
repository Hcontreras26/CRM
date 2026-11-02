import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * #591 · Buscar usuarios desde el buscador (Ctrl K): `GET /api/users/buscar`.
 *
 * Diego, 02/11: el superadmin encuentra a todos; un admin, solo a los de sus
 * campus. Y la excepción que pide la tarea: una gestora a la que se le da
 * `users.view` encuentra usuarios (de sus campus); sin él, 403.
 *
 *   npx vitest run tests/buscarUsuarios591.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const { default: modulo } = await import('../src/modules/users/index.js');
const { errorHandler } = await import('../src/shared/middleware/errorHandler.js');

const app = express();
app.use(express.json());
app.use(modulo.prefix, modulo.router);
app.use(errorHandler);
const request = supertest(app);

const MARCA = `BUU${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const ids = { users: [], projects: [] };
let P; let OTRO; let SUPER; let ADMIN; let GESTORA; let GESTORA_CON; let JOSE_P; let LUCIA_OTRO; let TUTOR_P;

const como = (u) => ({ Authorization: `Bearer ${jwt.sign({ userId: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '10m' })}` });
const buscar = (u, texto, extra = '') => request.get(`/api/users/buscar?q=${encodeURIComponent(texto)}${extra}`).set(como(u));
const idsDe = (r) => r.body.data.map((x) => x.id);

async function persona(n, role, campus = []) {
  const [u] = await q(
    `INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, role`,
    [`${MARCA} ${n}`, `${n.toLowerCase().replace(/[^a-z]/g, '')}@${MARCA.toLowerCase()}.test`, role]);
  ids.users.push(u.id);
  for (const c of campus) await q(`INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)`, [u.id, c]);
  return u;
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
  SUPER = await persona('Super', 'superadmin');
  ADMIN = await persona('Admin', 'admin', [P]);
  GESTORA = await persona('Gestora', 'gestor', [P]);
  GESTORA_CON = await persona('GestoraCon', 'gestor', [P]);
  await q(`INSERT INTO user_permission_overrides (user_id, resource, action, allowed) VALUES ($1, 'users', 'view', true)`, [GESTORA_CON.id]);
  JOSE_P = await persona('José Pérez', 'gestor', [P]);
  LUCIA_OTRO = await persona('Lucía Gómez', 'gestor', [OTRO]);
  TUTOR_P = await persona('Tutor Tomás', 'tutor', [P]);
}, 60000);

afterAll(async () => {
  await q(`DELETE FROM user_permission_overrides WHERE user_id = ANY($1::int[])`, [ids.users]);
  await q(`DELETE FROM user_projects WHERE user_id = ANY($1::int[])`, [ids.users]);
  await q(`DELETE FROM users WHERE id = ANY($1::int[])`, [ids.users]);
  await q(`DELETE FROM projects WHERE id = ANY($1::int[])`, [ids.projects]);
  await pool.end();
}, 60000);

describe('quién encuentra a quién', () => {
  it('el superadmin encuentra a los de todos los campus, sin acentos', async () => {
    const r = await buscar(SUPER, `${MARCA} jose`);
    expect(r.status).toBe(200);
    expect(idsDe(r)).toEqual([JOSE_P.id]);
    expect(idsDe(await buscar(SUPER, `${MARCA} lucia`))).toEqual([LUCIA_OTRO.id]);
  });

  it('un admin, solo a los de sus campus', async () => {
    expect(idsDe(await buscar(ADMIN, `${MARCA} jose`))).toEqual([JOSE_P.id]);
    expect(idsDe(await buscar(ADMIN, `${MARCA} lucia`))).toEqual([]);
  });

  it('pidiendo un campus que no es suyo, nada (nunca «todos»)', async () => {
    const r = await buscar(ADMIN, MARCA, `&projectIds=${OTRO}`);
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([]);
  });

  it('por correo también', async () => {
    expect(idsDe(await buscar(ADMIN, `josprez@${MARCA.toLowerCase()}`))).toEqual([JOSE_P.id]);
  });

  it('los tutores no salen aquí (tienen su pantalla)', async () => {
    expect(idsDe(await buscar(SUPER, `${MARCA} tomas`))).toEqual([]);
    expect(TUTOR_P.id).toBeTruthy();
  });
});

describe('la excepción de la tarea: manda el permiso, no el rol', () => {
  it('una gestora sin users.view: 403', async () => {
    expect((await buscar(GESTORA, `${MARCA} jose`)).status).toBe(403);
  });

  it('una gestora a la que se le da users.view encuentra usuarios de sus campus', async () => {
    const r = await buscar(GESTORA_CON, `${MARCA} jose`);
    expect(r.status).toBe(200);
    expect(idsDe(r)).toEqual([JOSE_P.id]);
    expect(idsDe(await buscar(GESTORA_CON, `${MARCA} lucia`))).toEqual([]);
  });

  it('menos de dos letras: 400', async () => {
    expect((await buscar(ADMIN, 'j')).status).toBe(400);
  });
});
