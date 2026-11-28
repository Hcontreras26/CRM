import { z } from 'zod';
import { AppError } from '../../shared/utils/AppError.js';
import { veTodoElCrm } from '../../shared/utils/ambito.js';
import { anotar, ACCIONES } from '../credentials/credentials.registro.js';
import * as app from './meta-app.service.js';
import { SERVICIO_APP } from './meta-app.config.js';

/**
 * Meta Ads › Configuración › App de Meta (CRM#1209). Lo pide `meta_ads.edit`
 * y `meta_ads.app` (ver meta-ads.routes.js). Ninguna respuesta lleva el
 * secreto ni un token; el registro (`user_activity_log`) anota QUÉ se tocó y
 * quién, nunca el valor.
 *
 * La app es de todo el CRM: la tarjeta enseña los tokens de todos los campus y
 * su secreto renueva los de todos. Por eso, además del permiso, solo entra
 * quien ve el CRM entero (`veTodoElCrm`); un admin recortado a sus campus que
 * tenga `meta_ads.app` por excepción recibe igualmente un 403.
 */
function soloTodoElCrm(req) {
  if (!veTodoElCrm(req.user)) {
    throw new AppError('La app de Meta es de todo el CRM: solo la configura quien ve todos los campus.', 403, 'FORBIDDEN');
  }
}

// Lo mismo que comprueba la pantalla antes de enviar.
const APP_ID = z.string().trim().regex(/^\d{5,20}$/, 'El ID de la app son solo números (entre 5 y 20).');
const APP_SECRET = z.string().trim().regex(/^[a-f0-9]{32}$/i, 'El secreto de la app son 32 caracteres, números y letras de la «a» a la «f».');

export const guardarSchema = z.object({
  app_id: APP_ID,
  // Sin secreto se queda el guardado (para cambiar solo el ID).
  app_secret: APP_SECRET.optional().nullable(),
}).strict();

export const probarSchema = z.object({
  app_id: APP_ID.optional(),
  app_secret: APP_SECRET.optional(),
}).strict().refine((d) => !!d.app_id === !!d.app_secret, { message: 'Para probar otra app hacen falta el ID y el secreto.' });

const dias = (min, max, que) => z.number().int(`${que}: un número entero.`).min(min, `${que}: de ${min} a ${max}.`).max(max, `${que}: de ${min} a ${max}.`).nullable().optional();

export const ajustesSchema = z.object({
  renovacion_activa: z.boolean().nullable().optional(),
  renovar_dias: dias(1, 59, 'Renovar cuando queden'),
  aviso_dias: dias(1, 30, 'Avisar cuando queden'),
  gasto_total_cada_horas: dias(1, 168, 'Gasto de toda la vida'),
}).strict();

const leer = (schema, datos) => {
  const r = schema.safeParse(datos);
  if (!r.success) throw new AppError(r.error.issues[0]?.message || 'Datos no válidos', 400, 'VALIDATION_ERROR');
  return r.data;
};

/** GET /meta-ads/app */
export async function ver(req, res, next) {
  try { soloTodoElCrm(req); res.json({ success: true, data: await app.estado() }); } catch (err) { next(err); }
}

/** PUT /meta-ads/app — guarda el ID y el secreto y los prueba. */
export async function guardar(req, res, next) {
  try {
    soloTodoElCrm(req);
    const datos = leer(guardarSchema, req.body || {});
    const { nueva } = await app.guardar(datos, req.user.userId);
    await anotar(req, nueva ? ACCIONES.CREAR : ACCIONES.CAMBIAR, { servicio: SERVICIO_APP, entorno: 'produccion' });
    const prueba = await app.probar();
    await anotar(req, ACCIONES.PROBAR, { servicio: SERVICIO_APP, entorno: 'produccion' });
    res.json({ success: true, data: { prueba, estado: await app.estado() } });
  } catch (err) { next(err); }
}

/** POST /meta-ads/app/probar — la guardada, o la del formulario sin guardarla. */
export async function probar(req, res, next) {
  try {
    soloTodoElCrm(req);
    const datos = leer(probarSchema, req.body || {});
    const prueba = await app.probar(datos);
    await anotar(req, ACCIONES.PROBAR, { servicio: SERVICIO_APP, entorno: 'produccion' });
    res.json({ success: true, data: { ...prueba, estado: await app.estado() } });
  } catch (err) { next(err); }
}

/** DELETE /meta-ads/app — «Quitar». */
export async function quitar(req, res, next) {
  try {
    soloTodoElCrm(req);
    const { habia } = await app.quitar();
    if (habia) await anotar(req, ACCIONES.BORRAR, { servicio: SERVICIO_APP, entorno: 'produccion' });
    res.json({ success: true, data: await app.estado() });
  } catch (err) { next(err); }
}

/** PUT /meta-ads/app/ajustes — la renovación automática y sus días. */
export async function guardarAjustes(req, res, next) {
  try {
    soloTodoElCrm(req);
    const datos = leer(ajustesSchema, req.body || {});
    await app.guardarAjustes(datos, req.user.userId);
    await anotar(req, ACCIONES.CAMBIAR, { servicio: `${SERVICIO_APP}.ajustes`, entorno: 'produccion' });
    res.json({ success: true, data: await app.estado() });
  } catch (err) { next(err); }
}

/** POST /meta-ads/app/renovar — «Renovar ahora», aunque la automática esté apagada. */
export async function renovar(req, res, next) {
  try {
    soloTodoElCrm(req);
    const resumen = await app.renovarAhora();
    await anotar(req, 'meta_app.renovar', { servicio: SERVICIO_APP, entorno: 'produccion' });
    res.json({ success: true, data: { resumen, estado: await app.estado() } });
  } catch (err) { next(err); }
}
