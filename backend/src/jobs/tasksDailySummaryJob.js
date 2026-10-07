import { logger } from '../shared/utils/logger.js';
import { sendEmail } from '../shared/services/brevo.service.js';
import { vigilar } from './latido.js';
import { findDailyDigest } from '../modules/tasks/tasks.model.js';
import { armarCorreoDelDia, AVISO_TAREAS_DEL_DIA } from '../modules/tasks/tasks.emails.js';

/**
 * El correo de cada mañana del tablero de tareas (#210, fase 3): a cada persona,
 * lo que le vence hoy y lo que ya tiene vencido. Quien no tiene nada de eso no
 * recibe nada — un correo diario que dice «nada» enseña a no abrirlo.
 *
 * Como el resto de avisos diarios: se mira la hora en cada vuelta en vez de
 * programar una hora exacta, y la clave lleva el DIA, asi un reinicio a las
 * 08:05 ni se lo salta ni lo repite. Se apaga en «Mis preferencias»
 * («tareas_del_dia») o, para todo un entorno, con TAREAS_DIARIO_DISABLED=1.
 */

const HORA = parseInt(process.env.TAREAS_DIARIO_HORA || '8', 10);
const TICK_MS = parseInt(process.env.TAREAS_DIARIO_TICK_MS || String(30 * 60 * 1000), 10);

const hoy = () => new Date().toISOString().slice(0, 10);

export async function runTasksDailySummary({ ahora = new Date(), forzar = false } = {}) {
  if (!forzar && ahora.getHours() !== HORA) return { omitido: 'fuera de hora' };

  const gente = await findDailyDigest(AVISO_TAREAS_DEL_DIA);
  let mandados = 0;
  for (const persona of gente) {
    try {
      const c = armarCorreoDelDia({ persona, tareas: persona.tareas, hoy: ahora });
      const r = await sendEmail({
        to: [{ email: persona.email, name: persona.nombre }],
        subject: c.asunto,
        htmlContent: c.htmlContent,
        textContent: c.textContent,
        tags: ['tareas', 'tareas-del-dia'],
        clave: `${AVISO_TAREAS_DEL_DIA}-${persona.user_id}-${hoy()}`,
      });
      if (r?.sent) mandados++;
    } catch (err) {
      // Que falle el de una persona no deja sin aviso a las demas.
      logger.error({ err: err.message, userId: persona.user_id }, 'Fallo mandando el correo diario de tareas');
    }
  }
  if (gente.length) logger.info({ destinatarios: gente.length, mandados }, 'Correo diario de tareas');
  return { destinatarios: gente.length, mandados };
}

export function startTasksDailySummaryScheduler() {
  if (process.env.TAREAS_DIARIO_DISABLED === '1') {
    logger.info('Correo diario de tareas desactivado (TAREAS_DIARIO_DISABLED=1)');
    return;
  }
  vigilar('tareas_del_dia', 'Tareas: correo de cada mañana', () => runTasksDailySummary(), TICK_MS);
}
