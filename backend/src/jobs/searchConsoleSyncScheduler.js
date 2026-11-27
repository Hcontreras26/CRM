// Sincronización periódica de Search Console (CRM#36), como la de GA4.
//
// Por cada campus con credencial `gsc` (de producción) Y con la sincronización
// encendida: la primera vez, los últimos 180 días (90 y sus 90 anteriores, para
// comparar); después, los últimos 5 (Google sigue ajustando los últimos días) o
// el hueco si estuvo parada. Una vez al día, además, la indexación de las
// páginas de formación. Los lunes, al acabar, el aviso de la semana (CRM#1156),
// con los umbrales de cada campus: ver search-console.aviso.js.
// Un campus que falla no para a los demás: el error queda en
// `gsc_sincronizacion` y se ve en la tarjeta del campus.
//
// QUÉ CAMPUS (CRM#1210). El interruptor es de cada campus, en Integraciones ›
// Search Console («Sincronizar este campus»). Si nadie lo ha tocado, vale
// GSC_SYNC_ACTIVO del servidor como reserva; sin ella, apagado. Por eso la
// tarea arranca siempre: sin ningún campus encendido, la vuelta no llama a
// Google y el aviso no tiene nada que mirar.

import { logger } from '../shared/utils/logger.js';
import { proyectosConGSC, ponerAlDia, interruptorDe } from '../modules/search-console/search-console.service.js';
import { revisarCaidas, enMadrid } from '../modules/search-console/search-console.aviso.js';
import { vigilar } from './latido.js';
import { reloj } from './relojDeVueltas.js';

const TICK_MS = parseInt(process.env.GSC_SYNC_TICK_MS || String(6 * 60 * 60 * 1000), 10); // 6h
const AL_ARRANCAR_MS = 3 * 60 * 1000;
const cuando = reloj(TICK_MS, AL_ARRANCAR_MS);
let enMarcha = false;

/** Cuándo será la próxima vuelta (null si la tarea no está en marcha en este proceso). */
export const proximaVuelta = (ahora) => cuando.proxima(ahora);

export async function vuelta({ ahora = new Date() } = {}) {
  if (enMarcha) return { enMarcha: true };
  enMarcha = true;
  const resumen = { campus: 0, ok: 0, fallidos: 0, apagados: 0 };
  try {
    const encendidos = [];
    for (const p of await proyectosConGSC()) {
      if (interruptorDe(p).activo) encendidos.push(p); else resumen.apagados += 1;
    }
    for (const p of encendidos) {
      const r = await ponerAlDia(p.project_id, { ahora });
      resumen.campus += 1;
      if (r.ok) resumen.ok += 1; else resumen.fallidos += 1;
    }
    // Los lunes, después de traer los datos: el aviso de la semana (#1156).
    // Sale una vez por campus y lunes aunque haya varias vueltas ese día.
    // Solo de los campus encendidos: uno apagado no trae datos nuevos.
    if (encendidos.length && enMadrid(ahora).diaSemana === 1) {
      resumen.aviso_semanal = await revisarCaidas({ ahora, campus: encendidos });
    }
    if (resumen.campus) logger.info(resumen, 'Search Console: vuelta hecha');
    return resumen;
  } finally {
    enMarcha = false;
  }
}

export function startSearchConsoleSyncScheduler() {
  vigilar('search_console', 'Sincronización de Search Console', () => vuelta(), TICK_MS,
    { alArrancarMs: AL_ARRANCAR_MS });
  cuando.arranca();
  logger.info({ tickMs: TICK_MS }, 'Sincronización de Search Console programada (por campus)');
}
