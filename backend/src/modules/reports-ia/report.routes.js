import { Router } from 'express';
import { verifyToken } from '../../shared/middleware/auth.js';
import { puede } from '../../shared/middleware/permissions.js';
import * as ctrl from './report.controller.js';
import { projectAccess } from '../../shared/middleware/projectAccess.js';

const router = Router();
router.use(verifyToken);

// Con «Todos» o una empresa (#218, Diego 04/11): los informes de todos los campus
// de quien pide. Antes de `/:projectId`, que si no se la come; sin
// `projectAccess`, el controlador recorta por ámbito.
router.get('/ambito', puede('reports_ia.view'), ctrl.listarDelAmbito);
// Solo de un campus de quien pide (projectAccess): antes valía el id de cualquiera.
router.get('/:projectId', puede('reports_ia.view'), projectAccess, ctrl.list);
// El detalle y el PDF miran el campus del informe dentro (#218).
router.get('/detail/:id', puede('reports_ia.view'), ctrl.getDetail);
// Generar, también de un campus suyo (#218): antes cualquiera con el permiso
// generaba el de otra empresa, y con la clave de Anthropic de ESE campus.
router.post('/:projectId/generate', puede('reports_ia.generar'), projectAccess, ctrl.generate);
router.post('/:id/export-pdf', puede('reports_ia.generar'), ctrl.exportPdf);

export default router;
