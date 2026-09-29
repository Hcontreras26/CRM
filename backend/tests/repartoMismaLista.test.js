import {
  describe, it, expect, beforeAll, afterAll,
} from 'vitest';
import { query } from '../src/shared/config/db.js';
import { gestoresDelReparto, aQuienLeToca } from '../src/modules/leads/reparto.js';

/**
 * La pantalla de «a quién le toca» y el reparto de verdad, contra la BASE (#11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE EXISTE
 *
 * La lista de quién entra en el reparto estaba escrita dos veces y las dos no
 * decían lo mismo. `lead.model.js` —el que reparte— salta a quien está marcado
 * como no disponible, a quien tiene una ausencia hoy y a quien lleva las
 * colaboraciones de los profesores, y para que un admin entre le exige
 * `recibe_leads`. `shortcuts.controller.js` —el que iba a alimentar la
 * pantalla— no miraba nada de eso.
 *
 * O sea que la pantalla podía decir «el próximo es Laura» con Laura de
 * vacaciones. Y el equipo se organiza con lo que lee: una pantalla que nombra a
 * alguien con seguridad y se equivoca es peor que no tenerla.
 *
 * Esto va contra la base real y no simulada a propósito: lo que falla aquí son
 * las CONDICIONES de la consulta —un JOIN que no filtra, un NOT EXISTS que
 * falta—, y eso una base simulada lo aprueba siempre.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const marca = `t${Date.now()}`;
let projectId = null;
const ids = {};
let hayBase = true;
/** Por que no se pudo montar el escenario. Sin esto, el fallo es «false». */
let porQueNo = null;

async function nuevoUsuario(clave, { rol = 'gestor', activo = true, disponible = true, colaboraciones = false }) {
  const { rows } = await query(
    `INSERT INTO users (nombre, email, password_hash, role, active, is_available, gestor_colaboraciones)
     VALUES ($1, $2, 'x', $3, $4, $5, $6) RETURNING id`,
    [`${clave} ${marca}`, `${clave}.${marca}@test.local`, rol, activo, disponible, colaboraciones]
  );
  ids[clave] = rows[0].id;
  return rows[0].id;
}

async function alProyecto(clave, { orden, recibeLeads = false }) {
  await query(
    `INSERT INTO user_projects (user_id, project_id, active, orden_cola, recibe_leads)
     VALUES ($1, $2, true, $3, $4)`,
    [ids[clave], projectId, orden, recibeLeads]
  );
}

beforeAll(async () => {
  try {
    const { rows } = await query(
      `INSERT INTO projects (nombre, slug, webhook_api_key, active)
       VALUES ($1, $2, $3, true) RETURNING id`,
      [`Reparto ${marca}`, `reparto-${marca}`, `k-${marca}`]
    );
    projectId = rows[0].id;
  } catch (err) {
    // Se guarda el motivo. La primera version se lo tragaba y el fallo era un
    // `expect(false)` sin decir si faltaba la base o una columna obligatoria:
    // dos arreglos completamente distintos.
    hayBase = false;
    porQueNo = err.message;
    return;
  }

  // Siete personas, cada una en una situación distinta.
  await nuevoUsuario('normal', {});
  await nuevoUsuario('empatada', {});                       // mismo orden_cola que 'normal'
  await nuevoUsuario('vacaciones', {});
  await nuevoUsuario('nodisponible', { disponible: false });
  await nuevoUsuario('colaboraciones', { colaboraciones: true });
  await nuevoUsuario('adminsinleads', { rol: 'admin' });
  await nuevoUsuario('adminconleads', { rol: 'admin' });

  await alProyecto('normal', { orden: 1 });
  await alProyecto('empatada', { orden: 1 });               // empate a propósito
  await alProyecto('vacaciones', { orden: 2 });
  await alProyecto('nodisponible', { orden: 3 });
  await alProyecto('colaboraciones', { orden: 4 });
  await alProyecto('adminsinleads', { orden: 5, recibeLeads: false });
  await alProyecto('adminconleads', { orden: 6, recibeLeads: true });

  await query(
    `INSERT INTO user_availability_blocks (user_id, fecha_inicio, fecha_fin)
     VALUES ($1, CURRENT_DATE - 1, CURRENT_DATE + 1)`,
    [ids.vacaciones]
  );
});

afterAll(async () => {
  if (!hayBase || !projectId) return;
  const todos = Object.values(ids);
  await query('DELETE FROM user_availability_blocks WHERE user_id = ANY($1::int[])', [todos]);
  await query('DELETE FROM user_projects WHERE project_id = $1', [projectId]);
  await query('DELETE FROM project_queue_state WHERE project_id = $1', [projectId]);
  await query('DELETE FROM users WHERE id = ANY($1::int[])', [todos]);
  await query('DELETE FROM projects WHERE id = $1', [projectId]);
});

/**
 * SIN BASE ESTO NO COMPRUEBA NADA, Y HAY QUE DECIRLO
 *
 * Todo lo de abajo va contra el esquema real. Con la base apagada, el `beforeAll`
 * se traga el error y las comprobaciones pasarían con listas vacías: en verde
 * sin haber mirado nada.
 */
describe('la base tiene que estar', () => {
  it('se pudo crear el escenario, o esto no vale', () => {
    expect(
      hayBase && projectId,
      porQueNo
        ? `no se pudo montar el escenario: ${porQueNo}`
        : 'sin base no se comprueba nada. Levántala: docker compose -f docker-compose.dev.yml up -d'
    ).toBeTruthy();
  });
});

describe('quién entra en el reparto', () => {
  it('a quien está de vacaciones HOY no le toca', async () => {
    const g = await gestoresDelReparto(query, projectId);
    expect(g.map((x) => x.id)).not.toContain(ids.vacaciones);
  });

  it('a quien está marcado como no disponible tampoco', async () => {
    const g = await gestoresDelReparto(query, projectId);
    expect(g.map((x) => x.id)).not.toContain(ids.nodisponible);
  });

  it('quien lleva las colaboraciones no vende, así que no entra', async () => {
    const g = await gestoresDelReparto(query, projectId);
    expect(g.map((x) => x.id)).not.toContain(ids.colaboraciones);
  });

  it('un admin solo entra si tiene marcado que recibe leads', async () => {
    const g = await gestoresDelReparto(query, projectId);
    const dentro = g.map((x) => x.id);
    expect(dentro).not.toContain(ids.adminsinleads);
    expect(dentro).toContain(ids.adminconleads);
  });

  it('los que sí, entran', async () => {
    const g = await gestoresDelReparto(query, projectId);
    expect(g.map((x) => x.id)).toEqual(
      expect.arrayContaining([ids.normal, ids.empatada, ids.adminconleads])
    );
  });

  it('en total, tres de siete', async () => {
    const g = await gestoresDelReparto(query, projectId);
    expect(g).toHaveLength(3);
  });
});

describe('el orden no puede bailar', () => {
  it('dos con el mismo orden_cola salen siempre igual', async () => {
    // El round-robin guarda una POSICION, no una persona. Si el orden cambia
    // entre dos consultas, la misma posición apunta a otra persona: una recibe
    // dos leads seguidos y la otra ninguno, sin error y sin rastro. Postgres no
    // promete un orden estable con el ORDER BY empatado, así que se desempata.
    const a = await gestoresDelReparto(query, projectId);
    const b = await gestoresDelReparto(query, projectId);
    const c = await gestoresDelReparto(query, projectId);
    expect(b.map((x) => x.id)).toEqual(a.map((x) => x.id));
    expect(c.map((x) => x.id)).toEqual(a.map((x) => x.id));
  });

  it('el empate lo rompe el id, de menor a mayor', async () => {
    const g = await gestoresDelReparto(query, projectId);
    const empatados = g.filter((x) => x.orden_cola === 1).map((x) => x.id);
    expect(empatados).toEqual([...empatados].sort((x, y) => x - y));
  });
});

describe('a quién le toca el siguiente', () => {
  it('da la vuelta al llegar al final', async () => {
    const g = await gestoresDelReparto(query, projectId);
    expect(aQuienLeToca(g, g.length - 1).indice).toBe(0);
  });

  it('sin cursor guardado (-1) empieza por el primero', async () => {
    const g = await gestoresDelReparto(query, projectId);
    expect(aQuienLeToca(g, -1).gestor.id).toBe(g[0].id);
  });

  it('sin nadie en el reparto no inventa a quien le toca', async () => {
    // Un proyecto recién creado, o uno donde todo el mundo está de vacaciones.
    // Devolver el primero de una lista vacía sería `undefined` colándose hasta
    // la pantalla como si fuera una persona.
    expect(aQuienLeToca([], 3)).toEqual({ indice: null, gestor: null });
  });

  it('un cursor que no es un número no se cuela como NaN', async () => {
    // `Number(undefined) ?? -1` da NaN, no -1: `??` solo mira null y undefined.
    // Con NaN, `gestores[NaN]` es undefined, y eso llega a la pantalla como si
    // fuera una persona con nombre vacío.
    const g = await gestoresDelReparto(query, projectId);
    for (const malo of [undefined, null, NaN, 'x', '']) {
      const r = aQuienLeToca(g, malo);
      expect(r.gestor, `con ${String(malo)}`).toBeTruthy();
      expect(Number.isInteger(r.indice)).toBe(true);
    }
  });

  it('un cursor negativo raro tampoco cae en un hueco', async () => {
    // `(-5 + 1) % 3` es -1 en JavaScript, no 2.
    const g = await gestoresDelReparto(query, projectId);
    const r = aQuienLeToca(g, -5);
    expect(r.indice).toBeGreaterThanOrEqual(0);
    expect(r.gestor).toBeTruthy();
  });
});

describe('los que se quedaron sin dueño', () => {
  /**
   * El botón dice «reasignar N» y luego la acción reparte los que sean. Si las
   * dos cuentas no filtran igual, el número miente — y en este caso mentía en
   * la dirección peor: la acción NO excluía las fichas borradas, así que el
   * spam acababa en la bandeja de una gestora como trabajo por hacer.
   */
  it('una ficha borrada no cuenta como pendiente', async () => {
    const { rows: viva } = await query(
      `INSERT INTO leads (project_id, nombre, responsable_id) VALUES ($1, $2, NULL) RETURNING id`,
      [projectId, `Viva ${marca}`]
    );
    const { rows: borrada } = await query(
      `INSERT INTO leads (project_id, nombre, responsable_id, deleted_at)
       VALUES ($1, $2, NULL, NOW()) RETURNING id`,
      [projectId, `Borrada ${marca}`]
    );

    // La cuenta que enseña el panel.
    const { rows: contadas } = await query(
      `SELECT COUNT(*)::int AS n FROM leads
        WHERE project_id = $1 AND responsable_id IS NULL AND deleted_at IS NULL`,
      [projectId]
    );
    // La lista que reparte de verdad.
    const { rows: repartibles } = await query(
      `SELECT id FROM leads
        WHERE project_id = $1 AND responsable_id IS NULL AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [projectId]
    );

    expect(contadas[0].n).toBe(1);
    expect(repartibles.map((r) => r.id)).toEqual([viva[0].id]);
    expect(repartibles.map((r) => r.id)).not.toContain(borrada[0].id);

    await query('DELETE FROM leads WHERE id = ANY($1::int[])', [[viva[0].id, borrada[0].id]]);
  });
});
