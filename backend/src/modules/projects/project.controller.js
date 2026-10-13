import * as model from './project.model.js';
import * as service from './project.service.js';
import { createProjectSchema, updateProjectSchema, createSociedadSchema } from './project.validation.js';
import { AppError } from '../../shared/utils/AppError.js';
import { saveLocal, getLocal, deleteLocal } from '../../shared/services/localStorage.service.js';
import crypto from 'crypto';
import { catalogo, tiposEnLaBase } from './tipos.js';

export async function list(req, res, next) {
  try {
    const projects = await model.findAll({ active: req.query.active });
    res.json({ success: true, data: projects });
  } catch (err) { next(err); }
}

export async function getById(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw new AppError('ID invalido', 400, 'INVALID_ID');
    const project = await model.findById(id);
    if (!project) throw new AppError('Proyecto no encontrado', 404, 'NOT_FOUND');
    res.json({ success: true, data: project });
  } catch (err) { next(err); }
}

/**
 * GET /api/projects/types — los tipos de proyecto que hay (#15).
 *
 * Con `disponible` en cada uno: la base es un enum de Postgres y los tipos
 * nuevos no entran hasta que se aplique la migracion 140.
 */
export async function types(req, res, next) {
  try {
    res.json({ success: true, data: await catalogo() });
  } catch (err) { next(err); }
}

/**
 * ¿Puede la base guardar este tipo?
 *
 * Sin esto, elegir un tipo que la migracion todavia no ha creado no da un error
 * entendible: Postgres contesta 22P02 «invalid input value for enum» y el
 * manejador lo tapa con «error del sistema». Ya nos costo media hora con
 * `lead_status` y `proxima_convocatoria`, buscando en el sitio equivocado.
 *
 * Aqui se dice lo que pasa y que hay que hacer.
 */
async function exigirTipoQueLaBaseAcepte(tipo) {
  if (!tipo) return;
  const hay = await tiposEnLaBase();
  if (!hay.includes(tipo)) {
    throw new AppError(
      `El tipo «${tipo}» todavia no esta habilitado en la base de datos. Falta aplicar la migracion 140.`,
      409, 'TIPO_NO_DISPONIBLE'
    );
  }
}

export async function create(req, res, next) {
  try {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    await exigirTipoQueLaBaseAcepte(parsed.data.type);
    const exists = await model.slugExists(parsed.data.slug);
    if (exists) throw new AppError('El slug ya existe', 409, 'SLUG_EXISTS');
    // Por el servicio: el campus llega a los admins de su empresa (#220).
    const project = await service.crear(parsed.data);
    res.status(201).json({ success: true, data: project });
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw new AppError('ID invalido', 400, 'INVALID_ID');
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    await exigirTipoQueLaBaseAcepte(parsed.data.type);
    const updated = await service.actualizar(id, parsed.data);
    if (!updated) throw new AppError('No se actualizo', 400, 'NO_FIELDS');
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

function mimeExt(mime) {
  if (mime === 'image/svg+xml') return 'svg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}
function extMime(ext) {
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export async function uploadLogo(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw new AppError('ID invalido', 400, 'INVALID_ID');
    if (!req.file) throw new AppError('Imagen requerida (campo file)', 400, 'FILE_REQUIRED');

    const project = await model.findById(id);
    if (!project) throw new AppError('Proyecto no encontrado', 404, 'NOT_FOUND');

    if (project.logo_key) {
      try { await deleteLocal(project.logo_key); } catch {}
    }

    const ext = mimeExt(req.file.mimetype);
    const key = `logos/project-${id}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
    await saveLocal(key, req.file.buffer);

    const logoUrl = `/api/projects/${id}/logo?v=${Date.now()}`;
    const updated = await model.update(id, { logo_url: logoUrl, logo_key: key });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

export async function getLogo(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw new AppError('ID invalido', 400, 'INVALID_ID');
    const project = await model.findById(id);
    if (!project?.logo_key) return res.status(404).end();

    const ext = project.logo_key.split('.').pop();
    let buffer, size;
    try {
      ({ buffer, size } = await getLocal(project.logo_key));
    } catch (e) {
      if (e.code === 'ENOENT') return res.status(404).end();
      throw e;
    }
    res.setHeader('Content-Type', extMime(ext));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Length', size);
    res.end(buffer);
  } catch (err) { next(err); }
}

export async function deleteLogo(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw new AppError('ID invalido', 400, 'INVALID_ID');
    const project = await model.findById(id);
    if (!project) throw new AppError('Proyecto no encontrado', 404, 'NOT_FOUND');
    if (project.logo_key) {
      try { await deleteLocal(project.logo_key); } catch {}
    }
    const updated = await model.update(id, { logo_url: null, logo_key: null });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

export async function listSociedades(req, res, next) {
  try {
    const rows = await model.listSociedades();
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

export async function createSociedad(req, res, next) {
  try {
    const parsed = createSociedadSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    const soc = await model.createSociedad(parsed.data);
    res.status(201).json({ success: true, data: soc });
  } catch (err) { next(err); }
}

export async function regenerateKey(req, res, next) {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) throw new AppError('ID invalido', 400, 'INVALID_ID');
    const newKey = await model.regenerateWebhookKey(id);
    if (!newKey) throw new AppError('Proyecto no encontrado', 404, 'NOT_FOUND');
    res.json({ success: true, data: { webhook_api_key: newKey } });
  } catch (err) { next(err); }
}
