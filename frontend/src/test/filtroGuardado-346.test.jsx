import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/*
  #346 · El campus elegido en el filtro de Prospectos vive en la dirección
  (`?multi=`) y sobrevivía a cambiar la empresa de arriba: con ICTESS elegido
  en «Todos» y luego CEDIA arriba, la lista seguía siendo la de ICTESS, y el
  desplegable —que ya solo lista CEDIA— no lo enseñaba marcado en ninguna parte.

  Con «Todos» o una empresa arriba, solo cuenta lo elegido que sea de ese ámbito.
*/

const CEDIA = 1; const LATERAL = 2;
const CAMPUS = [
  { id: 10, nombre: 'Psiko Aprende', sociedad_emisora_id: CEDIA },
  { id: 11, nombre: 'Fono Aprende', sociedad_emisora_id: CEDIA },
  { id: 20, nombre: 'ICTESS', sociedad_emisora_id: LATERAL },
  { id: 30, nombre: 'Pruebas', sociedad_emisora_id: LATERAL, es_prueba: true },
];

const { CTX, cliente } = vi.hoisted(() => ({
  CTX: { value: {} },
  cliente: { get: vi.fn(), patch: vi.fn(), post: vi.fn() },
}));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => CTX.value }));
vi.mock('@/shared/api/client', () => ({ default: cliente }));

const { useLeads } = await import('@/modules/leads/hooks/useLeads');
const { soloDelAmbito } = await import('@/shared/hooks/useAmbito');

const conEmpresa = (activeIssuerId) => ({
  activeProject: { id: -1, nombre: 'Todos los proyectos' }, isAllProjects: true, projects: CAMPUS, activeIssuerId,
});
const abrir = (url) => renderHook(() => useLeads(), {
  wrapper: ({ children }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>,
});
/** Los campus que se le pidieron al servidor en la última lista de prospectos. */
const pedidos = () => {
  const url = cliente.get.mock.calls.map(([u]) => u).filter((u) => u.startsWith('/leads?')).pop() || '';
  return new URLSearchParams(url.split('?')[1]).get('projectIds');
};

beforeEach(() => {
  vi.clearAllMocks();
  cliente.get.mockResolvedValue({ success: true, data: [], pagination: { total: 0, page: 1, totalPages: 1 } });
});

describe('el filtro de campus guardado sigue a la empresa de arriba (#346)', () => {
  it('ICTESS elegido y CEDIA arriba: no se cuela, se piden los campus de CEDIA', async () => {
    CTX.value = conEmpresa(CEDIA);
    const { result } = abrir('/?multi=20');
    expect(result.current.selectedProjectIds).toEqual([]);
    await waitFor(() => expect(pedidos()).toBe('10,11'));
  });

  it('de lo elegido, se queda lo que sí es de la empresa', async () => {
    CTX.value = conEmpresa(CEDIA);
    const { result } = abrir('/?multi=20,11');
    expect(result.current.selectedProjectIds).toEqual([11]);
    await waitFor(() => expect(pedidos()).toBe('11'));
  });

  it('con «Todos», el elegido de cualquier empresa vale; el de pruebas, no', async () => {
    CTX.value = conEmpresa(null);
    const { result } = abrir('/?multi=20,30');
    expect(result.current.selectedProjectIds).toEqual([20]);
    await waitFor(() => expect(pedidos()).toBe('20'));
  });

  it('con un campus elegido arriba, lo de la dirección se respeta como antes', () => {
    CTX.value = { activeProject: { id: 10, nombre: 'Psiko Aprende' }, isAllProjects: false, projects: CAMPUS, activeIssuerId: null };
    const { result } = abrir('/?multi=20');
    expect(result.current.selectedProjectIds).toEqual([20]);
  });

  it('la regla, sola', () => {
    expect(soloDelAmbito([20, 11, 99], [10, 11])).toEqual([11]);
    expect(soloDelAmbito([], [10])).toEqual([]);
  });
});
