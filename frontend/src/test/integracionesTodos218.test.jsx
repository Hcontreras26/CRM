import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

/**
 * #218, tanda 4 · Integraciones con «Todos» o una empresa (Diego, 04/11/2026):
 * el estado de cada campus en una lista, SOLO PARA VER. Para cambiar algo se
 * entra en el campus.
 */

const ctx = vi.hoisted(() => ({ valor: {} }));
const get = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ctx.valor }));
vi.mock('@/shared/api/client', () => ({ default: { get, put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));
// La tarjeta de links de pago (#680) mira los permisos de quien entra.
const permisos = vi.hoisted(() => ({ mapa: {} }));
vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: (k) => permisos.mapa[k] === true }) }));

const { default: IntegrationsPage } = await import('@/modules/accounting/pages/IntegrationsPage');

const CAMPUS = [
  { id: 1, nombre: 'Psiko Aprende', type: 'crm', integraciones: [
    { provider: 'stripe', has_secret: true, last_test_status: 'success', last_test_at: '2026-11-01T10:00:00Z' },
    { provider: 'brevo', has_secret: true, last_test_status: 'error', last_test_at: '2026-11-01T10:00:00Z' },
  ] },
  { id: 2, nombre: 'Fono Aprende', type: 'crm', integraciones: [] },
];

beforeEach(() => {
  get.mockReset();
  get.mockImplementation(async (url) => (url === '/integrations/estado'
    ? { success: true, data: CAMPUS }
    : { success: true, data: [] }));
});

describe('#218 · Integraciones con «Todos»', () => {
  it('lista cada campus con su estado, sin formularios para cambiar nada', async () => {
    const switchProject = vi.fn();
    ctx.valor = { activeProject: { id: -1 }, isAllProjects: true, activeIssuerId: null, switchProject };
    render(<IntegrationsPage />);
    const tabla = await screen.findByRole('table', { name: 'Estado de las integraciones por campus' });
    const filas = within(tabla).getAllByRole('row');
    expect(filas).toHaveLength(3); // cabecera + 2 campus
    expect(filas[1].textContent).toContain('Psiko Aprende');
    expect(filas[1].textContent).toContain('Conectado');
    expect(filas[1].textContent).toContain('Error');
    expect(filas[2].textContent).toContain('Sin configurar');
    // Solo para ver: ni un campo para escribir una clave.
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(get).toHaveBeenCalledWith('/integrations/estado', { params: {} });
    // Para cambiar algo, se entra en el campus.
    fireEvent.click(screen.getByRole('button', { name: /Entrar en Fono Aprende/ }));
    expect(switchProject).toHaveBeenCalledWith(2);
  });

  it('con una empresa arriba, pide los campus de esa empresa', async () => {
    ctx.valor = { activeProject: { id: 1 }, isAllProjects: false, activeIssuerId: 7, switchProject: vi.fn() };
    render(<IntegrationsPage />);
    await screen.findByRole('table', { name: 'Estado de las integraciones por campus' });
    expect(get).toHaveBeenCalledWith('/integrations/estado', { params: { issuerId: 7 } });
  });

  it('con un campus elegido, sus tarjetas de siempre y no la lista', async () => {
    ctx.valor = { activeProject: { id: 1, nombre: 'Psiko Aprende', type: 'crm' }, isAllProjects: false, activeIssuerId: null };
    render(<IntegrationsPage />);
    await vi.waitFor(() => expect(get).toHaveBeenCalledWith(expect.stringContaining('/integrations/stripe?projectId=1')));
    expect(screen.queryByRole('table', { name: 'Estado de las integraciones por campus' })).toBeNull();
    expect(get).not.toHaveBeenCalledWith('/integrations/estado', expect.anything());
  });
});

describe('#680 · la tarjeta de links de pago', () => {
  const CAMPUS_1 = { activeProject: { id: 1, nombre: 'Psiko Aprende', type: 'crm' }, isAllProjects: false, activeIssuerId: null };

  it('sale con un campus elegido, con su clave aparte y los permisos que necesita', async () => {
    permisos.mapa = { 'integrations.view': true, 'integrations.edit': true };
    ctx.valor = CAMPUS_1;
    render(<IntegrationsPage />);
    await vi.waitFor(() => expect(get).toHaveBeenCalledWith('/integrations/stripe_links?projectId=1'));
    expect(screen.getByRole('heading', { name: /Links de pago/ })).toBeTruthy();
    expect(screen.getByLabelText(/Clave restringida de escritura/)).toBeTruthy();
    expect(screen.getByText('Checkout Sessions')).toBeTruthy();
    // Sin «Configurar los links de pago», ni el campo del descuento ni su petición.
    expect(screen.queryByLabelText(/Descuento máximo/)).toBeNull();
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining('/links-pago/config'));
  });

  it('con «Configurar los links de pago», el descuento máximo del campus', async () => {
    permisos.mapa = { 'integrations.view': true, 'integrations.edit': true, 'links_pago.configurar': true };
    get.mockImplementation(async (url) => (url.startsWith('/links-pago/config')
      ? { success: true, data: { project_id: 1, descuento_max_pct: 10 } }
      : { success: true, data: null }));
    ctx.valor = CAMPUS_1;
    render(<IntegrationsPage />);
    const campo = await screen.findByLabelText(/Descuento máximo/);
    await vi.waitFor(() => expect(campo.value).toBe('10'));
  });
});
