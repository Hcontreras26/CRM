import { Router } from 'express';
import { verifyToken, soloRoles } from '../../shared/middleware/auth.js';
import * as ctrl from './webhooks-salientes.controller.js';

const router = Router();
router.use(verifyToken);
// `soloRoles` y no `roleGuard`: roleGuard deja pasar también a soporte, y el
// webhook de transferencias es solo de admin y super admin (Diego, 15/10), como
// Conectores. El ámbito de cada webhook lo comprueba el controlador.
router.use(soloRoles('admin', 'superadmin'));

router.get('/', ctrl.listar);
// Antes de /:id, o Express leería «ejemplo» y «envios» como un identificador.
router.get('/ejemplo', ctrl.ejemplo);
router.get('/envios', ctrl.envios);
router.post('/envios/:envioId/reenviar', ctrl.reenviar);
router.get('/:id', ctrl.uno);
router.post('/', ctrl.crear);
router.patch('/:id', ctrl.cambiar);
router.delete('/:id', ctrl.borrar);
router.post('/:id/prueba', ctrl.prueba);

export default router;
