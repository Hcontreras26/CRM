import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
