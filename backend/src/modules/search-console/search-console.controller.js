import { AppError } from '../../shared/utils/AppError.js';
import { veTodoElCrm, campusDeLaPersona } from '../../shared/utils/ambito.js';
import * as service from './search-console.service.js';
import { periodoSchema, campusSchema, sincronizarSchema } from './search-console.validation.js';

const leer = (schema, datos) => {
  const r = schema.safeParse(datos);
  if (!r.success) throw new AppError(r.error.issues[0]?.message || 'Datos no válidos', 400, 'VALIDATION_ERROR');
  return r.data;
};

/** GET /estado — los campus con Search Console conectado y cómo fue su última sincronización. */
export async function estado(req, res, next) {
  try {
    let filas = await service.proyectosConGSC();
    if (!veTodoElCrm(req.user)) {
      const mios = await campusDeLaPersona(req.user.userId);
      filas = filas.filter((f) => mios.includes(f.project_id));
    }
    res.json({ success: true, data: { activo: service.syncActivo(), campus: filas } });
  } catch (err) { next(err); }
}

/** POST /sincronizar — una vuelta ya, para un campus. */
export async function sincronizar(req, res, next) {
  try {
    const { project_id } = leer(sincronizarSchema, req.body || {});
    const r = await service.ponerAlDia(project_id);
    if (!r.ok) throw new AppError(r.error, 502, 'GSC_SYNC');
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}

/** GET /resumen?projectId&desde&hasta — totales, periodo anterior y serie por día. */
export async function resumen(req, res, next) {
  try {
    const p = leer(periodoSchema, req.query);
    res.json({ success: true, data: await service.resumen(p.projectId, p.desde, p.hasta) });
  } catch (err) { next(err); }
}

/** GET /consultas?projectId&desde&hasta[&buscar&limite] — las búsquedas. */
export async function consultas(req, res, next) {
  try {
    const p = leer(periodoSchema, req.query);
    res.json({ success: true, data: await service.consultas(p.projectId, p.desde, p.hasta, p) });
  } catch (err) { next(err); }
}

/** GET /paginas?projectId&desde&hasta[&buscar&limite] — las páginas y sus oportunidades. */
export async function paginas(req, res, next) {
  try {
    const p = leer(periodoSchema, req.query);
    res.json({ success: true, data: await service.paginas(p.projectId, p.desde, p.hasta, p) });
  } catch (err) { next(err); }
}

/** GET /indexacion?projectId — las páginas de formación y si Google las tiene. */
export async function indexacion(req, res, next) {
  try {
    const { projectId } = leer(campusSchema, req.query);
    res.json({ success: true, data: await service.indexacion(projectId) });
  } catch (err) { next(err); }
}
