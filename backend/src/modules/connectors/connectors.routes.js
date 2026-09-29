import { Router } from 'express';
import { verifyToken, roleGuard } from '../../shared/middleware/auth.js';
import * as ctrl from './connectors.controller.js';

const router = Router();
router.use(verifyToken);
router.use(roleGuard('admin', 'superadmin'));

router.get('/', ctrl.list);
// Un servidor MCP: sus herramientas, para elegir la que trae los datos.
router.post('/mcp/herramientas', ctrl.herramientasMcp);
router.get('/:id', ctrl.getById);
router.post('/', ctrl.create);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

router.post('/:id/preview', ctrl.preview);
router.post('/:id/import', ctrl.runImport);

export default router;
