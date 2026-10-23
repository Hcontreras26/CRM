import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../src/shared/config/db.js';

/**
 * #423, fase 5 · La migración 222 deja a cada persona como estaba.
 *
 * Personas de prueba con cada rol y cada casilla; se pasa la migración (dos
 * veces) y se comprueba:
 *   - cada una tiene EXACTAMENTE las excepciones que dice `casillas.js`, la
 *     regla escrita en JS que usan las pruebas y el menú;
 *   - lo guardado sobre claves que no surtían efecto se archiva y se quita,
 *     y lo que sí se miraba se queda (en excepciones y en roles a medida);
 *   - todo queda en el registro, y la segunda pasada no repite nada.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const SQL = fs.readFileSync(path.resolve(aqui, '../migrations/222_permisos_casillas_a_excepciones.sql'), 'utf8');
// La 222 se pasa con un candado: las pruebas van en paralelo y dos migraciones
// a la vez sobre la misma base se pisarían (en un despliegue va una sola vez).
async function pasarLa222() {
  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock(423)');
    await c.query(SQL);
  } finally {
    await c.query('SELECT pg_advisory_unlock(423)');
    c.release();
  }
}

const { excepcionesDeCasillas } = await import('../src/modules/permissions/casillas.js');

const MARCA = `CAS423_${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const personas = [];
let rolMedida;

const ROLES = ['admin', 'gestor', 'soporte', 'project_manager', 'tutor', 'colaborador', 'superadmin'];
const CASILLAS = [
  {}, { factura_manager: true }, { editar_fechas_factura: true }, { gestor_colaboraciones: true },
  { usa_mcp: true }, { usa_whatsapp: false },
  { factura_manager: true, editar_fechas_factura: true, usa_mcp: true },
];

beforeAll(async () => {
  let n = 0;
  for (const role of ROLES) {
    for (const c of CASILLAS) {
      n += 1;
      const u = { role, factura_manager: false, editar_fechas_factura: false, gestor_colaboraciones: false, usa_mcp: false, usa_whatsapp: true, ...c };
      const [fila] = await q(
        `INSERT INTO users (nombre, email, password_hash, role, factura_manager, editar_fechas_factura, gestor_colaboraciones, usa_mcp, usa_whatsapp)
         VALUES ($1, $2, 'x', $3, $4, $5, $6, $7, $8) RETURNING id`,
        [`${MARCA} ${n}`, `p${n}_${MARCA.toLowerCase()}@test.local`, role,
          u.factura_manager, u.editar_fechas_factura, u.gestor_colaboraciones, u.usa_mcp, u.usa_whatsapp]);
      personas.push({ ...u, id: fila.id });
    }
  }
  // Una gestora con una excepción que antes no hacía nada y otra que sí.
  const g = personas.find((p) => p.role === 'gestor' && !p.factura_manager && !p.usa_mcp && p.usa_whatsapp);
  await q(`INSERT INTO user_permission_overrides (user_id, resource, action, allowed) VALUES ($1, 'users', 'view', true), ($1, 'diplomas', 'view', true)`, [g.id]);
  // Un rol a medida con lo mismo en su JSON.
  [rolMedida] = await q(`INSERT INTO custom_roles (label, base_role, permissions) VALUES ($1, 'gestor', $2) RETURNING id`,
    [`${MARCA} medida`, JSON.stringify({ 'leads.export': true, 'reports.view': true, 'tasks.close': true })]);

  await pasarLa222();
  await pasarLa222(); // dos veces: no repite nada
}, 60000);

afterAll(async () => {
  const ids = personas.map((p) => p.id);
  await q('DELETE FROM permisos_registro WHERE usuario_id = ANY($1::int[]) OR custom_role_id = $2', [ids, rolMedida.id]);
  await q('DELETE FROM permisos_inertes_archivo WHERE usuario_id = ANY($1::int[]) OR custom_role_id = $2', [ids, rolMedida.id]);
  await q('DELETE FROM users WHERE id = ANY($1::int[])', [ids]);
  await q('DELETE FROM custom_roles WHERE id = $1', [rolMedida.id]);
});

describe('migración 222: las casillas, como excepciones (#423)', () => {
  it('cada persona tiene exactamente las excepciones de `casillas.js`', async () => {
    const distintas = [];
    for (const p of personas) {
      const filas = await q(`SELECT resource || '.' || action AS clave, allowed FROM user_permission_overrides WHERE user_id = $1`, [p.id]);
      const tiene = Object.fromEntries(filas.map((f) => [f.clave, f.allowed]));
      delete tiene['diplomas.view']; // la que ya tenía a mano (se queda: ver abajo)
      const espera = excepcionesDeCasillas(p);
      if (JSON.stringify(Object.entries(tiene).sort()) !== JSON.stringify(Object.entries(espera).sort())) {
        distintas.push(`${p.role} ${JSON.stringify(p)}: ${JSON.stringify(tiene)} ≠ ${JSON.stringify(espera)}`);
      }
    }
    expect(distintas).toEqual([]);
  });

  it('cada excepción nueva queda en el registro, una sola vez', async () => {
    const ids = personas.map((p) => p.id);
    const filas = await q(`SELECT usuario_id, clave, COUNT(*)::int AS n FROM permisos_registro
                            WHERE usuario_id = ANY($1::int[]) AND origen = 'migracion_222' AND motivo LIKE 'La casilla%'
                            GROUP BY 1, 2`, [ids]);
    const esperadas = personas.reduce((a, p) => a + Object.keys(excepcionesDeCasillas(p)).length, 0);
    expect(filas.length).toBe(esperadas);
    expect(filas.every((f) => f.n === 1)).toBe(true);
  });

  it('lo que no surtía efecto se archiva y se quita; lo que sí, se queda', async () => {
    const g = personas.find((p) => p.role === 'gestor' && !p.factura_manager && !p.usa_mcp && p.usa_whatsapp);
    const suyas = await q(`SELECT resource || '.' || action AS clave FROM user_permission_overrides WHERE user_id = $1 ORDER BY 1`, [g.id]);
    expect(suyas.map((x) => x.clave)).toEqual(['diplomas.view']);
    expect(await q(`SELECT clave, valor FROM permisos_inertes_archivo WHERE usuario_id = $1`, [g.id]))
      .toEqual([{ clave: 'users.view', valor: true }]);
  });

  it('en un rol a medida, igual: fuera lo que no hacía nada; dentro lo de Tareas y lo que miraba la pantalla (punto 5)', async () => {
    const [cr] = await q('SELECT permissions FROM custom_roles WHERE id = $1', [rolMedida.id]);
    expect(cr.permissions).toEqual({ 'leads.export': true, 'tasks.close': true });
    expect(await q(`SELECT clave, valor FROM permisos_inertes_archivo WHERE custom_role_id = $1`, [rolMedida.id]))
      .toEqual([{ clave: 'reports.view', valor: true }]);
  });
});
