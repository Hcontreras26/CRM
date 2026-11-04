import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * #218, tanda 4 · Convocatorias con «Todos» o una empresa (Diego, 04/11/2026):
 * todos sus campus juntos, cada convocatoria y cada pendiente con su campus.
 * Crear sigue siendo de un campus: con «Todos» no se ofrece.
 */

const auth = vi.hoisted(() => ({ valor: {} }));
const get = vi.hoisted(() => vi.fn());
const patch = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth.valor }));
vi.mock('@/shared/api/client', () => ({ default: { get, post: vi.fn(), patch } }));

const { default: ConvocatoriasPage } = await import('@/modules/convocatorias/pages/ConvocatoriasPage');

const CONVOCATORIAS = [
  { id: 1, project_id: 10, proyecto_nombre: 'Psiko', nombre: 'CETLAT', activa: true, tope_nueva: 40, tope_habilitada: 70, ofrecimientos: 3 },
  { id: 2, project_id: 20, proyecto_nombre: 'Fono', nombre: 'Beca Fono', activa: true, tope_nueva: 30, tope_habilitada: 60, ofrecimientos: 0 },
];
const PENDIENTES = [
  { id: 5, lead_id: 7, project_id: 20, proyecto_nombre: 'Fono', convocatoria: 'Beca Fono', lead_nombre: 'Ana', fecha_resultado: '2026-11-04', dias_de_retraso: 0 },
];

const superadmin = { id: 1, role: 'superadmin', roles_extra: [] };

beforeEach(() => {
  get.mockReset(); patch.mockReset();
  get.mockImplementation(async (url) => {
    if (String(url).startsWith('/convocatorias/ambito')) return { success: true, data: CONVOCATORIAS };
    if (String(url).startsWith('/convocatorias/pendientes')) return { success: true, data: PENDIENTES };
    if (String(url).startsWith('/convocatorias/embudo')) return { success: true, data: null };
    return { success: true, data: [] };
  });
});

const abrir = () => render(<MemoryRouter><ConvocatoriasPage /></MemoryRouter>);

describe('#218 · Convocatorias con «Todos»', () => {
  it('las de todos los campus, cada una con su campus, y sin «Nueva»', async () => {
    auth.valor = { activeProject: { id: -1 }, user: superadmin, permissions: {}, activeIssuerId: null };
    abrir();
    const lista = await screen.findByRole('region', { name: 'Las convocatorias' });
    await within(lista).findByText('CETLAT');
    expect(within(lista).getByLabelText('Campus: Psiko')).toBeTruthy();
    expect(within(lista).getByLabelText('Campus: Fono')).toBeTruthy();
    expect(within(lista).queryByRole('button', { name: /Nueva/ })).toBeNull();
    expect(get).toHaveBeenCalledWith('/convocatorias/ambito');
  });

  it('los pendientes dicen de qué campus son', async () => {
    auth.valor = { activeProject: { id: -1 }, user: superadmin, permissions: {}, activeIssuerId: null };
    abrir();
    const urgentes = await screen.findByRole('region', { name: 'Le debemos respuesta' });
    await within(urgentes).findByText('Ana');
    expect(within(urgentes).getByText('Fono')).toBeTruthy();
  });

  it('con una empresa arriba, las tres cosas piden esa empresa', async () => {
    auth.valor = { activeProject: { id: -1 }, user: superadmin, permissions: {}, activeIssuerId: 7 };
    abrir();
    await waitFor(() => expect(get).toHaveBeenCalledWith('/convocatorias/ambito?issuerId=7'));
    expect(get).toHaveBeenCalledWith('/convocatorias/pendientes?issuerId=7');
    expect(get).toHaveBeenCalledWith('/convocatorias/embudo?issuerId=7');
  });

  it('con un campus arriba, la lista de siempre y sin columna de campus', async () => {
    get.mockImplementation(async (url) => (String(url).startsWith('/convocatorias?projectId=10')
      ? { success: true, data: [CONVOCATORIAS[0]] } : { success: true, data: [] }));
    auth.valor = { activeProject: { id: 10 }, user: superadmin, permissions: {}, activeIssuerId: null };
    abrir();
    const lista = await screen.findByRole('region', { name: 'Las convocatorias' });
    await within(lista).findByText('CETLAT');
    expect(within(lista).queryByLabelText('Campus: Psiko')).toBeNull();
    expect(get).toHaveBeenCalledWith('/convocatorias?projectId=10');
  });
});
