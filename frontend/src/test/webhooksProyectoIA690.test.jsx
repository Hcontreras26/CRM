import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * #690 · Un campus IA no tiene Captación (`salvoTipo: ['ia']` en el menú). Lo que
 * venía de allí —Prospectos, Make, formularios, admisión por webhook— no sale en
 * Conexión › Webhooks: ni sus pestañas ni sus tarjetas del Resumen. Montado de
 * verdad, con el tipo pasando por `tipoDelMenu` (en pruebas, PROYECTOS_IA está
 * encendido, como en /testeo).
 */

const get = vi.fn();
const cabecera = { value: null };
const permisos = { value: null };
vi.mock('@/shared/api/client', () => ({ default: { get: (...a) => get(...a) }, API_BASE_URL: '/crm/api' }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => cabecera.value }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'admin' }, projects: [], permissions: null }) }));
vi.mock('@/shared/hooks/usePermission', () => ({
  default: () => ({ can: (p) => (permisos.value ? permisos.value.includes(p) : true), tieneRol: () => true, llevaEquipo: false }),
}));

const { default: WebhooksLayout } = await import('@/modules/webhooks/pages/WebhooksLayout');
const { default: WebhooksResumenPage } = await import('@/modules/webhooks/pages/WebhooksResumenPage');
const { PROYECTOS_IA } = await import('@/shared/lib/proyectosIA');

const campus = (type) => ({ id: 4, nombre: 'Tarot IA', type, modules: {}, sociedad_emisora_id: 7 });

const IA = { id: 4, nombre: 'Tarot IA', type: 'ia', modules: {}, sociedad_emisora_id: 7 };
const CURSOS = { id: 5, nombre: 'Psiko', type: 'educacion', modules: {}, sociedad_emisora_id: 7 };
const OTRA_IA = { id: 6, nombre: 'Nutri IA', type: 'ia', modules: {}, sociedad_emisora_id: 8 };
const TODOS = { id: -1, nombre: 'Todos los proyectos', type: 'multi' };

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ success: true, data: [] });
  permisos.value = null;
});

describe('Conexión › Webhooks en un campus IA', () => {
  it('en pruebas, PROYECTOS_IA está encendido (si no, esta prueba no prueba nada)', () => {
    expect(PROYECTOS_IA).toBe(true);
  });

  it('las pestañas: sin Prospectos ni Make', () => {
    cabecera.value = { activeProject: campus('ia'), activeIssuerId: null, projects: [] };
    render(<MemoryRouter><WebhooksLayout /></MemoryRouter>);
    const nav = screen.getByRole('navigation');
    expect(within(nav).queryByRole('link', { name: /Prospectos/ })).toBeNull();
    expect(within(nav).queryByRole('link', { name: /Make/ })).toBeNull();
    expect(within(nav).getByRole('link', { name: /Transferencias/ })).toBeTruthy();
  });

  it('en un campus de formación, todas', () => {
    cabecera.value = { activeProject: campus('educacion'), activeIssuerId: null, projects: [] };
    render(<MemoryRouter><WebhooksLayout /></MemoryRouter>);
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('link', { name: /Prospectos/ })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: /Make/ })).toBeTruthy();
  });

  it('el Resumen: sin las tarjetas de Captación, y sin pedir lo suyo', async () => {
    cabecera.value = { activeProject: campus('ia'), activeIssuerId: null, projects: [] };
    render(<MemoryRouter><WebhooksResumenPage /></MemoryRouter>);
    expect(await screen.findByTestId('tipo-transferencias')).toBeTruthy();
    for (const t of ['prospectos', 'admision-webhooks', 'make', 'formularios']) {
      expect(screen.queryByTestId(`tipo-${t}`)).toBeNull();
    }
    const pedidas = get.mock.calls.map(([u]) => u);
    expect(pedidas.some((u) => u.startsWith('/make-webhooks'))).toBe(false);
    expect(pedidas.some((u) => u.startsWith('/forms?'))).toBe(false);
  });

  it('en un campus de formación, el Resumen sí las pide', async () => {
    cabecera.value = { activeProject: campus('educacion'), activeIssuerId: null, projects: [] };
    render(<MemoryRouter><WebhooksResumenPage /></MemoryRouter>);
    expect(await screen.findByTestId('tipo-make')).toBeTruthy();
    expect(get.mock.calls.some(([u]) => u.startsWith('/make-webhooks'))).toBe(true);
  });

  it('con «Todos» y campus IA y de formación mezclados, lo de Captación solo se pide de los de formación', async () => {
    cabecera.value = { activeProject: TODOS, activeIssuerId: null, projects: [IA, CURSOS] };
    render(<MemoryRouter><WebhooksResumenPage /></MemoryRouter>);
    expect(await screen.findByTestId('tipo-make')).toBeTruthy();
    const make = get.mock.calls.map(([u]) => u).filter((u) => u.startsWith('/make-webhooks?'));
    expect(make).toEqual(['/make-webhooks?projectId=5']);
  });

  it('con una empresa (aunque sus campus sean todos IA) o con «Todos», las pestañas siguen la regla del menú: salen', () => {
    // El menú, con una empresa o «Todos», enseña Captación (`type: 'multi'`): las pestañas, igual.
    cabecera.value = { activeProject: TODOS, activeIssuerId: 8, projects: [IA, CURSOS, OTRA_IA] };
    const { unmount } = render(<MemoryRouter><WebhooksLayout /></MemoryRouter>);
    expect(within(screen.getByRole('navigation')).getByRole('link', { name: /Make/ })).toBeTruthy();
    unmount();
    cabecera.value = { activeProject: TODOS, activeIssuerId: null, projects: [IA, CURSOS] };
    render(<MemoryRouter><WebhooksLayout /></MemoryRouter>);
    expect(within(screen.getByRole('navigation')).getByRole('link', { name: /Make/ })).toBeTruthy();
  });

  it('si un campus pasa a ser IA con la pantalla abierta, se vuelve a pedir y desaparece lo de Captación', async () => {
    cabecera.value = { activeProject: campus('educacion'), activeIssuerId: null, projects: [] };
    const { rerender } = render(<MemoryRouter><WebhooksResumenPage /></MemoryRouter>);
    expect(await screen.findByTestId('tipo-make')).toBeTruthy();
    const antes = get.mock.calls.filter(([u]) => u.startsWith('/webhooks-salientes?')).length;
    cabecera.value = { activeProject: campus('ia'), activeIssuerId: null, projects: [] };
    rerender(<MemoryRouter><WebhooksResumenPage /></MemoryRouter>);
    await waitFor(() => expect(screen.queryByTestId('tipo-make')).toBeNull());
    await waitFor(() => expect(get.mock.calls.filter(([u]) => u.startsWith('/webhooks-salientes?')).length).toBeGreaterThan(antes));
  });

  it('el estado vacío dice todas sus causas: campus IA y módulo apagado', async () => {
    permisos.value = ['make.view'];
    cabecera.value = { activeProject: TODOS, activeIssuerId: null, projects: [IA, { ...CURSOS, modules: { make: false } }] };
    render(<MemoryRouter><WebhooksResumenPage /></MemoryRouter>);
    const texto = (await screen.findByText(/o no hay ninguno/)).textContent;
    expect(texto).toMatch(/no existe en los proyectos IA/);
    expect(texto).toMatch(/módulo apagado/);
  });

  it('si solo se puede ver lo de Captación y el campus es IA, se dice por qué no hay nada', async () => {
    permisos.value = ['make.view', 'forms.view'];
    cabecera.value = { activeProject: campus('ia'), activeIssuerId: null, projects: [] };
    render(<MemoryRouter><WebhooksResumenPage /></MemoryRouter>);
    expect(await screen.findByText('Sin webhooks en estos campus')).toBeTruthy();
    expect(screen.getByText(/venía de Captación .*no existe en los proyectos IA, o no hay ninguno/)).toBeTruthy();
    expect(screen.queryByText(/módulo apagado/)).toBeNull();
  });

  it('si solo quedan los tokens antiguos y no hay ninguno, no se queda la página en blanco', async () => {
    permisos.value = ['webhooks.view', 'forms.view'];
    cabecera.value = { activeProject: campus('ia'), activeIssuerId: null, projects: [] };
    render(<MemoryRouter><WebhooksResumenPage /></MemoryRouter>);
    expect(await screen.findByText('Sin webhooks en estos campus')).toBeTruthy();
    // Los tokens SÍ se piden en el campus IA y solo están vacíos: también se dice.
    expect(screen.getByText(/venía de Captación.*o no hay ninguno/)).toBeTruthy();
  });
});
