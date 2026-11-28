import { query, getClient } from '../../shared/config/db.js';
import { logger } from '../../shared/utils/logger.js';
import { AppError } from '../../shared/utils/AppError.js';
import { getDecryptedValue } from '../credentials/credentials.model.js';
import { leerCredencial, analitica, inspeccionar, partirUrl, esDelSitio } from './search-console.client.js';
import { interruptorDelCampus, envEncendido } from '../../shared/utils/interruptorCampus.js';

/**
 * Search Console: lo que pasa en Google antes de la visita (CRM#36).
 *
 *   · `sincronizarProyecto` trae clics, impresiones y posición por día (del
 *     sitio entero, por página y por búsqueda) y los guarda; borra y vuelve a
 *     escribir el tramo, porque Google sigue ajustando los últimos días.
 *   · `revisarIndexacion` pregunta a Google, una vez al día, si las páginas de
 *     formación (`products.url_info`) están indexadas.
 *   · `resumen`, `consultas`, `paginas` e `indexacion` lo leen para la
 *     pantalla «Tráfico orgánico», comparando con el periodo anterior.
 */

export const SERVICIO = 'gsc';

/**
 * La variable del servidor (GSC_SYNC_ACTIVO). Desde CRM#1210 solo es la RESERVA:
 * vale para los campus en los que nadie ha tocado el interruptor de la tarjeta.
 */
export function syncActivo() {
  return envEncendido(process.env.GSC_SYNC_ACTIVO);
}

/** Si un campus se sincroniza solo, y por qué (`fila` de `proyectosConGSC`). */
export function interruptorDe(fila) {
  return interruptorDelCampus(fila?.sync_activo ?? null, syncActivo());
}

/** Días que se traen la primera vez: 90 y sus 90 anteriores, para comparar. */
export const DIAS_HISTORICO = 180;
/** Días que se vuelven a traer en cada vuelta: Google sigue ajustando los últimos. */
export const DIAS_REPASO = 5;
/** Páginas que se inspeccionan por campus y día (Google deja 2.000 por propiedad). */
export const MAX_INSPECCIONES = 150;
/** Cada cuánto se vuelve a mirar la indexación. */
const HORAS_INDEXACION = 20;
/** Una página es «oportunidad» con estas impresiones o más… */
export const MIN_IMPRESIONES = 100;
/** …en las dos primeras páginas de Google y con menos de la mitad del CTR medio. */
export const MAX_POSICION = 20;

const dia = (d) => d.toISOString().slice(0, 10);
const haceDias = (n, ahora = new Date()) => dia(new Date(ahora.getTime() - n * 86400000));
const ctr = (clics, impresiones) => (impresiones > 0 ? Number((clics / impresiones * 100).toFixed(2)) : null);
const posicion = (suma, impresiones) => (impresiones > 0 ? Number((Number(suma) / impresiones).toFixed(1)) : null);

/** Los campus que tienen credencial de Search Console (solo la de producción). */
export async function proyectosConGSC() {
  const { rows } = await query(
    `SELECT ac.project_id, p.nombre, COALESCE(s.site_url, p.gsc_property) AS site_url,
            s.last_synced_at, s.last_status, s.last_error, s.backfill_done, s.indexacion_at,
            s.sync_activo, s.aviso_caida_clics, s.aviso_caida_impresiones, s.aviso_min_clics, s.aviso_min_impresiones
       FROM api_credentials ac
       JOIN projects p ON p.id = ac.project_id
       LEFT JOIN gsc_sincronizacion s ON s.project_id = ac.project_id
      WHERE ac.service = $1 AND ac.active = true
        AND COALESCE(ac.metadata->>'entorno', 'produccion') = 'produccion'
      ORDER BY p.nombre`,
    [SERVICIO]
  );
  return rows;
}

export async function credencialDe(projectId) {
  const valor = await getDecryptedValue(SERVICIO, projectId, { soloProduccion: true });
  if (!valor) throw new AppError('Este campus no tiene credencial de Search Console', 404, 'GSC_SIN_CREDENCIAL');
  const { rows } = await query(`SELECT gsc_property FROM projects WHERE id = $1`, [projectId]);
  return leerCredencial(valor, rows[0]?.gsc_property || null);
}

async function guardarEstado(projectId, { siteUrl = null, ok, error = null, backfill = null, indexacion = false }) {
  await query(
    `INSERT INTO gsc_sincronizacion (project_id, site_url, last_synced_at, last_status, last_error, backfill_done, indexacion_at)
     VALUES ($1, $2, CASE WHEN $3 THEN NOW() END, $4, $5, COALESCE($6, false), CASE WHEN $7 THEN NOW() END)
     ON CONFLICT (project_id) DO UPDATE SET
       site_url       = COALESCE(EXCLUDED.site_url, gsc_sincronizacion.site_url),
       last_synced_at = COALESCE(EXCLUDED.last_synced_at, gsc_sincronizacion.last_synced_at),
       last_status    = EXCLUDED.last_status,
       last_error     = EXCLUDED.last_error,
       backfill_done  = gsc_sincronizacion.backfill_done OR COALESCE($6, false),
       indexacion_at  = COALESCE(EXCLUDED.indexacion_at, gsc_sincronizacion.indexacion_at),
       updated_at     = NOW()`,
    [projectId, siteUrl, ok, ok ? 'ok' : 'error', error, backfill, indexacion]
  );
}

/**
 * Suma las filas que caen en la misma clave (dos URL que quedan en la misma
 * ruta al normalizar, una búsqueda repetida) antes de escribir, para no chocar
 * con la clave primaria. La posición se acumula ponderada por impresiones.
 */
export function agrupar(filas, clave) {
  const m = new Map();
  for (const f of filas) {
    const k = clave(f);
    if (!k) continue;
    const id = k.join('|');
    const a = m.get(id) || { k, clics: 0, impresiones: 0, posicion_suma: 0 };
    a.clics += f.clics;
    a.impresiones += f.impresiones;
    a.posicion_suma += f.posicion * f.impresiones;
    m.set(id, a);
  }
  return [...m.values()];
}

const TROZO = 20000;
async function insertar(cli, sql, filas, columnas) {
  for (let i = 0; i < filas.length; i += TROZO) {
    const t = filas.slice(i, i + TROZO);
    await cli.query(sql, columnas.map((c) => t.map(c)));
  }
}

/** Trae de Search Console el tramo [desde, hasta] y lo deja en la base. */
export async function sincronizarProyecto(projectId, { desde, hasta, cred = null } = {}) {
  const c = cred || await credencialDe(projectId);
  const [sitio, porPagina, porConsulta] = await Promise.all([
    analitica(c, { desde, hasta, dimensiones: ['date'] }),
    analitica(c, { desde, hasta, dimensiones: ['date', 'page'] }),
    analitica(c, { desde, hasta, dimensiones: ['date', 'query'] }),
  ]);

  const dias = agrupar(sitio, (f) => [f.date]);
  const paginas = agrupar(porPagina, (f) => {
    const { host, ruta } = partirUrl(f.page);
    return [f.date, host.slice(0, 255), ruta];
  });
  const consultas = agrupar(porConsulta, (f) => (f.query ? [f.date, String(f.query).slice(0, 500)] : null));

  const cli = await getClient();
  try {
    await cli.query('BEGIN');
    for (const t of ['gsc_diario', 'gsc_paginas_diarias', 'gsc_consultas_diarias']) {
      await cli.query(`DELETE FROM ${t} WHERE project_id = $1 AND fecha BETWEEN $2 AND $3`, [projectId, desde, hasta]);
    }
    const pid = Number(projectId);
    await insertar(cli,
      `INSERT INTO gsc_diario (project_id, fecha, clics, impresiones, posicion_suma)
       SELECT ${pid}, f, c, i, p FROM unnest($1::date[], $2::int[], $3::int[], $4::numeric[]) AS t(f, c, i, p)`,
      dias, [(d) => d.k[0], (d) => d.clics, (d) => d.impresiones, (d) => d.posicion_suma.toFixed(2)]);
    await insertar(cli,
      `INSERT INTO gsc_paginas_diarias (project_id, fecha, host, ruta, clics, impresiones, posicion_suma)
       SELECT ${pid}, f, h, r, c, i, p
         FROM unnest($1::date[], $2::text[], $3::text[], $4::int[], $5::int[], $6::numeric[]) AS t(f, h, r, c, i, p)`,
      paginas, [(d) => d.k[0], (d) => d.k[1], (d) => d.k[2], (d) => d.clics, (d) => d.impresiones, (d) => d.posicion_suma.toFixed(2)]);
    await insertar(cli,
      `INSERT INTO gsc_consultas_diarias (project_id, fecha, consulta, clics, impresiones, posicion_suma)
       SELECT ${pid}, f, q, c, i, p
         FROM unnest($1::date[], $2::text[], $3::int[], $4::int[], $5::numeric[]) AS t(f, q, c, i, p)`,
      consultas, [(d) => d.k[0], (d) => d.k[1], (d) => d.clics, (d) => d.impresiones, (d) => d.posicion_suma.toFixed(2)]);
    await cli.query('COMMIT');
  } catch (err) {
    await cli.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cli.release();
  }
  // `dias` lo usa ponerAlDia para los días pedidos: aquí, cuántos trajo Google.
  return { siteUrl: c.siteUrl, dias_con_datos: dias.length, paginas: paginas.length, consultas: consultas.length };
}

/**
 * Pregunta a Google por las páginas de formación del campus que son de la
 * propiedad, las que hace más que no se miran primero. Una URL que falla queda
 * como ERROR y no para a las demás. Las que ya no son de ningún producto, se quitan.
 */
export async function revisarIndexacion(projectId, { cred = null, maximo = MAX_INSPECCIONES } = {}) {
  const c = cred || await credencialDe(projectId);
  const { rows } = await query(
    `SELECT DISTINCT ON (btrim(p.url_info)) btrim(p.url_info) AS url, p.id AS product_id, g.revisado_at
       FROM products p
       LEFT JOIN gsc_indexacion g ON g.project_id = p.project_id AND g.url = btrim(p.url_info)
      WHERE p.project_id = $1 AND p.active = true AND p.url_info ~* '^\\s*https?://'
      ORDER BY btrim(p.url_info), p.id`,
    [projectId]
  );
  const delSitio = rows.filter((r) => esDelSitio(r.url, c.siteUrl));
  await query(
    `DELETE FROM gsc_indexacion WHERE project_id = $1 AND NOT (url = ANY($2::text[]))`,
    [projectId, delSitio.map((r) => r.url)]
  );
  const turno = delSitio
    .sort((a, b) => (a.revisado_at ? new Date(a.revisado_at).getTime() : 0) - (b.revisado_at ? new Date(b.revisado_at).getTime() : 0))
    .slice(0, maximo);

  const resumen = { revisadas: 0, errores: 0, fuera: rows.length - delSitio.length };
  for (const r of turno) {
    let fila;
    try {
      const i = await inspeccionar(c, r.url);
      fila = { veredicto: i.veredicto.slice(0, 20), cobertura: i.cobertura?.slice(0, 255) || null, ultimo: i.ultimoRastreo, error: null };
    } catch (err) {
      // Sin acceso a la propiedad no tiene sentido seguir: fallarían todas.
      if (err.code === 'GSC_AUTH' || err.statusCode === 403) throw err;
      fila = { veredicto: 'ERROR', cobertura: null, ultimo: null, error: err.message };
      resumen.errores += 1;
    }
    await query(
      `INSERT INTO gsc_indexacion (project_id, url, product_id, veredicto, cobertura, ultimo_rastreo, error, revisado_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (project_id, url) DO UPDATE SET
         product_id = EXCLUDED.product_id, veredicto = EXCLUDED.veredicto, cobertura = EXCLUDED.cobertura,
         ultimo_rastreo = EXCLUDED.ultimo_rastreo, error = EXCLUDED.error, revisado_at = NOW()`,
      [projectId, r.url, r.product_id, fila.veredicto, fila.cobertura, fila.ultimo, fila.error]
    );
    resumen.revisadas += 1;
  }
  return resumen;
}

/**
 * Una vuelta para un campus: el histórico la primera vez, los últimos días
 * después (o el hueco, si estuvo parada); y la indexación, si toca. Anota cómo
 * fue; no lanza.
 */
export async function ponerAlDia(projectId, { ahora = new Date() } = {}) {
  const { rows } = await query(`SELECT * FROM gsc_sincronizacion WHERE project_id = $1`, [projectId]);
  const estado = rows[0];
  let dias = DIAS_REPASO;
  if (!estado?.backfill_done) dias = DIAS_HISTORICO;
  else if (estado.last_synced_at) {
    const parada = Math.ceil((ahora - new Date(estado.last_synced_at)) / 86400000);
    dias = Math.min(Math.max(DIAS_REPASO, parada + 1), DIAS_HISTORICO);
  }
  let cred;
  let r;
  try {
    cred = await credencialDe(projectId);
    r = await sincronizarProyecto(projectId, { desde: haceDias(dias, ahora), hasta: dia(ahora), cred });
  } catch (err) {
    await guardarEstado(projectId, { siteUrl: cred?.siteUrl || null, ok: false, error: err.message });
    logger.warn({ projectId, err: err.message }, 'Search Console: no se pudo sincronizar el campus');
    return { ok: false, dias, error: err.message };
  }

  const toca = !estado?.indexacion_at
    || (ahora - new Date(estado.indexacion_at)) / 3600000 >= HORAS_INDEXACION;
  let indexacion = null;
  if (toca) {
    try {
      indexacion = await revisarIndexacion(projectId, { cred });
    } catch (err) {
      // La analítica ya está guardada: la indexación se reintenta en la próxima vuelta.
      logger.warn({ projectId, err: err.message }, 'Search Console: no se pudo revisar la indexación');
      indexacion = { error: err.message };
    }
  }
  await guardarEstado(projectId, {
    siteUrl: r.siteUrl, ok: true, backfill: true, indexacion: Boolean(indexacion && !indexacion.error),
  });
  return { ok: true, dias, ...r, indexacion };
}

// ─── Lectura ────────────────────────────────────────────────────────────────

/** El periodo de la misma longitud justo antes de [desde, hasta]. */
export function periodoAnterior(desde, hasta) {
  const d = Date.parse(`${desde}T00:00:00Z`);
  const h = Date.parse(`${hasta}T00:00:00Z`);
  const largo = Math.round((h - d) / 86400000) + 1;
  return {
    desde: dia(new Date(d - largo * 86400000)),
    hasta: dia(new Date(d - 86400000)),
  };
}

const total = (r) => ({
  clics: Number(r?.clics || 0),
  impresiones: Number(r?.impresiones || 0),
  ctr: ctr(Number(r?.clics || 0), Number(r?.impresiones || 0)),
  posicion: posicion(r?.posicion_suma, Number(r?.impresiones || 0)),
});

export async function totales(projectId, desde, hasta) {
  const { rows } = await query(
    `SELECT SUM(clics)::int AS clics, SUM(impresiones)::int AS impresiones, SUM(posicion_suma) AS posicion_suma,
            COUNT(*)::int AS dias
       FROM gsc_diario WHERE project_id = $1 AND fecha BETWEEN $2 AND $3`,
    [projectId, desde, hasta]
  );
  return { ...total(rows[0]), dias: rows[0]?.dias || 0 };
}

/** Totales del periodo y del anterior, la serie por día y el último día con datos. */
export async function resumen(projectId, desde, hasta) {
  const ant = periodoAnterior(desde, hasta);
  const [actual, anterior, { rows: dias }, { rows: [u] }] = await Promise.all([
    totales(projectId, desde, hasta),
    totales(projectId, ant.desde, ant.hasta),
    query(
      `SELECT to_char(d.fecha, 'YYYY-MM-DD') AS fecha, g.clics, g.impresiones, g.posicion_suma
         FROM generate_series($2::date, $3::date, '1 day') AS d(fecha)
         LEFT JOIN gsc_diario g ON g.project_id = $1 AND g.fecha = d.fecha
        ORDER BY d.fecha`,
      [projectId, desde, hasta]
    ),
    query(`SELECT to_char(MAX(fecha), 'YYYY-MM-DD') AS ultimo FROM gsc_diario WHERE project_id = $1`, [projectId]),
  ]);
  return {
    periodo: { desde, hasta },
    anterior: { ...ant, ...anterior },
    total: actual,
    ultimo_dia: u?.ultimo || null,
    dias: dias.map((d) => (d.clics == null
      // Sin fila: Search Console no tiene ese día (no es cero).
      ? { fecha: d.fecha, clics: null, impresiones: null, ctr: null, posicion: null }
      : { fecha: d.fecha, ...total(d) })),
  };
}

/** Las búsquedas del periodo, con sus clics del periodo anterior. */
export async function consultas(projectId, desde, hasta, { limite = 100, buscar = '' } = {}) {
  const ant = periodoAnterior(desde, hasta);
  const { rows } = await query(
    `WITH a AS (
       SELECT consulta, SUM(clics)::int AS clics, SUM(impresiones)::int AS impresiones, SUM(posicion_suma) AS posicion_suma
         FROM gsc_consultas_diarias
        WHERE project_id = $1 AND fecha BETWEEN $2 AND $3 AND ($6 = '' OR consulta ILIKE '%' || $6 || '%')
        GROUP BY consulta
     ),
     b AS (
       SELECT consulta, SUM(clics)::int AS clics
         FROM gsc_consultas_diarias
        WHERE project_id = $1 AND fecha BETWEEN $4 AND $5 AND consulta IN (SELECT consulta FROM a)
        GROUP BY consulta
     )
     SELECT a.consulta, a.clics, a.impresiones, a.posicion_suma, b.clics AS clics_antes
       FROM a LEFT JOIN b USING (consulta)
      ORDER BY a.clics DESC, a.impresiones DESC, a.consulta
      LIMIT $7`,
    [projectId, desde, hasta, ant.desde, ant.hasta, String(buscar || '').trim(), Math.min(Number(limite) || 100, 1000)]
  );
  return rows.map((r) => ({
    consulta: r.consulta,
    ...total(r),
    clics_antes: r.clics_antes == null ? null : Number(r.clics_antes),
  }));
}

/**
 * Una página es «oportunidad» cuando Google ya la enseña (impresiones de sobra,
 * en las dos primeras páginas) pero casi nadie pincha: el título y la
 * descripción no convencen. Es lo que pide Carlos para Julián.
 */
export function esOportunidad(p, ctrMedio) {
  return p.impresiones >= MIN_IMPRESIONES
    && p.posicion != null && p.posicion <= MAX_POSICION
    && ctrMedio != null && p.ctr != null && p.ctr < ctrMedio / 2;
}

/** Las páginas del periodo, con sus clics del anterior y el aviso de oportunidad. */
export async function paginas(projectId, desde, hasta, { limite = 300, buscar = '' } = {}) {
  const ant = periodoAnterior(desde, hasta);
  const [sitio, { rows }] = await Promise.all([
    totales(projectId, desde, hasta),
    query(
      `WITH a AS (
         SELECT host, ruta, SUM(clics)::int AS clics, SUM(impresiones)::int AS impresiones, SUM(posicion_suma) AS posicion_suma
           FROM gsc_paginas_diarias
          WHERE project_id = $1 AND fecha BETWEEN $2 AND $3 AND ($6 = '' OR (host || ruta) ILIKE '%' || $6 || '%')
          GROUP BY host, ruta
       ),
       b AS (
         SELECT host, ruta, SUM(clics)::int AS clics
           FROM gsc_paginas_diarias
          WHERE project_id = $1 AND fecha BETWEEN $4 AND $5
          GROUP BY host, ruta
       ),
       ix AS (
         SELECT DISTINCT ON (h, r) h, r, veredicto, cobertura FROM (
           SELECT lower(regexp_replace(split_part(regexp_replace(url, '^https?://', '', 'i'), '/', 1), '^www\\.', '', 'i')) AS h,
                  COALESCE(NULLIF(lower(rtrim(split_part(split_part(regexp_replace(url, '^https?://[^/]+', '', 'i'), '#', 1), '?', 1), '/')), ''), '/') AS r,
                  veredicto, cobertura, revisado_at
             FROM gsc_indexacion WHERE project_id = $1
         ) x ORDER BY h, r, revisado_at DESC
       )
       SELECT a.host, a.ruta, a.clics, a.impresiones, a.posicion_suma, b.clics AS clics_antes,
              ix.veredicto, ix.cobertura
         FROM a
         LEFT JOIN b ON b.host = a.host AND b.ruta = a.ruta
         LEFT JOIN ix ON ix.h = a.host AND ix.r = a.ruta
        ORDER BY a.impresiones DESC, a.clics DESC
        LIMIT $7`,
      [projectId, desde, hasta, ant.desde, ant.hasta, String(buscar || '').trim(), Math.min(Number(limite) || 300, 2000)]
    ),
  ]);
  const filas = rows.map((r) => {
    const p = {
      host: r.host,
      ruta: r.ruta,
      ...total(r),
      clics_antes: r.clics_antes == null ? null : Number(r.clics_antes),
      indexacion: r.veredicto ? { veredicto: r.veredicto, cobertura: r.cobertura } : null,
    };
    return { ...p, oportunidad: esOportunidad(p, sitio.ctr) };
  });
  return { ctr_medio: sitio.ctr, filas };
}

/** Las páginas de formación revisadas: primero las que no están indexadas. */
export async function indexacion(projectId) {
  const { rows } = await query(
    `SELECT g.url, g.product_id, p.nombre AS producto, g.veredicto, g.cobertura, g.ultimo_rastreo, g.error, g.revisado_at
       FROM gsc_indexacion g
       LEFT JOIN products p ON p.id = g.product_id
      WHERE g.project_id = $1
      ORDER BY (g.veredicto = 'PASS'), g.veredicto, p.nombre NULLS LAST, g.url`,
    [projectId]
  );
  const cuenta = { indexadas: 0, no_indexadas: 0, errores: 0 };
  for (const r of rows) {
    if (r.veredicto === 'PASS') cuenta.indexadas += 1;
    else if (r.veredicto === 'ERROR') cuenta.errores += 1;
    else cuenta.no_indexadas += 1;
  }
  return { ...cuenta, paginas: rows };
}

// ─── Para Claude (MCP «informe_seo») ────────────────────────────────────────

/** Días del periodo por defecto: cuatro semanas, como la pantalla. */
export const DIAS_INFORME = 28;

/** Cómo está Search Console en un campus: credencial, último día guardado y última vuelta. */
export async function estadoDelCampus(projectId) {
  const [{ rows: [cred] }, { rows: [u] }, { rows: [s] }] = await Promise.all([
    query(
      `SELECT 1 AS hay FROM api_credentials
        WHERE service = $1 AND project_id = $2 AND active = true
          AND COALESCE(metadata->>'entorno', 'produccion') = 'produccion'
        LIMIT 1`,
      [SERVICIO, projectId]
    ),
    query(`SELECT to_char(MAX(fecha), 'YYYY-MM-DD') AS ultimo FROM gsc_diario WHERE project_id = $1`, [projectId]),
    query(`SELECT last_synced_at, last_status FROM gsc_sincronizacion WHERE project_id = $1`, [projectId]),
  ]);
  return {
    conectado: Boolean(cred?.hay),
    ultimo_dia: u?.ultimo || null,
    ultima_sincronizacion: s?.last_synced_at ? new Date(s.last_synced_at).toISOString() : null,
    estado_sincronizacion: s?.last_status || null,
  };
}

/**
 * El periodo del informe. Sin fechas, las últimas cuatro semanas HASTA EL
 * ÚLTIMO DÍA GUARDADO: Google va dos o tres días por detrás, y contar hasta
 * hoy haría que todo pareciera bajar.
 */
export function periodoDelInforme({ desde = null, hasta = null, ultimoDia = null, ahora = new Date() } = {}) {
  const fin = hasta || ultimoDia || haceDias(1, ahora);
  const inicio = desde || dia(new Date(Date.parse(`${fin}T00:00:00Z`) - (DIAS_INFORME - 1) * 86400000));
  return { desde: inicio, hasta: fin };
}

const pct = (ahora, antes) => (antes > 0 ? Number(((ahora - antes) / antes * 100).toFixed(1)) : null);

/** Lo que cambia de un periodo al otro. La posición baja cuando MEJORA. */
export function cambioEntre(actual, anterior) {
  return {
    clics: actual.clics - anterior.clics,
    clics_pct: pct(actual.clics, anterior.clics),
    impresiones: actual.impresiones - anterior.impresiones,
    impresiones_pct: pct(actual.impresiones, anterior.impresiones),
    ctr_puntos: actual.ctr != null && anterior.ctr != null ? Number((actual.ctr - anterior.ctr).toFixed(2)) : null,
    posicion: actual.posicion != null && anterior.posicion != null ? Number((actual.posicion - anterior.posicion).toFixed(1)) : null,
  };
}

const TABLA_MOVIMIENTOS = {
  consultas: { tabla: 'gsc_consultas_diarias', clave: 'consulta' },
  paginas: { tabla: 'gsc_paginas_diarias', clave: `host || ruta` },
};

/**
 * Las búsquedas o las páginas que más SUBEN y más BAJAN en clics frente al
 * periodo anterior de la misma longitud. Entran también las que desaparecen
 * (bajan a 0) y las que aparecen (vienen de 0).
 */
export async function movimientos(projectId, desde, hasta, { tipo = 'consultas', limite = 10 } = {}) {
  const t = TABLA_MOVIMIENTOS[tipo];
  if (!t) throw new AppError(`Tipo de movimiento desconocido: ${tipo}`, 400, 'GSC_TIPO');
  const ant = periodoAnterior(desde, hasta);
  const { rows } = await query(
    `WITH a AS (
       SELECT ${t.clave} AS clave, SUM(clics)::int AS clics, SUM(impresiones)::int AS impresiones, SUM(posicion_suma) AS posicion_suma
         FROM ${t.tabla} WHERE project_id = $1 AND fecha BETWEEN $2 AND $3 GROUP BY 1
     ),
     b AS (
       SELECT ${t.clave} AS clave, SUM(clics)::int AS clics, SUM(impresiones)::int AS impresiones, SUM(posicion_suma) AS posicion_suma
         FROM ${t.tabla} WHERE project_id = $1 AND fecha BETWEEN $4 AND $5 GROUP BY 1
     ),
     m AS (
       SELECT COALESCE(a.clave, b.clave) AS clave,
              COALESCE(a.clics, 0) AS clics, COALESCE(a.impresiones, 0) AS impresiones, a.posicion_suma,
              COALESCE(b.clics, 0) AS clics_antes, COALESCE(b.impresiones, 0) AS impresiones_antes, b.posicion_suma AS posicion_suma_antes,
              COALESCE(a.clics, 0) - COALESCE(b.clics, 0) AS diferencia
         FROM a FULL JOIN b ON b.clave = a.clave
     )
     (SELECT 'sube' AS sentido, m.* FROM m WHERE diferencia > 0 ORDER BY diferencia DESC, impresiones DESC, clave LIMIT $6)
     UNION ALL
     (SELECT 'baja' AS sentido, m.* FROM m WHERE diferencia < 0 ORDER BY diferencia ASC, impresiones_antes DESC, clave LIMIT $6)`,
    [projectId, desde, hasta, ant.desde, ant.hasta, Math.min(Math.max(Number(limite) || 10, 1), 50)]
  );
  const fila = (r) => {
    const actual = total(r);
    const antes = total({ clics: r.clics_antes, impresiones: r.impresiones_antes, posicion_suma: r.posicion_suma_antes });
    return {
      [tipo === 'paginas' ? 'pagina' : 'consulta']: r.clave,
      clics: actual.clics,
      clics_antes: antes.clics,
      diferencia_clics: Number(r.diferencia),
      impresiones: actual.impresiones,
      impresiones_antes: antes.impresiones,
      ctr: actual.ctr,
      posicion: actual.posicion,
      posicion_antes: antes.posicion,
    };
  };
  return {
    suben: rows.filter((r) => r.sentido === 'sube').map(fila),
    bajan: rows.filter((r) => r.sentido === 'baja').map(fila),
  };
}

/**
 * Las búsquedas o las páginas con MÁS CLICS del periodo, en el mismo orden que
 * la pantalla «Tráfico orgánico» (clics, luego impresiones). Con `anterior`
 * (un periodo), cada fila trae lo que tenía entonces y lo que cambia; sin él,
 * ni se mira el periodo anterior.
 */
export async function top(projectId, desde, hasta, { tipo = 'consultas', limite = 10, anterior = null } = {}) {
  const t = TABLA_MOVIMIENTOS[tipo];
  if (!t) throw new AppError(`Tipo de top desconocido: ${tipo}`, 400, 'GSC_TIPO');
  const tope = Math.min(Math.max(Number(limite) || 10, 1), 50);
  const { rows } = await query(
    `WITH a AS (
       SELECT ${t.clave} AS clave, SUM(clics)::int AS clics, SUM(impresiones)::int AS impresiones, SUM(posicion_suma) AS posicion_suma
         FROM ${t.tabla} WHERE project_id = $1 AND fecha BETWEEN $2 AND $3 GROUP BY 1
        ORDER BY 2 DESC, 3 DESC, 1
        LIMIT $4
     )
     ${anterior
    ? `, b AS (
       SELECT ${t.clave} AS clave, SUM(clics)::int AS clics, SUM(impresiones)::int AS impresiones, SUM(posicion_suma) AS posicion_suma
         FROM ${t.tabla} WHERE project_id = $1 AND fecha BETWEEN $5 AND $6 AND (${t.clave}) IN (SELECT clave FROM a) GROUP BY 1
     )
     SELECT a.*, b.clics AS clics_antes, b.impresiones AS impresiones_antes, b.posicion_suma AS posicion_suma_antes
       FROM a LEFT JOIN b ON b.clave = a.clave`
    : 'SELECT a.* FROM a'}
      ORDER BY a.clics DESC, a.impresiones DESC, a.clave`,
    anterior ? [projectId, desde, hasta, tope, anterior.desde, anterior.hasta] : [projectId, desde, hasta, tope]
  );
  return rows.map((r) => {
    const actual = total(r);
    const fila = { [tipo === 'paginas' ? 'pagina' : 'consulta']: r.clave, ...actual };
    if (!anterior) return fila;
    const antes = total({ clics: r.clics_antes, impresiones: r.impresiones_antes, posicion_suma: r.posicion_suma_antes });
    return {
      ...fila,
      clics_antes: antes.clics,
      impresiones_antes: antes.impresiones,
      ctr_antes: antes.ctr,
      posicion_antes: antes.posicion,
      cambio: cambioEntre(actual, antes),
    };
  });
}

/** Hasta cuántos días la evolución va por semanas; a partir de ahí, por meses. */
export const DIAS_EVOLUCION_SEMANAL = 90;

const finDeTramo = (inicio, por) => {
  const d = new Date(`${inicio}T00:00:00Z`);
  return por === 'mes'
    ? dia(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))
    : dia(new Date(d.getTime() + 6 * 86400000));
};

/**
 * Clics e impresiones por semana (de lunes a domingo; por mes si el periodo
 * pasa de 90 días), del sitio entero (`gsc_diario`, lo mismo que el total).
 * Solo salen los tramos con datos, y nada pasa de `tope` (el último día
 * guardado): la primera y la última fila pueden ser tramos incompletos, y lo
 * dicen sus fechas y `dias_con_datos`.
 */
export async function evolucion(projectId, desde, hasta, { tope = null } = {}) {
  const fin = tope && tope < hasta ? tope : hasta;
  const largo = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000) + 1;
  const por = largo > DIAS_EVOLUCION_SEMANAL ? 'mes' : 'semana';
  const { rows } = await query(
    `SELECT to_char(date_trunc($4, fecha::timestamp), 'YYYY-MM-DD') AS inicio,
            SUM(clics)::int AS clics, SUM(impresiones)::int AS impresiones, SUM(posicion_suma) AS posicion_suma,
            COUNT(*)::int AS dias
       FROM gsc_diario WHERE project_id = $1 AND fecha BETWEEN $2 AND $3
      GROUP BY 1 ORDER BY 1`,
    [projectId, desde, fin, por === 'mes' ? 'month' : 'week']
  );
  return {
    por,
    filas: rows.map((r) => {
      const finTramo = finDeTramo(r.inicio, por);
      return {
        desde: r.inicio < desde ? desde : r.inicio,
        hasta: finTramo > fin ? fin : finTramo,
        dias_con_datos: r.dias,
        ...total(r),
      };
    }),
  };
}

/**
 * El informe SEO de un campus: totales del periodo, su evolución, las
 * búsquedas y páginas con más clics y, si se compara (de serie), el periodo
 * anterior, lo que cambia y lo que más sube y baja. Con `comparar: false` el
 * periodo anterior ni se consulta. Solo lee lo que ya guardó la
 * sincronización: no llama a Google.
 */
export async function informeSeo(projectId, desde, hasta, { limite = 10, comparar = true, tope = null } = {}) {
  const ant = comparar ? periodoAnterior(desde, hasta) : null;
  const sinDias = ({ dias: _dias, ...resto }) => resto;
  const [actual, evol, topConsultas, topPaginas, extra] = await Promise.all([
    totales(projectId, desde, hasta),
    evolucion(projectId, desde, hasta, { tope }),
    top(projectId, desde, hasta, { tipo: 'consultas', limite, anterior: ant }),
    top(projectId, desde, hasta, { tipo: 'paginas', limite, anterior: ant }),
    comparar
      ? Promise.all([
        totales(projectId, ant.desde, ant.hasta),
        movimientos(projectId, desde, hasta, { tipo: 'consultas', limite }),
        movimientos(projectId, desde, hasta, { tipo: 'paginas', limite }),
      ])
      : null,
  ]);
  const informe = {
    periodo: { desde, hasta, dias_con_datos: actual.dias },
    total: sinDias(actual),
    evolucion: evol,
    consultas: { top: topConsultas },
    paginas: { top: topPaginas },
  };
  if (!extra) return informe;
  const [anterior, consultasMov, paginasMov] = extra;
  return {
    ...informe,
    anterior: { ...ant, dias_con_datos: anterior.dias, ...sinDias(anterior) },
    cambio: cambioEntre(actual, anterior),
    consultas: { top: topConsultas, ...consultasMov },
    paginas: { top: topPaginas, ...paginasMov },
  };
}
