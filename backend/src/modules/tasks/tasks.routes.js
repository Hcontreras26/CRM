import { Router } from 'express';
import { verifyToken, soloRoles } from '../../shared/middleware/auth.js';
import * as ctrl from './tasks.controller.js';

const router = Router();

// Todas las rutas de tareas requieren autenticación y rol con acceso (excluye a tutor)
router.use(verifyToken);
router.use(soloRoles('superadmin', 'admin', 'gestor', 'soporte', 'colaborador'));

// Métricas de equipo (Fase 4)
router.get('/metrics', ctrl.teamMetrics);

// Rutas de tareas
router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.patch('/:id/move', ctrl.move);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.archive);

// Checklists (Fase 2)
router.post('/:id/checklist', ctrl.addChecklistItem);
router.patch('/:id/checklist/:itemId', ctrl.updateChecklistItem);
router.delete('/:id/checklist/:itemId', ctrl.deleteChecklistItem);

// Comentarios (Fase 2)
router.post('/:id/comments', ctrl.addComment);
router.delete('/:id/comments/:commentId', ctrl.deleteComment);

// Etiquetas (Fase 2)
router.post('/:id/tags', ctrl.addTag);
router.delete('/:id/tags/:tagId', ctrl.deleteTag);

export default router;
