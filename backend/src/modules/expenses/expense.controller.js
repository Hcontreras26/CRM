import * as model from './expense.model.js';
import * as service from './expense.service.js';
import {
  createExpenseSchema,
  updateExpenseSchema,
  listExpensesSchema,
  resumenExpensesSchema,
} from './expense.validation.js';
import { AppError } from '../../shared/utils/AppError.js';
import { proyectosDelAmbito } from '../../shared/utils/ambito.js';

function validar(schema, datos) {
  const parsed = schema.safeParse(datos);
  if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
  return parsed.data;
}

function idDe(req) {
  const id = parseInt(req.params.id);
  if (isNaN(id)) throw new AppError('ID invalido', 400, 'INVALID_ID');
  return id;
}

// ---------- LISTADO Y RESUMEN ----------

// Egresos es de Finanzas, y Finanzas va POR EMPRESA (Diego, 15/09: «finanzas
// es por empresa claramente»): con una empresa en la cabecera llega
// `issuerId` y `proyectosDelAmbito` lo traduce a sus campus --siempre dentro
// de los de la persona (#245)--. En ISEIE, sin selector de empresa, llega un
// campus o nada, y el mismo código vale.
export async function listExpenses(req, res, next) {
  try {
    const filtros = validar(listExpensesSchema, req.query);
    const result = await model.listExpenses({ ...filtros, ...(await proyectosDelAmbito(req)) });
    res.json({
      success: true,
      data: result.expenses,
      pagination: { total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages },
    });
  } catch (err) { next(err); }
}

export async function resumen(req, res, next) {
  try {
    const filtros = validar(resumenExpensesSchema, req.query);
    const data = await model.resumenExpenses({ ...filtros, ...(await proyectosDelAmbito(req)) });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// ---------- CRUD ----------

export async function getExpense(req, res, next) {
  try {
    const expense = await service.getVisible(idDe(req), req.user);
    res.json({ success: true, data: expense });
  } catch (err) { next(err); }
}

export async function createExpense(req, res, next) {
  try {
    const data = validar(createExpenseSchema, req.body);
    const expense = await service.create(data, req.user);
    res.status(201).json({ success: true, data: expense });
  } catch (err) { next(err); }
}

export async function updateExpense(req, res, next) {
  try {
    const id = idDe(req);
    const data = validar(updateExpenseSchema, req.body);
    const updated = await service.update(id, data, req.user);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

export async function deleteExpense(req, res, next) {
  try {
    await service.remove(idDe(req), req.user);
    res.json({ success: true, data: { message: 'Egreso eliminado' } });
  } catch (err) { next(err); }
}

// ---------- COMPROBANTE ----------

/**
 * POST /api/expenses/upload-comprobante
 * Devuelve {comprobante_url, key, mime, size}, que el frontend anexa luego al
 * payload del create/update. Multer ya dejó el archivo en req.file (`uploadDoc`).
 */
export async function uploadComprobante(req, res, next) {
  try {
    if (!req.file) throw new AppError('Archivo requerido (campo "file")', 400, 'FILE_REQUIRED');
    const baseUrl = process.env.API_PUBLIC_BASE_URL || ''; // relativo si vacío
    const result = await service.uploadComprobante({
      buffer: req.file.buffer,
      mime: req.file.mimetype,
      size: req.file.size,
      baseUrl,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

/**
 * GET /api/expenses/comprobante/:key
 * Va con el token en la cabecera: la pantalla lo pide por fetch y lo abre como
 * blob. Un enlace normal del navegador no manda `Authorization` y daba 401
 * siempre (auditoría de Finanzas, 4.3).
 */
export async function downloadComprobante(req, res, next) {
  try {
    const key = decodeURIComponent(req.params.key || '');
    const { buffer } = await service.downloadComprobante(key);
    const ext = key.split('.').pop()?.toLowerCase();
    const ctype = ext === 'pdf' ? 'application/pdf'
      : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
      : ext === 'png' ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : 'application/octet-stream';
    res.setHeader('Content-Type', ctype);
    res.setHeader('Content-Disposition', `inline; filename="${key}"`);
    res.send(buffer);
  } catch (err) { next(err); }
}
