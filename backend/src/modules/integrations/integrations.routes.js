import { Router } from 'express';
import { verifyToken } from '../../shared/middleware/auth.js';
import { puede } from '../../shared/middleware/permissions.js';
import { projectAccess } from '../../shared/middleware/projectAccess.js';
import { AppError } from '../../shared/utils/AppError.js';
import * as ctrl from './integrations.controller.js';
import * as salud from './salud.controller.js';
import * as categoriasMoodle from './moodle-categorias.controller.js';
import * as google from './google.controller.js';

const router = Router();

router.use(verifyToken);
// Y solo en SUS campus (QA de Diego, 22/10). Tener el permiso no basta: un admin de
// otra empresa cambiaba el projectId y veía, guardaba o borraba la integración
// de un campus ajeno —con Moodle, la URL y el token de administrador del campus—.
// Cada ruta: primero el permiso (#423) y después `projectAccess`. El controlador
// usa `req.projectId`, el campus que se ha comprobado ahí.
//
// Antes, un projectId que no es un número daba 400 aquí. `projectAccess` lo
// manda tal cual a la base, que falla, y la petición se queda sin respuesta:
// se comprueba antes, el mismo campo que mira él. Solo mira el formato, no
// quién entra: en el inventario de permisos (#423) va con los técnicos.
router.use(function projectIdConFormato(req, _res, next) {
  const pedido = req.params.projectId || req.body?.projectId || req.query.projectId;
  if (pedido !== undefined && !(/^\d{1,9}$/.test(String(pedido)) && Number(pedido) > 0)) {
    return next(new AppError('projectId requerido', 400, 'PROJECT_REQUIRED'));
  }
  next();
});

router.get('/',                puede('integrations.view'), projectAccess, ctrl.list);
// Antes de `/:provider`, que si no se la come. Sin `projectAccess`: no es de un
// campus, y el controlador recorta por el ámbito de quien pide (#218).
router.get('/estado',          puede('integrations.view'), ctrl.estado);
// La salud de las conexiones de cada campus (CRM#533). Antes de `/:provider`,
// por lo mismo. Sin `projectAccess`: el controlador recorta por el ámbito de
// quien pide, como `/estado`. Solo superadmin y admin (`integrations.salud`).
router.get('/salud',            puede('integrations.salud'), salud.salud);
router.post('/salud/comprobar', puede('integrations.salud'), salud.comprobar);
// En qué categoría del Moodle va el curso de cada tipo de formación (CRM#1113, fase 2).
// Leer lee el Moodle del campus; guardar solo escribe en `config_public`. Antes de `/:provider`.
router.get('/moodle/categorias', puede('integrations.view'), projectAccess, categoriasMoodle.ver);
router.put('/moodle/categorias', puede('integrations.edit'), projectAccess, categoriasMoodle.guardar);
// Google Analytics 4 y Search Console del campus (CRM#1099): la cuenta de servicio
// y la propiedad, guardadas en `api_credentials` como las lee el módulo de cada uno.
// Ver, quien ve Integraciones; guardar, probar y quitar, solo admin y superadmin
// (`integrations.google`). `:servicio` es `ga4` o `gsc`.
router.post('/google/gsc/sitios',      puede('integrations.google'), projectAccess, google.sitios);
// La sincronización del campus y los umbrales del aviso, desde la tarjeta (CRM#1210):
// sin `.env`. Mismo permiso que conectar la cuenta.
router.put('/google/gsc/umbrales',     puede('integrations.google'), projectAccess, google.guardarUmbrales);
router.put('/google/:servicio/sincronizacion', puede('integrations.google'), projectAccess, google.ponerSincronizacion);
router.post('/google/:servicio/sincronizar',   puede('integrations.google'), projectAccess, google.sincronizarAhora);
router.get('/google/:servicio',        puede('integrations.view'), projectAccess, google.ver);
router.put('/google/:servicio',        puede('integrations.google'), projectAccess, google.guardar);
router.post('/google/:servicio/probar', puede('integrations.google'), projectAccess, google.probar);
router.delete('/google/:servicio',     puede('integrations.google'), projectAccess, google.quitar);
router.get('/:provider',       puede('integrations.view'), projectAccess, ctrl.getOne);
router.put('/',                puede('integrations.edit'), projectAccess, ctrl.upsert);
router.post('/:provider/test', puede('integrations.edit'), projectAccess, ctrl.test);
router.delete('/:provider',    puede('integrations.edit'), projectAccess, ctrl.remove);

export default router;
