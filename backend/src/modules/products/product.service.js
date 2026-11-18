import * as ProductModel from './product.model.js';
import { AppError } from '../../shared/utils/AppError.js';
import { uploadToR2, deleteFromR2 } from '../../shared/services/r2.service.js';
import { generatePresignedUrl } from '../../shared/utils/presignedUrl.js';
import { logger } from '../../shared/utils/logger.js';
import { query } from '../../shared/config/db.js';

export async function listByProject(projectId, opts = {}) {
  return ProductModel.findByProject(projectId, opts);
}

export async function getById(id, projectId) {
  const product = await ProductModel.findById(id);
  if (!product) throw new AppError('Producto no encontrado', 404, 'PRODUCT_NOT_FOUND');
  if (product.project_id !== projectId) throw new AppError('No tienes acceso a este producto', 403, 'FORBIDDEN');
  return product;
}

/**
 * #770 · El responsable de desarrollar un curso: un tutor o un tutor redactor de
 * alta. Lo comprueba el servidor: el desplegable solo propone, y sin esto se
 * podría fijar a cualquiera (y la venta acabaría asignándole el pendiente).
 */
async function comprobarResponsable(data) {
  if (!data.responsable_desarrollo_id) return;
  const { rows } = await query(
    `SELECT 1 FROM users WHERE id = $1 AND role IN ('tutor', 'tutor_redactor') AND active`, [data.responsable_desarrollo_id]);
  if (!rows.length) throw new AppError('El responsable tiene que ser un tutor o un tutor redactor activo', 400, 'VALIDATION_ERROR');
}

export async function create(data) {
  const existing = await ProductModel.findByProjectAndName(data.projectId, data.nombre);
  if (existing) throw new AppError('Ya existe un producto con ese nombre en este proyecto', 409, 'PRODUCT_DUPLICATE');
  await comprobarResponsable(data);
  return ProductModel.create(data);
}

export async function update(id, projectId, data) {
  const product = await getById(id, projectId);
  if (data.nombre && data.nombre !== product.nombre) {
    const existing = await ProductModel.findByProjectAndName(projectId, data.nombre);
    if (existing) throw new AppError('Ya existe un producto con ese nombre en este proyecto', 409, 'PRODUCT_DUPLICATE');
  }
  await comprobarResponsable(data);
  return ProductModel.update(id, data);
}

export async function deactivate(id, projectId) {
  await getById(id, projectId);
  return ProductModel.deactivate(id);
}

const R2_PREFIX = 'r2://';

function extOf(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/svg+xml') return 'svg';
  return 'bin';
}

function isR2Configured() {
  return process.env.CLOUDFLARE_R2_ACCOUNT_ID
    && process.env.CLOUDFLARE_R2_ACCOUNT_ID !== 'test'
    && process.env.CLOUDFLARE_R2_ACCESS_KEY
    && process.env.CLOUDFLARE_R2_ACCESS_KEY !== 'test';
}

export async function uploadImage(id, projectId, file) {
  const product = await getById(id, projectId);
  if (!file) throw new AppError('Archivo requerido', 400, 'FILE_REQUIRED');

  // Si ya tenia una imagen R2 previa, intentar borrarla (best-effort).
  if (product.image_url && product.image_url.startsWith(R2_PREFIX)) {
    const oldKey = product.image_url.slice(R2_PREFIX.length);
    deleteFromR2(oldKey).catch(err => logger.warn({ err, oldKey }, 'No se pudo borrar imagen previa'));
  }

  if (!isR2Configured()) {
    throw new AppError('R2 no esta configurado en este entorno', 503, 'STORAGE_UNAVAILABLE');
  }

  const ext = extOf(file.mimetype);
  const key = `products/${projectId}/${id}/${Date.now()}.${ext}`;
  await uploadToR2(key, file.buffer, file.mimetype);

  const stored = `${R2_PREFIX}${key}`;
  const updated = await ProductModel.update(id, { image_url: stored });
  return updated;
}

export async function removeImage(id, projectId) {
  const product = await getById(id, projectId);
  if (product.image_url && product.image_url.startsWith(R2_PREFIX)) {
    const oldKey = product.image_url.slice(R2_PREFIX.length);
    deleteFromR2(oldKey).catch(err => logger.warn({ err, oldKey }, 'No se pudo borrar imagen R2'));
  }
  return ProductModel.update(id, { image_url: null });
}

// Resuelve image_url a una URL accesible. Si es r2://, devuelve presigned URL.
// Si ya es http(s), la devuelve tal cual.
export async function resolveImageUrl(imageUrl) {
  if (!imageUrl) return null;
  if (imageUrl.startsWith(R2_PREFIX)) {
    return generatePresignedUrl(imageUrl.slice(R2_PREFIX.length));
  }
  return imageUrl;
}
