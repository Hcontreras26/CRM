import { logger } from '../shared/utils/logger.js';
import { vigilar } from './latido.js';
import { findDailyDigest } from '../modules/tasks/tasks.model.js';
import {
  armarCorreoDelDia,
  AVISO_TAREAS_DEL_DIA,
  correosActivos,
} from '../modules/tasks/tasks.emails.js';
import { sendEmail } from '../shared/services/brevo.service.js';

/**
 * El correo de cada mañana del tablero de tareas (#210, fase 3): a cada persona,
 * lo que le vence hoy y lo que ya tiene vencido. Quien no tiene nada de eso no
 * recibe nada — un correo diario que dice «nada» enseña a no abrirlo.
 *
 * Utiliza APP_TIMEZONE (por defecto Europe/Madrid) para comprobar que sean las 8
 * de la mañana en hora de la oficina y no en UTC del servidor.
 */

const HORA = parseInt(process.env.TAREAS_DIARIO_HORA || '8', 10);
const TICK_MS = parseInt(process.env.TAREAS_DIARIO_TICK_MS || String(30 * 60 * 1000), 10);

function horaLocal(d = new Date()) {
  const tz = process.env.APP_TIMEZONE || 'Europe/Madrid';
  return Number(new Intl.DateTimeFormat('es-ES', { hour: 'numeric', hour12: false, timeZone: tz }).format(d));
}

function hoyLocal(d = new Date()) {
  const tz = process.env.APP_TIMEZONE || 'Europe/Madrid';
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export async function runTasksDailySummary({ ahora = new Date(), forzar = false } = {}) {
  if (!forzar && horaLocal(ahora) !== HORA) return { omitido: 'fuera de hora' };

  const gente = await findDailyDigest(AVISO_TAREAS_DEL_DIA);
  let mandados = 0;
  for (const persona of gente) {
    try {
      const c = armarCorreoDelDia({ persona, tareas: persona.tareas, hoy: ahora });
      const clave = `${AVISO_TAREAS_DEL_DIA}-${persona.user_id}-${hoyLocal(ahora)}`;

      if (!correosActivos()) {
        logger.info({ to: persona.email, clave }, 'Resumen diario de tareas simulado (TAREAS_CORREOS_ACTIVOS=false)');
        mandados++;
        continue;
      }

      const r = await sendEmail({
        to: [{ email: persona.email, name: persona.nombre }],
        subject: c.asunto,
        htmlContent: c.htmlContent,
        textContent: c.textContent,
        tags: ['tareas', 'tareas-del-dia'],
        clave,
      });
      if (r?.sent) mandados++;
    } catch (err) {
      // Que falle el de una persona no deja sin aviso a las demas.
      logger.error({ err: err.message, userId: persona.user_id }, 'Fallo mandando el correo diario de tareas');
    }
  }
  if (gente.length) logger.info({ destinatarios: gente.length, mandados }, 'Correo diario de tareas procesado');
  return { destinatarios: gente.length, mandados };
}

export function startTasksDailySummaryScheduler() {
  if (process.env.TAREAS_DIARIO_DISABLED === '1') {
    logger.info('Correo diario de tareas desactivado (TAREAS_DIARIO_DISABLED=1)');
    return;
  }
  vigilar('tareas_del_dia', 'Tareas: correo de cada mañana', () => runTasksDailySummary(), TICK_MS);
}
