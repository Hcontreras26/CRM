import { Router } from 'express';
import { verifyToken } from '../../shared/middleware/auth.js';
import { puede } from '../../shared/middleware/permissions.js';
import { veTodoElCrm, campusDeLaPersona } from '../../shared/utils/ambito.js';
import { AppError } from '../../shared/utils/AppError.js';
import * as ctrl from './google-analytics.controller.js';

const router = Router();
router.use(verifyToken);

/**
 * Google Analytics (CRM#55): ver (`google_analytics.view`) y sincronizar
 * (`google_analytics.edit`). La credencial se carga en Integraciones › Google
 * Analytics 4 de cada campus (CRM#1099) y se guarda con las demás claves (servicio
 * `google_analytics`), no aquí.
 *
 * Y solo de SUS campus, como Meta Ads: el `projectId` pedido tiene que ser suyo.
 */
async function deSusCampus(req, _res, next) {
  try {
    if (veTodoElCrm(req.user)) return next();
    const pedido = Number(req.query.projectId || req.body?.project_id);
    if (!pedido) return next(); // la validación responde 400
    const mios = await campusDeLaPersona(req.user.userId);
    if (!mios.includes(pedido)) return next(new AppError('No tienes acceso a ese campus', 403, 'FORBIDDEN'));
    next();
  } catch (err) { next(err); }
}
// Para el inventario de permisos (#423): acota por campus, no decide quién entra.
deSusCampus.regla = { tipo: 'alcance', nombre: 'deSusCampus' };

const ver = [puede('google_analytics.view'), deSusCampus];
const sincronizar = [puede('google_analytics.edit'), deSusCampus];

router.get('/estado', puede('google_analytics.view'), ctrl.estado);
router.get('/embudo', ver, ctrl.embudo);
router.get('/paginas', ver, ctrl.paginas);
router.post('/sincronizar', sincronizar, ctrl.sincronizar);

export default router;
