import { logger } from '../shared/utils/logger.js';
import { procesarPendientes } from '../modules/webhooks-salientes/webhooks-salientes.service.js';
import { vigilar } from './latido.js';

/**
 * Los reintentos del webhook de transferencias (Diego, 15/10; migración 206).
 *
 * El primer envío sale en el momento, justo después de apuntar el cobro. Si
 * falla, el envío se queda en la base como «pendiente» con la hora de su
 * próximo intento (1, 5 y 15 minutos), y esta vuelta lo recoge. Como la cola
 * está en la base y no en memoria, un reinicio no pierde ninguno.
 *
 * Cada dos minutos: es el intervalo de la tarea más rápida del CRM (latido.js),
 * y para esperas de 1, 5 y 15 minutos da de sobra.
 *
 * Se apaga con WEBHOOKS_SALIENTES_DISABLED=1 (el primer envío sigue saliendo;
 * solo dejan de hacerse los reintentos).
 */
const TICK_MS = parseInt(process.env.WEBHOOKS_SALIENTES_TICK_MS || String(2 * 60 * 1000), 10);

async function vuelta() {
  try {
    const r = await procesarPendientes();
    if (r.intentados || r.rescatados) logger.info(r, 'Webhook de transferencias: reintentos');
    return r;
  } catch (err) {
    // Sin la migración 206 la tabla no existe: se avisa y se espera a la próxima.
    logger.warn({ err: err.message }, 'Webhook de transferencias: no se pudieron revisar los reintentos');
    return null;
  }
}

export function startWebhooksSalientesScheduler() {
  if (process.env.WEBHOOKS_SALIENTES_DISABLED === '1') {
    logger.info('Reintentos del webhook de transferencias desactivados (WEBHOOKS_SALIENTES_DISABLED=1)');
    return;
  }
  vigilar('webhooks_salientes', 'Webhook de transferencias: reintentos', vuelta, TICK_MS);
  logger.info({ tickMs: TICK_MS }, 'Reintentos del webhook de transferencias iniciados');
}
