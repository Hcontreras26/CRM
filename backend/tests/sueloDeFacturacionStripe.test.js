import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pool from '../src/shared/config/db.js';
import { fechaDeCorte, escalonesDelCorte } from '../src/modules/stripe-payments/stripe-payments.model.js';

/**
 * Los tres escalones del suelo de facturación (lo pide el ticket de los IA).
 *
 * De qué fecha en adelante entra un cobro de Stripe. El orden es:
 *
 *   1. `invoicing_status.al_dia_hasta` — el corte puesto a mano. Manda.
 *   2. la primera factura de la sociedad emisora del proyecto.
 *   3. `projects.created_at` — el día que el proyecto entró al CRM.
 *
 * POR QUÉ IMPORTA Y NO ES UN DETALLE: hay 576 cobros anteriores al alta de su
 * proyecto, ya facturados fuera del CRM. Los proyectos de hoy no los ven porque
 * alguien les puso un corte a mano. Un proyecto nuevo —los IA— no tiene ese
 * corte y se apoya en el tercer escalón; si ese escalón fallara, la primera
 * sincronización se traería el histórico entero de la cuenta de Stripe y cada
 * cobro que alguien asociara emitiría una factura repetida. Antes de que el
 * escalón 3 existiera, el suelo en ese caso era 1900.
 *
 * Se prueba contra Postgres de verdad porque lo que puede fallar es el
 * COALESCE, y un mock del COALESCE no prueba nada.
 *
 * Cada caso ANULA el escalón de más arriba para ver actuar al de abajo, y el
 * último comprueba el orden: con los tres puestos, manda el primero.
 */

let issuerId;
let projectId;
const facturas = [];
const ALTA = '2026-05-20';
const PRIMERA_FACTURA = '2026-03-10';
const CORTE_A_MANO = '2026-07-01';

beforeAll(async () => {
  const { rows: iss } = await pool.query(
    `INSERT INTO invoice_issuers (razon_social, nif) VALUES ('Suelo Test SL', 'B00000000') RETURNING id`);
  issuerId = iss[0].id;

  const { rows: pr } = await pool.query(
    `INSERT INTO projects (nombre, slug, webhook_api_key, type, sociedad_emisora_id, created_at)
     VALUES ('Suelo Test IA', 'suelo-test-ia', 'whk_suelo_test', 'ia', $1, $2) RETURNING id`,
    [issuerId, `${ALTA} 10:00:00`]);
  projectId = pr[0].id;
});

afterAll(async () => {
  for (const id of facturas) await pool.query('DELETE FROM invoices WHERE id = $1', [id]);
  await pool.query('DELETE FROM invoicing_status WHERE project_id = $1', [projectId]);
  await pool.query('DELETE FROM projects WHERE id = $1', [projectId]);
  await pool.query('DELETE FROM invoice_issuers WHERE id = $1', [issuerId]);
  await pool.end();
});

/** Una factura de la sociedad, del tipo que SÍ cuenta para el escalón 2. */
async function facturaDeLaSociedad({ fecha, numero, tipo = 'normal' }) {
  const { rows } = await pool.query(
    `INSERT INTO invoices (project_id, issuer_id, ano, numero, codigo, tipo, estado,
                           cliente_nombre, cliente_nif, cliente_direccion, cliente_ciudad,
                           cliente_cp, cliente_pais, items, fecha_emision,
                           base_imponible, iva_importe, total)
     VALUES ($1, $2, 2026, $3, $4, $5, 'emitida', 'Cliente Suelo', 'X0000000X',
             'Calle 1', 'Madrid', '28001', 'ES', '[]'::jsonb, $6, 100, 21, 121)
     RETURNING id`,
    [projectId, issuerId, numero, `SUELO-${numero}`, tipo, fecha]);
  facturas.push(rows[0].id);
  return rows[0].id;
}

/** Una fecha de Postgres, como 'YYYY-MM-DD', sin que la zona la mueva. */
function iso(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('escalón 3 — el alta del proyecto', () => {
  it('sin corte a mano y sin facturas, manda el día que el proyecto entró al CRM', async () => {
    // Es el caso de los proyectos IA recién creados, y el que evita que la
    // primera sincronización se traiga el histórico entero.
    expect(iso(await fechaDeCorte(projectId))).toBe(ALTA);
    const e = await escalonesDelCorte(projectId);
    expect(e.manda).toBe('alta_proyecto');
    expect(iso(e.altaProyecto)).toBe(ALTA);
  });

  it('nunca devuelve 1900, que es lo que devolvía antes', async () => {
    const corte = await fechaDeCorte(projectId);
    expect(new Date(corte).getFullYear()).toBeGreaterThan(2000);
  });
});

describe('escalón 2 — la primera factura de la sociedad', () => {
  it('manda sobre el alta, aunque sea anterior', async () => {
    // Anterior al alta a propósito: si la sociedad ya facturaba antes de que el
    // proyecto entrara al CRM, el suelo baja hasta ahí.
    await facturaDeLaSociedad({ fecha: PRIMERA_FACTURA, numero: 900101 });
    await facturaDeLaSociedad({ fecha: '2026-04-15', numero: 900102 });
    expect(iso(await fechaDeCorte(projectId))).toBe(PRIMERA_FACTURA);
    expect((await escalonesDelCorte(projectId)).manda).toBe('primera_factura');
  });

  it('una proforma NO cuenta: es un presupuesto, no una factura', async () => {
    await facturaDeLaSociedad({ fecha: '2026-01-05', numero: 900103, tipo: 'proforma' });
    // Sigue mandando la primera factura de verdad, no la proforma de enero.
    expect(iso(await fechaDeCorte(projectId))).toBe(PRIMERA_FACTURA);
  });
});

describe('escalón 1 — el corte puesto a mano', () => {
  it('manda sobre los otros dos', async () => {
    await pool.query(
      `INSERT INTO invoicing_status (project_id, al_dia_hasta) VALUES ($1, $2)
       ON CONFLICT (project_id) DO UPDATE SET al_dia_hasta = $2`,
      [projectId, CORTE_A_MANO]);

    expect(iso(await fechaDeCorte(projectId))).toBe(CORTE_A_MANO);
    const e = await escalonesDelCorte(projectId);
    expect(e.manda).toBe('corte_mano');
    // Y los otros dos siguen consultándose y saliendo: quien lo mira necesita
    // ver que manda el que cree, no solo el resultado.
    expect(iso(e.primeraFactura)).toBe(PRIMERA_FACTURA);
    expect(iso(e.altaProyecto)).toBe(ALTA);
  });

  it('es la salida de emergencia: moverlo hacia atrás baja el suelo', async () => {
    // Está escrito en el modelo como la forma de recuperar un cobro que quedó
    // por debajo del corte.
    await pool.query('UPDATE invoicing_status SET al_dia_hasta = $2 WHERE project_id = $1',
      [projectId, '2026-02-01']);
    expect(iso(await fechaDeCorte(projectId))).toBe('2026-02-01');
  });
});

describe('un proyecto que no existe', () => {
  it('no da fecha, y quien llama decide', async () => {
    expect(await fechaDeCorte(999999)).toBeNull();
    expect(await escalonesDelCorte(999999)).toBeNull();
  });
});
