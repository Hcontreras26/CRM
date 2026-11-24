import { Router } from 'express';
import { verifyToken } from '../../shared/middleware/auth.js';
import { puede } from '../../shared/middleware/permissions.js';
import { veTodoElCrm, campusDeLaPersona } from '../../shared/utils/ambito.js';
import { AppError } from '../../shared/utils/AppError.js';
import * as ctrl from './google-ads.controller.js';

const router = Router();
router.use(verifyToken);

/**
 * Google Ads (CRM#54): ver (`google_ads.view`) y sincronizar o asociar campañas
 * (`google_ads.edit`). La credencial se guarda en «Claves» (servicio `google_ads`).
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

const ver = [puede('google_ads.view'), deSusCampus];
const editar = [puede('google_ads.edit'), deSusCampus];

router.get('/estado', puede('google_ads.view'), ctrl.estado);
router.get('/campanas', ver, ctrl.campanas);
router.get('/diario', ver, ctrl.diario);
router.get('/campanas/:campaignId/grupos', ver, ctrl.grupos);
router.patch('/campanas/:campaignId/campus', editar, ctrl.asignarCampus);
router.post('/sincronizar', editar, ctrl.sincronizar);

export default router;
