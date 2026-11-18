import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Los cobros de un proyecto IA, filtrados en el servidor (#44).
 *
 * Lo que se fija: que los filtros salgan en la consulta, que lo que viene de
 * la URL NO se pueda colar como SQL (plan, fechas), que el neto sea bruto menos
 * devuelto, y que el tamaño de pagina tenga tope.
 */
const llamadas = [];
const query = vi.fn(async (sql, params) => {
  llamadas.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
  if (/count\(\*\)::int AS n/.test(sql)) {
    return { rows: [{ n: 4, bruto: 39.96, devuelto: 9.99, renovaciones: 3, altas: 1, devueltos: 1 }] };
  }
  return { rows: [{ id: 1, fecha: '2026-10-01', producto: 'Suscripcion mensual', importe: 9.99, devuelto: 0, renovacion: false, nombre: 'a', email: 'a@a.com', referencia: null }] };
});
vi.mock('../src/shared/config/db.js', () => ({ query: (...a) => query(...a), getClient: vi.fn() }));

const { cobrosDeProyecto } = await import('../src/modules/ia-monitor/ia.model.js');

beforeEach(() => { llamadas.length = 0; query.mockClear(); });

describe('cobros de un proyecto IA', () => {
  it('sin filtros, solo el proyecto', async () => {
    await cobrosDeProyecto(4);
    expect(llamadas[0].sql).toContain('WHERE c.project_id = $1 ORDER BY');
    expect(llamadas[0].params).toEqual([4]);
  });

  it('el neto es el bruto menos lo devuelto, y las paginas salen de la cuenta', async () => {
    const r = await cobrosDeProyecto(4, { limit: 3 });
    expect(r.totales).toMatchObject({ n: 4, bruto: 39.96, devuelto: 9.99, neto: 29.97, renovaciones: 3, altas: 1 });
    expect(r.pagination).toEqual({ total: 4, page: 1, limit: 3, totalPages: 2 });
  });

  it('el tipo y el plan filtran por el producto, y las cifras usan el MISMO filtro que la lista', async () => {
    await cobrosDeProyecto(4, { tipo: 'renovacion', plan: 'anual' });
    const [lista, cifras] = llamadas;
    expect(lista.sql).toContain("c.producto_contratado ILIKE '%(renovacion)%'");
    expect(lista.sql).toContain("c.producto_contratado ILIKE '%anual%'");
    expect(cifras.sql).toContain("c.producto_contratado ILIKE '%anual%'");
  });

  it('los devueltos se buscan en la tabla de devoluciones', async () => {
    await cobrosDeProyecto(4, { tipo: 'devuelto' });
    expect(llamadas[0].sql).toContain('FROM conversion_refunds r0');
  });

  it('la busqueda va como parametro, nunca pegada en el SQL', async () => {
    await cobrosDeProyecto(4, { q: "x' OR 1=1 --" });
    expect(llamadas[0].params).toEqual([4, "%x' OR 1=1 --%"]);
    expect(llamadas[0].sql).not.toContain('OR 1=1');
  });

  it('un plan o un tipo que no existe se ignora', async () => {
    await cobrosDeProyecto(4, { tipo: "alta'; DROP TABLE conversions; --", plan: "mensual'; DROP TABLE x; --" });
    expect(llamadas[0].sql).not.toMatch(/DROP/i);
    expect(llamadas[0].params).toEqual([4]);
  });

  it('una fecha mal escrita se ignora; una buena entra como parametro', async () => {
    await cobrosDeProyecto(4, { desde: '2026-01-01; DROP TABLE x', hasta: '2026-10-31' });
    expect(llamadas[0].params).toEqual([4, '2026-10-31']);
    expect(llamadas[0].sql).toContain('c.fecha_conversion <= $2');
    expect(llamadas[0].sql).not.toMatch(/DROP/i);
  });

  it('el tamaño de pagina tiene tope y la pagina minima es la 1', async () => {
    await cobrosDeProyecto(4, { limit: 99999, page: -5 });
    expect(llamadas[0].sql).toContain('LIMIT 100 OFFSET 0');
  });
});
