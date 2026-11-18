import * as model from './ia.model.js';
import { AppError } from '../../shared/utils/AppError.js';
import { getDecryptedValue } from '../credentials/credentials.model.js';
import { logger } from '../../shared/utils/logger.js';
import * as gastoIA from '../../shared/services/gastoIA.service.js';
import { urlDeStripe } from '../../shared/config/stripeApi.js';
import * as supabaseIA from './supabase.service.js';
import { agrupaPorMotivo, comentarios } from './motivosDeBaja.js';

async function getStripeKey(projectId) {
  try {
    const perProject = await getDecryptedValue('stripe', projectId);
    if (perProject) return perProject;
    const global = await getDecryptedValue('stripe', null);
    if (global) return global;
  } catch {}
  return process.env.STRIPE_SECRET_KEY || null;
}

// Calcula metricas live llamando Stripe (sin SDK, fetch directo)
async function fetchStripeMetrics(apiKey) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  // Subscripciones activas (max 100, paginar)
  let active = []; let starting_after = null; let page = 0;
  while (page++ < 5) {
    const url = new URL(urlDeStripe('/v1/subscriptions'));
    url.searchParams.set('status', 'active');
    url.searchParams.set('limit', '100');
    url.searchParams.set('expand[]', 'data.items');
    if (starting_after) url.searchParams.set('starting_after', starting_after);
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error(`Stripe ${r.status}`);
    const j = await r.json();
    active = active.concat(j.data || []);
    if (!j.has_more) break;
    starting_after = j.data[j.data.length - 1]?.id;
  }
  // MRR (sumar items.price.unit_amount * quantity, normalizar por interval)
  let mrr = 0;
  for (const sub of active) {
    for (const item of sub.items?.data || []) {
      const amount = (item.price?.unit_amount || 0) / 100;
      const qty = item.quantity || 1;
      const interval = item.price?.recurring?.interval;
      const intervalCount = item.price?.recurring?.interval_count || 1;
      let monthly = amount * qty;
      if (interval === 'year') monthly = monthly / (12 * intervalCount);
      else if (interval === 'week') monthly = monthly * (4 / intervalCount);
      else if (interval === 'day') monthly = monthly * (30 / intervalCount);
      else monthly = monthly / intervalCount;
      mrr += monthly;
    }
  }
  // New / cancelled del mes
  const now = new Date();
  const monthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
  const newSubsRes = await fetch(`${urlDeStripe('/v1/subscriptions')}?created[gte]=${monthStart}&limit=100`, { headers });
  const newSubsJ = newSubsRes.ok ? await newSubsRes.json() : { data: [] };
  const newSubs = (newSubsJ.data || []).length;
  // Las canceladas del mes. Se piden con `cancellation_details` porque ahi
  // viene POR QUE se fueron, que es la unica cifra de retencion accionable:
  // que el churn sea del 8 % no se puede arreglar; que cuatro de cada diez
  // digan «no lo uso suficiente», si.
  const cancelledRes = await fetch(`${urlDeStripe('/v1/subscriptions')}?status=canceled&canceled_at[gte]=${monthStart}&limit=100`, { headers });
  const cancelledJ = cancelledRes.ok ? await cancelledRes.json() : { data: [] };
  const canceladas = cancelledJ.data || [];
  const cancelledSubs = canceladas.length;
  // Failed payments (charges del mes con status failed)
  const failedRes = await fetch(`${urlDeStripe('/v1/charges')}?created[gte]=${monthStart}&limit=100`, { headers });
  const failedJ = failedRes.ok ? await failedRes.json() : { data: [] };
  const failedPayments = (failedJ.data || []).filter(c => c.status === 'failed').length;
  // Churn = cancelled / active mes anterior (aproximado: usar active actual)
  const churnRate = active.length > 0 ? (cancelledSubs / active.length) * 100 : 0;
  return {
    mrr: Math.round(mrr * 100) / 100,
    activeSubs: active.length,
    newSubs, cancelledSubs, failedPayments,
    churnRate: Math.round(churnRate * 100) / 100,
    porQueSeVan: agrupaPorMotivo(canceladas),
    // Los escritos a mano van aparte y sin agregar: son de cada persona.
    comentariosDeBaja: comentarios(canceladas).slice(0, 20),
  };
}

export async function getMetrics(req, res, next) {
  try {
    const projectId = parseInt(req.params.projectId);
    if (!projectId) throw new AppError('projectId requerido', 400, 'PROJECT_REQUIRED');
    const key = await getStripeKey(projectId);
    let metrics = null;
    let warning = null;
    if (key) {
      try {
        metrics = await fetchStripeMetrics(key);
      } catch (err) {
        logger.warn({ err: err.message }, 'Stripe fetch failed');
        warning = `Error consultando Stripe: ${err.message}`;
      }
    } else {
      warning = 'STRIPE_API_KEY no configurada. Configura en Settings > APIs (proyecto) o en .env del servidor.';
    }
    // Evolucion 12 meses desde snapshots
    const snaps = await model.listSnapshots(projectId, 12);
    const evolution12Months = snaps.map(s => ({
      mes: s.mes,
      mrr: Number(s.mrr),
      activeSubs: s.active_subs,
      newSubs: s.new_subs,
      cancelledSubs: s.cancelled_subs,
      churnRate: Number(s.churn_rate),
    }));
    res.json({
      success: true,
      data: {
        ...(metrics || { mrr: 0, activeSubs: 0, newSubs: 0, cancelledSubs: 0, failedPayments: 0, churnRate: 0,
          porQueSeVan: { total: 0, motivos: [] }, comentariosDeBaja: [] }),
        evolution12Months,
        warning,
        api_configured: !!key,
      },
    });
  } catch (err) { next(err); }
}

/**
 * Cuanto lleva gastado la IA este mes y cuanto queda (#22).
 *
 * Existe para que «¿esta puesto el tope?» se pueda contestar mirando, no
 * leyendo el codigo ni el .env del servidor. `instalado: false` quiere decir
 * que falta la migracion 145 y que por tanto NO hay tope — no que el gasto sea
 * cero.
 */
export async function getGasto(req, res, next) {
  try {
    res.json({ success: true, data: await gastoIA.estado() });
  } catch (err) { next(err); }
}

// ─── Supabase de los proyectos IA (#44) ──────────────────────────────────

/** El id del proyecto, comprobado. Sin esto un id con letras llega a Postgres
 *  como NaN y sale un 500 donde deberia salir un 400. */
function idDelProyecto(req) {
  const n = Number(req.params.projectId);
  if (!Number.isInteger(n) || n <= 0) {
    throw new AppError('projectId invalido', 400, 'BAD_PROJECT_ID');
  }
  return n;
}

export async function previoSupabase(req, res, next) {
  try {
    res.json({ success: true, data: await supabaseIA.previo(idDelProyecto(req)) });
  } catch (e) { next(e); }
}

export async function importarSupabase(req, res, next) {
  try {
    // `soloProbar` cuenta lo que haria sin escribir nada. La pantalla lo usa
    // para poder enseñar el numero ANTES de que alguien pulse de verdad.
    const soloProbar = req.query.soloProbar === 'true' || req.body?.soloProbar === true;
    res.json({ success: true, data: await supabaseIA.importar(idDelProyecto(req), { soloProbar, usuarioId: req.user?.userId || null }) });
  } catch (e) { next(e); }
}

/**
 * POST /api/ia/supabase/quitar-pruebas/:projectId
 *
 * Quita las ventas que eran pruebas. Con `soloProbar` dice cuantas quitaria
 * sin tocar nada -- que es como hay que mirarlo la primera vez.
 */
export async function quitarPruebasSupabase(req, res, next) {
  try {
    const soloProbar = req.query.soloProbar === 'true' || req.body?.soloProbar === true;
    res.json({ success: true, data: await supabaseIA.quitarLasDePrueba(idDelProyecto(req), { soloProbar }) });
  } catch (err) { next(err); }
}

/**
 * GET /api/ia/cobros/:projectId?tipo=&plan=&q=&desde=&hasta=&page=&limit=
 *
 * Los cobros del proyecto con sus devoluciones, filtrados en el servidor.
 */
export async function cobros(req, res, next) {
  try {
    const q = req.query || {};
    const data = await model.cobrosDeProyecto(idDelProyecto(req), {
      tipo: q.tipo, plan: q.plan, q: q.q, desde: q.desde, hasta: q.hasta, page: q.page, limit: q.limit,
    });
    res.json({ success: true, ...data });
  } catch (e) { next(e); }
}
