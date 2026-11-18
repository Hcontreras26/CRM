import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/*
  #218 · El contador de prospectos nuevos del menú, con «Todos» o una empresa.

  Con -1 arriba pedía `/leads?status=nuevo&limit=1` sin campus, y el servidor
  lo rechaza (`projectId o projectIds requerido`): en /testeo, el 05/11, un 400
  al abrir cada pantalla y otro cada 5 minutos. Ahora pide los campus de lo
  que hay arriba, como la lista de prospectos.
*/

const get = vi.hoisted(() => vi.fn());
const ctx = vi.hoisted(() => ({ value: null }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 3, nombre: 'Angel M.', email: 'angel@empresa.com', role: 'admin' },
    permissions: { '*': true },
    logout: vi.fn(),
  }),
}));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ctx.value }));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
  useOptionalTheme: () => 'dark',
}));
vi.mock('@/shared/api/client', () => ({ default: { get, post: vi.fn() } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { default: Sidebar } = await import('@/shared/components/layout/Sidebar');

const CAMPUS = [
  { id: 1, nombre: 'ISEIH', sociedad_emisora_id: 8 },
  { id: 2, nombre: 'Psiko Aprende', sociedad_emisora_id: 8 },
  { id: 3, nombre: 'ICTESS', sociedad_emisora_id: 9 },
];

async function pedidoDelContador(activeProject, activeIssuerId = null) {
  ctx.value = { activeProject, activeIssuerId, activeIssuer: null, projects: CAMPUS, setActiveProject: vi.fn() };
  render(<MemoryRouter><Sidebar /></MemoryRouter>);
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return get.mock.calls.map(([u]) => u).filter((u) => /^\/leads\?.*status=nuevo/.test(u));
}

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ success: true, data: [], pagination: { total: 0 } });
});

describe('el contador de prospectos nuevos (#218)', () => {
  it('con un campus, pide ese campus', async () => {
    const pedidos = await pedidoDelContador({ id: 1, nombre: 'ISEIH' });
    expect([...new Set(pedidos)]).toEqual(['/leads?projectId=1&status=nuevo&limit=1']);
  });

  it('con «Todos», pide sus campus, nunca sin campus', async () => {
    const pedidos = await pedidoDelContador({ id: -1, nombre: 'Todos los proyectos' });
    expect(pedidos.length).toBeGreaterThan(0);
    for (const u of pedidos) expect(u).toMatch(/projectIds=1,2,3&/);
  });

  it('con una empresa, solo los campus de esa empresa', async () => {
    const pedidos = await pedidoDelContador({ id: -1, nombre: 'CEDIA' }, 8);
    expect(pedidos.length).toBeGreaterThan(0);
    for (const u of pedidos) expect(u).toMatch(/projectIds=1,2&/);
  });
});
