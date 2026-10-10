import { logger } from '../shared/utils/logger.js';
import { vigilar } from './latido.js';
import { prepararYMandar, recordar } from '../modules/facturas-colaborador/facturas.service.js';

/**
 * Facturas de colaboradores (#202): el correo del mes y el recordatorio.
 *
 *   - El último día del mes, a las 10:00 de Madrid: se prepara el mes y a cada
 *     colaborador activo le sale un enlace por empresa.
 *   - El día 5, a la misma hora: recordatorio a quien no ha subido la del mes
 *     anterior.
 *
 * Como los demás avisos: se mira la hora en cada vuelta en vez de programar una
 * hora exacta. Repetir una vuelta no duplica nada: preparar el mes no crea filas
 * que ya existen, y el recordatorio no se repite a quien ya lo tiene.
 *
 * Los correos salen solo con FACTURAS_COLABORADOR_CORREOS_ACTIVOS encendido;
 * apagado, el mes se prepara igual y administración lo ve «sin enviar».
 */

const HORA = 10;
const TICK_MS = 30 * 60 * 1000;

/** Año, mes, día y hora en Madrid (el servidor está en UTC). */
export function enMadrid(ahora = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(ahora).map((p) => [p.type, p.value]));
  return { anio: Number(partes.year), mes: Number(partes.month), dia: Number(partes.day), hora: Number(partes.hour) };
}

const primerDia = (anio, mes) => `${anio}-${String(mes).padStart(2, '0')}-01`;
const diasDelMes = (anio, mes) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();

export async function runFacturasColaborador({ ahora = new Date() } = {}) {
  const { anio, mes, dia, hora } = enMadrid(ahora);
  // Desde las 10:00 y no solo en la vuelta de las 10: si el proceso se reinicia
  // a las 10:30, la siguiente vuelta lo hace igual. Repetirlo no duplica nada.
  if (hora < HORA) return { omitido: 'fuera de hora' };

  if (dia === diasDelMes(anio, mes)) {
    const r = await prepararYMandar(primerDia(anio, mes));
    logger.info(r, 'Facturas de colaboradores: mes preparado');
    return { tarea: 'mes', ...r };
  }
  // Del 1 al 4, el mes anterior otra vez (revisión del 10/10): si el último día la API
  // estaba caída, o la migración se pasó tarde, ese mes no se preparaba nunca. Repetirlo
  // no duplica nada (índice único y ON CONFLICT DO NOTHING) y manda lo que no salió.
  if (dia >= 1 && dia <= 4) {
    const anterior = mes === 1 ? primerDia(anio - 1, 12) : primerDia(anio, mes - 1);
    const r = await prepararYMandar(anterior);
    if (r.preparados || r.mandados) logger.info(r, 'Facturas de colaboradores: mes anterior recuperado');
    return { tarea: 'recuperar', ...r };
  }
  if (dia === 5) {
    const anterior = mes === 1 ? primerDia(anio - 1, 12) : primerDia(anio, mes - 1);
    const r = await recordar(anterior);
    logger.info(r, 'Facturas de colaboradores: recordatorio');
    return { tarea: 'recordatorio', ...r };
  }
  return { omitido: 'no toca hoy' };
}

export function startFacturasColaboradorScheduler() {
  vigilar('facturas_colaborador', 'Facturas de colaboradores: correo del mes y recordatorio',
    () => runFacturasColaborador(), TICK_MS);
}
