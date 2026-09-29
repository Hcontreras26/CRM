import { describe, it, expect } from 'vitest';
import { query } from '../src/shared/config/db.js';
import { resumenDelDia } from '../src/modules/reports/resumenDelDia.js';
import { overview } from '../src/modules/reports/report.model.js';

/**
 * El «ayer y hoy» del dashboard tiene que decir lo mismo que Reportes (#130).
 *
 * El ticket lo pone como condicion de aceptacion, y con razon:
 *
 *     «que los numeros del resumen cuadren con los de Reportes: si el dashboard
 *      dice 18 leads y Reportes dice 20, no se cree ninguno de los dos.»
 *
 * Dos pantallas que cuentan lo mismo y dan distinto no se arreglan discutiendo
 * cual tiene razon: se arreglan haciendo que una sola cuente. Como el dashboard
 * no puede llamar a `overview()` —son ocho consultas para pintar seis numeros—,
 * lo que las mantiene atadas es esta prueba: si alguien toca una definicion en
 * un lado y no en el otro, esto se pone rojo.
 *
 * CONTRA LA BASE DE VERDAD, y a proposito. Un doble de la base no coge que
 * `fecha_conversion` no es `created_at`, que es justo la clase de diferencia
 * que hace que dos pantallas discrepen.
 */

/**
 * Sin base esto no comprueba nada, y hay que decirlo: una prueba que aprueba
 * cuando no puede mirar es peor que no tenerla.
 */
async function hayBase() {
  try { await query('SELECT 1'); return true; } catch { return false; }
}

/** El dia con mas leads del historico. Comparar contra hoy no sirve: hoy puede
 *  no haber ninguno, y entonces la prueba compara cero con cero y pasa sin
 *  haber mirado nada — que es como se cuela un fallo. */
async function diaConLeads() {
  const { rows } = await query(
    `SELECT created_at::date AS dia, COUNT(*)::int AS n
       FROM leads
      WHERE deleted_at IS NULL
        AND project_id NOT IN (SELECT id FROM projects WHERE es_prueba)
      GROUP BY 1 ORDER BY n DESC, dia DESC LIMIT 1`);
  return rows[0] || null;
}

async function diaConVentas() {
  const { rows } = await query(
    `SELECT fecha_conversion AS dia, COUNT(*)::int AS n
       FROM conversions
      WHERE project_id NOT IN (SELECT id FROM projects WHERE es_prueba)
      GROUP BY 1 ORDER BY n DESC, dia DESC LIMIT 1`);
  return rows[0] || null;
}

const iso = (d) => new Date(d).toISOString().slice(0, 10);

describe('la base tiene que estar', () => {
  it('se conecta, o esto no vale', async () => {
    expect(
      await hayBase(),
      'sin base no se comprueba nada. Levantala: docker compose -f docker-compose.dev.yml up -d'
    ).toBe(true);
  });
});

describe('los numeros del dashboard son los de Reportes', () => {
  it('los LEADS cuadran, sobre un dia que de verdad tiene leads', async () => {
    expect(await hayBase(), 'sin base').toBe(true);
    const dia = await diaConLeads();
    expect(dia, 'no hay un solo lead con el que comparar: esta prueba no vale').not.toBeNull();
    expect(dia.n, 'el dia elegido tiene que tener leads, o no se compara nada').toBeGreaterThan(0);

    const resumen = await resumenDelDia({ referencia: iso(dia.dia) });
    const ov = await overview({ from: iso(dia.dia), to: iso(dia.dia) });

    expect(
      resumen.find((d) => d.dia === 'hoy').leads,
      `leads del ${iso(dia.dia)}: el dashboard y Reportes tienen que decir lo mismo`
    ).toBe(Number(ov.leads.total));
  });

  it('las VENTAS cuadran, sobre un dia que de verdad tiene ventas', async () => {
    expect(await hayBase(), 'sin base').toBe(true);
    const dia = await diaConVentas();
    expect(dia, 'no hay una sola venta con la que comparar').not.toBeNull();
    expect(dia.n).toBeGreaterThan(0);

    const resumen = await resumenDelDia({ referencia: iso(dia.dia) });
    const ov = await overview({ from: iso(dia.dia), to: iso(dia.dia) });

    expect(
      resumen.find((d) => d.dia === 'hoy').ventas,
      `ventas del ${iso(dia.dia)}`
    ).toBe(Number(ov.conversions.total));
  });
});

describe('la forma de la respuesta', () => {
  it('siempre vienen los dos dias, y en el mismo orden', async () => {
    const r = await resumenDelDia();
    expect(r.map((d) => d.dia)).toEqual(['ayer', 'hoy']);
  });

  it('un dia sin nada trae ceros, no se cae de la lista', async () => {
    // Un hueco en la pantalla parece una averia; un cero es un dato.
    const r = await resumenDelDia();
    for (const d of r) {
      for (const k of ['leads', 'contactados', 'ventas', 'sin_tocar']) {
        expect(typeof d[k], `${d.dia}.${k}`).toBe('number');
      }
    }
  });

  it('el recorte por gestora nunca devuelve mas que el total', async () => {
    // Si filtrar por una persona diera mas que sin filtrar, el filtro estaria
    // sumando en vez de recortando.
    const todo = await resumenDelDia();
    const { rows } = await query(
      `SELECT id FROM users WHERE role = 'gestor' AND active ORDER BY id LIMIT 1`);
    if (!rows.length) return; // sin gestoras que probar
    const suyo = await resumenDelDia({ asesoraId: rows[0].id });
    for (const dia of ['ayer', 'hoy']) {
      const a = todo.find((d) => d.dia === dia);
      const b = suyo.find((d) => d.dia === dia);
      expect(b.leads, `${dia}: los de una <= los de todas`).toBeLessThanOrEqual(a.leads);
      expect(b.ventas, `${dia}: ventas de una <= todas`).toBeLessThanOrEqual(a.ventas);
    }
  });
});
