// Sincronización periódica de Google Analytics 4 (CRM#55), como la de Meta.
//
// Por cada campus con credencial `google_analytics` (de producción): la primera
// vez, los últimos 90 días; después, los últimos 3 (GA4 sigue ajustando los dos
// últimos) o el hueco si estuvo parada. Un campus que falla no para a los demás:
// el error queda en `ga4_sincronizacion` y se ve en GET /api/google-analytics/estado.
//
// APAGADO DE SERIE: sin GA4_SYNC_ACTIVO=1 no arranca y `vuelta()` no llama a
// Google ni toca la base.

import { logger } from '../shared/utils/logger.js';
import { proyectosConGA4, ponerAlDia, syncActivo } from '../modules/google-analytics/google-analytics.service.js';
import { vigilar } from './latido.js';

const TICK_MS = parseInt(process.env.GA4_SYNC_TICK_MS || String(6 * 60 * 60 * 1000), 10); // 6h
let enMarcha = false;

export async function vuelta({ ahora = new Date() } = {}) {
  if (!syncActivo()) return { apagado: true };
  if (enMarcha) return { enMarcha: true };
  enMarcha = true;
  const resumen = { campus: 0, ok: 0, fallidos: 0 };
  try {
    for (const p of await proyectosConGA4()) {
      const r = await ponerAlDia(p.project_id, { ahora });
      resumen.campus += 1;
      if (r.ok) resumen.ok += 1; else resumen.fallidos += 1;
    }
    logger.info(resumen, 'GA4: vuelta hecha');
    return resumen;
  } finally {
    enMarcha = false;
  }
}

export function startGoogleAnalyticsSyncScheduler() {
  if (!syncActivo()) {
    logger.info('Sincronización de Google Analytics apagada (GA4_SYNC_ACTIVO no está a 1)');
    return;
  }
  vigilar('google_analytics', 'Sincronización de Google Analytics', () => vuelta(), TICK_MS,
    { alArrancarMs: 2 * 60 * 1000 });
  logger.info({ tickMs: TICK_MS }, 'Sincronización de Google Analytics iniciada');
}
