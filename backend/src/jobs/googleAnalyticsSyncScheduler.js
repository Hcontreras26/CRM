// Sincronización periódica de Google Analytics 4 (CRM#55), como la de Meta.
//
// Por cada campus con credencial `google_analytics` (de producción) Y con la
// sincronización encendida: la primera vez, los últimos 90 días; después, los
// últimos 3 (GA4 sigue ajustando los dos últimos) o el hueco si estuvo parada.
// Un campus que falla no para a los demás: el error queda en
// `ga4_sincronizacion` y se ve en la tarjeta del campus.
//
// QUÉ CAMPUS (CRM#1210). El interruptor es de cada campus, en Integraciones ›
// Google Analytics 4 («Sincronizar este campus»). Si nadie lo ha tocado, vale
// GA4_SYNC_ACTIVO del servidor como reserva; sin ella, apagado. Por eso la
// tarea arranca siempre: sin ningún campus encendido, la vuelta no llama a
// Google ni escribe nada.

import { logger } from '../shared/utils/logger.js';
import { proyectosConGA4, ponerAlDia, interruptorDe } from '../modules/google-analytics/google-analytics.service.js';
import { vigilar } from './latido.js';
import { reloj } from './relojDeVueltas.js';

const TICK_MS = parseInt(process.env.GA4_SYNC_TICK_MS || String(6 * 60 * 60 * 1000), 10); // 6h
const AL_ARRANCAR_MS = 2 * 60 * 1000;
const cuando = reloj(TICK_MS, AL_ARRANCAR_MS);
let enMarcha = false;

/** Cuándo será la próxima vuelta (null si la tarea no está en marcha en este proceso). */
export const proximaVuelta = (ahora) => cuando.proxima(ahora);

export async function vuelta({ ahora = new Date() } = {}) {
  if (enMarcha) return { enMarcha: true };
  enMarcha = true;
  const resumen = { campus: 0, ok: 0, fallidos: 0, apagados: 0 };
  try {
    for (const p of await proyectosConGA4()) {
      if (!interruptorDe(p).activo) { resumen.apagados += 1; continue; }
      const r = await ponerAlDia(p.project_id, { ahora });
      resumen.campus += 1;
      if (r.ok) resumen.ok += 1; else resumen.fallidos += 1;
    }
    if (resumen.campus) logger.info(resumen, 'GA4: vuelta hecha');
    return resumen;
  } finally {
    enMarcha = false;
  }
}

export function startGoogleAnalyticsSyncScheduler() {
  vigilar('google_analytics', 'Sincronización de Google Analytics', () => vuelta(), TICK_MS,
    { alArrancarMs: AL_ARRANCAR_MS });
  cuando.arranca();
  logger.info({ tickMs: TICK_MS }, 'Sincronización de Google Analytics programada (por campus)');
}
