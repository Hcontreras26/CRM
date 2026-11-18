import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * #163 · «Todas · Solo compartidas · Solo enteras» en Ingresos y en Análisis de
 * ventas. La pantalla manda `compartidas` y el servidor filtra; con «Todas» no
 * se manda nada, como antes.
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
vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: () => true }) }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { default: IncomePage } = await import('@/modules/accounting/pages/IncomePage');
const { default: SalesAnalysisPage } = await import('@/modules/sales/pages/SalesAnalysisPage');

beforeEach(() => {
  get.mockReset();
  // El resumen de Análisis es un objeto: con `null` la pantalla espera sin romperse.
  get.mockImplementation(async (url) => (url === '/ventas/resumen'
    ? { success: true, data: null }
    : { success: true, data: [], pagination: { total: 0 } }));
});

/** Los `params` de la última llamada a esa ruta. */
const ultima = (ruta) => [...get.mock.calls].reverse().find(([u]) => u === ruta)?.[1]?.params || null;

describe('#163 · Ingresos', () => {
  it('con «Todas» no manda el filtro; con «Solo compartidas», sí', async () => {
    render(<MemoryRouter><IncomePage /></MemoryRouter>);
    await waitFor(() => expect(ultima('/conversions')).not.toBeNull());
    expect(ultima('/conversions')).not.toHaveProperty('compartidas');
    fireEvent.change(screen.getByLabelText('Reparto:'), { target: { value: 'solo' } });
    await waitFor(() => expect(ultima('/conversions')).toMatchObject({ compartidas: 'solo' }));
  });

  it('«Solo enteras», también en la lista del periodo', async () => {
    render(<MemoryRouter><IncomePage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Reparto:'), { target: { value: 'enteras' } });
    await waitFor(() => expect(ultima('/conversions/filas')).toMatchObject({ compartidas: 'enteras' }));
  });
});

describe('#163 · Ingresos, «Ver las cuotas» (revisión de Diego, 05/11)', () => {
  const vacio = { n: 0, importe: 0 };
  const TOTALES = {
    importe: 0, pagado: 0, pendiente: 0, iva: 0, facturadas: 0, sinFactura: 0, noRequiereFactura: 0, pendientesDeFacturar: 0,
    facturasDeAntes: { n: 1, importe: 40 }, facturadoEnPeriodo: { n: 1, importe: 40 },
    cobrosDelPeriodo: { matricula: vacio, cuotas: vacio },
    facturasPorClase: { venta: vacio, cuota: { n: 1, importe: 40 }, parte: vacio, suelta: vacio }, porProyecto: [],
  };
  it('manda el filtro, y al cambiarlo se vuelve a pedir', async () => {
    get.mockImplementation(async (url) => (url === '/conversions'
      ? { success: true, data: [], pagination: { total: 0 }, totales: TOTALES }
      : { success: true, data: [], pagination: { total: 0 } }));
    render(<MemoryRouter><IncomePage /></MemoryRouter>);
    // El desglose de cuotas sale con unas fechas puestas.
    fireEvent.click(screen.getByRole('button', { name: 'Este mes' }));
    fireEvent.change(screen.getByLabelText('Reparto:'), { target: { value: 'solo' } });
    const boton = await screen.findByRole('button', { name: 'Ver las cuotas' });
    fireEvent.click(boton);
    await waitFor(() => expect(ultima('/conversions/cuotas')).toMatchObject({ compartidas: 'solo' }));
    // Cambiar el «Reparto» tira el desglose: era el del filtro de antes.
    fireEvent.change(screen.getByLabelText('Reparto:'), { target: { value: 'enteras' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Ver las cuotas' }));
    await waitFor(() => expect(ultima('/conversions/cuotas')).toMatchObject({ compartidas: 'enteras' }));
  });
});

describe('#163 · Análisis de ventas', () => {
  it('el resumen y las demás pestañas mandan el filtro', async () => {
    render(<MemoryRouter><SalesAnalysisPage /></MemoryRouter>);
    await waitFor(() => expect(ultima('/ventas/resumen')).not.toBeNull());
    expect(ultima('/ventas/resumen')).not.toHaveProperty('compartidas');
    fireEvent.change(screen.getByLabelText('Reparto'), { target: { value: 'solo' } });
    await waitFor(() => expect(ultima('/ventas/resumen')).toMatchObject({ compartidas: 'solo' }));
  });
});
