import { query, getClient } from '../../shared/config/db.js';
import { logger } from '../../shared/utils/logger.js';
import { AppError } from '../../shared/utils/AppError.js';
import { getDecryptedValue } from '../credentials/credentials.model.js';
import { leerCredencial, informe, fechaGa } from './google-analytics.client.js';

/**
 * Google Analytics: lo que pasa antes del lead (CRM#55).
 *
 *   · `sincronizarProyecto` trae de GA4 sesiones por canal y por página de
 *     entrada y las guarda por día (borra y vuelve a escribir el tramo: GA4
 *     reprocesa los dos últimos días y un canal puede desaparecer).
 *   · `embudo` y `paginas` lo cruzan al leer con `leads` y `conversions`, con
 *     las mismas reglas que «¿Dónde ponemos el dinero?» (#56): un lead cuenta el
 *     día que entró y una venta es la que tiene algún cobro y no es mensualidad.
 */

export const SERVICIO = 'google_analytics';
const TZ = process.env.APP_TIMEZONE || 'Europe/Madrid';
const ENTRADA = `(COALESCE(l.fecha_solicitud, l.created_at) AT TIME ZONE '${TZ}')::date`;

/** El interruptor de la sincronización periódica. Apagado de serie. */
export function syncActivo() {
  const v = String(process.env.GA4_SYNC_ACTIVO || '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

/** Días que se traen la primera vez. */
export const DIAS_HISTORICO = 90;
/** Días que se vuelven a traer en cada vuelta: GA4 sigue ajustando los últimos. */
export const DIAS_REPASO = 3;

/**
 * La ruta de una página, igual la dé GA4 o venga en `leads.landing_url`: sin
 * dominio, sin query ni ancla, sin barra final (salvo la portada) y en minúsculas.
 */
export function normalizarRuta(url) {
  if (!url) return null;
  let r = String(url).trim().replace(/^https?:\/\/[^/]+/i, '');
  r = r.split('#')[0].split('?')[0];
  if (!r.startsWith('/')) r = `/${r}`;
  r = r.replace(/\/+$/, '') || '/';
  return r.toLowerCase().slice(0, 1000);
}

// Lo mismo en SQL, para cruzar con `leads.landing_url` sin traerlos todos.
const RUTA_SQL = (col) => `COALESCE(NULLIF(lower(rtrim(
    split_part(split_part(regexp_replace(${col}, '^https?://[^/]+', '', 'i'), '#', 1), '?', 1),
  '/')), ''), '/')`;

const dia = (d) => d.toISOString().slice(0, 10);
const haceDias = (n, ahora = new Date()) => dia(new Date(ahora.getTime() - n * 86400000));

/** Los campus que tienen credencial de GA4 (solo la de producción). */
export async function proyectosConGA4() {
  const { rows } = await query(
    `SELECT ac.project_id, p.nombre, s.last_synced_at, s.last_status, s.last_error, s.backfill_done, s.property_id
       FROM api_credentials ac
       JOIN projects p ON p.id = ac.project_id
       LEFT JOIN ga4_sincronizacion s ON s.project_id = ac.project_id
      WHERE ac.service = $1 AND ac.active = true
        AND COALESCE(ac.metadata->>'entorno', 'produccion') = 'produccion'
      ORDER BY p.nombre`,
    [SERVICIO]
  );
  return rows;
}

export async function credencialDe(projectId) {
  const valor = await getDecryptedValue(SERVICIO, projectId, { soloProduccion: true });
  if (!valor) throw new AppError('Este campus no tiene credencial de Google Analytics', 404, 'GA4_SIN_CREDENCIAL');
  return leerCredencial(valor);
}

async function guardarEstado(projectId, { propertyId = null, ok, error = null, backfill = null }) {
  await query(
    `INSERT INTO ga4_sincronizacion (project_id, property_id, last_synced_at, last_status, last_error, backfill_done)
     VALUES ($1, $2, CASE WHEN $3 THEN NOW() END, $4, $5, COALESCE($6, false))
     ON CONFLICT (project_id) DO UPDATE SET
       property_id    = COALESCE(EXCLUDED.property_id, ga4_sincronizacion.property_id),
       last_synced_at = COALESCE(EXCLUDED.last_synced_at, ga4_sincronizacion.last_synced_at),
       last_status    = EXCLUDED.last_status,
       last_error     = EXCLUDED.last_error,
       backfill_done  = COALESCE($6, ga4_sincronizacion.backfill_done),
       updated_at     = NOW()`,
    [projectId, propertyId, ok, ok ? 'ok' : 'error', error ? String(error).slice(0, 1000) : null, backfill]
  );
}

/** Trae de GA4 canales y páginas de [desde, hasta] y reescribe ese tramo. */
export async function sincronizarProyecto(projectId, { desde, hasta, cred = null } = {}) {
  const c = cred || await credencialDe(projectId);
  const [canales, paginas] = await Promise.all([
    informe(c, {
      desde, hasta,
      dimensiones: ['date', 'sessionDefaultChannelGroup'],
      metricas: ['sessions', 'totalUsers', 'newUsers', 'keyEvents'],
    }),
    informe(c, {
      desde, hasta,
      dimensiones: ['date', 'landingPage'],
      metricas: ['sessions', 'totalUsers', 'keyEvents'],
    }),
  ]);

  // Varias landingPage pueden quedar en la misma ruta al normalizar (mayúsculas,
  // barra final): se suman antes de escribir para no chocar con la clave.
  const porPagina = new Map();
  for (const f of paginas) {
    const pagina = normalizarRuta(f.landingPage) || '(not set)';
    const k = `${f.date}|${pagina}`;
    const a = porPagina.get(k) || { fecha: fechaGa(f.date), pagina, sesiones: 0, usuarios: 0, eventos: 0 };
    a.sesiones += f.sessions; a.usuarios += f.totalUsers; a.eventos += f.keyEvents;
    porPagina.set(k, a);
  }

  const cli = await getClient();
  try {
    await cli.query('BEGIN');
    await cli.query(`DELETE FROM ga4_canales_diarios WHERE project_id = $1 AND fecha BETWEEN $2 AND $3`, [projectId, desde, hasta]);
    await cli.query(`DELETE FROM ga4_paginas_diarias WHERE project_id = $1 AND fecha BETWEEN $2 AND $3`, [projectId, desde, hasta]);
    if (canales.length) {
      await cli.query(
        `INSERT INTO ga4_canales_diarios (project_id, fecha, canal, sesiones, usuarios, usuarios_nuevos, eventos_clave)
         SELECT $1, f, c, s, u, n, e
           FROM unnest($2::date[], $3::text[], $4::int[], $5::int[], $6::int[], $7::numeric[]) AS t(f, c, s, u, n, e)
         ON CONFLICT (project_id, fecha, canal) DO UPDATE SET
           sesiones = ga4_canales_diarios.sesiones + EXCLUDED.sesiones,
           usuarios = ga4_canales_diarios.usuarios + EXCLUDED.usuarios,
           usuarios_nuevos = ga4_canales_diarios.usuarios_nuevos + EXCLUDED.usuarios_nuevos,
           eventos_clave = ga4_canales_diarios.eventos_clave + EXCLUDED.eventos_clave`,
        [projectId,
          canales.map((f) => fechaGa(f.date)),
          canales.map((f) => (f.sessionDefaultChannelGroup || '(not set)').slice(0, 80)),
          canales.map((f) => f.sessions), canales.map((f) => f.totalUsers),
          canales.map((f) => f.newUsers), canales.map((f) => f.keyEvents)]
      );
    }
    const pags = [...porPagina.values()];
    if (pags.length) {
      await cli.query(
        `INSERT INTO ga4_paginas_diarias (project_id, fecha, pagina, sesiones, usuarios, eventos_clave)
         SELECT $1, f, p, s, u, e
           FROM unnest($2::date[], $3::text[], $4::int[], $5::int[], $6::numeric[]) AS t(f, p, s, u, e)`,
        [projectId, pags.map((p) => p.fecha), pags.map((p) => p.pagina),
          pags.map((p) => p.sesiones), pags.map((p) => p.usuarios), pags.map((p) => p.eventos)]
      );
    }
    await cli.query('COMMIT');
  } catch (err) {
    await cli.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cli.release();
  }
  return { propertyId: c.propertyId, canales: canales.length, paginas: porPagina.size };
}

/**
 * Una vuelta para un campus: el histórico la primera vez, los últimos días
 * después (o el hueco, si estuvo parada). Anota cómo fue; no lanza.
 */
export async function ponerAlDia(projectId, { ahora = new Date() } = {}) {
  const { rows } = await query(`SELECT * FROM ga4_sincronizacion WHERE project_id = $1`, [projectId]);
  const estado = rows[0];
  let dias = DIAS_REPASO;
  if (!estado?.backfill_done) dias = DIAS_HISTORICO;
  else if (estado.last_synced_at) {
    const parada = Math.ceil((ahora - new Date(estado.last_synced_at)) / 86400000);
    dias = Math.min(Math.max(DIAS_REPASO, parada + 1), DIAS_HISTORICO);
  }
  try {
    const r = await sincronizarProyecto(projectId, { desde: haceDias(dias, ahora), hasta: dia(ahora) });
    await guardarEstado(projectId, { propertyId: r.propertyId, ok: true, backfill: true });
    return { ok: true, dias, ...r };
  } catch (err) {
    await guardarEstado(projectId, { ok: false, error: err.message });
    logger.warn({ projectId, err: err.message }, 'GA4: no se pudo sincronizar el campus');
    return { ok: false, dias, error: err.message };
  }
}

const tasa = (a, b) => (b > 0 ? Number((a / b * 100).toFixed(2)) : null);

/**
 * Sesiones → leads → ventas por día, en una sola línea (subfase 4).
 * `canales`: el reparto de sesiones del periodo por canal de GA4.
 */
export async function embudo(projectId, desde, hasta) {
  const { rows: dias } = await query(
    `WITH d AS (SELECT generate_series($2::date, $3::date, '1 day')::date AS fecha),
     s AS (
       SELECT fecha, SUM(sesiones)::int AS sesiones, SUM(usuarios)::int AS usuarios,
              SUM(eventos_clave)::numeric AS eventos_clave
         FROM ga4_canales_diarios WHERE project_id = $1 AND fecha BETWEEN $2 AND $3
        GROUP BY fecha
     ),
     l AS (
       SELECT ${ENTRADA} AS fecha, l.id
         FROM leads l
        WHERE l.project_id = $1 AND l.deleted_at IS NULL
          AND ${ENTRADA} BETWEEN $2::date AND $3::date
     ),
     v AS (
       SELECT l.fecha, COUNT(DISTINCT c.id)::int AS ventas
         FROM l JOIN conversions c ON c.lead_id = l.id AND NOT c.es_mensualidad
        WHERE EXISTS (SELECT 1 FROM conversion_payments cp WHERE cp.conversion_id = c.id)
        GROUP BY l.fecha
     )
     SELECT to_char(d.fecha, 'YYYY-MM-DD') AS fecha,
            s.sesiones, s.usuarios, s.eventos_clave,
            (SELECT COUNT(*) FROM l WHERE l.fecha = d.fecha)::int AS leads,
            COALESCE(v.ventas, 0) AS ventas
       FROM d LEFT JOIN s ON s.fecha = d.fecha LEFT JOIN v ON v.fecha = d.fecha
      ORDER BY d.fecha`,
    [projectId, desde, hasta]
  );
  const { rows: canales } = await query(
    `SELECT canal, SUM(sesiones)::int AS sesiones, SUM(usuarios)::int AS usuarios,
            SUM(eventos_clave)::numeric AS eventos_clave
       FROM ga4_canales_diarios WHERE project_id = $1 AND fecha BETWEEN $2 AND $3
      GROUP BY canal ORDER BY sesiones DESC`,
    [projectId, desde, hasta]
  );

  // Un día sin fila de GA4 es «sin dato» (null), no cero: puede no haberse traído.
  const total = dias.reduce((t, d) => ({
    sesiones: d.sesiones == null ? t.sesiones : (t.sesiones ?? 0) + d.sesiones,
    leads: t.leads + d.leads,
    ventas: t.ventas + d.ventas,
  }), { sesiones: null, leads: 0, ventas: 0 });

  return {
    dias: dias.map((d) => ({ ...d, eventos_clave: d.eventos_clave == null ? null : Number(d.eventos_clave) })),
    canales: canales.map((c) => ({ ...c, eventos_clave: Number(c.eventos_clave) })),
    total: {
      ...total,
      lead_por_sesion: total.sesiones == null ? null : tasa(total.leads, total.sesiones),
      venta_por_lead: tasa(total.ventas, total.leads),
    },
  };
}

/**
 * Por página de entrada: visitas, leads y ventas (subfase 3). Es lo que separa
 * «nadie entra» (pocas sesiones) de «entran y no piden» (muchas sesiones,
 * pocos leads). Las páginas con leads pero sin sesiones en GA4 también salen.
 */
export async function paginas(projectId, desde, hasta, { limite = 200 } = {}) {
  const { rows } = await query(
    `WITH g AS (
       SELECT pagina, SUM(sesiones)::int AS sesiones, SUM(usuarios)::int AS usuarios,
              SUM(eventos_clave)::numeric AS eventos_clave
         FROM ga4_paginas_diarias WHERE project_id = $1 AND fecha BETWEEN $2 AND $3
        GROUP BY pagina
     ),
     l AS (
       SELECT ${RUTA_SQL('l.landing_url')} AS pagina, l.id
         FROM leads l
        WHERE l.project_id = $1 AND l.deleted_at IS NULL AND l.landing_url IS NOT NULL
          AND ${ENTRADA} BETWEEN $2::date AND $3::date
     ),
     lp AS (
       SELECT l.pagina, COUNT(DISTINCT l.id)::int AS leads,
              COUNT(DISTINCT c.id) FILTER (
                WHERE c.id IS NOT NULL AND EXISTS (SELECT 1 FROM conversion_payments cp WHERE cp.conversion_id = c.id)
              )::int AS ventas
         FROM l LEFT JOIN conversions c ON c.lead_id = l.id AND NOT c.es_mensualidad
        GROUP BY l.pagina
     )
     SELECT COALESCE(g.pagina, lp.pagina) AS pagina,
            COALESCE(g.sesiones, 0) AS sesiones, COALESCE(g.usuarios, 0) AS usuarios,
            COALESCE(g.eventos_clave, 0)::numeric AS eventos_clave,
            COALESCE(lp.leads, 0) AS leads, COALESCE(lp.ventas, 0) AS ventas
       FROM g FULL JOIN lp ON lp.pagina = g.pagina
      ORDER BY COALESCE(g.sesiones, 0) DESC, COALESCE(lp.leads, 0) DESC
      LIMIT $4`,
    [projectId, desde, hasta, Math.min(Number(limite) || 200, 1000)]
  );
  return rows.map((r) => ({
    ...r,
    eventos_clave: Number(r.eventos_clave),
    lead_por_sesion: tasa(r.leads, r.sesiones),
  }));
}

/**
 * Cómo está un campus para el informe del MCP (CRM#1247): si tiene credencial
 * de producción, el último día que tiene guardado y cómo fue la última vuelta.
 */
export async function estadoDelCampus(projectId) {
  const [{ rows: [cred] }, { rows: [u] }, { rows: [s] }] = await Promise.all([
    query(
      `SELECT 1 AS hay FROM api_credentials
        WHERE service = $1 AND project_id = $2 AND active = true
          AND COALESCE(metadata->>'entorno', 'produccion') = 'produccion'
        LIMIT 1`,
      [SERVICIO, projectId]
    ),
    query(`SELECT to_char(MAX(fecha), 'YYYY-MM-DD') AS ultimo FROM ga4_canales_diarios WHERE project_id = $1`, [projectId]),
    query(`SELECT last_synced_at, last_status FROM ga4_sincronizacion WHERE project_id = $1`, [projectId]),
  ]);
  return {
    conectado: Boolean(cred?.hay),
    ultimo_dia: u?.ultimo || null,
    ultima_sincronizacion: s?.last_synced_at ? new Date(s.last_synced_at).toISOString() : null,
    estado_sincronizacion: s?.last_status || null,
  };
}

const pct = (ahora, antes) => (antes > 0 ? Number(((ahora - antes) / antes * 100).toFixed(1)) : null);

/** El periodo anterior de la misma longitud, pegado por delante. */
export function periodoAnterior(desde, hasta) {
  const d = Date.parse(`${desde}T00:00:00Z`);
  const largo = Math.round((Date.parse(`${hasta}T00:00:00Z`) - d) / 86400000) + 1;
  return { desde: dia(new Date(d - largo * 86400000)), hasta: dia(new Date(d - 86400000)) };
}

/**
 * Los totales del periodo con las MISMAS funciones que la pantalla: sesiones,
 * leads y ventas salen de `embudo`; usuarios y eventos clave, de sus canales
 * (la suma de los canales es la de los días). `dias_con_datos`: días con fila de GA4.
 */
async function totalesDelPeriodo(projectId, desde, hasta) {
  const e = await embudo(projectId, desde, hasta);
  const suma = (k) => e.canales.reduce((t, c) => t + Number(c[k] || 0), 0);
  return {
    dias_con_datos: e.dias.filter((d) => d.sesiones != null).length,
    total: {
      sesiones: e.total.sesiones ?? 0,
      usuarios: suma('usuarios'),
      conversiones: Number(suma('eventos_clave').toFixed(2)),
      leads: e.total.leads,
      ventas: e.total.ventas,
      lead_por_sesion: e.total.lead_por_sesion,
      venta_por_lead: e.total.venta_por_lead,
    },
    canales: e.canales.map((c) => ({ canal: c.canal, sesiones: c.sesiones, usuarios: c.usuarios, conversiones: c.eventos_clave })),
  };
}

/** Lo que cambia de un periodo al otro, en unidades y en %. */
export function cambioEntre(actual, anterior) {
  const r = {};
  for (const k of ['sesiones', 'usuarios', 'conversiones', 'leads', 'ventas']) {
    r[k] = Number((actual[k] - anterior[k]).toFixed(2));
    r[`${k}_pct`] = pct(actual[k], anterior[k]);
  }
  return r;
}

/**
 * El informe de GA4 de un campus para el MCP (CRM#1247): lo mismo que la
 * pantalla «Google Analytics» (`embudo` y `paginas`), con las páginas de más
 * tráfico y, si `comparar`, el periodo anterior de la misma longitud.
 */
export async function informeGa4(projectId, desde, hasta, { limite = 10, comparar = true } = {}) {
  const ant = comparar ? periodoAnterior(desde, hasta) : null;
  const [actual, pags, extra] = await Promise.all([
    totalesDelPeriodo(projectId, desde, hasta),
    paginas(projectId, desde, hasta, { limite }),
    comparar
      ? Promise.all([totalesDelPeriodo(projectId, ant.desde, ant.hasta), paginas(projectId, ant.desde, ant.hasta, { limite: 1000 })])
      : null,
  ]);
  const top = pags.map((p) => ({
    pagina: p.pagina, sesiones: p.sesiones, usuarios: p.usuarios, conversiones: p.eventos_clave,
    leads: p.leads, ventas: p.ventas, lead_por_sesion: p.lead_por_sesion,
  }));
  const informe = {
    periodo: { desde, hasta, dias_con_datos: actual.dias_con_datos },
    total: actual.total,
    canales: actual.canales,
    paginas: { top },
  };
  if (!extra) return informe;
  const [anterior, pagsAntes] = extra;
  const antes = new Map(pagsAntes.map((p) => [p.pagina, p]));
  return {
    ...informe,
    anterior: { ...ant, dias_con_datos: anterior.dias_con_datos, ...anterior.total },
    cambio: cambioEntre(actual.total, anterior.total),
    paginas: {
      top: top.map((p) => ({ ...p, sesiones_antes: antes.get(p.pagina)?.sesiones ?? 0, leads_antes: antes.get(p.pagina)?.leads ?? 0 })),
    },
  };
}
