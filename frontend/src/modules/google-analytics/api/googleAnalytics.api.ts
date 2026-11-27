import client from '@/shared/api/client';

/** Google Analytics 4 (CRM#55): lo que pasa antes del lead. */

export interface EstadoCampus {
  project_id: number;
  nombre: string;
  property_id: string | null;
  last_synced_at: string | null;
  last_status: 'ok' | 'error' | null;
  last_error: string | null;
  backfill_done: boolean | null;
  /** Si este campus se sincroniza solo (CRM#1210): su interruptor de Integraciones. */
  sync_activa?: boolean;
}
export interface Estado { activo: boolean; campus: EstadoCampus[] }

export interface DiaEmbudo {
  fecha: string;
  /** null: GA4 no tiene dato de ese día (no es cero). */
  sesiones: number | null;
  usuarios: number | null;
  eventos_clave: number | null;
  leads: number;
  ventas: number;
}
export interface CanalGA { canal: string; sesiones: number; usuarios: number; eventos_clave: number }
export interface Embudo {
  dias: DiaEmbudo[];
  canales: CanalGA[];
  total: { sesiones: number | null; leads: number; ventas: number; lead_por_sesion: number | null; venta_por_lead: number | null };
}
export interface PaginaGA {
  pagina: string;
  sesiones: number;
  usuarios: number;
  eventos_clave: number;
  leads: number;
  ventas: number;
  lead_por_sesion: number | null;
}

type Cuerpo<T> = { success?: boolean; data?: T };
const datos = <T,>(r: unknown) => (r as Cuerpo<T>).data as T;

export const googleAnalyticsApi = {
  estado: () => client.get('/google-analytics/estado').then(datos<Estado>),
  embudo: (projectId: number, desde: string, hasta: string) =>
    client.get(`/google-analytics/embudo?${new URLSearchParams({ projectId: String(projectId), desde, hasta })}`).then(datos<Embudo>),
  paginas: (projectId: number, desde: string, hasta: string) =>
    client.get(`/google-analytics/paginas?${new URLSearchParams({ projectId: String(projectId), desde, hasta })}`).then(datos<PaginaGA[]>),
  sincronizar: (projectId: number) =>
    client.post('/google-analytics/sincronizar', { project_id: projectId }).then(datos<{ ok: boolean; dias: number }>),
};
