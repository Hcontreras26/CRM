import { query, getClient } from '../../shared/config/db.js';
import { logger } from '../../shared/utils/logger.js';
import { AppError } from '../../shared/utils/AppError.js';
import { getDecryptedValue } from '../credentials/credentials.model.js';
import { leerCredencial, analitica, inspeccionar, partirUrl, esDelSitio } from './search-console.client.js';

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

/** El interruptor de la sincronización periódica. Apagado de serie. */
export function syncActivo() {
  const v = String(process.env.GSC_SYNC_ACTIVO || '').trim().toLowerCase();
  return v === '1' || v === 'true';
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
            s.last_synced_at, s.last_status, s.last_error, s.backfill_done, s.indexacion_at
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

async function totales(projectId, desde, hasta) {
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
