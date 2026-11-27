// Sincronización periódica de Search Console (CRM#36), como la de GA4.
//
// Por cada campus con credencial `gsc` (de producción): la primera vez, los
// últimos 180 días (90 y sus 90 anteriores, para comparar); después, los
// últimos 5 (Google sigue ajustando los últimos días) o el hueco si estuvo
// parada. Una vez al día, además, la indexación de las páginas de formación.
// Los lunes, al acabar, el aviso de la semana (CRM#1156): ver search-console.aviso.js.
// Un campus que falla no para a los demás: el error queda en
// `gsc_sincronizacion` y se ve en GET /api/search-console/estado.
//
// APAGADO DE SERIE: sin GSC_SYNC_ACTIVO=1 no arranca y `vuelta()` no llama a
// Google ni toca la base.

import { logger } from '../shared/utils/logger.js';
import { proyectosConGSC, ponerAlDia, syncActivo } from '../modules/search-console/search-console.service.js';
import { revisarCaidas, enMadrid } from '../modules/search-console/search-console.aviso.js';
import { vigilar } from './latido.js';

const TICK_MS = parseInt(process.env.GSC_SYNC_TICK_MS || String(6 * 60 * 60 * 1000), 10); // 6h
let enMarcha = false;

export async function vuelta({ ahora = new Date() } = {}) {
  if (!syncActivo()) return { apagado: true };
  if (enMarcha) return { enMarcha: true };
  enMarcha = true;
  const resumen = { campus: 0, ok: 0, fallidos: 0 };
  try {
    for (const p of await proyectosConGSC()) {
      const r = await ponerAlDia(p.project_id, { ahora });
      resumen.campus += 1;
      if (r.ok) resumen.ok += 1; else resumen.fallidos += 1;
    }
    // Los lunes, después de traer los datos: el aviso de la semana (#1156).
    // Sale una vez por campus y lunes aunque haya varias vueltas ese día.
    if (enMadrid(ahora).diaSemana === 1) {
      resumen.aviso_semanal = await revisarCaidas({ ahora });
    }
    logger.info(resumen, 'Search Console: vuelta hecha');
    return resumen;
  } finally {
    enMarcha = false;
  }
}

export function startSearchConsoleSyncScheduler() {
  if (!syncActivo()) {
    logger.info('Sincronización de Search Console apagada (GSC_SYNC_ACTIVO no está a 1)');
    return;
  }
  vigilar('search_console', 'Sincronización de Search Console', () => vuelta(), TICK_MS,
    { alArrancarMs: 3 * 60 * 1000 });
  logger.info({ tickMs: TICK_MS }, 'Sincronización de Search Console iniciada');
}
