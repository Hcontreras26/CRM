import { Router } from 'express';
import { verifyToken, roleGuard } from '../../shared/middleware/auth.js';
import * as ctrl from './accounting.controller.js';

const router = Router();

router.use(verifyToken);

// Dashboard accounting (admin y superadmin, NO gestor)
router.get('/dashboard', roleGuard('admin', 'superadmin'), ctrl.dashboard);

// Cuentas por cobrar (admin, superadmin y gestor — la gestora solo ve las suyas)
router.get('/receivable', roleGuard('admin', 'superadmin', 'soporte', 'gestor'), ctrl.receivable);

// Los egresos viven en su propio módulo (`modules/expenses`, #227), igual en
// los dos CRM. /api/accounting/expenses sigue respondiendo como alias suyo.

export default router;
