import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * #218, tanda 4 · Análisis IA con «Todos» o una empresa (Diego, 04/11/2026):
 * el historial de todos sus campus, cada informe con el suyo. Un informe es de
 * un campus: para generar uno nuevo se elige el campus dentro de la pantalla.
 */

const ctx = vi.hoisted(() => ({ valor: {} }));
const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ctx.valor }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'superadmin', roles_extra: [] }, permissions: {} }),
}));
vi.mock('@/shared/api/client', () => ({ default: { get, post } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { default: ReportsIAPage } = await import('@/modules/reports-ia/pages/ReportsIAPage');

const CAMPUS = [{ id: 10, nombre: 'Psiko' }, { id: 20, nombre: 'Fono' }];
const INFORMES = [
  { id: 'a', project_id: 10, proyecto_nombre: 'Psiko', periodo: '2026-10', metadata: {} },
  { id: 'b', project_id: 20, proyecto_nombre: 'Fono', periodo: '2026-10', metadata: {} },
];

beforeEach(() => {
  get.mockReset(); post.mockReset();
  get.mockImplementation(async (url) => {
    if (url === '/reports-ia/ambito') return { success: true, data: INFORMES };
    if (String(url).startsWith('/reports-ia/detail/')) return { success: true, data: { ...INFORMES[0], content: 'Texto' } };
    return { success: true, data: [] };
  });
});

const abrir = () => render(<MemoryRouter><ReportsIAPage /></MemoryRouter>);

describe('#218 · Análisis IA con «Todos»', () => {
  it('el historial de todos los campus, cada informe con su campus', async () => {
    ctx.valor = { activeProject: { id: -1, nombre: 'Todos' }, activeIssuerId: null, projects: CAMPUS };
    abrir();
    expect(await screen.findByText('Fono')).toBeTruthy();
    expect(screen.getAllByText('Psiko').length).toBeGreaterThan(0);
    expect(get).toHaveBeenCalledWith('/reports-ia/ambito', { params: {} });
    // Una sola vez: el ámbito no cambia entre renders.
    await waitFor(() => expect(get.mock.calls.filter(([u]) => u === '/reports-ia/ambito')).toHaveLength(1));
  });

  it('generar uno nuevo pide antes su campus', async () => {
    ctx.valor = { activeProject: { id: -1, nombre: 'Todos' }, activeIssuerId: null, projects: CAMPUS };
    abrir();
    await screen.findByText('Fono');
    expect(screen.getByRole('button', { name: 'Generar reporte con Claude AI' }).disabled).toBe(true);
    expect(screen.getByLabelText('Campus de el informe nuevo')).toBeTruthy();
  });

  it('con una empresa arriba, pide los de esa empresa', async () => {
    ctx.valor = { activeProject: { id: -1 }, activeIssuerId: 7, projects: CAMPUS };
    abrir();
    await waitFor(() => expect(get).toHaveBeenCalledWith('/reports-ia/ambito', { params: { issuerId: 7 } }));
  });

  it('con un campus arriba, el historial de ese campus y se genera ahí', async () => {
    ctx.valor = { activeProject: { id: 10, nombre: 'Psiko' }, activeIssuerId: null, projects: CAMPUS };
    abrir();
    await waitFor(() => expect(get).toHaveBeenCalledWith('/reports-ia/10'));
    expect(get).not.toHaveBeenCalledWith('/reports-ia/ambito', expect.anything());
    expect(screen.getByRole('button', { name: 'Generar reporte con Claude AI' }).disabled).toBe(false);
  });
});
