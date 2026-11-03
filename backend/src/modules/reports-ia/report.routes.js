import { Router } from 'express';
import { verifyToken } from '../../shared/middleware/auth.js';
import { puede } from '../../shared/middleware/permissions.js';
import * as ctrl from './report.controller.js';
import { projectAccess } from '../../shared/middleware/projectAccess.js';

const router = Router();
router.use(verifyToken);

// Solo de un campus de quien pide (projectAccess): antes valía el id de cualquiera.
router.get('/:projectId', puede('reports_ia.view'), projectAccess, ctrl.list);
router.get('/detail/:id', puede('reports_ia.view'), ctrl.getDetail);
router.post('/:projectId/generate', puede('reports_ia.generar'), ctrl.generate);
router.post('/:id/export-pdf', puede('reports_ia.generar'), ctrl.exportPdf);

export default router;
