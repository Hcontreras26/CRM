import { Router } from 'express';
import { verifyToken } from '../../shared/middleware/auth.js';
import { puede } from '../../shared/middleware/permissions.js';
import * as ctrl from './form.controller.js';

const router = Router();

// PUBLICAS (sin auth, llamadas desde el embed)
router.get('/public/:embedId', ctrl.publicMeta);
router.post('/public/:embedId/submit', ctrl.publicSubmit);
router.post('/webhook/:embedId', ctrl.publicWebhook);
router.post('/mailhook/:embedId', ctrl.publicMailhook);

router.use(verifyToken);
router.get('/', puede('forms.view'), ctrl.list);
router.get('/:id', puede('forms.view'), ctrl.getById);
router.get('/:id/status', puede('forms.view'), ctrl.getStatus);
router.get('/:id/events', puede('forms.view'), ctrl.listEvents);
router.post('/', puede('forms.create'), ctrl.create);
router.patch('/:id', puede('forms.edit'), ctrl.update);
router.delete('/:id', puede('forms.delete'), ctrl.remove);
router.post('/:id/listen', puede('forms.edit'), ctrl.startListening);
router.post('/:id/listen/stop', puede('forms.edit'), ctrl.stopListening);

export default router;
