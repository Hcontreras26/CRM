import { Router } from 'express';
import { verifyToken } from '../../shared/middleware/auth.js';
import { puede } from '../../shared/middleware/permissions.js';
import * as ctrl from './correos.controller.js';

const router = Router();
router.use(verifyToken);

// Admin y superadmin, como el Registro y por la misma razon, que aqui pesa mas:
// esto no lista sucesos, enseña el TEXTO de correos a personas. Un aviso a un
// tutor lleva lo que cobra; uno a un prospecto, su nombre y su formacion.

router.get('/', puede('correos.view'), ctrl.listar);
router.get('/recuento', puede('correos.view'), ctrl.recuento);
// Antes de `/:id`, o «sincronizar» se leeria como el id de un correo.
router.post('/sincronizar', puede('correos.sincronizar'), ctrl.sincronizar);
router.get('/:id', puede('correos.view'), ctrl.uno);

export default router;
