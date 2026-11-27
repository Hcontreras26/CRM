import { query } from '../../shared/config/db.js';
import { logger } from '../../shared/utils/logger.js';
import { notifyUsers } from '../notifications/notifications.service.js';
import { explicarPermisos } from '../permissions/permissions.service.js';
import { proyectosConGSC, totales } from './search-console.service.js';

/**
 * El aviso de la semana de Search Console (CRM#1156, sigue de #36).
 *
 * Cada lunes, por campus: la última semana contra la anterior (clics,
 * impresiones y posición media). Si los clics o las impresiones caen más del
 * umbral, aviso en la campana a quien puede verlo en ese campus
 * (`search_console.view`). La misma cuenta la
 * enseña la pantalla «Tráfico orgánico» en una línea arriba.
 *
 * QUÉ SEMANA. Search Console va 2–3 días por detrás: el lunes todavía no tiene
 * el domingo. Así que «la semana» son los 7 días que acaban en el último día
 * que Search Console ya tiene, y «la anterior», los 7 de antes. Es lo mismo que
 * hace la pantalla con «7 días».
 *
 * CUÁNDO NO SE AVISA, aunque baje:
 *   · si alguna de las dos semanas no tiene sus 7 días (un hueco no es un cero:
 *     comparar 5 días con 7 da una «caída» que no existe);
 *   · si el último día con datos es de hace más de una semana (la sincronización
 *     está parada: eso se ve en el estado, no es una caída de la web);
 *   · si la semana anterior no llega al mínimo de volumen (de 5 clics a 3 es
 *     «−40 %» y no es nada).
 *
 * UNA VEZ POR CAMPUS Y LUNES, sin tabla nueva: «ya avisado» es que ya hay un
 * aviso `gsc_caida` con ese `project_id` y ese `lunes` en `metadata`, como el
 * del tope de gasto de IA. El lunes, y no la semana comparada, porque Google
 * añade días a lo largo del lunes y la semana se movería entre una vuelta y la
 * siguiente.
 *
 * Solo cifras del sitio entero: ni búsquedas ni personas.
 */

export const TIPO_AVISO = 'gsc_caida';
const DIAS_SEMANA = 7;

const entero = (v, porDefecto) => {
  const n = Number.parseInt(String(v ?? '').trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : porDefecto;
};

/** Los de serie, si ni la pantalla ni el `.env` dicen nada. */
export const UMBRALES_DE_SERIE = Object.freeze({ clics: 30, impresiones: 30, minClics: 20, minImpresiones: 200 });
const VARIABLE = {
  clics: 'GSC_AVISO_CAIDA_CLICS',
  impresiones: 'GSC_AVISO_CAIDA_IMPRESIONES',
  minClics: 'GSC_AVISO_MIN_CLICS',
  minImpresiones: 'GSC_AVISO_MIN_IMPRESIONES',
};
/** Dónde guarda cada uno la tarjeta del campus (`gsc_sincronizacion`, migración 342). */
export const COLUMNA_UMBRAL = Object.freeze({
  clics: 'aviso_caida_clics',
  impresiones: 'aviso_caida_impresiones',
  minClics: 'aviso_min_clics',
  minImpresiones: 'aviso_min_impresiones',
});

/**
 * Los umbrales de un campus. Una caída de más del % avisa; 0 apaga esa métrica.
 * Los mínimos son de la semana ANTERIOR.
 *
 * De dónde sale cada uno (CRM#1210), por este orden: lo guardado en la tarjeta
 * del campus (`fila`, columnas de la 342); si no, el `.env` como reserva; si
 * no, el de serie. `origen` dice cuál, para que la pantalla lo cuente.
 */
export function umbralesDe(fila, env = process.env) {
  const out = {};
  const origen = {};
  for (const k of Object.keys(UMBRALES_DE_SERIE)) {
    const guardado = fila?.[COLUMNA_UMBRAL[k]];
    const delServidor = entero(env[VARIABLE[k]], null);
    if (guardado != null && Number.isFinite(Number(guardado))) { out[k] = Number(guardado); origen[k] = 'pantalla'; }
    else if (delServidor != null) { out[k] = delServidor; origen[k] = 'servidor'; }
    else { out[k] = UMBRALES_DE_SERIE[k]; origen[k] = 'serie'; }
  }
  return { ...out, origen };
}

/** Los del `.env` (o los de serie), sin mirar ningún campus. */
export function umbrales(env = process.env) {
  const { origen: _o, ...u } = umbralesDe(null, env);
  return u;
}

/** Los umbrales que valen ahora para un campus (lee su fila de `gsc_sincronizacion`). */
export async function umbralesDelCampus(projectId, env = process.env) {
  const { rows } = await query(
    `SELECT ${Object.values(COLUMNA_UMBRAL).join(', ')} FROM gsc_sincronizacion WHERE project_id = $1`,
    [projectId]
  );
  return umbralesDe(rows[0] || null, env);
}

const dia = (d) => d.toISOString().slice(0, 10);
const menos = (fecha, n) => dia(new Date(Date.parse(`${fecha}T00:00:00Z`) - n * 86400000));

/** Las dos semanas que se comparan, a partir del último día con datos. */
export function semanas(ultimoDia) {
  const desde = menos(ultimoDia, DIAS_SEMANA - 1);
  return {
    actual: { desde, hasta: ultimoDia },
    anterior: { desde: menos(desde, DIAS_SEMANA), hasta: menos(desde, 1) },
  };
}

/** La variación en %, con un decimal; null si antes no había nada. */
export const variacion = (ahora, antes) => (antes > 0 ? Math.round(((ahora - antes) / antes) * 1000) / 10 : null);

/** La fecha (AAAA-MM-DD) y el día de la semana (1 = lunes) en Madrid: el servidor puede ir en UTC. */
export function enMadrid(fecha) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(fecha).map((x) => [x.type, x.value]));
  const dias = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  return { diaSemana: dias[p.weekday], dia: `${p.year}-${p.month}-${p.day}` };
}

/**
 * La semana de un campus contra la anterior. `completa` dice si se puede
 * comparar (las dos con sus 7 días y datos recientes).
 */
export async function semanaDe(projectId, { ahora = new Date() } = {}) {
  const { rows: [u] } = await query(
    `SELECT to_char(MAX(fecha), 'YYYY-MM-DD') AS ultimo FROM gsc_diario WHERE project_id = $1`,
    [projectId]
  );
  if (!u?.ultimo) return { con_datos: false };
  const s = semanas(u.ultimo);
  const [actual, anterior] = await Promise.all([
    totales(projectId, s.actual.desde, s.actual.hasta),
    totales(projectId, s.anterior.desde, s.anterior.hasta),
  ]);
  const reciente = u.ultimo >= menos(dia(ahora), DIAS_SEMANA);
  return {
    con_datos: true,
    actual: { ...s.actual, ...actual },
    anterior: { ...s.anterior, ...anterior },
    completa: reciente && actual.dias === DIAS_SEMANA && anterior.dias === DIAS_SEMANA,
    reciente,
    variacion: {
      clics: variacion(actual.clics, anterior.clics),
      impresiones: variacion(actual.impresiones, anterior.impresiones),
      // En puntos; positivo es peor (la 8 está por debajo de la 3).
      posicion: actual.posicion != null && anterior.posicion != null
        ? Math.round((actual.posicion - anterior.posicion) * 10) / 10
        : null,
    },
  };
}

/**
 * Lo que ha caído más del umbral. Una caída de «más del 30 %» es por debajo de
 * −30: el −30 justo no avisa.
 */
export function caidas(semana, u = umbrales()) {
  if (!semana?.con_datos || !semana.completa) return [];
  const fuera = [];
  const mira = (metrica, umbral, minimo) => {
    const v = semana.variacion[metrica];
    if (umbral > 0 && v != null && semana.anterior[metrica] >= minimo && v < -umbral) {
      fuera.push({ metrica, variacion: v, ahora: semana.actual[metrica], antes: semana.anterior[metrica], umbral });
    }
  };
  mira('clics', u.clics, u.minClics);
  mira('impresiones', u.impresiones, u.minImpresiones);
  return fuera;
}

/**
 * A quién avisar: quien puede ABRIR lo que enlaza el aviso (revisión de Diego
 * en la PR #1165, como `destinatariosDeAcceso` de soporte).
 *
 *   · El ALCANCE, igual que la ruta (`deSusCampus`): super admin y soporte ven
 *     todos los campus; el resto, los suyos (`user_projects` activos).
 *   · De ahí, solo quien tenga `search_console.view`. Al admin al que se le ha
 *     quitado no le llega un aviso que le daría 403; al project manager, que lo
 *     trae de serie, o a quien lo tiene por excepción, sí.
 *
 * Vacío = no se avisa.
 */
export async function quienPuedeVerlo(projectId) {
  const { rows } = await query(
    `SELECT u.id FROM users u
      WHERE u.active AND (u.role IN ('superadmin', 'soporte')
         OR EXISTS (SELECT 1 FROM user_projects up
              WHERE up.user_id = u.id AND up.project_id = $1 AND up.active))
      ORDER BY u.id`,
    [projectId]
  );
  const out = [];
  for (const { id } of rows) {
    try {
      const e = await explicarPermisos(id);
      if (e?.mapa?.['search_console.view'] === true) out.push(id);
    } catch (err) {
      logger.warn({ err: err.message, userId: id }, 'Search Console: no se pudieron leer los permisos de un destinatario');
    }
  }
  return out;
}

const num = (n) => new Intl.NumberFormat('es-ES').format(n);
const fechaCorta = (s) => new Date(`${s}T00:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const NOMBRE = { clics: 'clics', impresiones: 'impresiones' };

/** El texto del aviso. */
export function textoDelAviso(nombre, semana, fuera) {
  const que = fuera.map((c) => `${NOMBRE[c.metrica]} ${c.variacion.toLocaleString('es-ES')} %`).join(' e ');
  const detalle = fuera.map((c) => `${num(c.ahora)} ${NOMBRE[c.metrica]} (antes ${num(c.antes)})`).join(', ');
  const pos = semana.variacion.posicion;
  const posicion = pos == null ? '' : ` Posición media ${semana.actual.posicion.toLocaleString('es-ES')}`
    + ` (${pos > 0 ? '+' : ''}${pos.toLocaleString('es-ES')}).`;
  return {
    title: `${nombre}: ${que} en Google esta semana`,
    message: `Del ${fechaCorta(semana.actual.desde)} al ${fechaCorta(semana.actual.hasta)}: ${detalle}, `
      + `contra los 7 días anteriores.${posicion}`,
  };
}

/**
 * Mira un campus y avisa si ha caído. No lanza: devuelve qué pasó.
 * `ahora` y `destinatarios` son para las pruebas.
 */
export async function avisarSiCae(projectId, nombre, { ahora = new Date(), destinatarios = null, u = null } = {}) {
  if (!u) u = await umbralesDelCampus(projectId);
  const semana = await semanaDe(projectId, { ahora });
  const fuera = caidas(semana, u);
  if (!fuera.length) {
    return { avisado: false, motivo: !semana.con_datos ? 'sin_datos' : !semana.completa ? 'semana_incompleta' : 'sin_caida' };
  }

  const { dia: lunes } = enMadrid(ahora);
  const { rows: previos } = await query(
    `SELECT 1 FROM admin_notifications
      WHERE type = $1 AND metadata->>'project_id' = $2 AND metadata->>'lunes' = $3
      LIMIT 1`,
    [TIPO_AVISO, String(projectId), lunes]
  );
  if (previos.length) return { avisado: false, motivo: 'ya_avisado', lunes };

  // `notifyUsers` con la lista vacía avisa a TODOS los admin: si en el campus
  // nadie puede verlo, no se le cuenta a los de otros.
  const para = destinatarios ?? await quienPuedeVerlo(projectId);
  if (!para.length) return { avisado: false, motivo: 'sin_destinatarios' };

  const creado = await notifyUsers({
    targetUserIds: para,
    type: TIPO_AVISO,
    ...textoDelAviso(nombre, semana, fuera),
    link_path: '/trafico-organico',
    metadata: {
      project_id: Number(projectId),
      lunes,
      desde: semana.actual.desde,
      hasta: semana.actual.hasta,
      caidas: fuera.map(({ metrica, variacion: v }) => ({ metrica, variacion: v })),
    },
  });
  return creado
    ? { avisado: true, lunes, caidas: fuera, notificacion: creado.id }
    : { avisado: false, motivo: 'no_se_pudo_escribir' };
}

/**
 * La vuelta de los lunes. `campus`: las filas de `proyectosConGSC` que mirar
 * (la tarea pasa solo las encendidas); sin él, todos los que tienen Search
 * Console. Cada uno con SUS umbrales (CRM#1210). Un campus que falla no para a
 * los demás.
 */
export async function revisarCaidas({ ahora = new Date(), campus = null } = {}) {
  const resumen = { campus: 0, avisados: 0, errores: 0 };
  for (const p of campus ?? await proyectosConGSC()) {
    resumen.campus += 1;
    try {
      const r = await avisarSiCae(p.project_id, p.nombre, { ahora, u: umbralesDe(p) });
      if (r.avisado) resumen.avisados += 1;
    } catch (err) {
      resumen.errores += 1;
      logger.warn({ projectId: p.project_id, err: err.message }, 'Search Console: no se pudo mirar la semana del campus');
    }
  }
  return resumen;
}
