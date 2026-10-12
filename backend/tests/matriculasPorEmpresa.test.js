import { describe, it, expect, vi, beforeEach } from 'vitest';

// #199 · el listado de Matrículas, «por empresa y con "Todos los proyectos",
// como el resto del CRM». Antes pedía siempre un campus: con «Todos» el
// servidor respondía 400 y la pantalla se quedaba cargando, y con una empresa
// en la cabecera salía el muro de «elige un campus».

const EMPRESAS = { 8: [1, 2, 3], 9: [4] };   // CEDIA, ICTESS
const CAMPUS = { 34: [1, 2, 3] };            // Mireia, admin de CEDIA
const consultas = [];

vi.mock('../src/shared/config/db.js', () => ({
  getClient: vi.fn(),
  query: vi.fn(async (sql, params = []) => {
    if (sql.includes('FROM projects WHERE sociedad_emisora_id = $1')) {
      return { rows: (EMPRESAS[params[0]] || []).map((id) => ({ id })) };
    }
    if (sql.includes('FROM user_projects WHERE user_id = $1 AND active = true')) {
      return { rows: (CAMPUS[params[0]] || []).map((project_id) => ({ project_id })) };
    }
    consultas.push({ sql, params });
    if (sql.includes('COUNT(*) FROM matriculas')) return { rows: [{ count: '0' }] };
    if (sql.includes('as pendientes')) return { rows: [{ total: 0, pendientes: 0, validadas: 0, rechazadas: 0 }] };
    return { rows: [] };
  }),
}));

const ctrl = await import('../src/modules/matriculas/matricula.controller.js');

const MANUEL = { userId: 2, role: 'superadmin' };
const MIREIA = { userId: 34, role: 'admin' };

async function listar(user, query = {}) {
  let salida = null;
  let error = null;
  const res = { json: (d) => { salida = d; return res; }, status() { return res; } };
  await ctrl.list({ user, query, params: {}, body: {} }, res, (e) => { error = e; });
  return { salida, error };
}

/** Las consultas de matrículas (la lista, su cuenta y las cifras), sin las del ámbito. */
const deMatriculas = () => consultas.filter((c) => c.sql.includes('matriculas'));

beforeEach(() => { consultas.length = 0; });

describe('el listado de Matrículas sigue a la cabecera', () => {
  it('con una empresa (CEDIA): solo sus campus, en la lista y en las cifras', async () => {
    const { salida, error } = await listar(MANUEL, { issuerId: '8' });
    expect(error).toBeNull();
    expect(salida.success).toBe(true);
    const q = deMatriculas();
    expect(q).toHaveLength(3);
    for (const { sql, params } of q) {
      expect(sql).toContain('m.project_id = ANY($1::int[])');
      expect(params[0]).toEqual([1, 2, 3]);
    }
  });

  it('con «Todos los proyectos»: ya no pide un campus, y deja fuera los de pruebas', async () => {
    const { salida, error } = await listar(MANUEL, {});
    expect(error).toBeNull();
    expect(salida.success).toBe(true);
    for (const { sql } of deMatriculas()) expect(sql).toContain('NOT IN (SELECT id FROM projects WHERE es_prueba)');
  });

  it('con un campus: solo ese', async () => {
    await listar(MANUEL, { projectId: '4' });
    for (const { params } of deMatriculas()) expect(params[0]).toEqual([4]);
  });

  it('una admin de CEDIA con «Todos»: sus campus, no todo el CRM', async () => {
    const { error } = await listar(MIREIA, {});
    expect(error).toBeNull();
    expect(deMatriculas()).toHaveLength(3);
    for (const { params } of deMatriculas()) expect(params[0]).toEqual([1, 2, 3]);
  });

  it('una admin de CEDIA que pide ICTESS cambiando la dirección: nada', async () => {
    const { error } = await listar(MIREIA, { issuerId: '9' });
    expect(error).toBeNull();
    expect(deMatriculas()).toHaveLength(3);
    for (const { params } of deMatriculas()) expect(params[0]).toEqual([-1]);
  });

  it('una admin de CEDIA que pide un campus que no es suyo: 403', async () => {
    const { error } = await listar(MIREIA, { projectId: '4' });
    expect(error?.statusCode).toBe(403);
    expect(deMatriculas()).toHaveLength(0);
  });

  it('el estado y la búsqueda siguen funcionando con la empresa', async () => {
    await listar(MANUEL, { issuerId: '8', estado: 'validada', search: 'ana' });
    const lista = deMatriculas().find((c) => c.sql.includes('LIMIT'));
    expect(lista.sql).toContain('m.estado = $2');
    expect(lista.params.slice(0, 3)).toEqual([[1, 2, 3], 'validada', '%ana%']);
  });
});
