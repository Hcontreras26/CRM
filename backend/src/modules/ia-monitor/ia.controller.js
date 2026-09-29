import * as model from './ia.model.js';
import { AppError } from '../../shared/utils/AppError.js';
import { getDecryptedValue } from '../credentials/credentials.model.js';
import { logger } from '../../shared/utils/logger.js';
import * as gastoIA from '../../shared/services/gastoIA.service.js';

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
    const url = new URL('https://api.stripe.com/v1/subscriptions');
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
  const newSubsRes = await fetch(`https://api.stripe.com/v1/subscriptions?created[gte]=${monthStart}&limit=100`, { headers });
  const newSubsJ = newSubsRes.ok ? await newSubsRes.json() : { data: [] };
  const newSubs = (newSubsJ.data || []).length;
  const cancelledRes = await fetch(`https://api.stripe.com/v1/subscriptions?status=canceled&canceled_at[gte]=${monthStart}&limit=100`, { headers });
  const cancelledJ = cancelledRes.ok ? await cancelledRes.json() : { data: [] };
  const cancelledSubs = (cancelledJ.data || []).length;
  // Failed payments (charges del mes con status failed)
  const failedRes = await fetch(`https://api.stripe.com/v1/charges?created[gte]=${monthStart}&limit=100`, { headers });
  const failedJ = failedRes.ok ? await failedRes.json() : { data: [] };
  const failedPayments = (failedJ.data || []).filter(c => c.status === 'failed').length;
  // Churn = cancelled / active mes anterior (aproximado: usar active actual)
  const churnRate = active.length > 0 ? (cancelledSubs / active.length) * 100 : 0;
  return {
    mrr: Math.round(mrr * 100) / 100,
    activeSubs: active.length,
    newSubs, cancelledSubs, failedPayments,
    churnRate: Math.round(churnRate * 100) / 100,
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
        ...(metrics || { mrr: 0, activeSubs: 0, newSubs: 0, cancelledSubs: 0, failedPayments: 0, churnRate: 0 }),
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
