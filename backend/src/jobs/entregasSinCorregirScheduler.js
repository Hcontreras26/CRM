import { logger } from '../shared/utils/logger.js';
import { avisarEntregasSinCorregir } from '../modules/tutores/tutor.entregasSinCorregir.js';
import { vigilar } from './latido.js';

/**
 * El aviso a la tutora de las entregas que llevan más de 48 h sin corregir (#681).
 *
 * Cada dos horas: el plazo es de 48 h y no hace falta más precisión, y cada vuelta lee
 * de Moodle los cursos de todas las tutoras. Cada entrega se avisa UNA vez (la tabla
 * `entregas_sin_corregir_avisos` lo recuerda): repetir la vuelta o reiniciar no repite.
 *
 * Solo arranca con el plugin del CRM en Moodle aprobado (lo mira app.js con
 * `pluginMoodleActivo`). Se apaga con ENTREGAS_SIN_CORREGIR_DISABLED=1.
 */

const TICK_MS = parseInt(process.env.ENTREGAS_SIN_CORREGIR_TICK_MS || String(2 * 60 * 60 * 1000), 10);

export function startEntregasSinCorregirScheduler() {
  if (process.env.ENTREGAS_SIN_CORREGIR_DISABLED === '1') {
    logger.info('Aviso de entregas sin corregir desactivado (ENTREGAS_SIN_CORREGIR_DISABLED=1)');
    return;
  }
  vigilar('entregas_sin_corregir', 'Aviso a las tutoras de entregas sin corregir de más de 48 h',
    () => avisarEntregasSinCorregir(), TICK_MS, { alArrancarMs: 5 * 60 * 1000 });
}
