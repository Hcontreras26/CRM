import { Router } from 'express';
import { verifyToken, roleGuard } from '../../shared/middleware/auth.js';
import * as ctrl from './correos.controller.js';

const router = Router();
router.use(verifyToken);

// Admin y superadmin, como el Registro y por la misma razon, que aqui pesa mas:
// esto no lista sucesos, enseña el TEXTO de correos a personas. Un aviso a un
// tutor lleva lo que cobra; uno a un prospecto, su nombre y su formacion.
router.use(roleGuard('admin', 'superadmin'));

router.get('/', ctrl.listar);
router.get('/recuento', ctrl.recuento);
// Antes de `/:id`, o «sincronizar» se leeria como el id de un correo.
router.post('/sincronizar', ctrl.sincronizar);
router.get('/:id', ctrl.uno);

export default router;
