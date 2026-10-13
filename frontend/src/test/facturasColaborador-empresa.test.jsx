import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { pathAllowsAll, rutaAceptaSociedad } from '@/shared/components/layout/AppLayout';

/**
 * #202 · Diego, 10/10: «las facturas de colaboradores son por EMPRESA, no por
 * campus». Con una empresa en la cabecera, las dos pantallas enseñaban el muro
 * «Elige un campus», y con «Todos los proyectos», «Selecciona un proyecto».
 */

const { cabecera, api } = vi.hoisted(() => ({
  cabecera: { value: {} },
  api: {
    empresas: vi.fn(),
    mes: vi.fn(),
    colaboradores: vi.fn(),
    // Segunda parte: las pestañas, el coste por campus y el ZIP.
    vista: vi.fn(),
    costePorCampus: vi.fn(),
    bajarZip: vi.fn(),
  },
}));

vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => cabecera.value }));
vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: () => true }) }));
vi.mock('@/modules/facturas-colaborador/api/facturasColaborador.api', async (original) => ({
  ...(await original()),
  facturasColaboradorApi: api,
}));

import FacturasColaboradoresPage from '@/modules/facturas-colaborador/pages/FacturasColaboradoresPage';

const MES_VACIO = {
  periodo: '2026-09-01', mes: 'septiembre de 2026', facturas: [],
  resumen: { total: 0, recibidas: 0, importe_recibido: 0, importe_acordado: 0 },
};

const abrir = (ruta = '/finanzas/facturas-colaboradores') => render(
  <MemoryRouter initialEntries={[ruta]}><FacturasColaboradoresPage /></MemoryRouter>,
);

describe('el muro deja pasar las dos pantallas', () => {
  it.each(['/finanzas/facturas-colaboradores', '/mi-factura'])('%s se abre con una empresa y con «Todos los proyectos»', (ruta) => {
    expect(rutaAceptaSociedad(ruta)).toBe(true);
    expect(pathAllowsAll(ruta)).toBe(true);
  });
});

describe('Facturas de colaboradores sigue a la empresa de la cabecera', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.empresas.mockResolvedValue({ data: [{ id: 7, razon_social: 'CEDIA Investigación y Desarrollo SL' }, { id: 9, razon_social: 'Ictess SL' }] });
    api.mes.mockResolvedValue({ data: MES_VACIO });
    api.colaboradores.mockResolvedValue({ data: [] });
    api.vista.mockResolvedValue({ data: { vista: 'por_pagar', resumen: { total: 0, importe: 0, pendiente: 0 }, facturas: [] } });
    api.costePorCampus.mockResolvedValue({ data: { campus: [] } });
    api.bajarZip.mockResolvedValue(undefined);
  });

  it('con una empresa elegida: «Del mes» pide solo la suya, sin desplegable que le lleve la contraria', async () => {
    cabecera.value = { activeIssuerId: 7, isAllProjects: true, activeProject: { id: null } };
    abrir();
    await waitFor(() => expect(api.mes).toHaveBeenCalled());
    expect(api.mes.mock.calls.every(([f]) => f.issuerId === 7)).toBe(true);
    expect(screen.queryByLabelText('Empresa')).toBeNull();
  });

  it('con un campus: la empresa de ese campus', async () => {
    cabecera.value = { activeIssuerId: null, isAllProjects: false, activeProject: { id: 3, sociedad_emisora_id: 9 } };
    abrir();
    await waitFor(() => expect(api.mes).toHaveBeenCalled());
    expect(api.mes.mock.calls.every(([f]) => f.issuerId === 9)).toBe(true);
  });

  it('con «Todos los proyectos»: todas las que ve, con el desplegable «Todas las empresas»', async () => {
    cabecera.value = { activeIssuerId: null, isAllProjects: true, activeProject: { id: null } };
    abrir();
    await waitFor(() => expect(api.mes).toHaveBeenCalled());
    expect(api.mes.mock.calls[0][0].issuerId).toBeUndefined();
    expect(screen.getByLabelText('Empresa')).toBeTruthy();
  });

  it('«Colaboradores», con una empresa elegida: solo quienes le facturan', async () => {
    cabecera.value = { activeIssuerId: 7, isAllProjects: true, activeProject: { id: null } };
    abrir('/finanzas/facturas-colaboradores?vista=colaboradores');
    await waitFor(() => expect(api.colaboradores).toHaveBeenCalled());
    expect(api.colaboradores.mock.calls.every(([f]) => f.issuerId === 7)).toBe(true);
  });
});

// La segunda parte, con la misma regla: sus pestañas, el coste por campus y el ZIP.
describe('Enviadas, Por pagar, Pagadas, Historial, el coste por campus y el ZIP, también', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.empresas.mockResolvedValue({ data: [{ id: 7, razon_social: 'CEDIA Investigación y Desarrollo SL' }, { id: 9, razon_social: 'Ictess SL' }] });
    api.mes.mockResolvedValue({ data: MES_VACIO });
    api.colaboradores.mockResolvedValue({ data: [{ id: 1, nombre: 'Laura' }] });
    api.vista.mockResolvedValue({ data: { vista: 'por_pagar', resumen: { total: 0, importe: 0, pendiente: 0 }, facturas: [] } });
    api.costePorCampus.mockResolvedValue({ data: { campus: [] } });
    api.bajarZip.mockResolvedValue(undefined);
  });

  it.each(['enviadas', 'por_pagar', 'pagadas', 'historial'])('%s, con CEDIA en la cabecera: solo CEDIA y sin desplegable', async (vista) => {
    cabecera.value = { activeIssuerId: 7, isAllProjects: true, activeProject: { id: null } };
    abrir(`/finanzas/facturas-colaboradores?vista=${vista}`);
    await waitFor(() => expect(api.vista).toHaveBeenCalled());
    expect(api.vista.mock.calls.every(([f]) => f.vista === vista && f.issuerId === '7')).toBe(true);
    // El filtro de colaborador, solo con quienes le facturan.
    await waitFor(() => expect(api.colaboradores).toHaveBeenCalled());
    expect(api.colaboradores.mock.calls.every(([f]) => f.issuerId === 7)).toBe(true);
    expect(screen.queryByLabelText('Empresa')).toBeNull();
  });

  it('con «Todos los proyectos», las pestañas no fijan empresa y tienen su desplegable', async () => {
    cabecera.value = { activeIssuerId: null, isAllProjects: true, activeProject: { id: null } };
    abrir('/finanzas/facturas-colaboradores?vista=pagadas');
    await waitFor(() => expect(api.vista).toHaveBeenCalled());
    expect(api.vista.mock.calls[0][0].issuerId).toBe('');
    expect(screen.getByLabelText('Empresa')).toBeTruthy();
  });

  it('al recargar «Del mes» (anular, pagar, «Actualizar») el coste por campus se pide otra vez', async () => {
    // Prueba a mano del 12/10: tras anular una factura, el coste seguía contándola.
    cabecera.value = { activeIssuerId: null, isAllProjects: true, activeProject: { id: null } };
    abrir('/finanzas/facturas-colaboradores?periodo=2026-09');
    await waitFor(() => expect(api.costePorCampus).toHaveBeenCalled());
    const antes = api.costePorCampus.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /Actualizar/ }));
    await waitFor(() => expect(api.costePorCampus.mock.calls.length).toBeGreaterThan(antes));
  });

  it('«Del mes» con un campus de Ictess: el coste por campus y el ZIP son de Ictess, sin elegir nada', async () => {
    cabecera.value = { activeIssuerId: null, isAllProjects: false, activeProject: { id: 3, sociedad_emisora_id: 9 } };
    abrir('/finanzas/facturas-colaboradores?periodo=2026-09');
    await waitFor(() => expect(api.costePorCampus).toHaveBeenCalled());
    expect(api.costePorCampus.mock.calls.every(([periodo, issuerId]) => periodo === '2026-09' && issuerId === '9')).toBe(true);
    // El ZIP ya no pide elegir empresa: es el de la cabecera.
    await waitFor(() => expect(api.empresas).toHaveBeenCalled());
    const zip = screen.getByRole('button', { name: 'Descargar el ZIP del mes' });
    await waitFor(() => expect(zip).not.toBeDisabled());
    fireEvent.click(zip);
    await waitFor(() => expect(api.bajarZip).toHaveBeenCalledWith('2026-09', 9, 'Ictess SL'));
  });
});
