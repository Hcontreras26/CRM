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
  // Lo que decide es el permiso de la ruta, `meta_ads.edit`, no el rol (#1169).
  auth: { permisos: { 'meta_ads.view': true, 'meta_ads.edit': true }, campus: { id: 3, nombre: 'Psiko Aprende' } },
}));

vi.mock('@/modules/meta-ads/api/metaAds.api', () => ({ metaApi: api }));
vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: (k) => !!auth.permisos[k] }) }));
vi.mock('@/shared/hooks/useCampusDeLaPantalla', () => ({ useCampusDeLaPantalla: () => auth.campus }));
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
  auth.permisos = { 'meta_ads.view': true, 'meta_ads.edit': true };
  auth.campus = { id: 3, nombre: 'Psiko Aprende' };
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

  it('quien solo consulta (sin meta_ads.edit) ve que no hay cuenta y a quién pedírsela', async () => {
    auth.permisos = { 'meta_ads.view': true };
    api.accounts.mockImplementationOnce(() => ok([]));
    render(<MetaAdsPage />);
    await screen.findByText(/Psiko Aprende no tiene ninguna cuenta de Meta conectada/);
    expect(screen.getByText(/pídeselo a quien gestione la publicidad/)).toBeTruthy();
    expect(screen.queryByText('Asistente para conectar Meta')).toBeNull();
  });
});

describe('por permiso, no por rol (#1169)', () => {
  it('sin meta_ads.edit, con cuenta, no hay «Sincronizar» ni «Asociar» ni configuración', async () => {
    auth.permisos = { 'meta_ads.view': true };
    render(<MetaAdsPage />);
    await screen.findByText('Máster otoño');
    expect(screen.queryByText('Asociar')).toBeNull();
    expect(screen.queryByRole('button', { name: /Sincronizar ahora/ })).toBeNull();
  });

  it('con meta_ads.edit (p. ej. una gestora con la excepción) sí puede asociar', async () => {
    render(<MetaAdsPage />);
    await screen.findByText('Máster otoño');
    expect(screen.getByText('Asociar')).toBeTruthy();
  });
});

describe('las filas abiertas siguen al rango de fechas', () => {
  it('al cambiar el rango con una campaña abierta, se vuelven a pedir sus conjuntos', async () => {
    api.adsets.mockImplementation(() => ok([{ adset_id: 'a1', nombre: 'Conjunto A', status: 'ACTIVE', total_spend: 5, total_impressions: 1, total_clicks: 0, total_leads: 0 }]));
    render(<MetaAdsPage />);
    fireEvent.click(await screen.findByTitle('Ver conjuntos'));
    await screen.findByText('Conjunto A');
    expect(api.adsets).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '7d' }));
    await waitFor(() => expect(api.adsets).toHaveBeenCalledTimes(2));
    const [, , rango] = api.adsets.mock.calls[1];
    expect(rango.dateFrom).not.toBe(api.adsets.mock.calls[0][2].dateFrom);
    await screen.findByText('Conjunto A');
  });
});

describe('las cuentas de un campus anterior no se pintan', () => {
  it('al cambiar de campus, la respuesta del anterior que llega tarde se descarta', async () => {
    let soltarVieja;
    api.accounts
      .mockImplementationOnce(() => new Promise((r) => { soltarVieja = () => r({ success: true, data: [{ ...CUENTA, ad_account_nombre: 'Cuenta vieja' }] }); }))
      .mockImplementation(() => ok([CUENTA]));
    const { rerender } = render(<MetaAdsPage />);
    await waitFor(() => expect(api.accounts).toHaveBeenCalledTimes(1));
    auth.campus = { id: 4, nombre: 'Fono Aprende' };
    rerender(<MetaAdsPage />);
    await screen.findByText('Psiko Ads');
    soltarVieja();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Cuenta vieja')).toBeNull();
    expect(screen.getByText('Psiko Ads')).toBeTruthy();
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
