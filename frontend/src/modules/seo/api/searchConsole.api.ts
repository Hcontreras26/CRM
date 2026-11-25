import client from '@/shared/api/client';

/** Search Console (CRM#36): lo que pasa en Google antes de la visita. */

export interface EstadoCampus {
  project_id: number;
  nombre: string;
  site_url: string | null;
  last_synced_at: string | null;
  last_status: 'ok' | 'error' | null;
  last_error: string | null;
  backfill_done: boolean | null;
  indexacion_at: string | null;
}
export interface Estado { activo: boolean; campus: EstadoCampus[] }

export interface Totales {
  clics: number;
  impresiones: number;
  /** En %; null sin impresiones. */
  ctr: number | null;
  posicion: number | null;
}
export interface DiaGsc {
  fecha: string;
  /** null: Search Console no tiene ese día (no es cero). */
  clics: number | null;
  impresiones: number | null;
  ctr: number | null;
  posicion: number | null;
}
export interface Resumen {
  periodo: { desde: string; hasta: string };
  anterior: Totales & { desde: string; hasta: string; dias: number };
  total: Totales & { dias: number };
  ultimo_dia: string | null;
  dias: DiaGsc[];
}
export interface ConsultaGsc extends Totales { consulta: string; clics_antes: number | null }
export interface PaginaGsc extends Totales {
  host: string;
  ruta: string;
  clics_antes: number | null;
  indexacion: { veredicto: string; cobertura: string | null } | null;
  oportunidad: boolean;
}
export interface Paginas { ctr_medio: number | null; filas: PaginaGsc[] }
export interface PaginaIndexacion {
  url: string;
  product_id: number | null;
  producto: string | null;
  veredicto: string;
  cobertura: string | null;
  ultimo_rastreo: string | null;
  error: string | null;
  revisado_at: string;
}
export interface Indexacion { indexadas: number; no_indexadas: number; errores: number; paginas: PaginaIndexacion[] }

/** La última semana contra la anterior (#1156). Sin datos: solo `con_datos: false`. */
export interface Semana {
  con_datos: boolean;
  actual?: Totales & { desde: string; hasta: string; dias: number };
  anterior?: Totales & { desde: string; hasta: string; dias: number };
  /** Las dos con sus 7 días y datos de esta semana: si no, no se compara. */
  completa?: boolean;
  reciente?: boolean;
  /** Clics e impresiones en %; posición en puntos (positivo es peor). */
  variacion?: { clics: number | null; impresiones: number | null; posicion: number | null };
  /** Lo que ha caído más del umbral: lo que avisa el lunes. */
  caidas?: Array<'clics' | 'impresiones'>;
}

type Cuerpo<T> = { success?: boolean; data?: T };
const datos = <T,>(r: unknown) => (r as Cuerpo<T>).data as T;
const qs = (projectId: number, desde: string, hasta: string) =>
  new URLSearchParams({ projectId: String(projectId), desde, hasta }).toString();

export const searchConsoleApi = {
  estado: () => client.get('/search-console/estado').then(datos<Estado>),
  resumen: (projectId: number, desde: string, hasta: string) =>
    client.get(`/search-console/resumen?${qs(projectId, desde, hasta)}`).then(datos<Resumen>),
  consultas: (projectId: number, desde: string, hasta: string) =>
    client.get(`/search-console/consultas?${qs(projectId, desde, hasta)}&limite=200`).then(datos<ConsultaGsc[]>),
  paginas: (projectId: number, desde: string, hasta: string) =>
    client.get(`/search-console/paginas?${qs(projectId, desde, hasta)}&limite=500`).then(datos<Paginas>),
  indexacion: (projectId: number) =>
    client.get(`/search-console/indexacion?projectId=${projectId}`).then(datos<Indexacion>),
  semana: (projectId: number) =>
    client.get(`/search-console/semana?projectId=${projectId}`).then(datos<Semana>),
  sincronizar: (projectId: number) =>
    client.post('/search-console/sincronizar', { project_id: projectId }).then(datos<{ ok: boolean; dias: number }>),
};
