import { logger } from '../shared/utils/logger.js';
import { devolverLosVencidos } from '../shared/services/estado-prospecto.service.js';
import { vigilar } from './latido.js';

/**
 * «Se le paso el dia y nadie le escribio»: de vuelta a «por contactar».
 *
 * La cola del dia ya sabia que estas personas tenian un paso vencido, pero su
 * etiqueta seguia diciendo «Contactado» de cuando se hablo con ellas. Quien
 * repartia la manana por el filtro de estado no las veia, y ahi se quedaban:
 * en la pantalla de Diego habia once atrasados, uno de 28 dias.
 *
 * Esto NO borra nada de lo andado. La checklist de la ficha sigue enseñando los
 * pasos dados, asi que se distingue a simple vista al que no se ha tocado del
 * que va a medias y se ha quedado parado. Y no se toca a quien compro, dijo que
 * no o espera a la convocatoria siguiente: eso lo decidio una persona.
 *
 * Una vuelta al dia y de madrugada. El vencimiento se cuenta por dias, no por
 * horas, asi que mirarlo mas veces solo repetiria el mismo resultado; y hacerlo
 * a las tres de la manana evita que a una gestora le cambie el estado de la
 * ficha que tiene abierta.
 */

const TICK_MS = parseInt(process.env.PASO_VENCIDO_TICK_MS || String(60 * 60 * 1000), 10);
const HORA = parseInt(process.env.PASO_VENCIDO_HORA || '3', 10);

// De que dia se dio ya la vuelta buena. Con un tick de una hora, sin esto se
// repetiria doce veces la misma madrugada.
let ultimoDia = null;

async function vuelta() {
  const ahora = new Date();
  const dia = ahora.toISOString().slice(0, 10);
  if (ahora.getHours() !== HORA || ultimoDia === dia) return null;

  try {
    const cuantos = await devolverLosVencidos();
    ultimoDia = dia;
    return { movidos: cuantos };
  } catch (err) {
    logger.error({ err: err.message }, 'Fallo devolviendo a «por contactar» los pasos vencidos');
    return null;
  }
}

export function startPasoVencidoScheduler() {
  if (process.env.PASO_VENCIDO_DISABLED === '1') {
    logger.info('Vuelta a «por contactar» por paso vencido desactivada (PASO_VENCIDO_DISABLED=1)');
    return;
  }
  vigilar('paso_vencido', 'Pasos vencidos: de vuelta a «por contactar»', vuelta, TICK_MS);
  logger.info({ hora: HORA, tickMs: TICK_MS }, 'Vuelta a «por contactar» por paso vencido iniciada');
}
