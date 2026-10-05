import { Router } from 'express';
import { verifyToken } from '../../shared/middleware/auth.js';
import * as ctrl from './tasks.controller.js';

const router = Router();

// Todas las rutas de tareas requieren usuario autenticado
router.use(verifyToken);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.patch('/:id/move', ctrl.move);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.archive);

export default router;
