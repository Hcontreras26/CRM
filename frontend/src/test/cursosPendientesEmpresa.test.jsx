import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Cursos pendientes con una empresa arriba (Diego, en la revisión de la #670):
 * «con una empresa elegida arriba, enseña todos sus campus y no solo los de esa
 * empresa». Ahora manda la empresa al resumen (las pestañas y los contadores) y
 * a la lista. El servidor ya la entendía (`proyectosDelAmbito`).
 */

const ctx = vi.hoisted(() => ({ valor: {} }));
const api = vi.hoisted(() => ({
  resumen: vi.fn(async () => ({ campus: [], total: { abiertos: 0, retrasados: 0, sin_tutora: 0, alumnas_esperando: 0 }, carga_por_tutora: null, indicadores: null })),
  listar: vi.fn(async () => []),
}));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ctx.valor }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'admin' }, permissions: {} }) }));
vi.mock('@/modules/cursos-pendientes/api/cursosPendientes.api', () => ({ cursosApi: api }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { default: CursosPendientesPage } = await import('@/modules/cursos-pendientes/pages/CursosPendientesPage');

beforeEach(() => { api.resumen.mockClear(); api.listar.mockClear(); });
const abrir = () => render(<MemoryRouter><CursosPendientesPage /></MemoryRouter>);

describe('Cursos pendientes y la empresa de arriba', () => {
  it('con una empresa, el resumen y la lista piden solo los de esa empresa', async () => {
    ctx.valor = { activeProject: { id: -1 }, activeIssuerId: 7 };
    abrir();
    await waitFor(() => expect(api.listar).toHaveBeenCalled());
    expect(api.resumen).toHaveBeenLastCalledWith({ issuerId: 7 });
    expect(api.listar.mock.calls.at(-1)[0]).toMatchObject({ issuerId: 7 });
  });

  it('con «Todos», como antes: todos los campus de quien mira', async () => {
    ctx.valor = { activeProject: { id: -1 }, activeIssuerId: null };
    abrir();
    await waitFor(() => expect(api.listar).toHaveBeenCalled());
    expect(api.resumen).toHaveBeenLastCalledWith({});
    expect(api.listar.mock.calls.at(-1)[0]).not.toHaveProperty('issuerId');
  });
});
