import { Router } from 'express';
import { verifyToken } from '../../shared/middleware/auth.js';
import { puede } from '../../shared/middleware/permissions.js';
import * as ctrl from './ia.controller.js';

const router = Router();
router.use(verifyToken);
router.get('/metrics/:projectId', puede('ia.view'), ctrl.getMetrics);
router.get('/gasto', puede('ia.view'), ctrl.getGasto);
export default router;
