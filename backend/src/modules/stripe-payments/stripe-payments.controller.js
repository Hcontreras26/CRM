import { proyectosDelAmbito, campusDeTodos, exigirCampusSuyo } from '../../shared/utils/ambito.js';
import * as model from './stripe-payments.model.js';
import * as service from './stripe-payments.service.js';
import { AppError } from '../../shared/utils/AppError.js';
import { logger } from '../../shared/utils/logger.js';
import { anotaWebhook } from '../status/webhooks.js';

/**
 * El ámbito de la lista y las cifras. Con «Todos los proyectos» (#218), super
 * admin y soporte reciben `{null, null}` de `proyectosDelAmbito`: antes eso era
 * «projectId requerido»; ahora, todos los campus menos los de pruebas.
 */
async function ambitoDeLaLista(req) {
  const ambito = await proyectosDelAmbito(req);
  if (!ambito.projectId && !ambito.projectIds) return { projectId: null, projectIds: await campusDeTodos(req) };
  return ambito;
}

function projectId(req) {
  const pid = Number(req.query.projectId || req.body?.projectId);
  if (!pid) throw new AppError('projectId requerido', 400, 'BAD_REQUEST');
  return pid;
}

export async function list(req, res, next) {
  try {
    const ambito = await ambitoDeLaLista(req);
    const { status, linked, search, from, to, page, limit, facturables, sinEquivalente } = req.query;
    const data = await model.listPayments({
      ...ambito, status, linked, search, from, to,
      facturables: facturables === '1' || facturables === 'true',
      sinEquivalente: sinEquivalente === '1' || sinEquivalente === 'true',
      page: Number(page) || 1,
      limit: Math.min(Number(limit) || 50, 200),
    });
    res.json({ success: true, data: data.rows, pagination: { total: data.total, page: Number(page) || 1, limit: Number(limit) || 50 } });
  } catch (e) { next(e); }
}

export async function stats(req, res, next) {
  try {
    const ambito = await ambitoDeLaLista(req);
    const pid = ambito.projectId;
    const { status, linked, search, from, to, facturables, sinEquivalente } = req.query;
    // Los mismos filtros que el listado: si no, la cabecera cuenta una cosa y la
    // tabla de debajo otra.
    const s = await model.getStats({
      ...ambito, status, linked, search, from, to,
      facturables: facturables === '1' || facturables === 'true',
      sinEquivalente: sinEquivalente === '1' || sinEquivalente === 'true',
    });
    // El estado de la sincronizacion es de UNA cuenta de Stripe: con la
    // empresa entera no hay una sola, asi que no se dice ninguna.
    const sync = pid ? await model.getSyncState(pid) : null;
    res.json({ success: true, data: { ...s, sync } });
  } catch (e) { next(e); }
}

/**
 * De que fecha para adelante se factura, y por que (GET /corte).
 *
 * Existe para poder enseñarlo en la pantalla donde se pega la clave, ANTES de
 * guardarla: guardar la clave es lo que arranca el sondeo. Hasta ahora este
 * dato solo se podia mirar con un SELECT a mano.
 */
export async function corte(req, res, next) {
  try {
    const data = await model.escalonesDelCorte(projectId(req));
    if (!data) throw new AppError('Proyecto no encontrado', 404, 'NOT_FOUND');
    res.json({ success: true, data });
  } catch (e) { next(e); }
}

export async function sync(req, res, next) {
  try {
    const pid = projectId(req);
    const fullHistory = req.body?.fullHistory === true || req.query?.fullHistory === 'true';
    // El historico ABSOLUTO: se salta el corte para TRAER, no para facturar.
    // Solo si se pide explicitamente; ni el cron ni el boton normal lo mandan.
    const desdeElPrincipio = req.body?.desdeElPrincipio === true || req.query?.desdeElPrincipio === 'true';
    // Sincronizar a mano reintenta ademas los cargos que quedaron sin asociar.
    const result = await service.syncStripePayments(pid, {
      fullHistory: fullHistory || desdeElPrincipio, desdeElPrincipio, retryPending: true,
    });
    res.json({ success: true, data: result });
  } catch (e) {
    logger.error({ e: e.message }, 'sync stripe failed');
    next(e);
  }
}

/**
 * El cargo del id de la ruta, si es de uno de los campus de quien pide (#717).
 *
 * Ver un cargo, asociarlo, desasociarlo y decidir su disputa iban solo por el id:
 * con permiso de ver pagos se leía el cargo de cualquier campus (importe, correo y
 * nombre del cliente), y con el de editar se movía dinero de otra empresa. Fuera de
 * sus campus es un 404, como si no existiera, igual que en el resto del CRM.
 */
async function cargoSuyo(req) {
  const row = await model.getById(Number(req.params.id));
  if (!row) throw new AppError('Pago no encontrado', 404, 'NOT_FOUND');
  await exigirCampusSuyo(req, row.project_id, 'Pago no encontrado');
  return row;
}

export async function getOne(req, res, next) {
  try {
    const row = await cargoSuyo(req);
    res.json({ success: true, data: row });
  } catch (e) { next(e); }
}

export async function link(req, res, next) {
  try {
    const cargo = await cargoSuyo(req);
    const { leadId, conversionId } = req.body || {};
    if (!leadId && !conversionId) throw new AppError('leadId o conversionId requerido', 400, 'BAD_REQUEST');
    // La venta y el prospecto, del MISMO campus que el cargo (#717): si no, un cobro de
    // un campus acababa sumado a una venta de otro (y en la factura de otra sociedad).
    if (conversionId && await model.campusDeLaVenta(conversionId) !== Number(cargo.project_id)) {
      throw new AppError('Venta no encontrada', 404, 'NOT_FOUND');
    }
    if (leadId && await model.campusDelLead(leadId) !== Number(cargo.project_id)) {
      throw new AppError('Lead no encontrado', 404, 'NOT_FOUND');
    }
    await service.manualLink(cargo.id, { leadId, conversionId, userId: req.user?.userId });
    res.json({ success: true });
  } catch (e) { next(e); }
}

export async function unlink(req, res, next) {
  try {
    const cargo = await cargoSuyo(req);
    await model.linkPayment(cargo.id, { leadId: null, conversionId: null, conversionPaymentId: null, userId: req.user?.userId, method: null });
    res.json({ success: true });
  } catch (e) { next(e); }
}

export async function updateDispute(req, res, next) {
  try {
    const { decision, notes } = req.body || {};
    const allowed = ['pending', 'accept_refund', 'contest', 'won', 'lost', 'closed'];
    if (!allowed.includes(decision)) throw new AppError(`decision debe ser: ${allowed.join(', ')}`, 400, 'BAD_DECISION');
    const cargo = await cargoSuyo(req);
    await service.updateDisputeDecision(cargo.id, { decision, notes, userId: req.user?.userId });
    res.json({ success: true });
  } catch (e) { next(e); }
}

// Webhook publico - sin auth, verifica firma
export async function webhook(req, res, next) {
  try {
    const pid = Number(req.params.projectId);
    if (!pid) return res.status(400).send('projectId requerido en URL');
    const sigHeader = req.get('stripe-signature');
    const rawBody = req.rawBody || (typeof req.body === 'string' ? req.body : null);
    if (!rawBody) {
      logger.warn('Webhook recibido sin rawBody');
      return res.status(400).send('rawBody requerido');
    }
    const secret = await service.getWebhookSecret(pid);
    // Sin secreto NO se acepta. Antes se dejaba pasar «en modo permisivo», y eso
    // convertia la URL en un formulario publico para inventar cobros: quien la
    // conociera podia mandar un charge.succeeded y crear un pago en el CRM.
    //
    // Cerrarlo no pierde cobros: el sondeo de stripePaymentsSyncScheduler los
    // recoge igual cada 5 minutos. Solo se pierde la inmediatez, hasta que se
    // configure el secreto en Integraciones.
    if (!secret) {
      logger.error({ projectId: pid },
        'Webhook de Stripe RECHAZADO: el proyecto no tiene secreto configurado. ' +
        'Ponlo en Integraciones; mientras tanto los cobros entran por el sondeo.');
      anotaWebhook('stripe', 'rechazado', 'el proyecto no tiene el secreto configurado', pid);
      return res.status(400).send('webhook secret no configurado para este proyecto');
    }
    if (!service.verifyStripeSignature(rawBody, sigHeader, secret)) {
      logger.warn({ projectId: pid }, 'Webhook de Stripe con firma invalida');
      anotaWebhook('stripe', 'rechazado', 'firma invalida', pid);
      return res.status(400).send('Firma invalida');
    }
    const event = JSON.parse(rawBody);
    const result = await service.handleWebhookEvent(pid, event);
    anotaWebhook('stripe', 'aceptado', null, pid);
    res.json({ received: true, ...result });
  } catch (e) {
    logger.error({ e: e.message }, 'webhook stripe failed');
    anotaWebhook('stripe', 'error', e.message, Number(req.params.projectId) || null);
    res.status(500).send(`Error: ${e.message}`);
  }
}
