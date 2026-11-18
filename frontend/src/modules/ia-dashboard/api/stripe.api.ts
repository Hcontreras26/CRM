// Stripe Monitor API client (CRM-108)
// Contrato definido en docs/03-api-endpoints.md > Stripe Monitor
// Backend pendiente (modulo `ia-monitor` por implementar). Mientras tanto, USE_MOCKS=true.

import client, { type ApiResponse } from '@/shared/api/client';
import { stripeMetricsMock } from '../mocks/stripe.mock';

const USE_MOCKS = false; // Backend listo (con fallback si falta STRIPE_API_KEY)

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export interface StripeEvolutionPoint {
  mes: string;
  mrr: number;
  activeSubs: number;
  newSubs: number;
  cancelledSubs: number;
  churnRate: number;
}

export interface StripeMetrics {
  mrr: number;
  activeSubs: number;
  newSubs: number;
  cancelledSubs: number;
  failedPayments: number;
  churnRate: number;
  evolution12Months: StripeEvolutionPoint[];
  /**
   * Por qué se fueron, de `cancellation_details` de Stripe.
   *
   * Es la única cifra de retención accionable: el churn no se puede
   * arreglar, «no lo uso suficiente» sí apunta a algún sitio.
   */
  porQueSeVan?: { total: number; motivos: { clave: string; etiqueta: string; bajas: number; pct: number }[] };
  /** Los escritos a mano, sin agregar: son de cada persona. */
  comentariosDeBaja?: { cuando: string | null; motivo: string | null; comentario: string | null }[];
  /**
   * Si este proyecto tiene clave de Stripe guardada.
   *
   * Separa las dos razones por las que no hay datos: «no esta conectado
   * todavia» y «esta conectado y no hay cobros». La pantalla dice cosas
   * distintas, y hasta ahora las juntaba en un «o las credenciales no estan
   * configuradas» que no le decia a nadie que hacer.
   */
  api_configured?: boolean;
  warning?: string | null;
}

export async function getStripeMetrics(projectId: string | number): Promise<ApiResponse<StripeMetrics>> {
  if (USE_MOCKS) {
    await delay(300);
    return { success: true, data: stripeMetricsMock(projectId) };
  }
  return client.get<StripeMetrics>(`/ia/metrics/${projectId}`);
}
