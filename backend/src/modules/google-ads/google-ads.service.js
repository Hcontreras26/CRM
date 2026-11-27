import { query, getClient } from '../../shared/config/db.js';
import { logger } from '../../shared/utils/logger.js';
import { AppError } from '../../shared/utils/AppError.js';
import { getDecryptedValue } from '../credentials/credentials.model.js';
import { credencialParaDatos, buscar, consultas, deMicros, tokenDeAcceso } from './google-ads.client.js';

/**
 * Google Ads: campañas y gasto en el CRM (CRM#54). El molde es Meta Ads.
 *
 *   · `sincronizarProyecto` trae de Google la cuenta, sus campañas y el gasto
 *     por día de campañas, grupos y anuncios, y reescribe ese tramo (Google
 *     sigue ajustando conversiones de días pasados).
 *   · `campanas`, `grupos`, `anuncios` y `diario` lo leen y lo cruzan con los
 *     prospectos y las ventas del CRM con las reglas de «¿Dónde ponemos el
 *     dinero?» (#56): un prospecto cuenta el día que entró, una venta es la que
 *     ya tiene algún cobro y no es mensualidad, y lo cobrado sale de
 *     `conversion_payments`. Lo que importa es el COSTE POR VENTA, no por clic.
 *   · Un prospecto es de una campaña si su `utm_campaign` es el id de la
 *     campaña ({campaignid} en la plantilla de seguimiento de Google) o su nombre.
 */

export const SERVICIO = 'google_ads';
const TZ = process.env.APP_TIMEZONE || 'Europe/Madrid';
const ENTRADA = `(COALESCE(l.fecha_solicitud, l.created_at) AT TIME ZONE '${TZ}')::date`;

/** El interruptor de la sincronización periódica. Apagado de serie. */
export function syncActivo() {
  const v = String(process.env.GOOGLE_ADS_SYNC_ACTIVO || '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

/** Días que se traen la primera vez. */
export const DIAS_HISTORICO = 90;
/** Días que se repasan en cada vuelta: Google sigue atribuyendo conversiones. */
export const DIAS_REPASO = 7;

const dia = (d) => d.toISOString().slice(0, 10);
const haceDias = (n, ahora = new Date()) => dia(new Date(ahora.getTime() - n * 86400000));
const dinero = (n) => Number(Number(n || 0).toFixed(2));
const razon = (a, b) => (b > 0 ? Number((a / b).toFixed(2)) : null);

/** El campus al que se apunta una campaña: el asignado a mano o el de su cuenta. */
const CAMPUS = `COALESCE(c.project_id_asignado, c.project_id)`;

/** Los campus con credencial de Google Ads (solo la de producción). */
export async function proyectosConGoogleAds() {
  const { rows } = await query(
    `SELECT ac.project_id, p.nombre, g.customer_id, g.nombre AS cuenta, g.moneda,
            g.last_synced_at, g.last_status, g.last_error, g.backfill_done
       FROM api_credentials ac
       JOIN projects p ON p.id = ac.project_id
       LEFT JOIN google_ads_cuentas g ON g.project_id = ac.project_id
      WHERE ac.service = $1 AND ac.active = true
        AND COALESCE(ac.metadata->>'entorno', 'produccion') = 'produccion'
      ORDER BY p.nombre`,
    [SERVICIO]
  );
  return rows;
}

export async function credencialDe(projectId) {
  const valor = await getDecryptedValue(SERVICIO, projectId, { soloProduccion: true });
  if (!valor) throw new AppError('Este campus no tiene credencial de Google Ads', 404, 'GOOGLE_ADS_SIN_CREDENCIAL');
  return credencialParaDatos(valor);
}

async function guardarEstado(projectId, { cuenta = null, ok, error = null, backfill = null }) {
  await query(
    `INSERT INTO google_ads_cuentas (project_id, customer_id, nombre, moneda, zona_horaria, last_synced_at, last_status, last_error, backfill_done)
     VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 THEN NOW() END, $7, $8, COALESCE($9, false))
     ON CONFLICT (project_id) DO UPDATE SET
       customer_id    = COALESCE(EXCLUDED.customer_id, google_ads_cuentas.customer_id),
       nombre         = COALESCE(EXCLUDED.nombre, google_ads_cuentas.nombre),
       moneda         = COALESCE(EXCLUDED.moneda, google_ads_cuentas.moneda),
       zona_horaria   = COALESCE(EXCLUDED.zona_horaria, google_ads_cuentas.zona_horaria),
       last_synced_at = COALESCE(EXCLUDED.last_synced_at, google_ads_cuentas.last_synced_at),
       last_status    = EXCLUDED.last_status,
       last_error     = EXCLUDED.last_error,
       backfill_done  = COALESCE($9, google_ads_cuentas.backfill_done),
       updated_at     = NOW()`,
    [projectId, cuenta?.customerId ?? null, cuenta?.nombre ?? null, cuenta?.moneda ?? null, cuenta?.zona ?? null,
      ok, ok ? 'ok' : 'error', error ? String(error).slice(0, 1000) : null, backfill]
  );
}

/**
 * Una cuenta de Google Ads va en un solo campus. Si la misma cuenta estuviera en
 * dos, cada vuelta borraría el gasto del otro y le quitaría sus campañas. Para
 * que una campaña cuente en otro campus está `project_id_asignado`.
 * Devuelve el campus que ya la tiene, o null.
 */
export async function campusConLaCuenta(customerId, projectId) {
  if (!customerId) return null;
  // Solo cuenta el campus que AÚN tiene la credencial activa: google_ads_cuentas
  // no se borra nunca, y si la cuenta pasa del campus A al B (se quita o se
  // desactiva en A y se pega en B), B no debe quedar rechazado para siempre.
  const { rows } = await query(
    `SELECT g.project_id, p.nombre FROM google_ads_cuentas g
       JOIN projects p ON p.id = g.project_id
       JOIN api_credentials ac ON ac.project_id = g.project_id AND ac.service = $3 AND ac.active = true
        AND COALESCE(ac.metadata->>'entorno', 'produccion') = 'produccion'
      WHERE g.customer_id = $1 AND g.project_id <> $2 LIMIT 1`,
    [customerId, projectId, SERVICIO]
  );
  return rows[0] || null;
}

export function mensajeCuentaRepetida(customerId, otro) {
  return `La cuenta de Google Ads ${customerId} ya está en el campus «${otro.nombre}». Una cuenta va en un solo campus: `
    + 'para que una campaña cuente en otro, cámbiala de campus en Publicidad › Google Ads.';
}

/**
 * Google puede devolver dos filas con la misma clave en una tanda: se suman
 * aquí, antes de escribir, porque un `ON CONFLICT DO UPDATE` no puede tocar dos
 * veces la misma fila en la misma sentencia. Un anuncio en dos grupos son dos
 * filas: el grupo va en la clave.
 */
export function agrupar(filas) {
  const por = new Map();
  for (const f of filas) {
    const k = `${f.nivel}|${f.elemento_id}|${f.ad_group_id}|${f.fecha}`;
    const y = por.get(k);
    if (!y) { por.set(k, { ...f }); continue; }
    y.coste = dinero(y.coste + f.coste);
    y.impresiones += f.impresiones;
    y.clics += f.clics;
    y.conversiones = dinero(y.conversiones + f.conversiones);
    y.valor_conv = dinero(y.valor_conv + f.valor_conv);
    y.nombre = y.nombre || f.nombre;
  }
  return [...por.values()];
}

/** Las filas del diario de un nivel, ya planas. */
function aplanar(filas, nivel, { customerId, projectId }) {
  return filas.map((f) => {
    const m = f.metrics || {};
    const base = {
      nivel, fecha: f.segments?.date, campaign_id: String(f.campaign?.id),
      customer_id: customerId, project_id: projectId,
      coste: deMicros(m.costMicros), impresiones: Number(m.impressions || 0), clics: Number(m.clicks || 0),
      conversiones: dinero(m.conversions), valor_conv: dinero(m.conversionsValue),
    };
    if (nivel === 'campana') return { ...base, elemento_id: String(f.campaign?.id), ad_group_id: '', nombre: f.campaign?.name || null };
    if (nivel === 'grupo') return { ...base, elemento_id: String(f.adGroup?.id), ad_group_id: String(f.adGroup?.id), nombre: f.adGroup?.name || null };
    const ad = f.adGroupAd?.ad || {};
    return { ...base, elemento_id: String(ad.id), ad_group_id: String(f.adGroup?.id), nombre: ad.name || ad.type || null };
  });
}

/**
 * Trae de Google [desde, hasta] de un campus y reescribe ese tramo.
 * `buscarImpl` se pasa en las pruebas para no llamar a Google.
 */
export async function sincronizarProyecto(projectId, { desde, hasta, cred = null, buscarImpl = buscar } = {}) {
  const c = cred || await credencialDe(projectId);
  const otro = await campusConLaCuenta(c.customerId, projectId);
  if (otro) throw new AppError(mensajeCuentaRepetida(c.customerId, otro), 409, 'GOOGLE_ADS_CUENTA_REPETIDA');
  const q = consultas(desde, hasta);
  // El token se renueva una vez para las cinco consultas, no una por consulta.
  const token = buscarImpl === buscar ? await tokenDeAcceso(c) : null;
  const b = (gaql) => buscarImpl(c, gaql, { token });
  const [cuentaFilas, campanas, dCamp, dGrupos, dAnuncios] = await Promise.all([
    b(q.cuenta), b(q.campanas), b(q.diarioCampanas), b(q.diarioGrupos), b(q.diarioAnuncios),
  ]);
  const cu = cuentaFilas[0]?.customer || {};
  const cuenta = { customerId: c.customerId, nombre: cu.descriptiveName || null, moneda: cu.currencyCode || null, zona: cu.timeZone || null };
  const ctx = { customerId: c.customerId, projectId };
  const diario = agrupar([
    ...aplanar(dCamp, 'campana', ctx), ...aplanar(dGrupos, 'grupo', ctx), ...aplanar(dAnuncios, 'anuncio', ctx),
  ].filter((f) => f.fecha && f.elemento_id && f.elemento_id !== 'undefined'));

  // La foto de cada campaña; las borradas que gastaron en el tramo, con el nombre del diario.
  const fotos = new Map();
  for (const f of campanas) {
    const id = String(f.campaign?.id);
    fotos.set(id, {
      id, nombre: f.campaign?.name || id, estado: f.campaign?.status || null,
      tipo: f.campaign?.advertisingChannelType || null,
      presupuesto: f.campaignBudget?.amountMicros != null ? deMicros(f.campaignBudget.amountMicros) : null,
    });
  }
  for (const f of diario) {
    if (f.nivel === 'campana' && !fotos.has(f.campaign_id)) {
      fotos.set(f.campaign_id, { id: f.campaign_id, nombre: f.nombre || f.campaign_id, estado: 'REMOVED', tipo: null, presupuesto: null });
    }
  }
  const lista = [...fotos.values()];

  const cli = await getClient();
  try {
    await cli.query('BEGIN');
    if (lista.length) {
      // Si la campaña ya era de otra cuenta/campus, se queda con la cuenta nueva;
      // la asignación a mano (`project_id_asignado`) no se toca.
      await cli.query(
        `INSERT INTO google_ads_campanas (campaign_id, customer_id, project_id, nombre, estado, tipo, presupuesto_diario, synced_at)
         SELECT id, $1, $2, n, e, t, p, NOW()
           FROM unnest($3::text[], $4::text[], $5::text[], $6::text[], $7::numeric[]) AS x(id, n, e, t, p)
         ON CONFLICT (campaign_id) DO UPDATE SET
           customer_id = EXCLUDED.customer_id, project_id = EXCLUDED.project_id,
           nombre = EXCLUDED.nombre,
           estado = COALESCE(EXCLUDED.estado, google_ads_campanas.estado),
           tipo = COALESCE(EXCLUDED.tipo, google_ads_campanas.tipo),
           presupuesto_diario = COALESCE(EXCLUDED.presupuesto_diario, google_ads_campanas.presupuesto_diario),
           synced_at = NOW()`,
        [c.customerId, projectId, lista.map((x) => x.id), lista.map((x) => String(x.nombre).slice(0, 500)),
          lista.map((x) => x.estado), lista.map((x) => x.tipo), lista.map((x) => x.presupuesto)]
      );
    }
    await cli.query(`DELETE FROM google_ads_diario WHERE customer_id = $1 AND fecha BETWEEN $2 AND $3`, [c.customerId, desde, hasta]);
    if (diario.length) {
      await cli.query(
        `INSERT INTO google_ads_diario (nivel, elemento_id, fecha, campaign_id, ad_group_id, customer_id, project_id, nombre, coste, impresiones, clics, conversiones, valor_conv)
         SELECT nv, el, f, ca, ag, $1, $2, n, co, im, cl, cv, va
           FROM unnest($3::text[], $4::text[], $5::date[], $6::text[], $7::text[], $8::text[],
                       $9::numeric[], $10::bigint[], $11::bigint[], $12::numeric[], $13::numeric[])
             AS x(nv, el, f, ca, ag, n, co, im, cl, cv, va)
         ON CONFLICT (nivel, elemento_id, ad_group_id, fecha) DO UPDATE SET
           campaign_id = EXCLUDED.campaign_id, customer_id = EXCLUDED.customer_id,
           project_id = EXCLUDED.project_id, nombre = EXCLUDED.nombre,
           coste = EXCLUDED.coste, impresiones = EXCLUDED.impresiones, clics = EXCLUDED.clics,
           conversiones = EXCLUDED.conversiones, valor_conv = EXCLUDED.valor_conv, synced_at = NOW()`,
        [c.customerId, projectId,
          diario.map((f) => f.nivel), diario.map((f) => f.elemento_id), diario.map((f) => f.fecha),
          diario.map((f) => f.campaign_id), diario.map((f) => f.ad_group_id),
          diario.map((f) => (f.nombre ? String(f.nombre).slice(0, 500) : null)),
          diario.map((f) => f.coste), diario.map((f) => f.impresiones), diario.map((f) => f.clics),
          diario.map((f) => f.conversiones), diario.map((f) => f.valor_conv)]
      );
    }
    await cli.query('COMMIT');
  } catch (err) {
    await cli.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    cli.release();
  }
  return { cuenta, campanas: lista.length, filas: diario.length, desde, hasta };
}

/**
 * Una vuelta para un campus: la primera vez, DIAS_HISTORICO; después, los
 * últimos DIAS_REPASO o el hueco desde la última vez si estuvo parada. Nunca
 * lanza: el error queda en `google_ads_cuentas` y se devuelve `{ ok: false }`.
 */
export async function ponerAlDia(projectId, { ahora = new Date(), buscarImpl } = {}) {
  try {
    const { rows } = await query(`SELECT last_synced_at, backfill_done FROM google_ads_cuentas WHERE project_id = $1`, [projectId]);
    const prev = rows[0];
    let dias = DIAS_REPASO;
    if (!prev?.backfill_done) dias = DIAS_HISTORICO;
    else if (prev.last_synced_at) {
      const parado = Math.ceil((ahora - new Date(prev.last_synced_at)) / 86400000) + 1;
      dias = Math.min(DIAS_HISTORICO, Math.max(DIAS_REPASO, parado));
    }
    const r = await sincronizarProyecto(projectId, { desde: haceDias(dias, ahora), hasta: dia(ahora), buscarImpl });
    await guardarEstado(projectId, { cuenta: r.cuenta, ok: true, backfill: true });
    return { ok: true, ...r };
  } catch (err) {
    logger.warn({ projectId, err: err.message }, 'Google Ads: sincronización fallida');
    await guardarEstado(projectId, { ok: false, error: err.message }).catch(() => {});
    return { ok: false, error: err.message };
  }
}

/**
 * Prospectos, ventas, vendido y cobrado por campaña de un campus, en el periodo.
 * Clave: el id de la campaña de Google (por id o por nombre en utm_campaign).
 */
async function crmPorCampana(projectId, desde, hasta) {
  const { rows } = await query(
    `WITH camp AS (
       SELECT c.campaign_id, lower(c.nombre) AS nombre FROM google_ads_campanas c WHERE ${CAMPUS} = $1
     ),
     base AS (
       SELECT DISTINCT ON (l.id) l.id AS lead_id, camp.campaign_id
         FROM leads l
         JOIN lead_utms lu ON lu.lead_id = l.id
         JOIN camp ON camp.campaign_id = NULLIF(lu.utm_campaign, '') OR camp.nombre = lower(NULLIF(lu.utm_campaign, ''))
        WHERE l.deleted_at IS NULL AND l.project_id = $1
          AND ${ENTRADA} >= $2::date AND ${ENTRADA} <= $3::date
        ORDER BY l.id, (camp.campaign_id = lu.utm_campaign) DESC
     ),
     venta AS (
       SELECT b.lead_id, c.id AS conversion_id, c.importe_total,
              (SELECT COALESCE(SUM(cp.importe), 0) FROM conversion_payments cp WHERE cp.conversion_id = c.id) AS cobrado
         FROM base b
         JOIN conversions c ON c.lead_id = b.lead_id AND NOT c.es_mensualidad
        WHERE EXISTS (SELECT 1 FROM conversion_payments x WHERE x.conversion_id = c.id)
     )
     SELECT b.campaign_id, COUNT(DISTINCT b.lead_id)::int AS leads, COUNT(v.conversion_id)::int AS ventas,
            COALESCE(SUM(v.importe_total), 0)::numeric AS vendido, COALESCE(SUM(v.cobrado), 0)::numeric AS cobrado
       FROM base b LEFT JOIN venta v ON v.lead_id = b.lead_id
      GROUP BY b.campaign_id`,
    [projectId, desde, hasta]
  );
  return new Map(rows.map((r) => [r.campaign_id, r]));
}

const conRatios = (f) => ({
  ...f,
  ctr: f.impresiones > 0 ? Number(((f.clics / f.impresiones) * 100).toFixed(2)) : null,
  cpc: razon(f.coste, f.clics),
  coste_por_lead: razon(f.coste, f.leads),
  coste_por_venta: razon(f.coste, f.ventas),
  retorno: dinero(f.cobrado - f.coste),
});

/** Las campañas de un campus con su gasto y lo que han traído al CRM. */
export async function campanas(projectId, desde, hasta) {
  const [{ rows: filas }, crm, { rows: cuenta }] = await Promise.all([
    query(
      `SELECT c.campaign_id, c.nombre, c.estado, c.tipo, c.presupuesto_diario, c.customer_id,
              c.project_id, c.project_id_asignado,
              COALESCE(SUM(d.coste), 0)::numeric AS coste, COALESCE(SUM(d.impresiones), 0)::bigint AS impresiones,
              COALESCE(SUM(d.clics), 0)::bigint AS clics, COALESCE(SUM(d.conversiones), 0)::numeric AS conversiones
         FROM google_ads_campanas c
         LEFT JOIN google_ads_diario d ON d.nivel = 'campana' AND d.elemento_id = c.campaign_id
                                      AND d.fecha BETWEEN $2::date AND $3::date
        WHERE ${CAMPUS} = $1
        GROUP BY c.campaign_id`,
      [projectId, desde, hasta]
    ),
    crmPorCampana(projectId, desde, hasta),
    query(`SELECT customer_id, nombre, moneda, last_synced_at, last_status, last_error FROM google_ads_cuentas WHERE project_id = $1`, [projectId]),
  ]);
  const lista = filas.map((f) => {
    const c = crm.get(f.campaign_id) || {};
    return conRatios({
      campaign_id: f.campaign_id, nombre: f.nombre, estado: f.estado, tipo: f.tipo,
      presupuesto_diario: f.presupuesto_diario != null ? dinero(f.presupuesto_diario) : null,
      asignada_a_mano: f.project_id_asignado != null,
      coste: dinero(f.coste), impresiones: Number(f.impresiones), clics: Number(f.clics), conversiones_google: dinero(f.conversiones),
      leads: c.leads || 0, ventas: c.ventas || 0, vendido: dinero(c.vendido), cobrado: dinero(c.cobrado),
    });
  }).filter((f) => f.coste || f.leads || f.estado === 'ENABLED')
    .sort((a, b) => (b.coste - a.coste) || (b.leads - a.leads));

  const suma = (k) => lista.reduce((s, f) => s + f[k], 0);
  const total = conRatios({
    coste: dinero(suma('coste')), impresiones: suma('impresiones'), clics: suma('clics'),
    conversiones_google: dinero(suma('conversiones_google')),
    leads: suma('leads'), ventas: suma('ventas'), vendido: dinero(suma('vendido')), cobrado: dinero(suma('cobrado')),
  });
  return { periodo: { desde, hasta }, cuenta: cuenta[0] || null, total, campanas: lista };
}

/** Gasto, clics y prospectos por día de un campus (huecos = sin dato). */
export async function diario(projectId, desde, hasta) {
  const { rows } = await query(
    `SELECT d.fecha::text AS fecha, SUM(d.coste)::numeric AS coste, SUM(d.clics)::bigint AS clics,
            SUM(d.impresiones)::bigint AS impresiones
       FROM google_ads_diario d JOIN google_ads_campanas c ON c.campaign_id = d.campaign_id
      WHERE d.nivel = 'campana' AND ${CAMPUS} = $1 AND d.fecha BETWEEN $2::date AND $3::date
      GROUP BY d.fecha ORDER BY d.fecha`,
    [projectId, desde, hasta]
  );
  return rows.map((r) => ({ fecha: r.fecha, coste: dinero(r.coste), clics: Number(r.clics), impresiones: Number(r.impresiones) }));
}

/** La campaña tiene que ser del campus pedido; si no, 404 (no se dice si existe). */
async function campanaDelCampus(campaignId, projectId) {
  const { rows } = await query(`SELECT campaign_id FROM google_ads_campanas c WHERE c.campaign_id = $1 AND ${CAMPUS} = $2`, [campaignId, projectId]);
  if (!rows[0]) throw new AppError('Campaña no encontrada en este campus', 404, 'NOT_FOUND');
}

async function porNivel(nivel, filtro, valor, desde, hasta) {
  const { rows } = await query(
    `SELECT d.elemento_id AS id, d.ad_group_id, MAX(d.nombre) AS nombre,
            SUM(d.coste)::numeric AS coste, SUM(d.impresiones)::bigint AS impresiones,
            SUM(d.clics)::bigint AS clics, SUM(d.conversiones)::numeric AS conversiones
       FROM google_ads_diario d
      WHERE d.nivel = $1 AND d.${filtro} = $2 AND d.fecha BETWEEN $3::date AND $4::date
      GROUP BY d.elemento_id, d.ad_group_id
      ORDER BY SUM(d.coste) DESC`,
    [nivel, valor, desde, hasta]
  );
  return rows.map((r) => ({
    id: r.id, ad_group_id: r.ad_group_id, nombre: r.nombre || r.id,
    coste: dinero(r.coste), impresiones: Number(r.impresiones), clics: Number(r.clics), conversiones_google: dinero(r.conversiones),
    ctr: Number(r.impresiones) > 0 ? Number(((Number(r.clics) / Number(r.impresiones)) * 100).toFixed(2)) : null,
    cpc: razon(dinero(r.coste), Number(r.clics)),
  }));
}

/** Grupos de anuncios de una campaña (y sus anuncios dentro). */
export async function grupos(projectId, campaignId, desde, hasta) {
  await campanaDelCampus(campaignId, projectId);
  const [gs, ads] = await Promise.all([
    porNivel('grupo', 'campaign_id', campaignId, desde, hasta),
    porNivel('anuncio', 'campaign_id', campaignId, desde, hasta),
  ]);
  return gs.map((g) => ({ ...g, anuncios: ads.filter((a) => a.ad_group_id === g.id) }));
}

/**
 * Asociar una campaña a otro campus (o devolverla al de su cuenta con null).
 * Quien asigna tiene que poder ver los dos campus: la ruta comprueba
 * `projectId` (el de ahora) y el controlador, `destino`.
 */
export async function asignarCampus(projectId, campaignId, destino, userId) {
  await campanaDelCampus(campaignId, projectId);
  if (destino != null) {
    const { rows } = await query(`SELECT id FROM projects WHERE id = $1`, [destino]);
    if (!rows[0]) throw new AppError('Ese campus no existe', 404, 'NOT_FOUND');
  }
  const { rows } = await query(
    `UPDATE google_ads_campanas
        SET project_id_asignado = CASE WHEN $2::int IS NULL OR $2::int = project_id THEN NULL ELSE $2::int END,
            asignado_por = $3
      WHERE campaign_id = $1
      RETURNING campaign_id, project_id, project_id_asignado`,
    [campaignId, destino, userId]
  );
  return rows[0];
}

/**
 * Para «¿Dónde ponemos el dinero?» (#56): gasto de Google Ads por campaña en el
 * periodo, de los campus pedidos (`lista`) o de todos los reales.
 */
export async function gastoPorCampana(filtroProyecto, params, desde, hasta) {
  const { rows } = await query(
    `SELECT d.campaign_id, c.nombre, COALESCE(SUM(d.coste), 0)::numeric AS gasto
       FROM google_ads_diario d
       JOIN google_ads_campanas c ON c.campaign_id = d.campaign_id
      WHERE d.nivel = 'campana' AND d.fecha >= $1::date AND d.fecha <= $2::date AND ${filtroProyecto(CAMPUS)}
      GROUP BY d.campaign_id, c.nombre`,
    [desde, hasta, ...params]
  );
  return rows;
}

/**
 * Para la herramienta del MCP (#1195): si el campus tiene Google Ads conectado,
 * su cuenta y el último día con gasto guardado. Todo filtrado por ESE campus
 * (no la lista de `proyectosConGoogleAds`, que es de todos).
 */
export async function estadoDelCampus(projectId) {
  const [{ rows: [cred] }, { rows: [cuenta] }, { rows: [u] }] = await Promise.all([
    query(
      `SELECT 1 AS hay FROM api_credentials
        WHERE service = $1 AND project_id = $2 AND active = true
          AND COALESCE(metadata->>'entorno', 'produccion') = 'produccion'
        LIMIT 1`,
      [SERVICIO, projectId]
    ),
    query(`SELECT customer_id, nombre, moneda, last_synced_at, last_status FROM google_ads_cuentas WHERE project_id = $1`, [projectId]),
    query(
      `SELECT to_char(MAX(d.fecha), 'YYYY-MM-DD') AS ultimo
         FROM google_ads_diario d JOIN google_ads_campanas c ON c.campaign_id = d.campaign_id
        WHERE d.nivel = 'campana' AND ${CAMPUS} = $1`,
      [projectId]
    ),
  ]);
  return {
    conectado: Boolean(cred?.hay),
    cuenta: cuenta ? { customer_id: cuenta.customer_id, nombre: cuenta.nombre, moneda: cuenta.moneda } : null,
    ultima_sincronizacion: cuenta?.last_synced_at ? new Date(cuenta.last_synced_at).toISOString() : null,
    estado_sincronizacion: cuenta?.last_status || null,
    ultimo_dia: u?.ultimo || null,
  };
}

/** El periodo por defecto de la pantalla «Google Ads»: de hace 30 días a ayer. */
export function periodoPorDefecto({ desde = null, hasta = null, ahora = new Date() } = {}) {
  return { desde: desde || haceDias(30, ahora), hasta: hasta || haceDias(1, ahora) };
}
