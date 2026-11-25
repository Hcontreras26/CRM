import { query } from '../../shared/config/db.js';
import { comoLista, SIN_PRUEBAS } from '../../shared/utils/ambito.js';
import { CANAL_DE_ORIGEN } from './report.model.js';
import { gastoPorCampana as gastoGoogleAds } from '../google-ads/google-ads.service.js';

/**
 * «¿Dónde ponemos el dinero el mes que viene?» (#56).
 *
 * Una tabla por canal —gasto, prospectos, ventas, cobrado, coste por venta—, lo
 * mismo por campaña dentro de cada canal, y contra el periodo anterior: un
 * número solo significa algo comparado. Incluye los canales SIN gasto (orgánico,
 * ChatGPT, referidos, WhatsApp), que suelen ser los que mejor convierten y
 * quedan fuera de todo panel de publicidad.
 *
 * LA REGLA DEL DINERO. Lo cobrado sale de `conversion_payments`, nunca de
 * `importe_pagado`; una venta es la que ya tiene algún cobro y no es una
 * mensualidad (la regla de «Ventas»). Si esta pantalla dijera una cifra y
 * Finanzas otra, dejaría de usarse.
 *
 * COHORTE. Se miran los prospectos que ENTRARON en el periodo y lo que han
 * vendido y cobrado —hasta hoy— esos mismos prospectos (es lo que responde «qué
 * trajo dinero»; mirar solo lo cobrado dentro del mes deja en pérdidas a lo que
 * se compró hace seis semanas). Como contrapartida, el periodo anterior ha tenido
 * MÁS tiempo para cobrar, y la pantalla lo avisa.
 *
 * EL GASTO. Hay gasto de Meta (`meta_campaigns_daily`) y, desde la #54, de
 * Google Ads (`google_ads_diario`), pero Google solo cuenta como «con gasto»
 * cuando alguno de los campus mirados tiene la cuenta sincronizada: sin eso sale
 * con `gasto: null` —«sin dato»— y NO con cero, que diría que no cuesta nada.
 * Igual TikTok, que no está conectado.
 */

const TZ = process.env.APP_TIMEZONE || 'Europe/Madrid';
const ENTRADA = `(COALESCE(l.fecha_solicitud, l.created_at) AT TIME ZONE '${TZ}')::date`;

/** Canales de los que SIEMPRE hay gasto en el CRM. El resto no tiene dato (no es cero). */
export const CANALES_CON_GASTO = ['meta_ads'];

/**
 * Los canales con gasto para los campus mirados: Meta siempre; Google Ads si
 * alguno tiene la cuenta de Google Ads sincronizada al menos una vez (#54).
 */
async function canalesConGasto(lista) {
  const params = [];
  let proyecto;
  if (lista) { params.push(lista); proyecto = `g.project_id = ANY($1::int[])`; } else proyecto = SIN_PRUEBAS('g.project_id');
  try {
    const { rows } = await query(`SELECT EXISTS (SELECT 1 FROM google_ads_cuentas g WHERE g.backfill_done AND ${proyecto}) AS hay`, params);
    return rows[0]?.hay ? [...CANALES_CON_GASTO, 'google_ads'] : CANALES_CON_GASTO;
  } catch (err) {
    // Sin la migración 335 la tabla no existe: el panel sigue como antes.
    if (err.code === '42P01') return CANALES_CON_GASTO;
    throw err;
  }
}
/** Canales que cuestan dinero (aunque el CRM aún no tenga su gasto): no son «sin gasto», son «sin conectar». */
export const CANALES_DE_PAGO = ['meta_ads', 'google_ads', 'tiktok_ads'];

const diaSiguiente = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const diasEntre = (desde, hasta) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86400000) + 1;

/** El periodo anterior, de la misma duración y pegado al de antes. */
export function periodoAnterior(desde, hasta) {
  const n = diasEntre(desde, hasta);
  return { from: diaSiguiente(desde, -n), to: diaSiguiente(desde, -1) };
}

const dinero = (n) => Number(Number(n || 0).toFixed(2));
const razon = (a, b) => (b > 0 ? Number((a / b).toFixed(2)) : null);

/** Prospectos, ventas y cobrado por canal y por campaña de UN periodo. */
async function dePeriodo(lista, desde, hasta) {
  const params = [desde, hasta];
  let proyecto;
  if (lista) { params.push(lista); proyecto = `l.project_id = ANY($3::int[])`; } else proyecto = SIN_PRUEBAS('l.project_id');
  const { rows } = await query(
    `WITH base AS (
       SELECT l.id AS lead_id, ${CANAL_DE_ORIGEN} AS canal, NULLIF(lu.utm_campaign, '') AS campana
         FROM leads l LEFT JOIN lead_utms lu ON lu.lead_id = l.id
        WHERE l.deleted_at IS NULL AND ${proyecto}
          AND ${ENTRADA} >= $1::date AND ${ENTRADA} <= $2::date
     ),
     venta AS (
       SELECT b.lead_id, c.id AS conversion_id, c.importe_total,
              (SELECT COALESCE(SUM(cp.importe), 0) FROM conversion_payments cp WHERE cp.conversion_id = c.id) AS cobrado
         FROM base b
         JOIN conversions c ON c.lead_id = b.lead_id AND NOT c.es_mensualidad
        WHERE EXISTS (SELECT 1 FROM conversion_payments x WHERE x.conversion_id = c.id)
     )
     SELECT b.canal, b.campana, GROUPING(b.campana)::int AS es_canal,
            COUNT(DISTINCT b.lead_id)::int AS leads,
            COUNT(v.conversion_id)::int AS ventas,
            COALESCE(SUM(v.importe_total), 0)::numeric AS vendido,
            COALESCE(SUM(v.cobrado), 0)::numeric AS cobrado
       FROM base b LEFT JOIN venta v ON v.lead_id = b.lead_id
      GROUP BY GROUPING SETS ((b.canal), (b.canal, b.campana))`,
    params
  );
  return rows;
}

/** Gasto de Meta del periodo, por campaña. */
async function gastoMeta(lista, desde, hasta) {
  const params = [desde, hasta];
  let proyecto;
  if (lista) { params.push(lista); proyecto = `d.project_id = ANY($3::int[])`; } else proyecto = SIN_PRUEBAS('d.project_id');
  const { rows } = await query(
    `SELECT d.campaign_id, mc.nombre, COALESCE(SUM(d.spend), 0)::numeric AS gasto
       FROM meta_campaigns_daily d
       JOIN meta_campaigns mc ON mc.campaign_id = d.campaign_id
      WHERE d.date >= $1::date AND d.date <= $2::date AND ${proyecto}
      GROUP BY d.campaign_id, mc.nombre`,
    params
  );
  return rows;
}

/** Gasto de Google Ads del periodo, por campaña (del campus al que se apunta cada una). */
function gastoGoogle(lista, desde, hasta) {
  return gastoGoogleAds(
    (campus) => (lista ? `${campus} = ANY($3::int[])` : SIN_PRUEBAS(campus)),
    lista ? [lista] : [], desde, hasta
  );
}

async function nombresDeCampana(ids) {
  if (!ids.length) return new Map();
  const { rows } = await query(`SELECT campaign_id, nombre FROM meta_campaigns WHERE campaign_id = ANY($1::text[])`, [ids]);
  return new Map(rows.map((r) => [r.campaign_id, r.nombre]));
}

/**
 * Las filas de un periodo ya ordenadas: { canales: Map(canal → fila), campanas:
 * Map(canal → Map(campaña → fila)) }, con el gasto puesto donde lo hay.
 */
async function resumenDelPeriodo(lista, desde, hasta, conGasto) {
  const conGoogle = conGasto.includes('google_ads');
  const [filas, gasto, google] = await Promise.all([
    dePeriodo(lista, desde, hasta), gastoMeta(lista, desde, hasta),
    conGoogle ? gastoGoogle(lista, desde, hasta) : [],
  ]);
  const canales = new Map();
  const campanas = new Map();
  for (const r of filas) {
    const fila = { leads: r.leads, ventas: r.ventas, vendido: dinero(r.vendido), cobrado: dinero(r.cobrado), gasto: null, nombre: null };
    if (r.es_canal) canales.set(r.canal, fila);
    else {
      if (!campanas.has(r.canal)) campanas.set(r.canal, new Map());
      campanas.get(r.canal).set(r.campana, fila);
    }
  }
  // Gasto de Meta: al canal entero (aunque la campaña no haya traído ningún
  // prospecto al CRM) y a cada campaña.
  const totalMeta = gasto.reduce((s, g) => s + Number(g.gasto), 0);
  if (!canales.has('meta_ads')) canales.set('meta_ads', { leads: 0, ventas: 0, vendido: 0, cobrado: 0, gasto: null, nombre: null });
  canales.get('meta_ads').gasto = dinero(totalMeta);
  if (!campanas.has('meta_ads')) campanas.set('meta_ads', new Map());
  for (const g of gasto) {
    const m = campanas.get('meta_ads');
    if (!m.has(g.campaign_id)) m.set(g.campaign_id, { leads: 0, ventas: 0, vendido: 0, cobrado: 0, gasto: null, nombre: null });
    Object.assign(m.get(g.campaign_id), { gasto: dinero(g.gasto), nombre: g.nombre });
  }
  if (conGoogle) ponerGastoGoogle(canales, campanas, google);
  return { canales, campanas };
}

/**
 * El gasto de Google Ads, igual que el de Meta. La `utm_campaign` de un prospecto
 * de Google puede ser el id de la campaña ({campaignid}) o su nombre: los que
 * vienen con el nombre se juntan con su id para que gasto y ventas caigan en la
 * misma fila.
 */
function ponerGastoGoogle(canales, campanas, google) {
  const nueva = () => ({ leads: 0, ventas: 0, vendido: 0, cobrado: 0, gasto: null, nombre: null });
  if (!canales.has('google_ads')) canales.set('google_ads', nueva());
  canales.get('google_ads').gasto = dinero(google.reduce((s, g) => s + Number(g.gasto), 0));
  const previas = campanas.get('google_ads') || new Map();
  const porNombre = new Map(google.map((g) => [String(g.nombre || '').toLowerCase(), g.campaign_id]));
  const m = new Map();
  for (const [clave, f] of previas) {
    const id = google.some((g) => g.campaign_id === clave) ? clave : (porNombre.get(String(clave || '').toLowerCase()) || clave);
    const a = m.get(id);
    if (!a) m.set(id, { ...f });
    else Object.assign(a, { leads: a.leads + f.leads, ventas: a.ventas + f.ventas, vendido: dinero(a.vendido + f.vendido), cobrado: dinero(a.cobrado + f.cobrado) });
  }
  for (const g of google) {
    if (!m.has(g.campaign_id)) m.set(g.campaign_id, nueva());
    Object.assign(m.get(g.campaign_id), { gasto: dinero(g.gasto), nombre: g.nombre });
  }
  campanas.set('google_ads', m);
}

const conRatios = (f) => ({
  ...f,
  coste_por_lead: f.gasto != null ? razon(f.gasto, f.leads) : null,
  coste_por_venta: f.gasto != null ? razon(f.gasto, f.ventas) : null,
  retorno: f.gasto != null ? dinero(f.cobrado - f.gasto) : null,
});

/**
 * @param {{ projectId?: number|null, projectIds?: number[]|null, from: string, to: string }} p
 */
export async function dineroPorCanal({ projectId = null, projectIds = null, from, to }) {
  const lista = comoLista(projectId, projectIds);
  const anterior = periodoAnterior(from, to);
  const conGasto = await canalesConGasto(lista);
  const [ahora, antes] = await Promise.all([
    resumenDelPeriodo(lista, from, to, conGasto),
    resumenDelPeriodo(lista, anterior.from, anterior.to, conGasto),
  ]);

  // Los nombres de las campañas que no son de Meta (o que vienen sin gasto) salen
  // de la propia UTM; las de Meta con id suelto, de su tabla.
  const idsMeta = [...(ahora.campanas.get('meta_ads')?.keys() || [])];
  const nombres = await nombresDeCampana(idsMeta);

  const todos = new Set([...ahora.canales.keys(), ...antes.canales.keys()]);
  const vacio = { leads: 0, ventas: 0, vendido: 0, cobrado: 0, gasto: null };
  const canales = [...todos].map((canal) => {
    const a = ahora.canales.get(canal) || { ...vacio, gasto: conGasto.includes(canal) ? 0 : null };
    const p = antes.canales.get(canal) || { ...vacio, gasto: conGasto.includes(canal) ? 0 : null };
    const nombresCamp = ahora.campanas.get(canal) || new Map();
    const campanas = [...nombresCamp.entries()].map(([id, f]) => ({
      ...conRatios(f),
      campana: id,
      nombre: f.nombre || nombres.get(id) || id,
    })).sort((x, y) => (y.cobrado - x.cobrado) || ((y.gasto || 0) - (x.gasto || 0)) || (y.leads - x.leads)).slice(0, 15);
    return {
      canal,
      tiene_gasto: conGasto.includes(canal),
      es_de_pago: CANALES_DE_PAGO.includes(canal),
      ...conRatios(a),
      anterior: conRatios(p),
      campanas,
    };
  }).filter((c) => c.leads || c.ventas || c.cobrado || c.gasto || c.anterior.leads || c.anterior.cobrado || c.anterior.gasto)
    .sort((x, y) => (y.cobrado - x.cobrado) || (y.leads - x.leads));

  // El total solo suma el gasto que se conoce: si falta el de Google Ads, el
  // coste por venta total sería mentira, así que se avisa con `gasto_completo`.
  const suma = (fn) => canales.reduce((s, c) => s + fn(c), 0);
  const total = {
    leads: suma((c) => c.leads), ventas: suma((c) => c.ventas),
    vendido: dinero(suma((c) => c.vendido)), cobrado: dinero(suma((c) => c.cobrado)),
    gasto: dinero(suma((c) => c.gasto || 0)),
  };
  const totalAnterior = {
    leads: suma((c) => c.anterior.leads), ventas: suma((c) => c.anterior.ventas),
    cobrado: dinero(suma((c) => c.anterior.cobrado)), gasto: dinero(suma((c) => c.anterior.gasto || 0)),
  };
  // El coste por venta del total se calcula SOLO con las ventas de los canales con
  // gasto conocido: dividir el gasto de Meta entre las ventas de ChatGPT o de
  // WhatsApp (que no costaron nada) daría un coste que no es de nadie. Aparte va
  // el «mezclado» (todo el gasto entre todas las ventas), por si se quiere.
  const ventasConGasto = (lista) => lista.filter((c) => c.tiene_gasto).reduce((s, c) => s + c.ventas, 0);
  const ventasConGastoAntes = canales.filter((c) => c.tiene_gasto).reduce((s, c) => s + c.anterior.ventas, 0);
  return {
    periodo: { from, to },
    anterior,
    canales_con_gasto: conGasto,
    // Hay canales de pago de los que no se conoce el gasto (Google Ads, TikTok…).
    gasto_completo: !canales.some((c) => CANALES_DE_PAGO.includes(c.canal) && !c.tiene_gasto && c.leads > 0),
    total: { ...total, coste_por_venta: razon(total.gasto, ventasConGasto(canales)), coste_mezclado: razon(total.gasto, total.ventas) },
    total_anterior: {
      ...totalAnterior,
      coste_por_venta: razon(totalAnterior.gasto, ventasConGastoAntes),
      coste_mezclado: razon(totalAnterior.gasto, totalAnterior.ventas),
    },
    canales,
  };
}
