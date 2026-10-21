import { Router } from 'express';
import { verifyToken } from '../../shared/middleware/auth.js';
import { puede } from '../../shared/middleware/permissions.js';
import * as ctrl from './audience.controller.js';

const router = Router();
router.use(verifyToken);

router.post('/preview', puede('audiences.view'), ctrl.preview);
router.post('/export', puede('audiences.export'), ctrl.exportCsv);
router.post('/upload-meta', puede('audiences.export'), ctrl.uploadMeta);
router.get('/upload-meta/history', puede('audiences.view'), ctrl.uploadHistory);
router.get('/upload-meta/:uploadId/status', puede('audiences.view'), ctrl.uploadStatus);

export default router;
