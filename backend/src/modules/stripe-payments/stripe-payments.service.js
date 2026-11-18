import crypto from 'crypto';
import { urlDeStripe } from '../../shared/config/stripeApi.js';
import { logger } from '../../shared/utils/logger.js';
import { activa as facturaAutomaticaActiva } from '../factura-automatica/factura-automatica.config.js';
import { decrypt } from '../../shared/utils/crypto.js';
import * as integrationsModel from '../integrations/integrations.model.js';
import { query } from '../../shared/config/db.js';
import * as model from './stripe-payments.model.js';
import * as tutores from '../tutores/tutor.model.js';
// Ventas a plazos: al asociar un cargo, su suscripción se apunta y se cierra al completar el pago (#747).
import { trasAsociarCargo, claveDeStripe, suscripcionDelCargo } from './suscripciones.service.js';
// Cada pago a su venta y la compra directa crea la suya (puerta 6, CRM#806).
import {
  pedidoDeLaWeb, formacionDelPedido, elegirVenta, crearVentaDeCompraDirecta, compraDirectaActiva, configCompraDirecta,
  PEDIDO_SIN_LEER,
} from './compra-directa.service.js';
// El interruptor de las reglas nuevas de asociación (apagado de serie).
import { asociacionV2Activa } from './asociacion.config.js';

export { asociacionV2Activa };

export async function getStripeKey(projectId) {
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

export async function stripeGet(apiKey, path, params = {}) {
  // La direccion sale de `stripeApi.js`: en produccion es Stripe y nada mas.
  const url = new URL(urlDeStripe(path));
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

/*
  UN CARGO CON VENTA PERO SIN COBRO SE VUELVE A ENGANCHAR (19/10).

  Dayana, venta 595 de Psiko (Laura): apuntó a mano la cuota de 108,33 € (cobro 881),
  la sincronización vio el cargo de Stripe y lo enganchó a ese cobro (auto_dedup), y
  luego ella borró el 881 y lo volvió a apuntar (882). Al borrarse, el cargo se quedó
  con la venta pero SIN cobro, y como solo se intentaba enganchar lo que no tenía venta,
  ya nadie lo miraba: en Stripe salía como «asociado» a un cobro que no existe.

  Ahora, si el cargo tiene venta y no cobro, se busca el cobro equivalente que ya
  esté apuntado (findPagoDuplicado: el mismo cargo en las notas, o mismo importe con
  un euro de margen y fecha a menos de 4 días, sin otro cargo enganchado). Si lo hay,
  se engancha. NUNCA se crea un cobro aquí: si no lo hay, el dinero ya pudo contarse
  de otra forma y apuntarlo otra vez lo contaría dos veces.
*/
export async function reengancharCobro(payment, dbRow) {
  if (dbRow.conversion_payment_id || payment.status !== 'succeeded') return;
  const segundos = Number(payment.stripe_created_at ?? 0);
  const fecha = segundos > 0
    ? new Date(segundos * 1000).toISOString().slice(0, 10)
    : new Date(dbRow.stripe_created_at).toISOString().slice(0, 10);
  const dup = await model.findPagoDuplicado(dbRow.conversion_id, payment.amount ?? dbRow.amount, fecha, payment.stripe_id ?? dbRow.stripe_id);
  if (!dup) return;
  await model.linkPayment(dbRow.id, {
    leadId: dbRow.lead_id, conversionId: dbRow.conversion_id, conversionPaymentId: dup.id,
    userId: dbRow.linked_by ?? null, method: dbRow.link_method || 'auto_dedup',
  });
  logger.info({ stripeId: dbRow.stripe_id, conversionId: dbRow.conversion_id, conversionPaymentId: dup.id },
    'cargo de Stripe sin cobro: enganchado al cobro que ya estaba');
}

// Marca de «lo está enlazando alguien ahora» en link_method. Empieza por «auto» para que
// la pantalla de cargos, si la llega a ver, lo cuente como automático.
const ENLAZANDO = 'auto_enlazando';
// Si el proceso muere con la reserva puesta, pasado este tiempo otro la puede retomar.
const RESERVA_MINUTOS = 2;

/**
 * Enlaza un cargo con su venta, de UNO EN UNO por cargo (#680, #635).
 *
 * El mismo cargo llega por varios caminos: el aviso de Stripe, el sondeo de cada 5 minutos
 * y el botón «Sincronizar». Si dos llegaban a la vez, los dos veían la fila aún sin venta,
 * los dos pasaban por la comprobación de duplicados antes de que el otro escribiera y los
 * dos sumaban el cobro: la venta acababa con el mismo pago dos veces.
 *
 * Ahora el cargo se RESERVA con una sola sentencia: quien recibe la fila lo enlaza y los
 * demás no hacen nada (ya lo está haciendo otro). Nadie se queda esperando con una conexión
 * cogida. La primera versión usaba un bloqueo de sesión que retenía una conexión mientras
 * el enlace pedía otras al mismo pool (max 20): con ~20 cargos distintos a la vez se
 * agotaba y se perdían cobros sin aviso (revisión de Diego, 10/11).
 *
 * La reserva pisa link_method y linked_at, así que la sentencia devuelve también los
 * valores de antes: son los que ve el enlace y los que vuelven a la fila si no se enlaza.
 */
async function autoLinkIfPossible(projectId, payment, dbRow, opciones = {}) {
  const { rows: [reservada] } = await query(
    `UPDATE stripe_payments sp
        SET link_method = $2, linked_at = NOW()
       FROM (SELECT id, link_method, linked_at FROM stripe_payments WHERE id = $1 FOR UPDATE) antes
      WHERE sp.id = antes.id
        AND sp.conversion_payment_id IS NULL
        AND (sp.link_method IS DISTINCT FROM $2 OR sp.linked_at < NOW() - make_interval(mins => $3))
      RETURNING sp.*, antes.link_method AS metodo_antes, antes.linked_at AS enlazado_antes`,
    [dbRow.id, ENLAZANDO, RESERVA_MINUTOS]
  );
  if (!reservada) return; // ya tiene su cobro, o lo está enlazando otro ahora mismo

  // Una reserva caducada no guarda lo de antes: se deja sin método, como un cargo nuevo.
  const metodo = reservada.metodo_antes === ENLAZANDO ? null : reservada.metodo_antes;
  const enlazado = reservada.metodo_antes === ENLAZANDO ? null : reservada.enlazado_antes;
  try {
    return await enlazarSiSePuede(projectId, payment, { ...reservada, link_method: metodo, linked_at: enlazado }, opciones);
  } finally {
    // Si se enlazó, linkPayment ya cambió link_method y esto no toca nada. Si no (sin lead,
    // otra moneda, un error…), la fila vuelve a como estaba para el siguiente intento.
    await query(
      `UPDATE stripe_payments SET link_method = $2, linked_at = $3 WHERE id = $1 AND link_method = $4`,
      [dbRow.id, metodo, enlazado, ENLAZANDO]
    ).catch((e) => logger.error({ err: e.message, projectId, stripeId: dbRow.stripe_id },
      'stripe: no se pudo soltar la reserva del cargo; caduca sola en 2 minutos'));
  }
}

/**
 * De qué suscripción de Stripe viene un cargo SIN venta (puerta 6, CRM#806).
 *
 * Una renovación pagada con otro correo no encaja por correo, pero su suscripción
 * es la de la venta (#747 la apunta en `conversions.stripe_subscription_id`). Se
 * pregunta a Stripe UNA vez por cargo y se apunta en él (`suscripcion_buscada`);
 * solo si el cargo tiene cliente de Stripe, que es lo que tienen los de
 * suscripción. Si Stripe falla no se marca nada: se reintenta en la siguiente.
 */
export async function suscripcionDelCargoSuelto(projectId, payment, dbRow, {
  clave = claveDeStripe, delCargo = suscripcionDelCargo,
} = {}) {
  if (dbRow.stripe_subscription_id) return dbRow.stripe_subscription_id;
  if (dbRow.suscripcion_buscada) return null;
  if (!(payment.customer_stripe_id || dbRow.customer_stripe_id)) return null;
  try {
    const apiKey = await clave(projectId);
    if (!apiKey) return null;
    const sub = await delCargo(apiKey, payment.stripe_id || dbRow.stripe_id);
    await model.guardarSuscripcionDelCargo(dbRow.id, sub);
    return sub;
  } catch (e) {
    logger.warn({ projectId, stripeId: payment.stripe_id || dbRow.stripe_id, err: e.message },
      'stripe: no se pudo saber de qué suscripción viene el cargo');
    return null;
  }
}

/**
 * A QUÉ VENTA VA, COMO SIEMPRE (con el interruptor apagado): la venta más
 * reciente de la ficha más nueva con ese correo, y solo si la ficha está
 * «convertida». Si hay ficha pero no venta, el cargo queda «pendiente» en ella.
 * Devuelve { conv, ficha, metodoAuto, email } o null si no se asocia.
 */
async function ventaComoSiempre(projectId, payment, dbRow) {
  const lead = await model.findLeadByEmail(projectId, payment.customer_email);
  if (!lead) return null;
  const conv = lead.status === 'convertido' ? await model.findConversionByLeadId(lead.id) : null;
  if (!conv) {
    await model.linkPayment(dbRow.id, { leadId: lead.id, conversionId: null, conversionPaymentId: null, userId: null, method: 'auto_pending' });
    return null;
  }
  return { conv, ficha: lead, metodoAuto: 'auto_email', email: payment.customer_email };
}

/**
 * A QUÉ VENTA VA, CON LAS REGLAS NUEVAS (puerta 6, CRM#806; solo con el
 * interruptor encendido). Por orden:
 *
 *   1. Por el correo, como siempre: la venta más reciente de la ficha más nueva.
 *      Ya no hace falta que la ficha esté «convertida»: si tiene venta, la
 *      venta manda (el estado de la ficha se cambia a mano y no dice nada del
 *      dinero).
 *   2. Si es una compra en la web (pedido de WooCommerce), su formación decide:
 *      la venta de ESA formación entre todas las fichas con ese correo; una
 *      compra de un curso nuevo no se cuelga de la venta de otro. Y si la ficha
 *      más nueva no tenía venta, se mira en las de antes (duplicados).
 *   3. Por la suscripción de Stripe: la venta que la tiene, aunque el correo no
 *      encaje.
 *   4. Compra directa sin venta (solo desde la pasada de compras directas, con
 *      su interruptor y su espera): se crea la venta, sin gestora.
 *
 * Lo que no encaje se queda «sin asociar», como antes.
 *
 * `sinEsperarALaTienda` (lo pide el webhook de Stripe): el pedido se lee solo si
 * ya está guardado en el CRM. Si hay que pedírselo a la tienda, no se decide
 * nada aquí —devuelve { aplazado: true }— y quien llama lo enlaza después, ya
 * fuera de la respuesta a Stripe. Una tienda lenta no puede retrasar el aviso.
 */
async function ventaConLasReglasNuevas(projectId, payment, dbRow, { compraDirecta = false, sinEsperarALaTienda = false } = {}) {
  const email = payment.customer_email || dbRow.customer_email || null;
  const pedido = pedidoDeLaWeb(payment.metadata ?? dbRow.metadata);
  let formacion = null;
  if (pedido) {
    formacion = await formacionDelPedido(projectId, pedido, { soloGuardado: sinEsperarALaTienda });
    if (formacion === PEDIDO_SIN_LEER) return { aplazado: true };
  }
  const lead = email ? await model.findLeadByEmail(projectId, email) : null;
  let conv = lead ? await model.findConversionByLeadId(lead.id) : null;
  let ficha = lead;
  let metodoAuto = 'auto_email';

  if (lead && (!conv || formacion)) {
    const elegida = elegirVenta(await model.ventasPorCorreo(projectId, email), formacion?.id);
    conv = elegida;
    if (elegida) ficha = { id: elegida.lead_id, nombre: elegida.lead_nombre, responsable_id: elegida.responsable_id };
  }

  if (!conv) {
    const sub = await suscripcionDelCargoSuelto(projectId, payment, dbRow);
    const deLaSuscripcion = sub ? await model.ventaDeLaSuscripcion(projectId, sub) : null;
    if (deLaSuscripcion) {
      conv = deLaSuscripcion;
      ficha = { id: deLaSuscripcion.lead_id, nombre: deLaSuscripcion.lead_nombre, responsable_id: deLaSuscripcion.responsable_id };
      metodoAuto = 'auto_suscripcion';
    }
  }

  // Solo la pide la pasada de compras directas, que ya mira el interruptor y la espera.
  if (!conv && compraDirecta && pedido) {
    try {
      const creada = await crearVentaDeCompraDirecta({ projectId, payment: { ...payment, customer_email: email }, lead, formacion, orderId: pedido });
      if (creada) {
        conv = { id: creada.id };
        ficha = { id: creada.lead_id, nombre: lead?.nombre || payment.customer_name || null, responsable_id: lead?.responsable_id || null };
        metodoAuto = 'auto_compra_directa';
      }
    } catch (e) {
      logger.warn({ projectId, stripeId: payment.stripe_id, err: e.message, code: e.code },
        'compra directa: no se pudo crear la venta; el cargo se queda sin asociar');
    }
  }

  if (!conv) {
    if (lead) await model.linkPayment(dbRow.id, { leadId: lead.id, conversionId: null, conversionPaymentId: null, userId: null, method: 'auto_pending' });
    return null;
  }
  return { conv, ficha, metodoAuto, email };
}

async function enlazarSiSePuede(projectId, payment, dbRow, { compraDirecta = false, sinEsperarALaTienda = false } = {}) {
  if (dbRow.conversion_id) {
    await reengancharCobro(payment, dbRow);
    return;
  }
  // Apagado el interruptor, como siempre: sin correo en el cargo no se hace nada.
  const v2 = asociacionV2Activa();
  if (payment.status !== 'succeeded' || (!v2 && !payment.customer_email)) return;
  // Un cargo en otra moneda solo vale si su importe ya viene liquidado en euros.
  // Los importados sin el balance_transaction guardaron el importe en la moneda
  // del cargo: asociarlos meteria 270.000 pesos colombianos como 270.000 euros.
  const moneda = String(payment.currency || dbRow.currency || 'EUR').toUpperCase();
  if (moneda !== 'EUR') {
    logger.warn({ stripeId: payment.stripe_id, moneda, importe: payment.amount },
      'cargo en moneda extranjera sin convertir a euros: no se asocia');
    return;
  }

  const destino = v2
    ? await ventaConLasReglasNuevas(projectId, payment, dbRow, { compraDirecta, sinEsperarALaTienda })
    : await ventaComoSiempre(projectId, payment, dbRow);
  if (destino?.aplazado) return { aplazado: true };
  if (!destino) return;
  const { conv, ficha, metodoAuto, email } = destino;
  const fecha = new Date(payment.stripe_created_at * 1000).toISOString().slice(0, 10);
  // ¿Es realmente un duplicado? Lo es cuando la asesora ya registró ESE MISMO cobro a mano:
  // mismo importe y fecha muy próxima en la misma venta. No basta con que la venta esté
  // saldada — hay ventas cuyo importe_total quedó corto y siguen recibiendo mensualidades
  // legítimas, y bloquearlas dejaba el cobro sin factura.
  const dup = await model.findPagoDuplicado(conv.id, payment.amount, fecha, payment.stripe_id);
  if (dup) {
    // Se vincula al pago que ya existe (y a su factura, si la tiene) SIN volver a sumar.
    await model.linkPayment(dbRow.id, { leadId: ficha.id, conversionId: conv.id, conversionPaymentId: dup.id, userId: null, method: 'auto_dedup' });
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
  await model.linkPayment(dbRow.id, { leadId: ficha.id, conversionId: conv.id, conversionPaymentId: cpId, userId: null, method: metodoAuto });
  // El cobro queda registrado en la venta y espera EN LA COLA de facturacion.
  // La factura NO sale sola: la emite una persona cuando comprueba que los datos
  // del cliente estan bien. Antes se emitia aqui mismo, y salian facturas
  // numeradas con lo que hubiera en la ficha en ese momento.
  logger.info({ conversionId: conv.id, paymentId: cpId, stripeId: payment.stripe_id },
    'cobro de Stripe registrado; queda en la cola de facturacion');
  // Factura automatica (#764), si esta encendida en este campus: pide los datos
  // fiscales al alumno o, si ya los dio, emite la de este cobro.
  facturaAutomatica(conv.id, cpId);

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
  if (ficha.responsable_id) {
    const { notifyUsers } = await import('../notifications/notifications.service.js');
    const euros = Number(payment.amount).toLocaleString('es-ES', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });
    await notifyUsers({
      targetUserIds: [ficha.responsable_id],
      type: 'venta_automatica',
      title: `Cobro de ${euros} € de ${ficha.nombre || email}`,
      message: 'Entro por Stripe y se registro solo en su venta. Queda en la cola de facturacion.',
      link_path: `/prospectos/${ficha.id}`,
      metadata: { lead_id: ficha.id, conversion_id: conv.id, stripe_id: payment.stripe_id },
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
    // La misma puerta que el webhook y el sondeo de disputas (#396): se guarda en
    // `stripe_disputes`, se deja al dia el cargo y, si es nueva y abierta, se avisa.
    const { guardar } = await import('./disputas.service.js');
    await guardar(projectId, { ...d, charge }, { origen: 'sondeo' });
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
export async function filtroDeMetadata(projectId) {
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

export function deQuienEs(charge, filtro) {
  if (!filtro) return 'mio';
  const marca = charge?.metadata?.[filtro.clave];
  if (marca == null || marca === '') return 'sin_marcar';
  return String(marca) === filtro.valor ? 'mio' : 'ajeno';
}

/**
 * UN FALLO TIENE QUE QUEDAR APUNTADO, NO SOLO EN EL LOG.
 *
 * `stripe_sync_state.last_error` existia desde el principio y NADIE LO ESCRIBIA
 * NUNCA: la unica linea que lo tocaba lo ponia a null al terminar bien. O sea
 * que un proyecto cuya clave ha caducado falla cada cinco minutos y por fuera
 * se ve igual que uno sano — el panel de Estado lee justo ese campo para decir
 * si Stripe va (`piezas.service.js`), y decia que si.
 *
 * Importa mas ahora que los proyectos IA se conectan por access token y sin
 * webhook: la unica via por la que entra el dinero es este cron, y los tokens
 * de este tipo CADUCAN. El dia que venza, sin esto, la sincronizacion se para
 * y no se entera nadie hasta que alguien eche en falta cobros.
 *
 * `last_sync_at` NO se toca al fallar, a proposito: tiene que seguir diciendo
 * cuando fue la ultima vez que salio bien, que es la pregunta de verdad.
 */
async function apuntaElFallo(projectId, err) {
  try {
    await model.upsertSyncState(projectId, {
      last_error: String(err?.message || err).slice(0, 500),
    });
  } catch (e) {
    // Si ni siquiera se puede apuntar, al menos que se vea el porque.
    logger.error({ projectId, err: e.message }, 'Stripe sync: no se pudo apuntar el fallo');
  }
}

export async function syncStripePayments(projectId, opciones = {}) {
  try {
    return await sincroniza(projectId, opciones);
  } catch (err) {
    await apuntaElFallo(projectId, err);
    throw err;
  }
}

async function sincroniza(projectId, { fullHistory = false, retryPending = false, desdeElPrincipio = false } = {}) {
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
  /*
    EL HISTORICO ABSOLUTO, CUANDO ALGUIEN LO PIDE A PROPOSITO.

    Angel: «el contenido de stripe si que debe estar al dia, saca el completo,
    el historico absoluto».

    El corte sigue existiendo y sigue mandando en LO FACTURABLE, que es lo que
    el ticket llama «la regla que no se negocia»: hay 576 cobros anteriores al
    alta de su proyecto que ya se facturaron fuera, y cada uno que alguien
    asocie emite una factura repetida.

    Lo que cambia es que TENER el dato y PODER FACTURARLO dejan de ser la misma
    cosa. Se trae todo —asi el CRM cuadra con lo que dice Stripe, que es la
    ultima casilla del #44— y lo anterior al corte entra marcado y fuera del
    filtro de facturables.

    Las pantallas de dinero no se mueven por esto: Ventas y Facturacion leen
    `stripe_payments` cruzando por `conversion_payment_id`, o sea solo los
    cobros YA asociados a una venta. Un cargo viejo sin asociar no suma en
    ningun sitio.

    No es la opcion por defecto ni la del cron: hay que pedirla.
  */
  const corte = await model.fechaDeCorte(projectId);
  if (corte && desdeElPrincipio) {
    logger.warn({ projectId, corte },
      'Stripe sync: historico ABSOLUTO pedido a mano. Se ignora el corte para TRAER; ' +
      'lo anterior sigue sin ser facturable.');
  }
  if (corte && !desdeElPrincipio) {
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
  // ¿Se llego al final de la lista, o se corto por el tope de paginas?
  //
  // Empieza en FALSE y solo se pone a true al salir por «ya no hay mas». Salir
  // por el `while` --agotado el tope-- lo deja en false, que es exactamente el
  // caso que no puede mover la marca de agua.
  let completo = false;

  while (pages < MAX_PAGES) {
    const params = { limit: 100, 'expand[]': 'data.balance_transaction' };
    if (createdGte) params['created[gte]'] = createdGte;
    if (startingAfter) params.starting_after = startingAfter;

    const data = await stripeGet(apiKey, '/v1/charges', params);
    // Lista vacia: no hay nada nuevo que traer. Eso tambien es haber llegado
    // al final.
    if (!data.data?.length) { completo = true; break; }

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
        catch (e) { logger.error({ err: e.message, projectId, stripeId: ch.id }, 'stripe: el cargo no se pudo enlazar con su venta (sondeo)'); }
        await trasAsociarCargo(dbRow.id);
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
    if (!data.has_more) { completo = true; break; }
    startingAfter = data.data[data.data.length - 1].id;
    pages++;
  }


  // SE CORTO POR EL TOPE DE PAGINAS: la marca de agua NO se mueve.
  //
  // Stripe devuelve los cargos del mas nuevo al mas viejo. Al parar en la
  // pagina 200 se han visto los 20.000 mas recientes y NO los anteriores; si la
  // marca de agua avanzara al mas nuevo de todos, la siguiente vuelta empezaria
  // por delante y esos cobros mas viejos no se pedirian jamas. Se quedaria un
  // agujero permanente y en silencio, que es justo lo que no puede pasar cuando
  // el cron es la unica via por la que entra el dinero.
  //
  // Dejandola quieta, la siguiente vuelta vuelve a pedir desde el mismo sitio y
  // sigue bajando. Se tarda mas y no se pierde nada.
  if (pages >= MAX_PAGES && !completo) {
    logger.warn({ projectId, pages },
      'Stripe sync: cortado por el tope de paginas. La marca de agua no se mueve: ' +
      'quedan cobros mas antiguos por traer y la siguiente vuelta sigue por ahi.');
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
          customer_name: row.customer_name,
          customer_stripe_id: row.customer_stripe_id,
          metadata: row.metadata,
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
    // Y los que tienen venta pero se quedaron sin cobro (ver reengancharCobro).
    for (const row of await model.listConVentaSinCobro(projectId, 500)) {
      try {
        await reengancharCobro({
          status: row.status, amount: Number(row.amount),
          stripe_created_at: Number(row.stripe_created_at), stripe_id: row.stripe_id,
        }, row);
        if ((await model.getById(row.id))?.conversion_payment_id) reasociados++;
      } catch (e) {
        logger.warn({ stripeId: row.stripe_id, err: e.message }, 'reenganche al cobro fallido');
      }
    }
  } catch (e) {
    logger.warn({ err: e.message }, 'no se pudo reintentar la asociacion de pendientes');
  }

  // Las compras directas en la web que siguen sin venta (puerta 6). Con su
  // interruptor: apagado no hace nada. Va también en el sondeo porque una compra
  // en la web no la registra nadie: si esperara al botón, no saldría. Pero en el
  // sondeo, una vez por hora y campus como mucho: un pedido que la tienda no
  // encuentra se volvería a pedir cada 5 minutos.
  let ventasCreadas = 0;
  const ultima = ULTIMA_PASADA_COMPRAS.get(projectId) || 0;
  if (retryPending || Date.now() - ultima > PASADA_COMPRAS_CADA_MS) {
    ULTIMA_PASADA_COMPRAS.set(projectId, Date.now());
    try { ventasCreadas = (await comprasDirectasSinVenta(projectId)).creadas; }
    catch (e) { logger.warn({ projectId, err: e.message }, 'compra directa: la pasada falló; se reintenta en la siguiente'); }
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

  const avanzaLaMarca = completo;
  await model.upsertSyncState(projectId, {
    last_sync_at: new Date().toISOString(),
    last_full_sync_at: (fullHistory && completo) ? new Date().toISOString() : (state?.last_full_sync_at || null),
    last_synced_until: (avanzaLaMarca && lastCreated)
      ? new Date(lastCreated * 1000).toISOString()
      : (state?.last_synced_until || null),
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
  logger.info({ projectId, imported, ajenos, sinMarcar, sinMarcarViejos, disputesFound, pages, reasociados, ventasCreadas, completo }, 'Stripe sync OK');
  return { imported, ajenos, sinMarcar, sinMarcarViejos, disputes: disputesFound, pages, reasociados, ventasCreadas, completo };
}

// Cuándo pasó por última vez la pasada de compras directas en cada campus (en memoria).
const ULTIMA_PASADA_COMPRAS = new Map();
const PASADA_COMPRAS_CADA_MS = 60 * 60 * 1000;

/**
 * LA PASADA DE COMPRAS DIRECTAS (puerta 6, CRM#806).
 *
 * Los cargos de pedidos de la web que llevan más de COMPRA_DIRECTA_ESPERA_HORAS sin
 * venta: se vuelven a intentar asociar (la asesora pudo registrarla mientras) y, si
 * nada encaja, se crea la venta sin gestora con la formación del pedido. Pasa por la
 * misma reserva que todo enlace: aunque coincidan el sondeo y el botón, una venta
 * por cargo.
 */
export async function comprasDirectasSinVenta(projectId, { env = process.env, limite = 25 } = {}) {
  // Crear la venta es la regla 4 de las nuevas: sin ellas encendidas, tampoco.
  if (!compraDirectaActiva(env) || !asociacionV2Activa(env)) return { mirados: 0, creadas: 0 };
  const { esperaHoras, dias } = configCompraDirecta(env);
  const filas = await model.listComprasDirectasSinVenta(projectId, { esperaHoras, dias, limit: limite });
  let creadas = 0;
  for (const row of filas) {
    try {
      await autoLinkIfPossible(projectId, {
        stripe_id: row.stripe_id,
        status: row.status,
        amount: Number(row.amount),
        currency: row.currency,
        customer_email: row.customer_email,
        customer_name: row.customer_name,
        customer_stripe_id: row.customer_stripe_id,
        metadata: row.metadata,
        stripe_created_at: Number(row.stripe_created_at),
      }, row, { compraDirecta: true });
      const despues = await model.getById(row.id);
      if (despues?.link_method === 'auto_compra_directa') {
        creadas += 1;
        // Como cualquier cargo recién asociado: su suscripción, si la tiene (#747).
        await trasAsociarCargo(row.id);
      }
    } catch (e) {
      logger.warn({ projectId, stripeId: row.stripe_id, err: e.message }, 'compra directa: el cargo no se pudo procesar');
    }
  }
  if (filas.length) logger.info({ projectId, mirados: filas.length, creadas }, 'compras directas sin venta: pasada hecha');
  return { mirados: filas.length, creadas };
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
  // Asociado a mano también cuenta: si era la última cuota, la suscripción se cierra (#747).
  if (cpId) await trasAsociarCargo(stripePaymentId);
  // Asociar el cargo NO emite la factura: el cobro queda registrado en la venta y
  // espera en la cola. La emite una persona cuando comprueba que los datos del
  // cliente estan bien.
  if (cpId) {
    logger.info({ conversionId, paymentId: cpId, stripePaymentId },
      'cargo de Stripe asociado a mano; queda en la cola de facturacion');
    if (!yaExistia) facturaAutomatica(conversionId, cpId); // #764, si esta encendida
  }
}

/**
 * Factura automatica (#764). No bloquea: el cobro ya esta apuntado y, si esto
 * falla, sigue en la cola como siempre. Apagada, ni siquiera carga el modulo.
 */
function facturaAutomatica(conversionId, paymentId) {
  if (!facturaAutomaticaActiva() || !conversionId || !paymentId) return;
  import('../factura-automatica/factura-automatica.service.js')
    .then((fa) => fa.alCobrar({ conversionId, paymentId }))
    .catch((err) => logger.warn({ err: err.message, conversionId, paymentId }, 'factura automatica: fallo con un cobro de Stripe'));
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

/**
 * El enlace de un cargo que llega por el AVISO de Stripe (puerta 6, CRM#806).
 *
 * Stripe espera la respuesta unos segundos y reintenta si no llega. Por eso aquí
 * el pedido de la web se lee solo si ya está guardado en el CRM; si hay que
 * pedírselo a la tienda (hasta 15 s), el cargo se enlaza DESPUÉS, fuera de la
 * respuesta. Pasa por la misma reserva que todo enlace: no se apunta dos veces.
 * Con el interruptor de las reglas nuevas apagado nunca se aplaza nada.
 */
async function enlazarDesdeElAviso(projectId, payment, dbRow) {
  const r = await autoLinkIfPossible(projectId, payment, dbRow, { sinEsperarALaTienda: true });
  if (!r?.aplazado) return;
  setImmediate(() => {
    autoLinkIfPossible(projectId, payment, dbRow)
      .then(async () => {
        // Como cualquier cargo recién asociado: su suscripción, si la tiene (#747).
        if ((await model.getById(dbRow.id))?.conversion_payment_id) await trasAsociarCargo(dbRow.id);
      })
      .catch((e) => logger.warn({ err: e.message, projectId, stripeId: payment.stripe_id },
        'stripe: el cargo de un pedido de la web no se pudo enlazar tras el aviso; queda sin asociar'));
  });
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
      try { await enlazarDesdeElAviso(projectId, payment, dbRow); }
      catch (e) { logger.error({ err: e.message, projectId, stripeId: payment.stripe_id }, 'stripe: el cargo no se pudo enlazar con su venta (aviso)'); }
      if (event.type === 'charge.succeeded') await trasAsociarCargo(dbRow.id);
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
      // `obj` es la disputa. Antes era un UPDATE sobre el cargo: si el CRM no lo
      // tenia (anterior al corte del alta, o que nunca entro), la disputa se
      // perdia sin aviso. Ahora se guarda siempre en `stripe_disputes`, se deja
      // al dia el cargo si existe y, si es nueva y abierta, se avisa (#396).
      const { desdeElWebhook } = await import('./disputas.service.js');
      const r = await desdeElWebhook(projectId, obj, apiKey);
      if (r?.skipped) return { skipped: r.skipped, stripeId: obj.id };
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
          try { await enlazarDesdeElAviso(projectId, payment, dbRow); }
          catch (e) { logger.error({ err: e.message, projectId, stripeId: payment.stripe_id }, 'stripe: el cargo no se pudo enlazar con su venta (payment_intent)'); }
          if (event.type === 'payment_intent.succeeded') await trasAsociarCargo(dbRow.id);
        } catch (e) { logger.warn({ err: e.message }, 'fetch charge from PI failed'); }
      }
      return { processed: event.type, stripeId: obj.id };
    }
    default:
      return { skipped: event.type };
  }
}
