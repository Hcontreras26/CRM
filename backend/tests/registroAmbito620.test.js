import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * El Registro, por campus (Diego, 03/11, #620): «todo debe estar alineado: el
 * admin ve las pestañas por campus y empresas, según sus roles».
 *
 *   · Lo que tiene campus, solo de los de quien mira (`listaDelAmbito`).
 *   · Lo que no tiene campus —errores, tareas, un inicio de sesión—, solo con
 *     `registro.sistema` (de serie, soporte; el super admin lo tiene todo).
 *   · No depende de la fuente sino de la fila: un correo con campus se recorta
 *     por campus; uno sin campus es del sistema.
 *   · La lista, las fuentes y el CSV, igual.
 *
 *   npx vitest run tests/registroAmbito620.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const { default: modulo } = await import('../src/modules/registro/index.js');
const { errorHandler } = await import('../src/shared/middleware/errorHandler.js');
const { olvidarTablas } = await import('../src/modules/registro/registro.model.js');

const app = express();
app.use(express.json());
app.use(modulo.prefix, modulo.router);
app.use(errorHandler);
const request = supertest(app);

const MARCA = `RG620${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const one = async (sql, p) => (await q(sql, p))[0];
const ids = { users: [], projects: [], leads: [], correos: [], errores: [] };
let MIO; let AJENO; let ADMIN; let SOPORTE; let SUPER;

const como = (u) => ({ Authorization: `Bearer ${jwt.sign({ userId: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '10m' })}` });
const pedir = (u, ruta) => request.get(ruta).set(como(u));
/** Lo de esta prueba, para no mezclarlo con lo que haya en la base. */
const mias = (r) => r.body.data.filas.filter((f) => `${f.resumen} ${f.entidad_nombre || ''}`.includes(MARCA)).map((f) => f.resumen).sort();

beforeAll(async () => {
  olvidarTablas();
  const campus = async (c) => {
    const p = await one(`INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
      [`${MARCA} ${c}`, `${MARCA.toLowerCase()}-${c}`, `${MARCA}-k-${c}`]);
    ids.projects.push(p.id);
    // Un cambio en una ficha de ese campus.
    const l = await one(`INSERT INTO leads (project_id, nombre, email) VALUES ($1, $2, $3) RETURNING id`, [p.id, `${MARCA} lead ${c}`, `${c}@${MARCA.toLowerCase()}.test`]);
    ids.leads.push(l.id);
    await q(`INSERT INTO lead_audit_log (lead_id, field_name, old_value, new_value) VALUES ($1, 'notas', '', $2)`, [l.id, `${MARCA} ficha ${c}`]);
    // Un correo de ese campus.
    const e = await one(`INSERT INTO email_envios (destinatarios, asunto, estado, project_id) VALUES ($1, $2, 'enviado', $3) RETURNING id`,
      [`${c}@${MARCA.toLowerCase()}.test`, `${MARCA} correo ${c}`, p.id]);
    ids.correos.push(e.id);
    return p.id;
  };
  MIO = await campus('mio'); AJENO = await campus('ajeno');
  // Lo de todo el sistema: un correo sin campus y un error del servidor.
  ids.correos.push((await one(`INSERT INTO email_envios (destinatarios, asunto, estado) VALUES ('sis@x.test', $1, 'enviado') RETURNING id`, [`${MARCA} correo sistema`])).id);
  ids.errores.push((await one(`INSERT INTO status_errors (method, path, status_code, message) VALUES ('GET', '/api/x', 500, $1) RETURNING id`, [`${MARCA} error`])).id);

  const persona = async (c, role, suyos) => {
    const u = await one(`INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, role`, [`${MARCA} ${c}`, `${c}@${MARCA.toLowerCase()}.test`, role]);
    ids.users.push(u.id);
    for (const p of suyos) await q('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [u.id, p]);
    return u;
  };
  ADMIN = await persona('admin', 'admin', [MIO]);
  SOPORTE = await persona('soporte', 'soporte', []);
  SUPER = await persona('super', 'superadmin', []);
}, 60000);

afterAll(async () => {
  await q('DELETE FROM lead_audit_log WHERE lead_id = ANY($1::int[])', [ids.leads]);
  await q('DELETE FROM leads WHERE id = ANY($1::int[])', [ids.leads]);
  await q('DELETE FROM email_envios WHERE id = ANY($1::int[])', [ids.correos]);
  await q('DELETE FROM status_errors WHERE id = ANY($1::int[])', [ids.errores]);
  await q('DELETE FROM user_projects WHERE user_id = ANY($1::int[])', [ids.users]);
  await q('DELETE FROM users WHERE id = ANY($1::int[])', [ids.users]);
  await q('DELETE FROM projects WHERE id = ANY($1::int[])', [ids.projects]);
  await pool.end();
}, 60000);

const TODO = '/api/registro?vista=todos&limite=500';

describe('el Registro, por campus (#620)', () => {
  it('un admin ve lo de SUS campus; ni lo de otro campus ni lo del sistema', async () => {
    const r = await pedir(ADMIN, TODO);
    expect(r.status).toBe(200);
    expect(mias(r)).toEqual([
      `Cambió notas a «${MARCA} ficha mio»`,
      expect.stringContaining(`${MARCA} correo mio`),
    ].sort());
    // Ni las fuentes que nunca traen campus.
    expect(r.body.data.fuentes).not.toContain('error');
    expect(r.body.data.fuentes).not.toContain('tarea');
  });

  it('soporte (registro.sistema) lo ve todo, también lo del sistema', async () => {
    const r = await pedir(SOPORTE, TODO);
    const vistas = mias(r).join(' | ');
    for (const algo of ['ficha mio', 'ficha ajeno', 'correo mio', 'correo ajeno', 'correo sistema', 'error']) {
      expect(vistas).toContain(`${MARCA} ${algo}`);
    }
  });

  it('el super admin, igual', async () => {
    expect(mias(await pedir(SUPER, TODO)).join(' | ')).toContain(`${MARCA} correo sistema`);
  });

  it('las fuentes: al admin no se le ofrecen Errores ni Tareas', async () => {
    const admin = (await pedir(ADMIN, '/api/registro/fuentes')).body.data.map((f) => f.nombre);
    expect(admin).not.toContain('error');
    expect(admin).not.toContain('tarea');
    const soporte = (await pedir(SOPORTE, '/api/registro/fuentes')).body.data.map((f) => f.nombre);
    expect(soporte).toEqual(expect.arrayContaining(['error', 'tarea']));
  });

  it('el CSV recorta igual que la lista', async () => {
    const r = await pedir(ADMIN, '/api/registro/csv?vista=todos');
    expect(r.status).toBe(200);
    expect(r.text).toContain(`${MARCA} ficha mio`);
    expect(r.text).not.toContain(`${MARCA} ficha ajeno`);
    expect(r.text).not.toContain(`${MARCA} correo sistema`);
    expect(r.text).not.toContain(`${MARCA} error`);
  });

  it('un admin que pide el campus de otro: 403', async () => {
    expect((await pedir(ADMIN, `${TODO}&projectId=${AJENO}`)).status).toBe(403);
  });
});
