// Sincronización periódica de Google Ads (CRM#54), como la de Meta: cada 3 horas.
//
// Por cada campus con credencial `google_ads` (de producción): la primera vez,
// los últimos 90 días; después, los últimos 7 (Google sigue atribuyendo
// conversiones) o el hueco si estuvo parada. Un campus que falla no para a los
// demás: el error queda en `google_ads_cuentas` y se ve en GET /api/google-ads/estado.
//
// APAGADO DE SERIE: sin GOOGLE_ADS_SYNC_ACTIVO=1 no arranca y `vuelta()` no
// llama a Google ni toca la base.

import { logger } from '../shared/utils/logger.js';
import { proyectosConGoogleAds, ponerAlDia, syncActivo } from '../modules/google-ads/google-ads.service.js';
import { vigilar } from './latido.js';

const TICK_MS = parseInt(process.env.GOOGLE_ADS_SYNC_TICK_MS || String(3 * 60 * 60 * 1000), 10); // 3h
let enMarcha = false;

export async function vuelta({ ahora = new Date() } = {}) {
  if (!syncActivo()) return { apagado: true };
  if (enMarcha) return { enMarcha: true };
  enMarcha = true;
  const resumen = { campus: 0, ok: 0, fallidos: 0 };
  try {
    for (const p of await proyectosConGoogleAds()) {
      const r = await ponerAlDia(p.project_id, { ahora });
      resumen.campus += 1;
      if (r.ok) resumen.ok += 1; else resumen.fallidos += 1;
    }
    logger.info(resumen, 'Google Ads: vuelta hecha');
    return resumen;
  } finally {
    enMarcha = false;
  }
}

export function startGoogleAdsSyncScheduler() {
  if (!syncActivo()) {
    logger.info('Sincronización de Google Ads apagada (GOOGLE_ADS_SYNC_ACTIVO no está a 1)');
    return;
  }
  vigilar('google_ads_sync', 'Sincronización de Google Ads', () => vuelta(), TICK_MS,
    { alArrancarMs: 3 * 60 * 1000 });
  logger.info({ tickMs: TICK_MS }, 'Sincronización de Google Ads iniciada');
}
