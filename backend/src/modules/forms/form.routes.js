import { Router } from 'express';
import { verifyToken } from '../../shared/middleware/auth.js';
import { puede } from '../../shared/middleware/permissions.js';
import * as ctrl from './form.controller.js';
import { projectAccess } from '../../shared/middleware/projectAccess.js';
import { formularioDeSuCampus, campusDelCuerpo } from './form.acceso.js';

const router = Router();

// PUBLICAS (sin auth, llamadas desde el embed)
router.get('/public/:embedId', ctrl.publicMeta);
router.post('/public/:embedId/submit', ctrl.publicSubmit);
router.post('/webhook/:embedId', ctrl.publicWebhook);
router.post('/mailhook/:embedId', ctrl.publicMailhook);

router.use(verifyToken);
// Cada formulario, solo en su campus (CRM#791): ver, estado, eventos, editar, borrar y escuchar.
// Solo de un campus de quien pide (projectAccess): antes valía el id de cualquiera.
router.get('/', puede('forms.view'), projectAccess, ctrl.list);
router.get('/:id', puede('forms.view'), formularioDeSuCampus, ctrl.getById);
router.get('/:id/status', puede('forms.view'), formularioDeSuCampus, ctrl.getStatus);
router.get('/:id/events', puede('forms.view'), formularioDeSuCampus, ctrl.listEvents);
router.post('/', puede('forms.create'), campusDelCuerpo, ctrl.create);
router.patch('/:id', puede('forms.edit'), formularioDeSuCampus, ctrl.update);
router.delete('/:id', puede('forms.delete'), formularioDeSuCampus, ctrl.remove);
router.post('/:id/listen', puede('forms.edit'), formularioDeSuCampus, ctrl.startListening);
router.post('/:id/listen/stop', puede('forms.edit'), formularioDeSuCampus, ctrl.stopListening);

export default router;
