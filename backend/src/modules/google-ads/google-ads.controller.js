import { AppError } from '../../shared/utils/AppError.js';
import { veTodoElCrm, campusDeLaPersona } from '../../shared/utils/ambito.js';
import * as service from './google-ads.service.js';
import { periodoSchema, campanaSchema, sincronizarSchema, asignarSchema } from './google-ads.validation.js';

const leer = (schema, datos) => {
  const r = schema.safeParse(datos);
  if (!r.success) throw new AppError(r.error.issues[0]?.message || 'Datos no válidos', 400, 'VALIDATION_ERROR');
  return r.data;
};

/** GET /estado — los campus con Google Ads conectado y cómo fue su última sincronización. */
export async function estado(req, res, next) {
  try {
    let filas = await service.proyectosConGoogleAds();
    if (!veTodoElCrm(req.user)) {
      const mios = await campusDeLaPersona(req.user.userId);
      filas = filas.filter((f) => mios.includes(f.project_id));
    }
    res.json({
      success: true,
      data: { activo: service.syncActivo(), developer_token: Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN), campus: filas },
    });
  } catch (err) { next(err); }
}

/** POST /sincronizar — una vuelta ya, para un campus. */
export async function sincronizar(req, res, next) {
  try {
    const { project_id } = leer(sincronizarSchema, req.body || {});
    const r = await service.ponerAlDia(project_id);
    if (!r.ok) throw new AppError(r.error, 502, 'GOOGLE_ADS_SYNC');
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}

/** GET /campanas?projectId&desde&hasta — gasto y coste por venta de cada campaña. */
export async function campanas(req, res, next) {
  try {
    const p = leer(periodoSchema, req.query);
    res.json({ success: true, data: await service.campanas(p.projectId, p.desde, p.hasta) });
  } catch (err) { next(err); }
}

/** GET /diario?projectId&desde&hasta — gasto y clics por día. */
export async function diario(req, res, next) {
  try {
    const p = leer(periodoSchema, req.query);
    res.json({ success: true, data: await service.diario(p.projectId, p.desde, p.hasta) });
  } catch (err) { next(err); }
}

/** GET /campanas/:campaignId/grupos?projectId&desde&hasta — grupos y sus anuncios. */
export async function grupos(req, res, next) {
  try {
    const p = leer(periodoSchema, req.query);
    const { campaignId } = leer(campanaSchema, req.params);
    res.json({ success: true, data: await service.grupos(p.projectId, campaignId, p.desde, p.hasta) });
  } catch (err) { next(err); }
}

/** PATCH /campanas/:campaignId/campus — apuntar la campaña a otro campus. */
export async function asignarCampus(req, res, next) {
  try {
    const { campaignId } = leer(campanaSchema, req.params);
    const { project_id, destino } = leer(asignarSchema, req.body || {});
    if (destino != null && !veTodoElCrm(req.user)) {
      const mios = await campusDeLaPersona(req.user.userId);
      if (!mios.includes(destino)) throw new AppError('No tienes acceso a ese campus', 403, 'FORBIDDEN');
    }
    res.json({ success: true, data: await service.asignarCampus(project_id, campaignId, destino, req.user.userId) });
  } catch (err) { next(err); }
}
