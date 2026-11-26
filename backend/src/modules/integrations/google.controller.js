import { z } from 'zod';
import { AppError } from '../../shared/utils/AppError.js';
import { anotar, ACCIONES } from '../credentials/credentials.registro.js';
import * as google from './google.service.js';

/**
 * Integraciones › Google Analytics 4 y Search Console (CRM#1099). El campus es
 * `req.projectId`, el que ya comprobó `projectAccess`. Nada de aquí devuelve la
 * `private_key`: solo el correo de la cuenta, la propiedad y el estado.
 */

const guardarSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  // El JSON de la clave tal cual (texto) o ya leído. Opcional: sin él se queda el guardado.
  json: z.union([z.string().min(2).max(20000), z.record(z.string(), z.any())]).optional().nullable(),
  misma_cuenta: z.boolean().optional(),
  property_id: z.union([z.string().max(40), z.number()]).optional().nullable(),
  site_url: z.string().max(255).optional().nullable(),
}).strict();

const sitiosSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  json: z.union([z.string().min(2).max(20000), z.record(z.string(), z.any())]).optional().nullable(),
  misma_cuenta: z.boolean().optional(),
}).strict();

const leer = (schema, datos) => {
  const r = schema.safeParse(datos);
  if (!r.success) throw new AppError(r.error.issues[0]?.message || 'Datos no válidos', 400, 'VALIDATION_ERROR');
  return r.data;
};

/** GET /google/:servicio?projectId= */
export async function ver(req, res, next) {
  try {
    res.json({ success: true, data: await google.estado(req.params.servicio, req.projectId) });
  } catch (err) { next(err); }
}

/** PUT /google/:servicio — guarda el JSON y la propiedad del campus. */
export async function guardar(req, res, next) {
  try {
    const s = google.servicioDe(req.params.servicio);
    const datos = leer(guardarSchema, req.body || {});
    const { nueva } = await google.guardar(req.params.servicio, req.projectId, {
      json: datos.json || null,
      misma_cuenta: datos.misma_cuenta === true,
      property_id: datos.property_id ?? null,
      site_url: datos.site_url ?? null,
    }, req.user.userId);
    await anotar(req, nueva ? ACCIONES.CREAR : ACCIONES.CAMBIAR, {
      servicio: s.servicio, projectId: req.projectId, entorno: 'produccion',
    });
    res.json({ success: true, data: await google.estado(req.params.servicio, req.projectId) });
  } catch (err) { next(err); }
}

/** POST /google/:servicio/probar — una llamada real y mínima a Google. */
export async function probar(req, res, next) {
  try {
    const s = google.servicioDe(req.params.servicio);
    const r = await google.probar(req.params.servicio, req.projectId);
    await anotar(req, ACCIONES.PROBAR, { servicio: s.servicio, projectId: req.projectId, entorno: 'produccion' });
    res.json({ success: true, data: { ...r, estado: await google.estado(req.params.servicio, req.projectId) } });
  } catch (err) { next(err); }
}

/** POST /google/gsc/sitios — las propiedades de Search Console que ve la cuenta. */
export async function sitios(req, res, next) {
  try {
    const datos = leer(sitiosSchema, req.body || {});
    const lista = await google.sitiosDeSearchConsole(req.projectId, {
      json: datos.json || null, misma_cuenta: datos.misma_cuenta === true,
    });
    res.json({ success: true, data: lista });
  } catch (err) { next(err); }
}

/** DELETE /google/:servicio?projectId= — quita la credencial (lo ya traído se queda). */
export async function quitar(req, res, next) {
  try {
    const s = google.servicioDe(req.params.servicio);
    const { id } = await google.quitar(req.params.servicio, req.projectId);
    await anotar(req, ACCIONES.BORRAR, { servicio: s.servicio, projectId: req.projectId, entorno: 'produccion', id });
    res.json({ success: true, data: await google.estado(req.params.servicio, req.projectId) });
  } catch (err) { next(err); }
}
