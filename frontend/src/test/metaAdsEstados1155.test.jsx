import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * Meta Ads distingue «no se ha podido cargar», «sin cuenta conectada» y «sin
 * datos en el periodo» (#1155), como Google Ads (#54). Antes cada llamada
 * acababa en `.catch(() => setX([]))` y un error del servidor se leía como
 * «Sin campañas en este rango».
 */

const { api, auth } = vi.hoisted(() => ({
  api: {
    accounts: vi.fn(), dashboard: vi.fn(), campaigns: vi.fn(), roi: vi.fn(), productsView: vi.fn(),
    adsets: vi.fn(), ads: vi.fn(),
  },
  auth: { user: { role: 'admin' } },
}));

vi.mock('@/modules/meta-ads/api/metaAds.api', () => ({ metaApi: api }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('@/shared/hooks/useCampusDeLaPantalla', () => ({ useCampusDeLaPantalla: () => ({ id: 3, nombre: 'Psiko Aprende' }) }));
vi.mock('@/shared/components/ui/ElegirCampus', () => ({ default: () => null }));
vi.mock('@/modules/meta-ads/components/ConnectWizard', () => ({ default: () => <p>Asistente para conectar Meta</p> }));

import MetaAdsPage from '@/modules/meta-ads/pages/MetaAdsPage';

const CUENTA = { id: 1, project_id: 3, ad_account_id: 'act_1', ad_account_nombre: 'Psiko Ads', currency: 'EUR', last_synced_at: null, last_sync_status: 'ok', last_sync_error: null };
const CAMPANA = {
  campaign_id: 'c1', nombre: 'Máster otoño', status: 'ACTIVE', effective_status: 'ACTIVE', objective: 'LEADS',
  total_spend: 100, total_impressions: 1000, total_clicks: 10, total_leads: 2, ctr: 1, cpl: 50, leads_crm: 1, cpl_crm: 100, ventas_crm: 0,
};
const ok = (data) => Promise.resolve({ success: true, data });
// Lo que lanza el cliente con un 500: ApiError(mensaje, status, data).
const falla = (msg = 'Error 500') => Promise.reject(Object.assign(new Error(msg), { status: 500, data: { success: false, error: msg } }));

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { role: 'admin' };
  api.accounts.mockImplementation(() => ok([CUENTA]));
  api.dashboard.mockImplementation(() => ok({ totals: { spend: 100, impressions: 1000, leads: 2, ctr: 1, cpl: 50 }, daily: [] }));
  api.campaigns.mockImplementation(() => ok([CAMPANA]));
  api.roi.mockImplementation(() => ok([]));
  api.productsView.mockImplementation(() => ok([]));
  api.adsets.mockImplementation(() => ok([]));
  api.ads.mockImplementation(() => ok([]));
});

describe('error al cargar (500)', () => {
  it('las campañas: se dice, con el motivo, y «Reintentar» las vuelve a pedir', async () => {
    api.campaigns.mockImplementationOnce(() => falla('Meta no responde'));
    render(<MetaAdsPage />);
    const aviso = await screen.findByRole('alert');
    expect(aviso.textContent).toContain('No se han podido cargar las campañas: Meta no responde');
    expect(screen.queryByText(/Todavía no hay datos de campañas/)).toBeNull();
    expect(screen.getByRole('button', { name: /Campañas \(—\)/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    await screen.findByText('Máster otoño');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('las cuentas: no se ofrece conectar una que a lo mejor ya está', async () => {
    api.accounts.mockImplementationOnce(() => falla());
    render(<MetaAdsPage />);
    expect((await screen.findByRole('alert')).textContent).toContain('No se han podido cargar las cuentas de Meta');
    expect(screen.queryByText('Asistente para conectar Meta')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    await screen.findByText('Psiko Ads');
  });

  it('un `success: false` con un 200 también es un fallo', async () => {
    api.campaigns.mockImplementationOnce(() => Promise.resolve({ success: false, error: 'Token caducado' }));
    render(<MetaAdsPage />);
    expect((await screen.findByRole('alert')).textContent).toContain('Token caducado');
  });

  it('las cifras del periodo, el ROI y la vista por producto, cada uno por su lado', async () => {
    api.dashboard.mockImplementationOnce(() => falla('sin dashboard'));
    api.roi.mockImplementationOnce(() => falla('sin roi'));
    api.productsView.mockImplementationOnce(() => falla('sin productos'));
    render(<MetaAdsPage />);
    await screen.findByText(/No se han podido cargar las cifras del periodo: sin dashboard/);
    // Las campañas sí llegaron: un fallo no tapa lo demás.
    expect(screen.getByText('Máster otoño')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Por producto/ }));
    await screen.findByText(/No se han podido cargar la vista por producto: sin productos/);
    fireEvent.click(screen.getByRole('button', { name: /Del gasto a la venta/ }));
    await screen.findByText(/No se han podido cargar los datos del gasto a la venta: sin roi/);
  });

  it('los anuncios de un conjunto, dentro de su fila', async () => {
    api.adsets.mockImplementation(() => ok([{ adset_id: 'a1', nombre: 'Conjunto A', status: 'ACTIVE', total_spend: 5, total_impressions: 1, total_clicks: 0, total_leads: 0 }]));
    api.ads.mockImplementationOnce(() => falla('Meta no responde'));
    render(<MetaAdsPage />);
    fireEvent.click(await screen.findByTitle('Ver conjuntos'));
    fireEvent.click(await screen.findByTitle('Ver anuncios'));
    expect((await screen.findByRole('alert')).textContent).toContain('No se han podido cargar los anuncios de este conjunto');
    expect(screen.queryByText(/Todavía no hay datos de anuncios/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    await screen.findByText(/Todavía no hay datos de anuncios de este conjunto/);
  });
});

describe('campus sin cuenta de Meta', () => {
  it('quien puede conectarla ve el asistente', async () => {
    api.accounts.mockImplementationOnce(() => ok([]));
    render(<MetaAdsPage />);
    await screen.findByText('Asistente para conectar Meta');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('quien solo consulta ve que no hay cuenta y a quién pedírsela', async () => {
    auth.user = { role: 'gestor' };
    api.accounts.mockImplementationOnce(() => ok([]));
    render(<MetaAdsPage />);
    await screen.findByText(/Psiko Aprende no tiene ninguna cuenta de Meta conectada/);
    expect(screen.getByText(/pídeselo a quien gestione la publicidad/)).toBeTruthy();
    expect(screen.queryByText('Asistente para conectar Meta')).toBeNull();
  });
});

describe('sin datos en el periodo', () => {
  it('lista vacía: lo dice, sin hablar de «backfill» y sin aviso de error', async () => {
    api.campaigns.mockImplementationOnce(() => ok([]));
    render(<MetaAdsPage />);
    await screen.findByText(/Todavía no hay datos de campañas del/);
    expect(document.body.textContent).not.toMatch(/backfill/i);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: /Campañas \(0\)/ })).toBeTruthy();
  });

  it('el ROI vacío habla del periodo, no del rango', async () => {
    render(<MetaAdsPage />);
    await screen.findByText('Máster otoño');
    fireEvent.click(screen.getByRole('button', { name: /Del gasto a la venta/ }));
    await screen.findByText(/Todavía no hay datos del/);
  });
});

describe('una respuesta vieja no pisa a la nueva', () => {
  it('al cambiar el rango, las campañas del rango anterior se descartan', async () => {
    let soltarVieja;
    api.campaigns
      .mockImplementationOnce(() => new Promise((r) => { soltarVieja = () => r({ success: true, data: [{ ...CAMPANA, campaign_id: 'v', nombre: 'Vieja' }] }); }))
      .mockImplementation(() => ok([{ ...CAMPANA, campaign_id: 'n', nombre: 'Nueva' }]));
    render(<MetaAdsPage />);
    await waitFor(() => expect(api.campaigns).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: '7d' }));
    await screen.findByText('Nueva');
    soltarVieja();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Vieja')).toBeNull();
  });
});
