// Servicio de Egresos (EPIC B; emparejado en los dos CRM en #227).
// Centraliza la lógica de negocio. El controller solo hace I/O HTTP.
// Aquí cuelgan los hooks que crean egresos solos (B0 Stripe, C cuenta por pagar).

import * as model from './expense.model.js';
import { AppError } from '../../shared/utils/AppError.js';
import { logger } from '../../shared/utils/logger.js';
import { veTodoElCrm, campusDeLaPersona } from '../../shared/utils/ambito.js';
import { saveLocal, getLocal, deleteLocal } from '../../shared/services/localStorage.service.js';
import crypto from 'crypto';

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
// El mismo tope que `uploadDoc` (multer corta antes en 10 MB). Antes el
// servicio decía 15 y la pantalla también: se podía elegir un fichero de 12 MB
// que el servidor rechazaba con un error que no lo explicaba.
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

function extFromMime(mime) {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'bin';
}

export function esAutomatico(e) {
  return !!(e?.source_payable_id || e?.source_stripe_payout_id);
}

// ============================================================
// Permisos por ámbito (#245)
// ============================================================

/*
  SIEMPRE DENTRO DE LO TUYO. El listado ya lo hacía `proyectosDelAmbito`, pero
  crear, editar, ver uno y borrar no miraban nada: un admin de CEDIA podía
  apuntar un gasto en un campus de ICTESS, o borrarlo sabiendo su número.
  Super admin y soporte lo ven todo, como en el resto del CRM.
*/

/** ¿Puede esta persona VER este gasto? Lo mismo que decide el listado. */
async function loVe(user, gasto, mios) {
  if (veTodoElCrm(user)) return true;
  if (gasto.project_id) return mios.includes(Number(gasto.project_id));
  if (gasto.issuer_id) return model.empresaTieneAlgunCampus(gasto.issuer_id, mios);
  return true; // general: ya cuenta en sus totales, así que se puede mirar
}

/** ¿Puede apuntar un gasto AHÍ (campus, empresa o general)? */
async function puedeApuntarAhi(user, destino, mios) {
  if (veTodoElCrm(user)) return;
  if (destino.project_id) {
    if (!mios.includes(Number(destino.project_id))) {
      throw new AppError('No tienes acceso a ese campus', 403, 'FORBIDDEN');
    }
    return;
  }
  if (destino.issuer_id) {
    if (!(await model.empresaTieneAlgunCampus(destino.issuer_id, mios))) {
      throw new AppError('No tienes acceso a esa empresa', 403, 'FORBIDDEN');
    }
    return;
  }
  // Un gasto general cuenta en TODAS las empresas: solo lo apunta quien las ve.
  throw new AppError('Elige un campus o una empresa: un egreso general de todo el CRM solo lo apunta un super admin', 403, 'FORBIDDEN');
}

async function cargarVisible(id, user) {
  const gasto = await model.findExpenseById(id);
  if (!gasto) throw new AppError('Egreso no encontrado', 404, 'NOT_FOUND');
  const mios = veTodoElCrm(user) ? [] : await campusDeLaPersona(user?.userId);
  // 404 y no 403: decir «existe pero no es tuyo» ya es contar algo.
  if (!(await loVe(user, gasto, mios))) throw new AppError('Egreso no encontrado', 404, 'NOT_FOUND');
  return { gasto, mios };
}

// ============================================================
// CRUD
// ============================================================

export async function getVisible(id, user) {
  return (await cargarVisible(id, user)).gasto;
}

export async function create(data, user) {
  const mios = veTodoElCrm(user) ? [] : await campusDeLaPersona(user?.userId);
  await puedeApuntarAhi(user, data, mios);
  const exp = await model.createExpense(data, user?.userId ?? null);
  logger.info({ expenseId: exp.id, categoria: exp.categoria, importe: exp.importe }, 'Egreso registrado');
  return exp;
}

export async function update(id, fields, user) {
  const { gasto, mios } = await cargarVisible(id, user);
  if (esAutomatico(gasto)) {
    throw new AppError('Egreso automático: se corrige desde su origen (cuenta por pagar o Stripe)', 409, 'AUTO_EXPENSE');
  }
  // Un gasto general solo lo toca quien puede apuntarlo.
  if (!gasto.project_id && !gasto.issuer_id) await puedeApuntarAhi(user, gasto, mios);

  const cambios = { ...fields };
  const cambiaDestino = fields.project_id !== undefined || fields.issuer_id !== undefined;
  if (cambiaDestino) {
    // El destino final, mezclando lo que llega con lo que había.
    const project_id = fields.project_id !== undefined ? fields.project_id : gasto.project_id;
    const issuer_id = project_id ? null : (fields.issuer_id !== undefined ? fields.issuer_id : gasto.issuer_id);
    await puedeApuntarAhi(user, { project_id, issuer_id }, mios);
    cambios.project_id = project_id ?? null;
    cambios.issuer_id = issuer_id ?? null;
  }

  const updated = await model.updateExpense(id, cambios);
  if (!updated) throw new AppError('Sin cambios o egreso no encontrado', 400, 'NO_FIELDS_OR_NOT_FOUND');
  return updated;
}

export async function remove(id, user) {
  const { gasto, mios } = await cargarVisible(id, user);
  if (esAutomatico(gasto)) {
    throw new AppError('Egreso automático: se corrige desde su origen (cuenta por pagar o Stripe)', 409, 'AUTO_EXPENSE');
  }
  if (!gasto.project_id && !gasto.issuer_id) await puedeApuntarAhi(user, gasto, mios);
  // Antes de borrar el expense, eliminar el archivo de comprobante si tiene.
  if (gasto.comprobante_key) {
    try { await deleteLocal(`expenses/${gasto.comprobante_key}`); } catch (err) {
      logger.warn({ err: err.message, key: gasto.comprobante_key }, 'No se pudo borrar comprobante (no crítico)');
    }
  }
  await model.deleteExpense(id);
  return { deleted: true };
}

// ============================================================
// Comprobante (upload / download)
// ============================================================

/**
 * Guarda el archivo de comprobante en local storage y devuelve los metadatos
 * para que el frontend los anexe al payload de create/update del expense.
 * No crea el expense: eso lo hace luego POST /api/expenses.
 */
export async function uploadComprobante({ buffer, mime, size, baseUrl = '' }) {
  if (!ALLOWED_MIMES.has(mime)) {
    throw new AppError('Formato no permitido. Solo PDF, JPG, PNG, WEBP.', 400, 'INVALID_MIME');
  }
  if (size > MAX_SIZE_BYTES) {
    throw new AppError(`Archivo demasiado grande (máx ${MAX_SIZE_BYTES / 1024 / 1024} MB)`, 400, 'TOO_LARGE');
  }
  const ext = extFromMime(mime);
  const hash = crypto.randomBytes(8).toString('hex');
  // Key SIN barra en medio para que `/comprobante/:key` no confunda la ruta.
  // En disco va en `expenses/<key>`.
  const key = `${Date.now()}-${hash}.${ext}`;
  await saveLocal(`expenses/${key}`, buffer);
  return {
    comprobante_url: `${baseUrl}/api/expenses/comprobante/${key}`,
    comprobante_key: key,
    comprobante_mime: mime,
    comprobante_size_bytes: size,
  };
}

/**
 * Lee el archivo de comprobante. Anti path-traversal: la key no puede llevar
 * barras ni '..'. Vale para las claves viejas de MultiCRM, que se guardaron
 * con la dirección `/api/accounting/expenses/comprobante/…`: el disco es el
 * mismo y la dirección vieja sigue respondiendo (alias del módulo).
 */
export async function downloadComprobante(key) {
  if (typeof key !== 'string' || !key.length) {
    throw new AppError('Key requerida', 400, 'INVALID_KEY');
  }
  if (key.includes('/') || key.includes('..') || key.includes('\\')) {
    throw new AppError('Key inválida', 400, 'INVALID_KEY');
  }
  try {
    const { buffer, size } = await getLocal(`expenses/${key}`);
    return { buffer, size };
  } catch (err) {
    if (err.code === 'ENOENT') throw new AppError('Comprobante no encontrado', 404, 'NOT_FOUND');
    throw err;
  }
}

// ============================================================
// Hooks: egresos que crea el sistema (EPIC B0 / C)
// ============================================================

/**
 * EPIC B0 (Stripe): registra un expense por el fee de un payout de Stripe.
 * Idempotente: si ya existe un expense para ese payout, devuelve el existente.
 */
export async function createFromStripePayout({ projectId, importe, fecha, descripcion, stripePayoutId }) {
  const existing = await model.findBySourceStripePayoutId(stripePayoutId);
  if (existing) return existing;
  return await model.createExpense({
    project_id: projectId,
    concepto: descripcion || `Fee Stripe payout ${stripePayoutId}`,
    importe,
    fecha: fecha || new Date().toISOString().slice(0, 10),
    categoria: 'comision_pasarela_pago',
    notas: null,
    source_stripe_payout_id: stripePayoutId,
  }, null);
}

/**
 * EPIC C: registra expense cuando una cuenta por pagar se completa al 100%.
 * Idempotente: si ya existe expense con ese source_payable_id, devuelve el existente.
 */
export async function createFromPayable({ projectId, importe, fecha, concepto, categoria, payableId }) {
  const existing = await model.findBySourcePayableId(payableId);
  if (existing) return existing;
  return await model.createExpense({
    project_id: projectId,
    concepto: concepto || `Pago cuenta por pagar #${payableId}`,
    importe,
    fecha: fecha || new Date().toISOString().slice(0, 10),
    categoria: categoria || 'otros',
    notas: null,
    source_payable_id: payableId,
  }, null);
}
