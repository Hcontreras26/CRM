import {
  describe, it, expect, beforeAll, afterAll,
} from 'vitest';
import { query } from '../src/shared/config/db.js';
import { createManualLead } from '../src/modules/leads/lead.service.js';

/**
 * Venta sin gestora con cliente nuevo: crear el prospecto sin dueño.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE EXISTE
 *
 * `createManualLead` reasignaba `advanceRoundRobin`, que es `const` desde el
 * 18/09. Cada «Registrar venta» sin gestora y con cliente nuevo moría con
 * «Assignment to constant variable» antes de crear nada:
 *
 *   - 28/09, Ana, refs 6TY103 y CDC8R9: arreglado quitando la línea.
 *   - 01/10, Ana otra vez, refs T0JQXT y 27M1G9: la fusión de la 2.0.0 con
 *     producción (29/09) había devuelto el bloque viejo junto al bueno.
 *
 * Las dos veces lo descubrió una gestora en producción. `node --check` no lo
 * ve —es un error de ejecución, no de sintaxis—, así que la prueba tiene que
 * llamar a la función de verdad, con `sinResponsable`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const marca = `t${Date.now()}`;
let projectId = null;
let gestoraId = null;
let hayBase = true;
let porQueNo = null;

beforeAll(async () => {
  try {
    const { rows } = await query(
      `INSERT INTO projects (nombre, slug, webhook_api_key, active)
       VALUES ($1, $2, $3, true) RETURNING id`,
      [`Venta sin gestora ${marca}`, `venta-sin-gestora-${marca}`, `k-${marca}`]
    );
    projectId = rows[0].id;
    const u = await query(
      `INSERT INTO users (nombre, email, password_hash, role, active, is_available)
       VALUES ($1, $2, 'x', 'gestor', true, true) RETURNING id`,
      [`Gestora ${marca}`, `gestora.${marca}@test.local`]
    );
    gestoraId = u.rows[0].id;
    await query(
      `INSERT INTO user_projects (user_id, project_id, active, orden_cola)
       VALUES ($1, $2, true, 1)`,
      [gestoraId, projectId]
    );
  } catch (err) {
    hayBase = false;
    porQueNo = err.message;
  }
});

afterAll(async () => {
  if (!projectId) return;
  // Lo que cuelga del lead primero; cada borrado por separado para que un
  // nombre de tabla que no exista en esta base no deje lo demás sin limpiar.
  for (const sql of [
    'DELETE FROM lead_steps WHERE lead_id IN (SELECT id FROM leads WHERE project_id = $1)',
    'DELETE FROM lead_interactions WHERE lead_id IN (SELECT id FROM leads WHERE project_id = $1)',
    'DELETE FROM leads WHERE project_id = $1',
    'DELETE FROM user_projects WHERE project_id = $1',
    'DELETE FROM project_queue_state WHERE project_id = $1',
    'DELETE FROM projects WHERE id = $1',
  ]) {
    try { await query(sql, [projectId]); } catch { /* sigue con el resto */ }
  }
  if (gestoraId) await query('DELETE FROM users WHERE id = $1', [gestoraId]).catch(() => {});
});

describe('Venta sin gestora con cliente nuevo', () => {
  it('hay base contra la que probar', () => {
    expect(hayBase, porQueNo || '').toBe(true);
  });

  it('crea el prospecto sin dueño aunque lo registre una gestora', async () => {
    if (!hayBase) return;
    const creado = await createManualLead(
      {
        project_id: projectId,
        nombre: `Cliente ${marca}`,
        email: `cliente.${marca}@test.local`,
        telefono: null,
        canal: 'directo',
      },
      { creatorUser: { userId: gestoraId, role: 'gestor' }, sinResponsable: true }
    );

    expect(creado.lead_id).toBeTruthy();
    const { rows } = await query('SELECT responsable_id FROM leads WHERE id = $1', [creado.lead_id]);
    expect(rows[0].responsable_id).toBeNull();
  });

  it('sin «sin gestora», el prospecto sigue siendo de quien lo registra', async () => {
    if (!hayBase) return;
    const creado = await createManualLead(
      {
        project_id: projectId,
        nombre: `Cliente propio ${marca}`,
        email: `propio.${marca}@test.local`,
        telefono: null,
        canal: 'directo',
      },
      { creatorUser: { userId: gestoraId, role: 'gestor' } }
    );

    const { rows } = await query('SELECT responsable_id FROM leads WHERE id = $1', [creado.lead_id]);
    expect(rows[0].responsable_id).toBe(gestoraId);
  });
});
