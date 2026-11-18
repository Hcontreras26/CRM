import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import pool from '../src/shared/config/db.js';
import { nombreDeLasLineas } from '../src/modules/conversions/nombre-de-las-lineas.js';
import { create } from '../src/modules/conversions/conversion.service.js';

/**
 * #223 · El «2x» en el nombre de las ventas con varias líneas.
 *
 * Diego (04/11/2026): una venta con cursos distintos se queda como UNA venta y
 * solo se limpia el nombre: sus cursos, sin cantidades y sin repetir. La
 * cantidad ya está en cada línea. Tres partes: la regla, el grifo (el servicio
 * al guardar) y la migración 242 para lo ya guardado.
 */

describe('la regla', () => {
  it('cursos distintos: los dos, sin cantidades', () => {
    expect(nombreDeLasLineas([
      { descripcion: 'Curso A', cantidad: 1 },
      { descripcion: 'Curso B', cantidad: 2 },
    ])).toBe('Curso A + Curso B');
  });

  it('el mismo curso dos veces: una sola vez, sin importar mayúsculas ni espacios', () => {
    expect(nombreDeLasLineas([
      { descripcion: 'Curso A', cantidad: 1 },
      { descripcion: '  curso   a ', cantidad: 1 },
    ])).toBe('Curso A');
  });

  it('respeta el orden de las líneas y salta las vacías', () => {
    expect(nombreDeLasLineas([
      { descripcion: 'Zeta' }, { descripcion: '' }, { descripcion: 'Alfa' },
    ])).toBe('Zeta + Alfa');
  });

  it('sin líneas o sin descripciones: null, y manda el nombre que llegó', () => {
    expect(nombreDeLasLineas(undefined)).toBeNull();
    expect(nombreDeLasLineas([])).toBeNull();
    expect(nombreDeLasLineas([{ descripcion: '   ' }])).toBeNull();
  });

  it('nunca pasa de 255, lo que cabe en la columna', () => {
    const largos = Array.from({ length: 20 }, (_, i) => ({ descripcion: `Diplomado larguísimo número ${i} en algo` }));
    const n = nombreDeLasLineas(largos);
    expect(n.length).toBeLessThanOrEqual(255);
    expect(n.endsWith('…')).toBe(true);
  });
});

let PROYECTO;
// Quien registra la venta: el historial del prospecto lo pide y tiene que existir.
let USUARIO;
const creado = { leads: [], ventas: [] };

async function lead() {
  const { rows } = await pool.query(
    `INSERT INTO leads (project_id, nombre, email, status, created_at, fecha_solicitud)
     VALUES ($1, 'Alumno 2x', $2, 'en_seguimiento', '2026-02-01', '2026-02-01') RETURNING id`,
    [PROYECTO, `dosx-${Math.random().toString(36).slice(2, 9)}@test.com`]);
  creado.leads.push(rows[0].id);
  return rows[0].id;
}

beforeAll(async () => {
  const { rows } = await pool.query(
    `INSERT INTO projects (nombre, slug, webhook_api_key, type)
     VALUES ('Nombre 2x Test', 'nombre-2x-test', 'whk_nombre_2x_test', 'crm') RETURNING id`);
  PROYECTO = rows[0].id;
  USUARIO = (await pool.query('SELECT MIN(id) AS id FROM users')).rows[0].id;
});

afterAll(async () => {
  // Los avisos de después de crear (comisión, secuencias) no esperan: se les da un
  // momento para que no escriban con la base ya cerrada.
  await new Promise((r) => setTimeout(r, 300));
  for (const id of creado.ventas) {
    await pool.query('DELETE FROM conversions_nombre_bak WHERE conversion_id = $1', [id]).catch(() => {});
    await pool.query('DELETE FROM conversion_items WHERE conversion_id = $1', [id]);
    await pool.query('DELETE FROM conversion_payments WHERE conversion_id = $1', [id]);
    await pool.query('DELETE FROM matriculas WHERE conversion_id = $1', [id]).catch(() => {});
    await pool.query('DELETE FROM conversions WHERE id = $1', [id]);
  }
  for (const id of creado.leads) {
    await pool.query('DELETE FROM lead_status_history WHERE lead_id = $1', [id]);
    await pool.query('DELETE FROM leads WHERE id = $1', [id]);
  }
  await pool.query('DELETE FROM projects WHERE id = $1', [PROYECTO]);
  await pool.end();
});

describe('el grifo: una venta nueva con varias líneas', () => {
  it('se guarda con sus cursos, aunque el diálogo antiguo mande «1x A + 2x B»', async () => {
    const c = await create({
      lead_id: await lead(), project_id: PROYECTO,
      producto_contratado: '1x Curso A + 2x Curso B',
      importe_total: 300, importe_pagado: 0, fecha_conversion: '2026-02-10',
      items: [
        { product_id: null, descripcion: 'Curso A', cantidad: 1, precio_unitario: 100 },
        { product_id: null, descripcion: 'Curso B', cantidad: 2, precio_unitario: 100 },
      ],
    }, USUARIO);
    creado.ventas.push(c.id);
    expect(c.producto_contratado).toBe('Curso A + Curso B');
    // La cantidad no se pierde: sigue en su línea.
    const { rows } = await pool.query(
      'SELECT descripcion, cantidad FROM conversion_items WHERE conversion_id = $1 ORDER BY orden', [c.id]);
    expect(rows.map((r) => [r.descripcion, Number(r.cantidad)])).toEqual([['Curso A', 1], ['Curso B', 2]]);
  });

  it('sin líneas, el nombre que llega no se toca', async () => {
    const c = await create({
      lead_id: await lead(), project_id: PROYECTO,
      producto_contratado: 'Diplomado escrito a mano',
      importe_total: 100, importe_pagado: 0, fecha_conversion: '2026-02-10',
    }, USUARIO);
    creado.ventas.push(c.id);
    expect(c.producto_contratado).toBe('Diplomado escrito a mano');
  });
});

describe('la migración 242: las ventas ya guardadas', () => {
  const SQL = fs.readFileSync(
    path.resolve(__dirname, '../migrations/242_nombre_de_venta_sin_cantidades.sql'), 'utf8');

  async function ventaGuardada(nombre, lineas) {
    const { rows } = await pool.query(
      `INSERT INTO conversions (lead_id, project_id, producto_contratado, importe_total, importe_pagado, fecha_conversion)
       VALUES ($1, $2, $3, 300, 0, '2026-02-10') RETURNING id`, [await lead(), PROYECTO, nombre]);
    const id = rows[0].id;
    creado.ventas.push(id);
    for (const [i, [d, cant]] of lineas.entries()) {
      await pool.query(
        `INSERT INTO conversion_items (conversion_id, descripcion, cantidad, precio_unitario, subtotal, orden)
         VALUES ($1, $2, $3, 100, $3 * 100, $4)`, [id, d, cant, i]);
    }
    return id;
  }
  const nombre = async (id) => (await pool.query(
    'SELECT producto_contratado FROM conversions WHERE id = $1', [id])).rows[0].producto_contratado;

  let sucia; let repetida; let limpia; let sinLineas;
  beforeAll(async () => {
    sucia = await ventaGuardada('1x Curso A + 2x Curso B', [['Curso A', 1], ['Curso B', 2]]);
    repetida = await ventaGuardada('1x Curso C + 1x Curso C + 1x Curso D', [['Curso C', 1], ['Curso C', 1], ['Curso D', 1]]);
    limpia = await ventaGuardada('Máster en algo 2x2', [['Máster en algo 2x2', 1]]);
    sinLineas = await ventaGuardada('3x Curso sin líneas', []);
    await pool.query(SQL);
  });

  it('quita las cantidades y deja sus cursos en orden', async () => {
    expect(await nombre(sucia)).toBe('Curso A + Curso B');
    expect(await nombre(repetida)).toBe('Curso C + Curso D');
  });

  it('guarda el antes en la copia, para poder deshacerlo', async () => {
    const { rows } = await pool.query(
      'SELECT decia, queda FROM conversions_nombre_bak WHERE conversion_id = $1', [sucia]);
    expect(rows[0]).toEqual({ decia: '1x Curso A + 2x Curso B', queda: 'Curso A + Curso B' });
  });

  it('no toca un nombre sin el «Nx » del diálogo, ni una venta sin líneas', async () => {
    expect(await nombre(limpia)).toBe('Máster en algo 2x2');
    expect(await nombre(sinLineas)).toBe('3x Curso sin líneas');
    const { rows } = await pool.query(
      'SELECT conversion_id FROM conversions_nombre_bak WHERE conversion_id = ANY($1::int[])', [[limpia, sinLineas]]);
    expect(rows).toEqual([]);
  });

  it('se puede volver a pasar sin cambiar nada', async () => {
    await pool.query(SQL);
    expect(await nombre(sucia)).toBe('Curso A + Curso B');
    const { rows } = await pool.query(
      'SELECT decia FROM conversions_nombre_bak WHERE conversion_id = $1', [sucia]);
    expect(rows[0].decia).toBe('1x Curso A + 2x Curso B');
  });
});
