import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * «Cobra desde» en Editar tutor (Diego, 13/10).
 *
 * Diego, al abrir «Editar tutor»: «ni me deja poner la fecha de inicio del
 * tutor». Carlos queria «colocar fecha de ingreso en el CRM y poder cambiarla a
 * más antes para que cuadren». Hasta hoy solo se podia formacion a formacion.
 *
 * Lo que se fija aqui:
 *   - la fecha pasa a TODAS las colaboraciones activas del tutor;
 *   - la que chocaria con otro tramo suyo de la misma formacion NO se mueve, y
 *     vuelve en «noCambiadas» con el motivo;
 *   - la que terminaria antes de empezar tampoco (la base lo prohibe);
 *   - todo en una transaccion, y si algo falla, ROLLBACK;
 *   - NO se genera ni se toca ninguna comision: eso es «Calcular»;
 *   - mismos permisos que editar colaboraciones, y solo tutores de mis campus.
 *
 * Sin base real: el cliente de la transaccion es un doble que contesta segun
 * la consulta.
 */

// ── Doble de la base ────────────────────────────────────────────────────────
let colabs = [];       // lo que devuelve el SELECT ... FOR UPDATE
let otrosTramos = [];  // tramos (inactivos o cerrados) que pueden chocar
let fallarEnUpdate = false;
const sqls = [];

function contestar(sql, params) {
  sqls.push({ sql, params });
  if (/FOR UPDATE OF c/.test(sql)) return { rows: colabs };
  if (/FROM tutor_collaborations\s+WHERE tutor_id = \$1 AND product_id = \$2/.test(sql)) {
    const [, productId, desde, hasta, excluirId] = params;
    const fin = hasta || '9999-12-31';
    return {
      rows: [...colabs, ...otrosTramos].filter((t) => t.product_id === productId
        && t.id !== excluirId
        && t.vigente_desde <= fin
        && (t.vigente_hasta || '9999-12-31') >= desde),
    };
  }
  if (/UPDATE tutor_collaborations/.test(sql)) {
    if (fallarEnUpdate) throw new Error('se cayo la base');
    const c = colabs.find((x) => x.id === params[0]);
    if (c) c.vigente_desde = params[1];
    return { rows: [], rowCount: 1 };
  }
  return { rows: [] };
}

const cliente = { query: vi.fn(async (sql, params) => contestar(sql, params)), release: vi.fn() };
const query = vi.fn(async (sql, params) => contestar(sql, params));
vi.mock('../src/shared/config/db.js', () => ({
  query: (...a) => query(...a),
  getClient: async () => cliente,
}));
vi.mock('bcrypt', () => ({ default: { hash: async () => 'x', compare: async () => true } }));

const model = await import('../src/modules/tutores/tutor.model.js');

const colab = (id, product_id, vigente_desde, vigente_hasta = null, formacion = `Curso ${product_id}`) => ({
  id, product_id, vigente_desde, vigente_hasta, formacion,
});

beforeEach(() => {
  colabs = [];
  otrosTramos = [];
  fallarEnUpdate = false;
  sqls.length = 0;
  cliente.query.mockClear();
  cliente.release.mockClear();
  query.mockClear();
});

describe('cambiarCobraDesde · el modelo', () => {
  it('mueve todas las activas a la fecha nueva, en una transaccion', async () => {
    colabs = [colab(1, 10, '2026-08-01'), colab(2, 20, '2026-08-01'), colab(3, 30, '2026-09-15')];
    const r = await model.cambiarCobraDesde(7, '2025-10-20');

    expect(r.cambiadas.map((c) => c.id)).toEqual([1, 2, 3]);
    expect(r.noCambiadas).toEqual([]);
    expect(r.total).toBe(3);
    expect(r.cambiadas[2]).toMatchObject({ antes: '2026-09-15', desde: '2025-10-20' });

    const orden = sqls.map((x) => x.sql.trim().split(/\s+/)[0]);
    expect(orden[0]).toBe('BEGIN');
    expect(orden.at(-1)).toBe('COMMIT');
    expect(cliente.release).toHaveBeenCalledTimes(1);
  });

  it('solo las activas del tutor: el SELECT filtra por tutor y por activa', async () => {
    await model.cambiarCobraDesde(7, '2025-10-20');
    const sel = sqls.find((x) => /FOR UPDATE OF c/.test(x.sql));
    expect(sel.sql).toMatch(/c\.tutor_id = \$1 AND c\.activa/);
    expect(sel.params).toEqual([7]);
  });

  it('la que ya tiene esa fecha no se toca ni cuenta como fallo', async () => {
    colabs = [colab(1, 10, '2025-10-20'), colab(2, 20, '2026-08-01')];
    const r = await model.cambiarCobraDesde(7, '2025-10-20');
    expect(r.sinCambio).toBe(1);
    expect(r.cambiadas.map((c) => c.id)).toEqual([2]);
    const updates = sqls.filter((x) => /UPDATE tutor_collaborations/.test(x.sql));
    expect(updates).toHaveLength(1);
  });

  it('respeta haySolape: la que chocaria con otro tramo suyo se queda como esta', async () => {
    // Formacion 10: tuvo un tramo cerrado de enero a julio de 2026. Adelantar la
    // activa (desde agosto) a octubre de 2025 se lo comeria.
    colabs = [colab(1, 10, '2026-08-01'), colab(2, 20, '2026-08-01')];
    otrosTramos = [colab(9, 10, '2026-01-01', '2026-07-31')];
    const r = await model.cambiarCobraDesde(7, '2025-10-20');

    expect(r.cambiadas.map((c) => c.id)).toEqual([2]);
    expect(r.noCambiadas).toHaveLength(1);
    expect(r.noCambiadas[0]).toMatchObject({ id: 1, desde: '2026-08-01' });
    expect(r.noCambiadas[0].motivo).toMatch(/solapar/i);
    expect(r.noCambiadas[0].motivo).toMatch(/2026-01-01 a 2026-07-31/);
    expect(colabs[0].vigente_desde, 'no se puede mover').toBe('2026-08-01');
  });

  it('la comprobacion del solape va por el cliente de la transaccion, no por el pool', async () => {
    colabs = [colab(1, 10, '2026-08-01')];
    await model.cambiarCobraDesde(7, '2025-10-20');
    expect(query).not.toHaveBeenCalled();
  });

  it('la que terminaria antes de empezar no se mueve', async () => {
    colabs = [colab(1, 10, '2026-01-01', '2026-03-31'), colab(2, 20, '2026-08-01')];
    const r = await model.cambiarCobraDesde(7, '2026-05-01');
    expect(r.cambiadas.map((c) => c.id)).toEqual([2]);
    expect(r.noCambiadas[0]).toMatchObject({ id: 1, hasta: '2026-03-31' });
    expect(r.noCambiadas[0].motivo).toMatch(/Termina el 2026-03-31/);
  });

  it('nunca toca las comisiones: ni INSERT ni UPDATE en tutor_commissions', async () => {
    colabs = [colab(1, 10, '2026-08-01')];
    await model.cambiarCobraDesde(7, '2025-10-20');
    expect(sqls.some((x) => /tutor_commissions/.test(x.sql))).toBe(false);
  });

  it('si algo falla a medias, ROLLBACK y suelta el cliente', async () => {
    colabs = [colab(1, 10, '2026-08-01')];
    fallarEnUpdate = true;
    await expect(model.cambiarCobraDesde(7, '2025-10-20')).rejects.toThrow(/se cayo/);
    const orden = sqls.map((x) => x.sql.trim().split(/\s+/)[0]);
    expect(orden).toContain('ROLLBACK');
    expect(orden).not.toContain('COMMIT');
    expect(cliente.release).toHaveBeenCalledTimes(1);
  });
});
