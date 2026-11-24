import client from '@/shared/api/client';

/** Google Ads (CRM#54): campañas y gasto, con lo que han traído al CRM. */

export interface EstadoCampus {
  project_id: number;
  nombre: string;
  customer_id: string | null;
  cuenta: string | null;
  moneda: string | null;
  last_synced_at: string | null;
  last_status: 'ok' | 'error' | null;
  last_error: string | null;
  backfill_done: boolean | null;
}
export interface Estado { activo: boolean; developer_token: boolean; campus: EstadoCampus[] }

export interface Cifras {
  coste: number;
  impresiones: number;
  clics: number;
  conversiones_google: number;
  leads: number;
  ventas: number;
  vendido: number;
  cobrado: number;
  ctr: number | null;
  cpc: number | null;
  coste_por_lead: number | null;
  coste_por_venta: number | null;
  retorno: number;
}
export interface Campana extends Cifras {
  campaign_id: string;
  nombre: string;
  estado: string | null;
  tipo: string | null;
  presupuesto_diario: number | null;
  asignada_a_mano: boolean;
}
export interface Campanas {
  periodo: { desde: string; hasta: string };
  cuenta: { customer_id: string; nombre: string | null; moneda: string | null; last_synced_at: string | null } | null;
  total: Cifras;
  campanas: Campana[];
}
export interface Dia { fecha: string; coste: number; clics: number; impresiones: number }
export interface Elemento {
  id: string;
  ad_group_id: string | null;
  nombre: string;
  coste: number;
  impresiones: number;
  clics: number;
  conversiones_google: number;
  ctr: number | null;
  cpc: number | null;
}
export interface Grupo extends Elemento { anuncios: Elemento[] }

type Cuerpo<T> = { success?: boolean; data?: T };
const datos = <T,>(r: unknown) => (r as Cuerpo<T>).data as T;
const qs = (projectId: number, desde: string, hasta: string) =>
  new URLSearchParams({ projectId: String(projectId), desde, hasta }).toString();

export const googleAdsApi = {
  estado: () => client.get('/google-ads/estado').then(datos<Estado>),
  campanas: (projectId: number, desde: string, hasta: string) =>
    client.get(`/google-ads/campanas?${qs(projectId, desde, hasta)}`).then(datos<Campanas>),
  diario: (projectId: number, desde: string, hasta: string) =>
    client.get(`/google-ads/diario?${qs(projectId, desde, hasta)}`).then(datos<Dia[]>),
  grupos: (projectId: number, campaignId: string, desde: string, hasta: string) =>
    client.get(`/google-ads/campanas/${campaignId}/grupos?${qs(projectId, desde, hasta)}`).then(datos<Grupo[]>),
  asignarCampus: (projectId: number, campaignId: string, destino: number | null) =>
    client.patch(`/google-ads/campanas/${campaignId}/campus`, { project_id: projectId, destino }).then(datos<unknown>),
  sincronizar: (projectId: number) =>
    client.post('/google-ads/sincronizar', { project_id: projectId }).then(datos<{ ok: boolean; desde: string; hasta: string; campanas: number }>),
};
