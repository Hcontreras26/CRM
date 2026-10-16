import { describe, it, expect } from 'vitest';
import { agruparPorEmpresa, campusConEmpresa, campusDelAmbito, empresaCorta } from './campusPorEmpresa';

// Diego, 10/10: en «Nueva tarea» salían los campus de todas las empresas bajo un
// único «Campus», con CEDIA puesta en la cabecera.
const proyectos = [
  { id: -1, nombre: 'Todos los proyectos', isAll: true },
  { id: 1, nombre: 'ISEIH', sociedad_emisora_id: 10, sociedad_nombre: 'CEDIA Investigación y Desarrollo SL' },
  { id: 2, nombre: 'Fono Aprende', sociedad_emisora_id: 10, sociedad_nombre: 'CEDIA Investigación y Desarrollo SL' },
  { id: 3, nombre: 'ICTESS', sociedad_emisora_id: 20, sociedad_nombre: 'Atlas Formación SL' },
  { id: 4, nombre: 'Suelto', sociedad_emisora_id: null, sociedad_nombre: null },
];
const todos = campusConEmpresa(proyectos);
const ids = (l: { id: number }[]) => l.map((c) => c.id);

describe('los campus del tablero van por empresa', () => {
  it('con una empresa en la cabecera, solo sus campus', () => {
    expect(ids(campusDelAmbito(todos, { activeIssuerId: 10, activeProject: null }))).toEqual([1, 2]);
  });
  it('con un campus en la cabecera, los de su empresa', () => {
    expect(ids(campusDelAmbito(todos, { activeIssuerId: null, activeProject: proyectos[1] }))).toEqual([1, 2]);
    expect(ids(campusDelAmbito(todos, { activeIssuerId: null, activeProject: proyectos[4] }))).toEqual([4]);
  });
  it('con «Todos los proyectos», todos, y nunca el pseudo-proyecto', () => {
    expect(ids(campusDelAmbito(todos, { activeIssuerId: null, activeProject: proyectos[0] }))).toEqual([1, 2, 3, 4]);
  });
  it('agrupa por empresa, en orden, con los sin empresa al final', () => {
    const g = agruparPorEmpresa(todos);
    expect(g.map((x) => x.empresa)).toEqual(['Atlas Formación SL', 'CEDIA Investigación y Desarrollo SL', 'Sin empresa']);
    expect(g[1].campus.map((c) => c.nombre)).toEqual(['Fono Aprende', 'ISEIH']);
  });
  it('el nombre corto de la empresa', () => {
    expect(empresaCorta('CEDIA Investigación y Desarrollo SL')).toBe('CEDIA');
    expect(empresaCorta(null)).toBe('Sin empresa');
  });
});
