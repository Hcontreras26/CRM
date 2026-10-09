import { Router } from 'express';
import { verifyToken, roleGuard, soloRoles } from '../../shared/middleware/auth.js';
import * as ctrl from './permissions.controller.js';

const router = Router();

router.use(verifyToken);

// Defaults del sistema — cualquier usuario autenticado puede ver
router.get('/system-defaults', ctrl.getSystemDefaults);

// Roles custom — solo admin/superadmin pueden ver/gestionar (info sensible)
router.get('/custom-roles', roleGuard('admin', 'superadmin'), ctrl.listCustomRoles);
router.get('/custom-roles/:id', roleGuard('admin', 'superadmin'), ctrl.getCustomRole);
router.post('/custom-roles', roleGuard('admin', 'superadmin'), ctrl.createCustomRole);
router.put('/custom-roles/:id', roleGuard('admin', 'superadmin'), ctrl.updateCustomRole);
router.delete('/custom-roles/:id', roleGuard('superadmin'), ctrl.deleteCustomRole);

// Permisos por usuario — admin ve/edita, superadmin todo
router.get('/users/:userId/permissions', roleGuard('admin', 'superadmin'), ctrl.getUserPermissions);
router.put('/users/:userId/permissions', roleGuard('admin', 'superadmin'), ctrl.saveUserPermissions);

// Permisos de Tareas por rol (#210): los cambian el superadmin y el admin
// (Hugo, 09/10). `soloRoles` y no `roleGuard`, que dejaría pasar también a
// soporte.
router.get('/role-permissions/:roleKey', soloRoles('superadmin', 'admin'), ctrl.getRolePermissions);
router.put('/role-permissions/:roleKey', soloRoles('superadmin', 'admin'), ctrl.saveRolePermissions);

// Vistas por rol (sidebar/dashboard/landing)
router.get('/role-views/:roleKey', ctrl.getRoleView);
router.put('/role-views/:roleKey', roleGuard('admin', 'superadmin'), ctrl.setRoleView);

export default router;
