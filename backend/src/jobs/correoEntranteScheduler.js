import { logger } from '../shared/utils/logger.js';
import { leerBuzon, hayBuzonQueLeer } from '../shared/services/correo-entrante.service.js';
import { vigilar } from './latido.js';

/**
 * Leer el buzón cada media hora. Segunda mitad del #146.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ UN PASE Y NO TIEMPO REAL
 *
 * IMAP sabe avisar cuando llega algo (IDLE), pero eso obliga a mantener una
 * conexión abierta contra Hostinger para siempre y a reabrirla cada vez que se
 * caiga. Para lo que se usa esto —ver si un tutor ha contestado con su
 * factura— media hora sobra, y quien no quiera esperar tiene el botón «Traer
 * del buzón» en la pantalla.
 *
 * NO PASA NADA SI SE SALTA UN PASE. La clave de cada correo es su `Message-ID`,
 * así que el siguiente recoge lo que el anterior no llegó a leer. No hay un
 * «por dónde iba» que se pueda perder.
 *
 * Y si no hay buzón configurado, ni arranca: un CRM sin `IMAP_USER` funciona
 * igual que antes, solo que sin la pestaña de recibidos.
 */

const TICK_MS = parseInt(process.env.CORREO_ENTRANTE_TICK_MS || String(30 * 60 * 1000), 10);

async function traer() {
  const r = await leerBuzon();
  // Solo se anota cuando hay algo. Un «0 nuevos» cada media hora, para siempre,
  // es ruido que acaba tapando lo que sí importa en el registro.
  if (r.nuevos > 0) logger.info(r, 'Correo entrante: guardados');
  return r;
}

export function startCorreoEntranteScheduler() {
  if (process.env.CORREO_ENTRANTE_DISABLED === '1') {
    logger.info('Correo entrante desactivado (CORREO_ENTRANTE_DISABLED=1)');
    return;
  }
  if (!hayBuzonQueLeer()) {
    logger.info('Correo entrante: sin buzón configurado, no se lee nada');
    return;
  }
  // Un minuto después de arrancar, no en el arranque: leer el buzón tarda unos
  // segundos y no tiene por qué competir con las primeras peticiones.
  setTimeout(traer, 60 * 1000);
  vigilar('correo_entrante', 'Correo entrante', traer, TICK_MS);
  logger.info({ tickMs: TICK_MS }, 'Correo entrante iniciado');
}
