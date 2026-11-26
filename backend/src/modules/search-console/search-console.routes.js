import { Router } from 'express';
import { verifyToken } from '../../shared/middleware/auth.js';
import { puede } from '../../shared/middleware/permissions.js';
import { veTodoElCrm, campusDeLaPersona } from '../../shared/utils/ambito.js';
import { AppError } from '../../shared/utils/AppError.js';
import * as ctrl from './search-console.controller.js';

const router = Router();
router.use(verifyToken);

/**
 * Search Console (CRM#36): ver (`search_console.view`) y sincronizar
 * (`search_console.edit`). La credencial se carga en Integraciones › Search
 * Console de cada campus (CRM#1099) y se guarda con las demás claves (servicio
 * `gsc`), no aquí.
 *
 * Y solo de SUS campus, como Google Analytics: el `projectId` pedido tiene que ser suyo.
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

const ver = [puede('search_console.view'), deSusCampus];
const sincronizar = [puede('search_console.edit'), deSusCampus];

router.get('/estado', puede('search_console.view'), ctrl.estado);
router.get('/resumen', ver, ctrl.resumen);
router.get('/consultas', ver, ctrl.consultas);
router.get('/paginas', ver, ctrl.paginas);
router.get('/indexacion', ver, ctrl.indexacion);
router.post('/sincronizar', sincronizar, ctrl.sincronizar);

export default router;
