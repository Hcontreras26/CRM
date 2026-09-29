import { z } from 'zod';
import * as model from './connectors.model.js';
import * as service from './connectors.service.js';
import { AppError } from '../../shared/utils/AppError.js';
import { proyectosDelAmbito, comoLista } from '../../shared/utils/ambito.js';

const VALID_TYPES = ['woocommerce_products', 'woocommerce_orders', 'wp_rest', 'acf', 'custom_api'];
const VALID_DESTINATIONS = ['product', 'lead', 'matricula', 'category'];

const createSchema = z.object({
  project_id:   z.number().int().positive(),
  type:         z.enum(VALID_TYPES),
  label:        z.string().min(1).max(150),
  destination:  z.enum(VALID_DESTINATIONS).default('product'),
  config:       z.record(z.any()).optional(),
  field_mapping: z.record(z.any()).optional(),
});

const updateSchema = z.object({
  label:         z.string().min(1).max(150).optional(),
  destination:   z.enum(VALID_DESTINATIONS).optional(),
  config:        z.record(z.any()).optional(),
  field_mapping: z.record(z.any()).optional(),
  active:        z.boolean().optional(),
});

/**
 * Las credenciales del conector NO salen de aqui.
 *
 * `config` guarda el `consumer_secret` de WooCommerce, la contrasena de
 * aplicacion de WordPress y el `bearer_token` de una API propia — y el modelo
 * las devuelve enteras, tanto al listar como al pedir una. O sea que estaban
 * viajando al navegador en cada carga de la pantalla, en texto plano.
 *
 * Se tapan AQUI y no en el modelo a proposito: `previewConnector` y el importador
 * leen del modelo y necesitan el valor de verdad para llamar al API externo. Lo
 * que no puede salir es por la puerta HTTP.
 *
 * Se manda `true`/`false` en vez del valor: la pantalla necesita saber si hay
 * algo guardado —para decir «•••• guardado, escribe para cambiarlo»— pero no
 * necesita el secreto para nada.
 *
 * Es la misma regla del panel de claves (#80): el valor no se devuelve nunca en
 * un listado.
 */
const SECRETOS = ['consumer_secret', 'wp_app_password', 'bearer_token', 'password', 'api_key', 'token'];

function sinSecretos(conector) {
  if (!conector) return conector;
  const config = { ...(conector.config || {}) };
  const guardados = {};
  for (const clave of Object.keys(config)) {
    if (!SECRETOS.includes(clave)) continue;
    guardados[clave] = Boolean(config[clave]);
    delete config[clave];
  }
  return { ...conector, config, secretos_guardados: guardados };
}

function cid(req) {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id <= 0) throw new AppError('id inválido', 400, 'INVALID_ID');
  return id;
}

/**
 * Con un campus, los suyos. Con una EMPRESA (`issuerId`), los de todos sus
 * campus —Diego, 29/09: «no puedo estar con la empresa»—: cada conector sigue
 * siendo de un campus y sale con su nombre, y al crearlo se elige cuál.
 */
export async function list(req, res, next) {
  try {
    const { projectId, projectIds } = await proyectosDelAmbito(req);
    const ids = comoLista(projectId, projectIds);
    if (!ids || ids.some((id) => !Number.isInteger(id))) {
      throw new AppError('Elige un campus o una empresa', 400, 'PROJECT_REQUIRED');
    }
    const conectores = await model.listByProjects(ids);
    res.json({ success: true, data: conectores.map(sinSecretos) });
  } catch (err) { next(err); }
}

export async function getById(req, res, next) {
  try {
    const c = await model.findById(cid(req));
    if (!c) throw new AppError('No encontrado', 404, 'NOT_FOUND');
    res.json({ success: true, data: sinSecretos(c) });
  } catch (err) { next(err); }
}

export async function create(req, res, next) {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    const c = await model.create(parsed.data);
    res.status(201).json({ success: true, data: sinSecretos(c) });
  } catch (err) { next(err); }
}

export async function update(req, res, next) {
  try {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');

    // GUARDAR NO PUEDE BORRAR EL SECRETO QUE NO SE MANDO.
    //
    // `update` reemplaza `config` entero. Como la pantalla lo recibe SIN los
    // secretos —los tapa `sinSecretos`— devolverlo tal cual al cambiar la
    // etiqueta dejaria el conector sin `consumer_secret` y sin decir nada: la
    // proxima importacion fallaria con un 401 y nadie relacionaria las dos cosas.
    //
    // Asi que el `config` que llega se FUSIONA sobre el guardado. Mandar una
    // clave la cambia; no mandarla la deja como estaba. Para borrarla de verdad
    // se manda vacia, que es explicito.
    const datos = { ...parsed.data };
    if (datos.config) {
      const actual = await model.findById(cid(req));
      if (!actual) throw new AppError('No encontrado', 404, 'NOT_FOUND');
      datos.config = { ...(actual.config || {}), ...datos.config };
    }

    const c = await model.update(cid(req), datos);
    if (!c) throw new AppError('No encontrado', 404, 'NOT_FOUND');
    res.json({ success: true, data: sinSecretos(c) });
  } catch (err) { next(err); }
}

export async function remove(req, res, next) {
  try {
    await model.remove(cid(req));
    res.json({ success: true });
  } catch (err) { next(err); }
}

// Trae 1-3 items de muestra del API externo + sugerencias de mapping
export async function preview(req, res, next) {
  try {
    const data = await service.previewConnector(cid(req));
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

// Ejecuta el import asíncrono (responde 202 con jobId conceptual)
export async function runImport(req, res, next) {
  try {
    const id = cid(req);
    res.status(202).json({ success: true, data: { connector_id: id, status: 'running' } });
    // Background
    setImmediate(async () => {
      try {
        const result = await service.importFromConnector(id);
        // El log ya queda en service. El frontend hace polling de last_sync_at + last_sync_status
      } catch (err) {
        // ya se registra en recordSync 'error'
      }
    });
  } catch (err) { next(err); }
}
