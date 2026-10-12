import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { pathAllowsAll, rutaAceptaSociedad } from '@/shared/components/layout/AppLayout';

/**
 * #199 · Matrículas, «por empresa y con "Todos los proyectos", como el resto del
 * CRM». Con una empresa en la cabecera salía el muro de «elige un campus», y con
 * «Todos» la lista se quedaba cargando: la pantalla no pedía nada sin un campus.
 */

const { cabecera, get } = vi.hoisted(() => ({ cabecera: { value: {} }, get: vi.fn() }));

vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => cabecera.value }));
vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: () => true, tieneRol: () => true }) }));
vi.mock('@/shared/api/client', () => ({ default: { get, post: vi.fn(), patch: vi.fn() } }));

import MatriculasPage from '@/modules/matriculas/pages/MatriculasPage';

const VACIA = { success: true, data: [], stats: { total: 0, pendientes: 0, validadas: 0, rechazadas: 0 } };
const pedido = () => new URLSearchParams(get.mock.calls.at(-1)[0].split('?')[1]);
const abrir = () => render(<MemoryRouter initialEntries={['/clientes/matriculas']}><MatriculasPage /></MemoryRouter>);

describe('el muro deja pasar Matrículas', () => {
  it('se abre con una empresa y con «Todos los proyectos»', () => {
    expect(rutaAceptaSociedad('/clientes/matriculas')).toBe(true);
    expect(pathAllowsAll('/clientes/matriculas')).toBe(true);
  });
});

describe('el listado sigue a la cabecera', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue(VACIA);
  });

  it('con una empresa: pide esa empresa y no un campus', async () => {
    cabecera.value = { activeIssuerId: 7, activeIssuer: { nombre: 'CEDIA' }, activeProject: { id: -1 } };
    abrir();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(pedido().get('issuerId')).toBe('7');
    expect(pedido().get('projectId')).toBeNull();
    expect(await screen.findByText('0 matrículas en CEDIA')).toBeTruthy();
  });

  it('con «Todos los proyectos»: pide sin campus y no se queda cargando', async () => {
    cabecera.value = { activeIssuerId: null, activeIssuer: null, activeProject: { id: -1 } };
    abrir();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(pedido().get('projectId')).toBeNull();
    expect(pedido().get('issuerId')).toBeNull();
    expect(await screen.findByText('Sin matrículas')).toBeTruthy();
  });

  it('con un campus: ese campus, como antes', async () => {
    cabecera.value = { activeIssuerId: null, activeIssuer: null, activeProject: { id: 3, nombre: 'ISEIH' } };
    abrir();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(pedido().get('projectId')).toBe('3');
    expect(await screen.findByText('0 matrículas en ISEIH')).toBeTruthy();
  });

  it('los webhooks, sin un campus elegido, piden elegirlo en vez de buscar el del «proyecto −1»', async () => {
    cabecera.value = { activeIssuerId: 7, activeIssuer: { nombre: 'CEDIA' }, activeProject: { id: -1 } };
    abrir();
    await waitFor(() => expect(get).toHaveBeenCalled());
    get.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Webhooks/ }));
    expect(await screen.findByText('Elige un campus')).toBeTruthy();
    expect(get.mock.calls.some(([url]) => url.startsWith('/webhook-tokens'))).toBe(false);
  });
});
