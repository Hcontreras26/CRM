import { describe, it, expect } from 'vitest';
import {
  ponerAmbito,
  ambitoComoObjeto,
  sociedadSinCampus,
  proyectosDelAmbito,
  idsDelAmbito,
  TODOS_LOS_PROYECTOS,
} from '@/shared/lib/ambitoInforme';

/*
  De qué va un informe (#120).

  Ocho sitios piden informes y cada uno se montaba sus parámetros a mano. Si se
  equivoca esta decisión, el informe sale igual —con las cifras de otro ámbito—,
  que es la peor forma de fallar: no se nota.
*/

const params = () => new URLSearchParams();

describe('qué se le manda al servidor', () => {
  it('una sociedad va como issuerId', () => {
    const p = ponerAmbito(params(), { activeIssuerId: 3, activeProject: null });
    expect(p.get('issuerId')).toBe('3');
    expect(p.get('projectId')).toBeNull();
  });

  it('un campus va como projectId', () => {
    const p = ponerAmbito(params(), { activeIssuerId: null, activeProject: { id: 7 } });
    expect(p.get('projectId')).toBe('7');
    expect(p.get('issuerId')).toBeNull();
  });

  it('todos los proyectos no manda nada', () => {
    // El -1 es un valor interno del CRM: mandarlo pediria el proyecto numero
    // menos uno, que no existe.
    const p = ponerAmbito(params(), { activeIssuerId: null, activeProject: { id: TODOS_LOS_PROYECTOS } });
    expect(p.toString()).toBe('');
  });

  it('la sociedad manda sobre el proyecto, nunca los dos a la vez', () => {
    // Al elegir una sociedad el proyecto activo se queda en «todos», pero
    // aunque quedara uno suelto, mandar los dos dejaria decidir al servidor
    // cual gana, y eso es una cifra distinta segun quien conteste.
    const p = ponerAmbito(params(), { activeIssuerId: 3, activeProject: { id: 7 } });
    expect(p.get('issuerId')).toBe('3');
    expect(p.get('projectId')).toBeNull();
  });

  it('sin ámbito ninguno no inventa parámetros', () => {
    expect(ponerAmbito(params(), {}).toString()).toBe('');
    expect(ponerAmbito(params(), { activeProject: { id: null } }).toString()).toBe('');
  });

  it('respeta lo que ya hubiera en la consulta', () => {
    const p = new URLSearchParams({ from: '2026-01-01', to: '2026-09-07' });
    ponerAmbito(p, { activeIssuerId: 3 });
    expect(p.get('from')).toBe('2026-01-01');
    expect(p.get('issuerId')).toBe('3');
  });
});

describe('la misma decisión, como objeto', () => {
  it('devuelve lo mismo que la versión de parámetros', () => {
    expect(ambitoComoObjeto({ activeIssuerId: 3 })).toEqual({ issuerId: 3 });
    expect(ambitoComoObjeto({ activeProject: { id: 7 } })).toEqual({ projectId: 7 });
    expect(ambitoComoObjeto({ activeProject: { id: TODOS_LOS_PROYECTOS } })).toEqual({});
    expect(ambitoComoObjeto({})).toEqual({});
  });
});

describe('una sociedad sin campus', () => {
  it('se reconoce, para poder decirlo', () => {
    // El informe sale vacio A PROPOSITO. Sin decirlo, una tabla en blanco se
    // lee como una averia.
    expect(sociedadSinCampus({ id: 3, nombre: 'CEDIA', campus: [] })).toBe(true);
  });

  it('con campus, no', () => {
    expect(sociedadSinCampus({ id: 3, nombre: 'CEDIA', campus: [{ id: 1 }] })).toBe(false);
  });

  it('sin sociedad elegida, tampoco', () => {
    // Estar en «todos los proyectos» no es estar en una sociedad vacia.
    expect(sociedadSinCampus(null)).toBe(false);
    expect(sociedadSinCampus(undefined)).toBe(false);
  });
});

describe('qué proyectos entran en lo que miras (#103)', () => {
  const TODOS = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 7 }, { id: 8 }];
  const CEDIA = { id: 3, nombre: 'CEDIA', campus: [{ id: 1 }, { id: 2 }, { id: 3 }] };

  it('una sociedad son sus campus, no todos', () => {
    // Es la diferencia entre «CEDIA» y «todo»: si devolviera los cinco, la
    // pantalla enseñaria ICTESS bajo la etiqueta de CEDIA.
    expect(idsDelAmbito({ activeIssuer: CEDIA, isAllProjects: true, projects: TODOS })).toEqual([1, 2, 3]);
  });

  it('la sociedad manda aunque «todos» siga puesto por dentro', () => {
    // Al elegir una sociedad el proyecto activo se queda en «todos» a
    // proposito: si ganara `isAllProjects`, elegir CEDIA no haria nada.
    expect(proyectosDelAmbito({ activeIssuer: CEDIA, isAllProjects: true, projects: TODOS })).toHaveLength(3);
  });

  it('sin sociedad, todos son todos', () => {
    expect(idsDelAmbito({ isAllProjects: true, projects: TODOS })).toEqual([1, 2, 3, 7, 8]);
  });

  it('con un campus suelto no hay lista: se usa el projectId de siempre', () => {
    expect(idsDelAmbito({ isAllProjects: false, projects: TODOS })).toEqual([]);
  });

  it('una sociedad sin campus da una lista vacia, no todos', () => {
    // Si cayera a «todos», una sociedad recien creada enseñaria el CRM entero.
    const vacia = { id: 9, nombre: 'NUEVA SL', campus: [] };
    expect(idsDelAmbito({ activeIssuer: vacia, isAllProjects: true, projects: TODOS })).toEqual([]);
  });

  it('sin nada puesto no revienta', () => {
    expect(idsDelAmbito({})).toEqual([]);
    expect(proyectosDelAmbito()).toEqual([]);
  });
});
