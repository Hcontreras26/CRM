import { Router } from 'express';
import { verifyToken } from '../../shared/middleware/auth.js';
import { puede } from '../../shared/middleware/permissions.js';
import * as ctrl from './credentials.controller.js';

const router = Router();
router.use(verifyToken);

// `soloRoles` y NO `roleGuard`, y esta es la diferencia que pide la #80.
//
// `roleGuard` deja pasar a superadmin y soporte ANTES de mirar la lista, asi
// que aqui coincidia con lo que se queria por casualidad. Con `soloRoles` se
// declara quien entra: si mañana aparece un rol nuevo, no hereda el acceso a
// las credenciales por caer en un `else`.

router.get('/', puede('credentials.view'), ctrl.list);
// Antes que `/:id/...` para que «paridad» y «registro» no se lean como un id.
router.get('/paridad', puede('credentials.view'), ctrl.paridad);
router.get('/registro', puede('credentials.view'), ctrl.registro);

router.post('/', puede('credentials.edit'), ctrl.upsert);
router.post('/:id/test', puede('credentials.edit'), ctrl.test);
// El valor entero, uno a uno y dejando rastro. El listado no lo trae nunca.
router.get('/:id/revelar', puede('credentials.revelar'), ctrl.revelar);
router.delete('/:id', puede('credentials.edit'), ctrl.remove);

export default router;
