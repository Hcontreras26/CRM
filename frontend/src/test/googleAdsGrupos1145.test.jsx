import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Google Ads (#54, revisión de la PR #1145): un fallo al cargar los grupos de
 * una campaña no es «sin grupos». Se dice, con el motivo, y «Reintentar» los
 * vuelve a pedir. Mismo criterio que Meta Ads en la #1169.
 */

const { api } = vi.hoisted(() => ({
  api: { estado: vi.fn(), campanas: vi.fn(), diario: vi.fn(), grupos: vi.fn(), asignarCampus: vi.fn(), sincronizar: vi.fn() },
}));

vi.mock('@/modules/google-ads/api/googleAds.api', () => ({ googleAdsApi: api }));
vi.mock('@/shared/hooks/useCampusDeLaPantalla', () => ({ useCampusDeLaPantalla: () => ({ id: 3, nombre: 'Psiko Aprende' }) }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ({ projects: [{ id: 3, nombre: 'Psiko Aprende' }] }) }));
vi.mock('@/shared/components/ui/ElegirCampus', () => ({ default: () => null }));
vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: () => false }) }));
vi.mock('recharts', () => {
  const Nada = () => null;
  return { LineChart: Nada, Line: Nada, XAxis: Nada, YAxis: Nada, Tooltip: Nada, ResponsiveContainer: Nada, CartesianGrid: Nada };
});

import GoogleAdsPage from '@/modules/google-ads/pages/GoogleAdsPage';

const cifras = { coste: 100, impresiones: 1000, clics: 10, cpc: 10, leads: 2, coste_por_lead: 50, ventas: 1, coste_por_venta: 100, cobrado: 250, retorno: 150, ctr: 1 };
const CAMPANA = { ...cifras, campaign_id: 'c1', nombre: 'Búsqueda duelo', estado: 'ENABLED', tipo: 'SEARCH', presupuesto_diario: null };
const GRUPO = { ...cifras, id: 'g1', nombre: 'Duelo exacta', anuncios: [] };

beforeEach(() => {
  vi.clearAllMocks();
  api.estado.mockResolvedValue({ activo: true, developer_token: true, campus: [{ project_id: 3, nombre: 'Psiko Aprende', moneda: 'EUR', last_synced_at: null, last_status: 'ok' }] });
  api.campanas.mockResolvedValue({ cuenta: { moneda: 'EUR' }, total: cifras, campanas: [CAMPANA] });
  api.diario.mockResolvedValue([]);
});

const pintar = () => render(<MemoryRouter><GoogleAdsPage /></MemoryRouter>);

describe('grupos de una campaña', () => {
  it('si fallan, se dice con el motivo (no «sin grupos») y «Reintentar» los vuelve a pedir', async () => {
    api.grupos
      .mockRejectedValueOnce(Object.assign(new Error('Error 500'), { status: 500, data: { success: false, error: 'Google no responde' } }))
      .mockResolvedValueOnce([GRUPO]);
    pintar();
    fireEvent.click(await screen.findByRole('button', { name: /Búsqueda duelo/ }));
    const aviso = await screen.findByRole('alert');
    expect(aviso.textContent).toContain('No se han podido cargar los grupos de esta campaña: Google no responde');
    expect(screen.queryByText(/Sin grupos con impresiones/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    await screen.findByText('Duelo exacta');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(api.grupos).toHaveBeenCalledTimes(2);
  });

  it('una lista vacía sí es «sin grupos», sin aviso de error', async () => {
    api.grupos.mockResolvedValueOnce([]);
    pintar();
    fireEvent.click(await screen.findByRole('button', { name: /Búsqueda duelo/ }));
    await screen.findByText(/Sin grupos con impresiones en el periodo/);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('cerrar y volver a abrir una campaña con error lo vuelve a intentar', async () => {
    api.grupos.mockRejectedValueOnce(new Error('caído')).mockResolvedValueOnce([GRUPO]);
    pintar();
    const fila = await screen.findByRole('button', { name: /Búsqueda duelo/ });
    fireEvent.click(fila);
    await screen.findByRole('alert');
    fireEvent.click(fila);
    fireEvent.click(fila);
    await screen.findByText('Duelo exacta');
  });
});
