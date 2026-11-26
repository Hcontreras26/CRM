import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * El aviso de la semana de Search Console (CRM#1156) contra la base de verdad:
 * a quién llega (quien puede verlo en ESE campus: por permiso, no por rol), que
 * no se repite el mismo lunes y que la ruta de la semana no falla sin datos.
 *
 *   npm run db:preparar && npx vitest run tests/searchConsoleAvisoBase1156.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const { avisarSiCae, semanaDe, umbrales } = await import('../src/modules/search-console/search-console.aviso.js');

const MARCA = `GSC1156${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const LUNES = new Date('2026-11-23T10:00:00Z');
const U = umbrales({});
let P;
let OTRO;
const u = {};

beforeAll(async () => {
  const campus = async (n) => (await q(
    `INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
    [`${MARCA} ${n}`, `${MARCA}-${n}`.toLowerCase(), `${MARCA}-${n}-key`]))[0].id;
  P = await campus('uno');
  OTRO = await campus('dos');
  const usuario = async (clave, role, projectId) => {
    const [r] = await q(
      `INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id`,
      [`${MARCA} ${clave}`, `${clave}.${MARCA}@prueba.test`.toLowerCase(), role]);
    if (projectId) await q(`INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)`, [r.id, projectId]);
    u[clave] = r.id;
  };
  await usuario('admin', 'admin', P);
  await usuario('adminOtro', 'admin', OTRO);
  await usuario('gestora', 'gestor', P);
  // Revisión de Diego (PR #1165): por permiso, no por rol.
  await usuario('adminSinPermiso', 'admin', P);
  await q(`INSERT INTO user_permission_overrides (user_id, resource, action, allowed) VALUES ($1, 'search_console', 'view', false)`,
    [u.adminSinPermiso]);
  await usuario('pm', 'project_manager', P);
  await usuario('gestoraConPermiso', 'gestor', P);
  await q(`INSERT INTO user_permission_overrides (user_id, resource, action, allowed) VALUES ($1, 'search_console', 'view', true)`,
    [u.gestoraConPermiso]);

  // 14 días hasta el domingo 22/11: 100 clics al día la semana anterior, 60 la última.
  const fin = Date.parse('2026-11-22T00:00:00Z');
  for (let i = 0; i < 14; i += 1) {
    const f = new Date(fin - i * 86400000).toISOString().slice(0, 10);
    await q(`INSERT INTO gsc_diario (project_id, fecha, clics, impresiones, posicion_suma) VALUES ($1, $2, $3, 1000, 8000)`,
      [P, f, i < 7 ? 60 : 100]);
  }
}, 60000);

afterAll(async () => {
  await q(`DELETE FROM admin_notifications WHERE type = 'gsc_caida' AND metadata->>'project_id' = ANY($1::text[])`, [[String(P), String(OTRO)]]);
  await q(`DELETE FROM user_permission_overrides WHERE user_id = ANY($1::int[])`, [Object.values(u)]);
  await q(`DELETE FROM user_projects WHERE user_id = ANY($1::int[])`, [Object.values(u)]);
  await q(`DELETE FROM users WHERE id = ANY($1::int[])`, [Object.values(u)]);
  await q(`DELETE FROM projects WHERE id = ANY($1::int[])`, [[P, OTRO]]);
  await pool.end();
});

describe('el aviso, en la base', () => {
  it('cae el 40 % → un aviso a quien puede verlo en ese campus, no a los de otro ni a la gestora', async () => {
    const r = await avisarSiCae(P, `${MARCA} uno`, { ahora: LUNES, u: U });
    expect(r.avisado).toBe(true);
    const [n] = await q(`SELECT * FROM admin_notifications WHERE id = $1`, [r.notificacion]);
    expect(n.type).toBe('gsc_caida');
    expect(n.target_user_ids).toContain(u.admin);
    expect(n.target_user_ids).not.toContain(u.adminOtro);
    expect(n.target_user_ids).not.toContain(u.gestora);
    // Por permiso, no por rol: el admin al que se le quitó no lo recibe; el
    // project manager (lo trae de serie) y la gestora con excepción, sí.
    expect(n.target_user_ids).not.toContain(u.adminSinPermiso);
    expect(n.target_user_ids).toContain(u.pm);
    expect(n.target_user_ids).toContain(u.gestoraConPermiso);
    expect(n.metadata).toMatchObject({ project_id: P, lunes: '2026-11-23', caidas: [{ metrica: 'clics', variacion: -40 }] });
  });

  it('otra vuelta el mismo lunes no lo repite', async () => {
    const r = await avisarSiCae(P, `${MARCA} uno`, { ahora: new Date('2026-11-23T18:00:00Z'), u: U });
    expect(r).toMatchObject({ avisado: false, motivo: 'ya_avisado' });
    const filas = await q(`SELECT 1 FROM admin_notifications WHERE type = 'gsc_caida' AND metadata->>'project_id' = $1`, [String(P)]);
    expect(filas).toHaveLength(1);
  });

  it('un campus sin datos de Search Console no da error', async () => {
    expect(await semanaDe(OTRO, { ahora: LUNES })).toEqual({ con_datos: false });
    expect((await avisarSiCae(OTRO, 'dos', { ahora: LUNES, u: U })).motivo).toBe('sin_datos');
  });
});
