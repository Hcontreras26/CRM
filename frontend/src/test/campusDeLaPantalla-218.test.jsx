import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

/*
  #218, tanda 3 · `useCampusDeLaPantalla`: el campus de una pantalla que es de
  UN campus (Buscar duplicados, Meta Ads, Chat IA). Con un campus arriba, ese;
  con una empresa o «Todos», el que se elija en la propia pantalla; si el ámbito
  tiene uno solo, ya viene elegido.
*/

const CTX = vi.hoisted(() => ({ activeProject: null, activeIssuerId: null, projects: [] }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => CTX }));

const { useCampusDeLaPantalla } = await import('@/shared/hooks/useCampusDeLaPantalla');

const PSIKO = { id: 10, nombre: 'Psiko', sociedad_emisora_id: 1 };
const FONO = { id: 11, nombre: 'Fono', sociedad_emisora_id: 1 };
const ICTESS = { id: 20, nombre: 'ICTESS', sociedad_emisora_id: 2 };

beforeEach(() => {
  CTX.activeProject = null; CTX.activeIssuerId = null; CTX.projects = [PSIKO, FONO, ICTESS];
});

describe('el campus de una pantalla de un solo campus (#218)', () => {
  it('con un campus en la cabecera, ese, sin nada que elegir', () => {
    CTX.activeProject = { id: 11, nombre: 'Fono' };
    const { result } = renderHook(() => useCampusDeLaPantalla());
    expect(result.current).toMatchObject({ id: 11, nombre: 'Fono', fijo: true });
  });

  it('con «Todos», falta elegirlo; las opciones son todos los suyos', () => {
    CTX.activeProject = { id: -1 };
    const { result } = renderHook(() => useCampusDeLaPantalla());
    expect(result.current.id).toBeNull();
    expect(result.current.fijo).toBe(false);
    expect(result.current.opciones.map((c) => c.nombre)).toEqual(['Psiko', 'Fono', 'ICTESS']);
    act(() => result.current.elegir(20));
    expect(result.current).toMatchObject({ id: 20, nombre: 'ICTESS' });
  });

  it('con una empresa, solo sus campus', () => {
    CTX.activeProject = { id: -1 }; CTX.activeIssuerId = 1;
    const { result } = renderHook(() => useCampusDeLaPantalla());
    expect(result.current.opciones.map((c) => c.nombre)).toEqual(['Psiko', 'Fono']);
  });

  it('si el ámbito tiene un solo campus, ya viene elegido', () => {
    CTX.activeProject = { id: -1 }; CTX.activeIssuerId = 2;
    const { result } = renderHook(() => useCampusDeLaPantalla());
    expect(result.current).toMatchObject({ id: 20, nombre: 'ICTESS', fijo: false });
  });

  it('al cambiar la cabecera, lo elegido aquí se olvida', () => {
    CTX.activeProject = { id: -1 };
    const { result, rerender } = renderHook(() => useCampusDeLaPantalla());
    act(() => result.current.elegir(10));
    expect(result.current.id).toBe(10);
    CTX.activeIssuerId = 2;
    rerender();
    expect(result.current.id).toBe(20);
  });
});
