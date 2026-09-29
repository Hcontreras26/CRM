import crypto from 'crypto';
import { logger } from '../../shared/utils/logger.js';
import { decrypt } from '../../shared/utils/crypto.js';
import * as integrationsModel from '../integrations/integrations.model.js';
import { query } from '../../shared/config/db.js';
import * as model from './stripe-payments.model.js';
import * as tutores from '../tutores/tutor.model.js';

async function getStripeKey(projectId) {
  try {
    const row = await integrationsModel.get(projectId, 'stripe');
    if (row?.encrypted_value) return decrypt(row.encrypted_value, row.iv, row.auth_tag);
  } catch (e) { logger.warn({ e: e.message }, 'getStripeKey failed'); }
  return process.env.STRIPE_SECRET_KEY || null;
}

export async function getWebhookSecret(projectId) {
  try {
    const row = await integrationsModel.get(projectId, 'stripe');
    const pub = row?.config_public || {};
    // Las columnas row.webhook_iv y row.webhook_auth_tag NUNCA han existido en
    // project_integrations —son iv y auth_tag, y pertenecen a la clave de API—,
    // asi que esta rama estaba muerta y siempre se caia al texto plano. El
    // secreto guarda ahora su propio iv y su etiqueta dentro de config_public.
    if (pub.webhook_secret_encrypted && pub.webhook_secret_iv && pub.webhook_secret_auth_tag) {
      return decrypt(pub.webhook_secret_encrypted, pub.webhook_secret_iv, pub.webhook_secret_auth_tag);
    }
    return pub.webhook_secret || null;
  } catch (e) { return null; }
}

async function stripeGet(apiKey, path, params = {}) {
  const url = new URL(`https://api.stripe.com${path}`);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  const r = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!r.ok) throw new Error(`Stripe ${path} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

function chargeToPayment(charge, projectId) {
  // Importe SIEMPRE en EUR: si el cargo entra en moneda extranjera, usamos el
  // importe liquidado por Stripe en EUR (balance_transaction.amount), no el
  // importe en la moneda del cargo. Así el CRM registra euros reales y no vuelve
  // a pasar lo de las facturas en $/CRC/COP.
  const bt = charge.balance_transaction; // objeto expandido (expand[]=data.balance_transaction)
  const chargeCur = (charge.currency || 'eur').toLowerCase();
  const foreign = chargeCur !== 'eur';
  const settledEur = bt && typeof bt.amount === 'number' ? bt.amount / 100 : null;
  const amountEur = foreign && settledEur != null ? settledEur : (charge.amount || 0) / 100;
  return {
    project_id: projectId,
    stripe_id: charge.id,
    type: 'charge',
    status: charge.status,
    amount: amountEur,
    currency: 'EUR',
    // Comisión de Stripe y neto realmente liquidado (para la copia de gestión).
    // La factura del alumno siempre va por el bruto (amount).
    fee_amount: bt && typeof bt.fee === 'number' ? bt.fee / 100 : null,
    net_amount: bt && typeof bt.net === 'number' ? bt.net / 100 : null,
    customer_email: charge.billing_details?.email || charge.receipt_email || null,
    customer_name: charge.billing_details?.name || null,
    customer_stripe_id: charge.customer || null,
    description: charge.description || null,
    metadata: {
      ...(charge.metadata || {}),
      ...(foreign ? { original_amount: (charge.amount || 0) / 100, original_currency: chargeCur.toUpperCase(), stripe_exchange_rate: bt?.exchange_rate ?? null } : {}),
    },
    payment_method: charge.payment_method_details?.type || null,
    disputed: !!charge.disputed,
    dispute_status: charge.dispute?.status || null,
    dispute_reason: charge.dispute?.reason || null,
    refunded: !!charge.refunded,
    refunded_amount: charge.amount_refunded ? charge.amount_refunded / 100 : null,
    stripe_created_at: charge.created,
  };
}

async function autoLinkIfPossible(projectId, payment, dbRow) {
  if (dbRow.conversion_id) return;
  if (payment.status !== 'succeeded' || !payment.customer_email) return;
  // Un cargo en otra moneda solo vale si su importe ya viene liquidado en euros.
  // Los importados sin el balance_transaction guardaron el importe en la moneda
  // del cargo: asociarlos meteria 270.000 pesos colombianos como 270.000 euros.
  const moneda = String(payment.currency || dbRow.currency || 'EUR').toUpperCase();
  if (moneda !== 'EUR') {
    logger.warn({ stripeId: payment.stripe_id, moneda, importe: payment.amount },
      'cargo en moneda extranjera sin convertir a euros: no se asocia');
    return;
  }
  const lead = await model.findLeadByEmail(projectId, payment.customer_email);
  if (!lead) return;
  if (lead.status !== 'convertido') {
    await model.linkPayment(dbRow.id, { leadId: lead.id, conversionId: null, conversionPaymentId: null, userId: null, method: 'auto_pending' });
    return;
  }
  const conv = await model.findConversionByLeadId(lead.id);
  if (!conv) {
    await model.linkPayment(dbRow.id, { leadId: lead.id, conversionId: null, conversionPaymentId: null, userId: null, method: 'auto_pending' });
    return;
  }
  const fecha = new Date(payment.stripe_created_at * 1000).toISOString().slice(0, 10);
  // ¿Es realmente un duplicado? Lo es cuando la asesora ya registró ESE MISMO cobro a mano:
  // mismo importe y fecha muy próxima en la misma venta. No basta con que la venta esté
  // saldada — hay ventas cuyo importe_total quedó corto y siguen recibiendo mensualidades
  // legítimas, y bloquearlas dejaba el cobro sin factura.
  const dup = await model.findPagoDuplicado(conv.id, payment.amount, fecha, payment.stripe_id);
  if (dup) {
    // Se vincula al pago que ya existe (y a su factura, si la tiene) SIN volver a sumar.
    await model.linkPayment(dbRow.id, { leadId: lead.id, conversionId: conv.id, conversionPaymentId: dup.id, userId: null, method: 'auto_dedup' });
    return;
  }
  // Registrar el cobro con la MISMA lógica que un pago manual (conversion.model.addPayment):
  // salda la cuota pendiente más antigua (FIFO). allowOverpay: un cobro real de Stripe se
  // registra aunque supere el total previsto de la venta (el total es lo que suele estar mal).
  const convModel = await import('../conversions/conversion.model.js');
  const res = await convModel.addPayment(conv.id, {
    importe: payment.amount, fecha, notas: `Auto-Stripe ${payment.stripe_id}`, metodo: 'tarjeta',
  }, { allowOverpay: true, allowDuplicate: true });
  if (res?.error || !res?.payment) return;
  const cpId = res.payment.id;
  await model.linkPayment(dbRow.id, { leadId: lead.id, conversionId: conv.id, conversionPaymentId: cpId, userId: null, method: 'auto_email' });
  // El cobro queda registrado en la venta y espera EN LA COLA de facturacion.
  // La factura NO sale sola: la emite una persona cuando comprueba que los datos
  // del cliente estan bien. Antes se emitia aqui mismo, y salian facturas
  // numeradas con lo que hubiera en la ficha en ese momento.
  logger.info({ conversionId: conv.id, paymentId: cpId, stripeId: payment.stripe_id },
    'cobro de Stripe registrado; queda en la cola de facturacion');

  // AVISAR DE LA VENTA AUTOMATICA (#111).
  //
  // «Hoy pasa en silencio, y es justo lo que hay que mirar.» Un cobro de Stripe
  // entra solo, salda una cuota y se pone en la cola de facturacion sin que
  // nadie se entere: quien lleva ese prospecto no sabe que le han pagado.
  //
  // Va a la gestora de la ficha, que es a quien le afecta. Si no tiene
  // responsable no se avisa a nadie: sin dueño no hay a quien decirselo, y
  // mandarlo a los admin convertiria esto en el ruido que la tarea quiere
  // quitar.
  //
  // No duplica correo: hoy este suceso no manda ninguno.
  if (lead.responsable_id) {
    const { notifyUsers } = await import('../notifications/notifications.service.js');
    const euros = Number(payment.amount).toLocaleString('es-ES', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    await notifyUsers({
      targetUserIds: [lead.responsable_id],
      type: 'venta_automatica',
      title: `Cobro de ${euros} € de ${lead.nombre || payment.customer_email}`,
      message: 'Entro por Stripe y se registro solo en su venta. Queda en la cola de facturacion.',
      link_path: `/prospectos/${lead.id}`,
      metadata: { lead_id: lead.id, conversion_id: conv.id, stripe_id: payment.stripe_id },
    }).catch(() => {});
  }
}

// Trae detalle completo de dispute desde Stripe API (incluye evidence_due_by)
async function fetchAndUpdateDispute(apiKey, projectId, charge) {
  if (!charge.disputed) return;
  try {
    const data = await stripeGet(apiKey, '/v1/disputes', { 'charge': charge.id, limit: 1 });
    const d = data.data?.[0];
    if (!d) return;
    await query(
      `UPDATE stripe_payments SET
         dispute_id = $1,
         dispute_status = $2,
         dispute_reason = $3,
         dispute_amount = $4,
         dispute_evidence_due_by = to_timestamp($5),
         updated_at = NOW()
       WHERE project_id = $6 AND stripe_id = $7`,
      [d.id, d.status, d.reason, (d.amount || 0) / 100, d.evidence_details?.due_by || null, projectId, charge.id]
    );
  } catch (e) {
    logger.warn({ chargeId: charge.id, err: e.message }, 'fetchDispute failed');
  }
}

/**
 * Cuando varios proyectos comparten la MISMA cuenta de Stripe (#44).
 *
 * El indice unico de `stripe_payments` es `(project_id, stripe_id)`, asi que el
 * mismo cobro importado por dos proyectos crea DOS filas: el mismo dinero
 * contado dos veces, alimentando dos juegos de cifras y dos calculos de
 * comision. Con cuentas separadas no pasa; con una compartida, pasa siempre.
 *
 * Y no hay forma de adivinarlo mirando el cobro. Comprobado en el checkout de
 * una de las plataformas: manda `metadata: { user_id, plan_type }`, y
 * `plan_type` es generico —monthly, annual, single— o sea el MISMO en todas.
 * Dos cobros de dos plataformas distintas son indistinguibles.
 *
 * Asi que se declara. En la integracion de Stripe del proyecto:
 *
 *     config_public.filtro_metadata = { clave: 'proyecto', valor: 'tarot-ia' }
 *
 * y la plataforma añade ese par a su checkout. Es una linea alli y cero aqui.
 *
 * Sin declararlo NO se filtra nada, que es lo correcto para una cuenta
 * dedicada: es el caso normal y no tiene por que configurarse.
 */
async function filtroDeMetadata(projectId) {
  try {
    const row = await integrationsModel.get(projectId, 'stripe');
    const f = row?.config_public?.filtro_metadata;
    if (f?.clave && f?.valor) return { clave: String(f.clave), valor: String(f.valor) };
  } catch { /* sin integracion, sin filtro */ }
  return null;
}

/**
 * ¿De quien es este cobro? Tres respuestas, y la tercera es la que importa.
 *
 *   'mio'        — lleva la marca de este proyecto
 *   'ajeno'      — lleva la marca de OTRO: seguro que no es nuestro
 *   'sin_marcar' — no lleva ninguna, y eso NO significa que no sea nuestro
 *
 * La tercera existe por como se marcan las renovaciones. En una suscripcion, el
 * cobro de renovacion lo genera Stripe sin pasar por el checkout, asi que la
 * plataforma solo puede marcarlo A POSTERIORI desde su webhook. Entre que Stripe
 * lo crea y la plataforma lo estampa hay una ventana, y si el CRM lee justo ahi
 * ve un cobro sin marca.
 *
 * Tratarlo como ajeno seria perder ese cobro para siempre. Por eso se distingue.
 */
/**
 * Cuanto se espera a que la plataforma estampe un cobro suyo.
 *
 * La marca de agua se queda esperando a los cobros sin marcar, y eso esta bien
 * durante la ventana de estampado — minutos. Pero si uno no se marca NUNCA
 * —porque es de otra plataforma que no marca, o porque su webhook esta roto— la
 * marca de agua se quedaria clavada para siempre y cada vuelta releeria una
 * ventana un poco mas grande, cada cinco minutos, hasta que alguien se diera
 * cuenta. Nadie se daria cuenta.
 *
 * Un dia es mucho mas que la ventana real y poco para el ritmo del negocio: si a
 * las 24 horas sigue sin marca, no es un desfase, es que no le van a poner
 * ninguna.
 */
const GRACIA_SIN_MARCAR_MS = 24 * 60 * 60 * 1000;

function deQuienEs(charge, filtro) {
  if (!filtro) return 'mio';
  const marca = charge?.metadata?.[filtro.clave];
  if (marca == null || marca === '') return 'sin_marcar';
  return String(marca) === filtro.valor ? 'mio' : 'ajeno';
}

export async function syncStripePayments(projectId, { fullHistory = false, retryPending = false } = {}) {
  const apiKey = await getStripeKey(projectId);
  if (!apiKey) throw new Error('Stripe API key no configurada para este proyecto');

  const state = await model.getSyncState(projectId);
  let createdGte = null;
  if (!fullHistory && state?.last_synced_until) {
    createdGte = Math.floor(new Date(state.last_synced_until).getTime() / 1000) - 3600;
  }

  // LO ANTERIOR AL ALTA DEL PROYECTO NO ENTRA (#44).
  //
  // En la PRIMERA sincronizacion no hay estado previo, asi que `createdGte` era
  // null y se le pedian a Stripe todos los cobros de la historia del proyecto
  // —hasta veinte mil— y todos se guardaban. Con un proyecto que lleva meses
  // cobrando, eso entra como ventas de este mes e infla las cifras y las
  // comisiones. Es justo lo que la tarea llama «la regla que no se negocia».
  //
  // El corte ya existia, pero solo al LISTAR lo pendiente de facturar. De
  // `stripe_payments` leen ademas las pantallas de dinero, asi que filtrar al
  // final no bastaba: habia que no traerlo.
  //
  // Se aplica tambien con `fullHistory`, que ahora significa «todo desde el
  // alta». La salida de emergencia sigue siendo la de siempre y esta escrita en
  // el modelo: mover `al_dia_hasta` hacia atras.
  const corte = await model.fechaDeCorte(projectId);
  if (corte) {
    const desdeElAlta = Math.floor(new Date(corte).getTime() / 1000);
    // El mayor de los dos: si ya se sincronizo hasta ayer, no se vuelve a pedir
    // desde el alta.
    createdGte = createdGte == null ? desdeElAlta : Math.max(createdGte, desdeElAlta);
  }

  const filtro = await filtroDeMetadata(projectId);

  let imported = 0;
  let ajenos = 0;
  let sinMarcar = 0;
  let sinMarcarViejos = 0;
  // El cobro sin marcar MAS ANTIGUO de esta vuelta. La marca de agua no puede
  // pasar de ahi: ver abajo.
  let primeroSinMarcar = null;
  let disputesFound = 0;
  let lastCreated = state?.last_synced_until ? Math.floor(new Date(state.last_synced_until).getTime() / 1000) : 0;
  let startingAfter = null;
  let pages = 0;
  const MAX_PAGES = 200;

  while (pages < MAX_PAGES) {
    const params = { limit: 100, 'expand[]': 'data.balance_transaction' };
    if (createdGte) params['created[gte]'] = createdGte;
    if (startingAfter) params.starting_after = startingAfter;

    const data = await stripeGet(apiKey, '/v1/charges', params);
    if (!data.data?.length) break;

    for (const ch of data.data) {
      try {
        const duenno = deQuienEs(ch, filtro);
        // De otro proyecto de la misma cuenta: ni se guarda ni cuenta como
        // importado, pero SI se apunta cuantos, para que al conectar se vea que
        // el filtro esta haciendo algo y no que no llega nada.
        if (duenno === 'ajeno') { ajenos++; continue; }
        // Sin marca todavia: puede ser una renovacion que su plataforma aun no
        // ha estampado. Se deja pasar de largo SIN mover la marca de agua, para
        // volver a mirarlo en la siguiente vuelta.
        if (duenno === 'sin_marcar') {
          const edadMs = Date.now() - ch.created * 1000;
          if (edadMs > GRACIA_SIN_MARCAR_MS) {
            // Ya no es un desfase de estampado: a estas alturas no le van a
            // poner marca. Se deja pasar la marca de agua y se apunta, porque
            // esto SI hay que mirarlo — o es de otra plataforma que no marca, o
            // su webhook no esta estampando.
            sinMarcarViejos++;
            continue;
          }
          sinMarcar++;
          if (primeroSinMarcar == null || ch.created < primeroSinMarcar) primeroSinMarcar = ch.created;
          continue;
        }
        const payment = chargeToPayment(ch, projectId);
        const dbRow = await model.upsertPayment(payment);
        try { await autoLinkIfPossible(projectId, payment, dbRow); }
        catch (e) { logger.warn({ chargeId: ch.id, err: e.message }, 'autoLink fail'); }
        if (ch.disputed) {
          await fetchAndUpdateDispute(apiKey, projectId, ch);
          disputesFound++;
        }
        imported++;
        if (ch.created > lastCreated) lastCreated = ch.created;
      } catch (e) {
        logger.warn({ chargeId: ch.id, err: e.message }, 'Charge sync failed - continua');
      }
    }
    if (!data.has_more) break;
    startingAfter = data.data[data.data.length - 1].id;
    pages++;
  }


  // Segunda pasada: los cargos que ya estaban importados y siguen sin asociar.
  // Stripe solo devuelve los cargos nuevos, asi que sin esto un cobro cuya
  // asociacion se deshizo no se volveria a enganchar nunca por mucho que se
  // pulse Sincronizar.
  //
  // Solo se hace cuando alguien pulsa Sincronizar a mano (retryPending). El cron
  // de cada 5 min no lo dispara: reasociar en masa es una decision del usuario,
  // no algo que deba pasar solo de madrugada.
  let reasociados = 0;
  if (retryPending) try {
    const pendientes = await model.listPendientesDeAsociar(projectId, 5000);
    for (const row of pendientes) {
      try {
        const antes = row.conversion_payment_id;
        await autoLinkIfPossible(projectId, {
          status: row.status,
          amount: Number(row.amount),
          customer_email: row.customer_email,
          currency: row.currency,
          stripe_created_at: Number(row.stripe_created_at),
          stripe_id: row.stripe_id,
        }, row);
        const despues = await model.getById(row.id);
        if (!antes && despues?.conversion_payment_id) reasociados++;
      } catch (e) {
        logger.warn({ stripeId: row.stripe_id, err: e.message }, 'reintento de asociacion fallido');
      }
    }
  } catch (e) {
    logger.warn({ err: e.message }, 'no se pudo reintentar la asociacion de pendientes');
  }

  // LA MARCA DE AGUA NO PASA DE UN COBRO SIN MARCAR.
  //
  // Si avanzara, la proxima vuelta empezaria despues de el y ese cobro no se
  // volveria a mirar NUNCA. Cuando su plataforma lo estampe —las renovaciones se
  // marcan a posteriori, desde su webhook— ya seria tarde: dinero perdido en
  // silencio, que es el peor final posible.
  //
  // Asi que se retrocede hasta un segundo antes del mas antiguo sin marcar. Se
  // vuelve a leer un trozo pequeño cada vez, y en cuanto aparezca la marca
  // entra y la marca de agua sigue su camino.
  if (primeroSinMarcar != null) {
    lastCreated = Math.min(lastCreated || primeroSinMarcar, primeroSinMarcar - 1);
  }

  await model.upsertSyncState(projectId, {
    last_sync_at: new Date().toISOString(),
    last_full_sync_at: fullHistory ? new Date().toISOString() : (state?.last_full_sync_at || null),
    last_synced_until: lastCreated ? new Date(lastCreated * 1000).toISOString() : (state?.last_synced_until || null),
    total_imported: (state?.total_imported || 0) + imported,
    last_error: null,
  });

  // Los viejos sin marcar se avisan aparte y como aviso, no como dato: si esto
  // sale, o hay una plataforma compartiendo cuenta sin marcar sus cobros, o el
  // estampado de la nuestra se ha roto. Las dos cosas hay que mirarlas.
  if (sinMarcarViejos) {
    logger.warn({ projectId, sinMarcarViejos },
      'Stripe: cobros de mas de un dia SIN marca de plataforma. O son de otra que no marca, ' +
      'o el estampado del webhook de la nuestra no esta funcionando.');
  }
  logger.info({ projectId, imported, ajenos, sinMarcar, sinMarcarViejos, disputesFound, pages, reasociados }, 'Stripe sync OK');
  return { imported, ajenos, sinMarcar, sinMarcarViejos, disputes: disputesFound, pages, reasociados };
}

export async function manualLink(stripePaymentId, { leadId, conversionId, userId }) {
  let cpId = null;
  let importe = 0;
  let yaExistia = false;
  if (conversionId) {
    const { rows } = await query(
      `SELECT amount, stripe_id, stripe_created_at, status FROM stripe_payments WHERE id=$1`, [stripePaymentId]);
    // Un cargo que NO se cobro no registra pago. Nunca.
    //
    // Aqui no se miraba el estado: asociar un cargo fallido creaba un cobro por
    // su importe, o sea dinero que no entro figurando como cobrado, y de ahi a
    // una factura emitida por algo que nadie pago. Hoy hay 225 cargos fallidos
    // en MultiCRM y 401 en ISEIE: cualquiera estaba a un clic.
    //
    // El enlace SI se hace —queda dicho de quien es el intento fallido, que
    // sirve para perseguirlo— pero sin cobro detras.
    const cobrado = rows[0]?.status === 'succeeded';
    const amount = cobrado ? Number(rows[0]?.amount || 0) : 0;
    // Fecha REAL del cobro en Stripe (antes se guardaba la de hoy y la factura salía con
    // fecha equivocada). Si faltara, se cae a hoy.
    const fecha = rows[0]?.stripe_created_at
      ? new Date(rows[0].stripe_created_at).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    if (amount > 0) {
      importe = amount;
      // Si la asesora ya registró ese mismo cobro a mano, se engancha al pago existente
      // (y a su factura) en vez de crear otro: se vincula pero NO vuelve a sumar.
      const dup = await model.findPagoDuplicado(conversionId, amount, fecha, rows[0]?.stripe_id);
      if (dup) {
        cpId = dup.id;
        yaExistia = true;
      } else {
        // Mismo camino que un pago manual: salda la cuota pendiente más antigua (FIFO)
        // para que el cobro aparezca en las mensualidades de la venta.
        const convModel = await import('../conversions/conversion.model.js');
        const res = await convModel.addPayment(conversionId, {
          importe: amount, fecha, notas: `Stripe ${rows[0]?.stripe_id || stripePaymentId}`, metodo: 'tarjeta',
        }, { allowOverpay: true, allowDuplicate: true });
        cpId = res?.payment?.id || null;
      }
    }
  }
  if (conversionId && !cpId) {
    logger.warn({ stripePaymentId, conversionId },
      'cargo asociado SIN registrar cobro: no consta como cobrado en Stripe');
  }
  await model.linkPayment(stripePaymentId, { leadId, conversionId, conversionPaymentId: cpId, userId, method: yaExistia ? 'manual_dedup' : 'manual' });
  // Asociar el cargo NO emite la factura: el cobro queda registrado en la venta y
  // espera en la cola. La emite una persona cuando comprueba que los datos del
  // cliente estan bien.
  if (cpId) {
    logger.info({ conversionId, paymentId: cpId, stripePaymentId },
      'cargo de Stripe asociado a mano; queda en la cola de facturacion');
  }
}

export async function updateDisputeDecision(stripePaymentId, { decision, notes, userId }) {
  await query(
    `UPDATE stripe_payments SET
       dispute_my_decision = $1,
       dispute_notes = COALESCE($2, dispute_notes),
       dispute_decided_at = NOW(),
       dispute_decided_by = $3,
       updated_at = NOW()
     WHERE id = $4`,
    [decision, notes || null, userId || null, stripePaymentId]
  );
}

// ─── Webhook handler (Stripe → CRM en tiempo real) ───────────────────────────
export function verifyStripeSignature(rawBody, sigHeader, secret) {
  if (!sigHeader || !secret) return false;
  const parts = {};
  for (const p of sigHeader.split(',')) {
    const [k, v] = p.split('=');
    if (k && v) (parts[k] = parts[k] || []).push(v);
  }
  const t = parts.t?.[0];
  const v1List = parts.v1 || [];
  if (!t || !v1List.length) return false;
  // La firma incluye la marca de tiempo, pero de nada sirve si no se comprueba:
  // sin esto, quien capture una peticion valida puede reenviarla mañana y el
  // cobro se duplica. Cinco minutos, la misma ventana que recomienda Stripe.
  const edadSegundos = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(edadSegundos) || edadSegundos > 300) return false;
  const payload = `${t}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  for (const v1 of v1List) {
    if (v1.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))) return true;
  }
  return false;
}


// Un reembolso de Stripe, llevado hasta el final: devolucion en la venta y
// comision del tutor revertida.
//
// Stripe manda un evento por CADA reembolso, con su propio identificador
// (re_...). Ese identificador es lo que impide registrarlo dos veces si el
// evento se reintenta o si alguien resincroniza: la devolucion se guarda con el,
// y hay un indice unico detras.
//
// Si el cobro de Stripe no esta atado a ningun cobro del CRM no se inventa nada:
// se avisa en el registro y alguien lo mira. Adivinar aqui es adivinar sobre
// dinero devuelto.
async function propagarReembolso(charge, projectId) {
  const { rows } = await query(
    `SELECT sp.conversion_id, sp.conversion_payment_id
       FROM stripe_payments sp
      WHERE sp.project_id = $1 AND sp.stripe_id = $2`,
    [projectId, charge.id]);
  const enlace = rows[0];
  if (!enlace?.conversion_id) {
    logger.warn({ charge: charge.id }, 'reembolso de un cobro que no esta atado a ninguna venta');
    return;
  }

  // Stripe manda todos los reembolsos del cargo; se procesan uno a uno porque
  // un cargo puede devolverse en partes.
  const lista = charge.refunds?.data?.length
    ? charge.refunds.data
    : [{ id: `${charge.id}_ref`, amount: charge.amount_refunded, reason: null, created: charge.created }];

  for (const r of lista) {
    const importe = Number(r.amount || 0) / 100;
    if (!(importe > 0)) continue;
    const resultado = await tutores.registrarDevolucion({
      conversionId: enlace.conversion_id,
      paymentId: enlace.conversion_payment_id || null,
      importe,
      fecha: r.created ? new Date(r.created * 1000).toISOString().slice(0, 10) : null,
      motivo: r.reason || 'Reembolso de Stripe',
      stripeRefundId: r.id,
      origen: 'stripe',
      userId: null,
    });
    if (resultado.repetida) continue;
    logger.info({
      charge: charge.id, refund: r.id, importe,
      comisionesRevertidas: resultado.comisionesRevertidas,
      sinCobroConcreto: resultado.sinCobroConcreto,
    }, 'reembolso registrado');
  }
}

export async function handleWebhookEvent(projectId, event) {
  const apiKey = await getStripeKey(projectId);
  const obj = event.data?.object;
  if (!obj) return { skipped: 'no data' };

  switch (event.type) {
    case 'charge.succeeded':
    case 'charge.updated':
    case 'charge.refunded':
    case 'charge.failed': {
      const payment = chargeToPayment(obj, projectId);
      const dbRow = await model.upsertPayment(payment);
      try { await autoLinkIfPossible(projectId, payment, dbRow); } catch (e) { logger.warn({ err: e.message }, 'autoLink wh fail'); }
      if (obj.disputed && apiKey) await fetchAndUpdateDispute(apiKey, projectId, obj);
      // Un reembolso no acaba en stripe_payments: si el alumno recupera su
      // dinero, hay que registrar la devolucion en su venta y deshacer la
      // comision del tutor. Antes se quedaba aqui y el tutor cobraba igual.
      if (event.type === 'charge.refunded') {
        try { await propagarReembolso(obj, projectId); }
        catch (e) { logger.error({ err: e.message, charge: obj.id }, 'reembolso: no se pudo propagar'); }
      }
      return { processed: event.type, stripeId: obj.id };
    }
    case 'charge.dispute.created':
    case 'charge.dispute.updated':
    case 'charge.dispute.closed': {
      // obj is the dispute object
      await query(
        `UPDATE stripe_payments SET
           disputed = true,
           dispute_id = $1, dispute_status = $2, dispute_reason = $3,
           dispute_amount = $4,
           dispute_evidence_due_by = to_timestamp($5),
           updated_at = NOW()
         WHERE project_id = $6 AND stripe_id = $7`,
        [obj.id, obj.status, obj.reason, (obj.amount || 0) / 100,
         obj.evidence_details?.due_by || null, projectId, obj.charge]
      );
      return { processed: event.type, stripeId: obj.id };
    }
    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed': {
      // Fetch the charge via API for full info (PI no incluye billing_details completos)
      if (apiKey && obj.latest_charge) {
        try {
          const ch = await stripeGet(apiKey, `/v1/charges/${obj.latest_charge}`);
          const payment = chargeToPayment(ch, projectId);
          const dbRow = await model.upsertPayment(payment);
          try { await autoLinkIfPossible(projectId, payment, dbRow); } catch {}
        } catch (e) { logger.warn({ err: e.message }, 'fetch charge from PI failed'); }
      }
      return { processed: event.type, stripeId: obj.id };
    }
    default:
      return { skipped: event.type };
  }
}
