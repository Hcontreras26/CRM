import { AppError } from '../../shared/utils/AppError.js';
import { veTodoElCrm, campusDeLaPersona } from '../../shared/utils/ambito.js';
import * as service from './google-analytics.service.js';
import { periodoSchema, sincronizarSchema } from './google-analytics.validation.js';

const leer = (schema, datos) => {
  const r = schema.safeParse(datos);
  if (!r.success) throw new AppError(r.error.issues[0]?.message || 'Datos no válidos', 400, 'VALIDATION_ERROR');
  return r.data;
};

/** GET /estado — los campus con GA4 conectado y cómo fue su última sincronización. */
export async function estado(req, res, next) {
  try {
    let filas = await service.proyectosConGA4();
    if (!veTodoElCrm(req.user)) {
      const mios = await campusDeLaPersona(req.user.userId);
      filas = filas.filter((f) => mios.includes(f.project_id));
    }
    // Cada campus con su interruptor (CRM#1210); `activo`, si alguno de los suyos va solo.
    filas = filas.map((f) => ({ ...f, sync_activa: service.interruptorDe(f).activo }));
    res.json({ success: true, data: { activo: filas.some((f) => f.sync_activa), campus: filas } });
  } catch (err) { next(err); }
}

/** POST /sincronizar — una vuelta ya, para un campus. */
export async function sincronizar(req, res, next) {
  try {
    const { project_id } = leer(sincronizarSchema, req.body || {});
    const r = await service.ponerAlDia(project_id);
    if (!r.ok) throw new AppError(r.error, 502, 'GA4_SYNC');
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}

/** GET /embudo?projectId&desde&hasta — sesiones → leads → ventas. */
export async function embudo(req, res, next) {
  try {
    const p = leer(periodoSchema, req.query);
    res.json({ success: true, data: await service.embudo(p.projectId, p.desde, p.hasta) });
  } catch (err) { next(err); }
}

/** GET /paginas?projectId&desde&hasta — visitas y leads por página de entrada. */
export async function paginas(req, res, next) {
  try {
    const p = leer(periodoSchema, req.query);
    res.json({ success: true, data: await service.paginas(p.projectId, p.desde, p.hasta, { limite: p.limite }) });
  } catch (err) { next(err); }
}
