import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * #1176, gemela de CRM-ISEIE#186 · «Todas · Solo compartidas · Solo enteras»
 * en la pantalla Ventas (`/ventas`): que lo sigan las tarjetas y que se combine
 * con los demás filtros. Ingresos y Análisis ya los prueba
 * compartidasFiltro163.test.jsx. En ISEIE: frontend/src/__smoke__/compartidas186.test.jsx.
 */

const get = vi.hoisted(() => vi.fn());
vi.mock('@/shared/api/client', () => ({ default: { get, post: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'admin' } }) }));
vi.mock('@/contexts/ProjectContext', () => ({
  useProjectContext: () => ({
    activeProject: { id: 1, nombre: 'Campus de prueba' }, activeIssuer: null, activeIssuerId: null,
    projects: [{ id: 1, nombre: 'Campus de prueba' }], switchProject: vi.fn(), switchIssuer: vi.fn(),
  }),
}));
vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: () => true, veGestoras: false }) }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { default: SalesPage } = await import('@/modules/sales/pages/SalesPage');
// Las tarjetas de Ventas son `lazy`: se cargan ya, para que la prueba no dependa de
// lo que tarde la primera carga de cada una.
await Promise.all([
  import('@/modules/sales/components/ResumenVentas'), import('@/modules/sales/components/CursosVendidosCard'),
  import('@/modules/sales/components/EvolucionVentas'), import('@/modules/sales/components/DesgloseVentas'),
  import('@/modules/sales/components/VentasPorPais'), import('@/modules/sales/components/ClientesVentas'),
]);
const { default: IncomePage } = await import('@/modules/accounting/pages/IncomePage');

beforeEach(() => {
  get.mockReset();
  // El resumen es un objeto: con `null` la tarjeta espera sin romperse.
  get.mockImplementation(async (url) => (String(url).startsWith('/ventas/resumen')
    ? { success: true, data: null }
    : { success: true, data: [], pagination: { total: 0 } }));
});

/** Los parámetros de la última llamada a esa ruta, en `params` o en la dirección. */
function ultima(ruta) {
  const llamada = [...get.mock.calls].reverse().find(([u]) => String(u).split('?')[0] === ruta);
  if (!llamada) return null;
  const [url, opciones] = llamada;
  const deLaUrl = Object.fromEntries(new URLSearchParams(String(url).split('?')[1] || ''));
  return { ...deLaUrl, ...(opciones?.params || {}) };
}

describe('Finanzas › Ventas · «Programas más vendidos» sigue al «Reparto»', () => {
  it('con «Todas» no lo manda; con «Solo compartidas», sí', async () => {
    render(<MemoryRouter><IncomePage /></MemoryRouter>);
    await waitFor(() => expect(ultima('/ventas/top-products')).not.toBeNull(), { timeout: 10000 });
    expect(ultima('/ventas/top-products')).not.toHaveProperty('compartidas');
    fireEvent.change(screen.getByLabelText('Reparto:'), { target: { value: 'solo' } });
    await waitFor(() => expect(ultima('/ventas/top-products')).toMatchObject({ compartidas: 'solo' }), { timeout: 10000 });
  }, 30000);
});

describe('Ventas · las tarjetas siguen al «Reparto»', () => {
  const TARJETAS = ['/ventas/resumen', '/ventas/top-products', '/ventas/serie', '/ventas/desglose', '/ventas/paises', '/ventas/por-cliente'];
  // Las tarjetas son `lazy`: la primera vez tardan en cargar más que el segundo por defecto.
  const ESPERA = { timeout: 20000 };

  it('con «Todas», ninguna lo manda; con «Solo compartidas», todas', async () => {
    render(<MemoryRouter><SalesPage /></MemoryRouter>);
    await waitFor(() => TARJETAS.forEach((t) => expect(ultima(t)).not.toBeNull()), ESPERA);
    TARJETAS.forEach((t) => expect(ultima(t)).not.toHaveProperty('compartidas'));
    fireEvent.change(screen.getByLabelText('Reparto'), { target: { value: 'solo' } });
    await waitFor(() => TARJETAS.forEach((t) => expect(ultima(t)).toMatchObject({ compartidas: 'solo' })), ESPERA);
  }, 60000);

  it('se combina con los demás filtros: el periodo sigue puesto', async () => {
    render(<MemoryRouter><SalesPage /></MemoryRouter>);
    await waitFor(() => expect(ultima('/ventas/resumen')).not.toBeNull(), ESPERA);
    const { from, to } = ultima('/ventas/resumen');
    fireEvent.change(screen.getByLabelText('Reparto'), { target: { value: 'enteras' } });
    await waitFor(() => expect(ultima('/ventas/resumen')).toMatchObject({ compartidas: 'enteras', from, to, projectId: '1' }), ESPERA);
  }, 30000);
});
