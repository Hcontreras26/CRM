import { Router } from 'express';
import { verifyToken, soloRoles } from '../../shared/middleware/auth.js';
import { ROLES_TAREAS } from './tasks.model.js';
import * as ctrl from './tasks.controller.js';

const router = Router();

// Quien tiene tablero, declarado y sin atajos (`soloRoles`, no `roleGuard`).
// El tutor no entra: lo hace con el rol colaborador (#210, fase 5).
router.use(verifyToken);
router.use(soloRoles(...ROLES_TAREAS));

// Rutas fijas antes que /:id, para no chocar
router.get('/metrics', ctrl.teamMetrics);
router.get('/assignees', ctrl.assignees);
router.get('/tags', ctrl.tagNames);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.getById);
router.patch('/:id/move', ctrl.move);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.archive);

// La tarjeta completa (fase 2)
router.post('/:id/checklist', ctrl.addChecklistItem);
router.patch('/:id/checklist/:itemId', ctrl.updateChecklistItem);
router.delete('/:id/checklist/:itemId', ctrl.deleteChecklistItem);

router.post('/:id/comments', ctrl.addComment);
router.delete('/:id/comments/:commentId', ctrl.deleteComment);

router.post('/:id/tags', ctrl.addTag);
router.delete('/:id/tags/:tagId', ctrl.deleteTag);

router.post('/:id/links', ctrl.addLink);
router.delete('/:id/links/:linkId', ctrl.deleteLink);

export default router;
