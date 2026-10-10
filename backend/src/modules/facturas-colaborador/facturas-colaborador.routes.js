import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { verifyToken } from '../../shared/middleware/auth.js';
import { checkPermission } from '../../shared/middleware/permissions.js';
import { resolvePermission } from '../permissions/permissions.service.js';
import { AppError } from '../../shared/utils/AppError.js';
import * as ctrl from './facturas-colaborador.controller.js';
import * as facturas from './facturas.controller.js';
import { TOPE_BYTES } from './facturas.service.js';

const router = Router();

// ─── El enlace del colaborador: sin usuario, con límite de intentos por IP ───

const limite = (max) => rateLimit({
  windowMs: 15 * 60 * 1000,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados intentos. Prueba de nuevo en 15 minutos.', code: 'RATE_LIMITED' },
});

// El tipo de verdad se mira después, por los primeros bytes (`tipoReal`).
const recibir = (campo) => (req, res, next) => {
  multer({ storage: multer.memoryStorage(), limits: { fileSize: TOPE_BYTES, files: 1 } })
    .single(campo)(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError('El archivo pasa de 10 MB', 400, 'FILE_TOO_LARGE'));
      return next(new AppError('No se pudo leer el archivo', 400, 'INVALID_FILE'));
    });
};
const recibirArchivo = recibir('archivo');

router.get('/enlace/:token', limite(60), facturas.verEnlace);
router.post('/enlace/:token', limite(20), recibirArchivo, facturas.subir);

// ─── «Mi factura»: el colaborador con usuario en el CRM, solo lo suyo ───
// Son las únicas de este módulo que puede pedir el rol colaborador
// (`RUTAS_DEL_COLABORADOR`, shared/utils/roles.js).

const sube = [verifyToken, checkPermission('facturas_colaborador', 'subir')];

router.get('/mias', sube, facturas.mias);
router.post('/mias/:id', sube, limite(20), recibirArchivo, facturas.subirMia);
router.get('/mias/:id/archivo', sube, facturas.archivoMio);

// ─── Administración: la lista de colaboradores ───
// El permiso se mira en el servidor; qué empresas ve cada uno lo acota el servicio.

const gestiona = [verifyToken, checkPermission('facturas_colaborador', 'gestionar')];
const ve = [verifyToken, checkPermission('facturas_colaborador', 'ver_todas')];
const anula = [verifyToken, checkPermission('facturas_colaborador', 'anular')];
// «Marcar pagada»: solo un admin (segunda parte).
const paga = [verifyToken, checkPermission('facturas_colaborador', 'pagar')];

// Las empresas, para el filtro de «Del mes» (ver_todas) y para la ficha (gestionar).
const veOGestiona = async (req, res, next) => {
  try {
    const { userId, role, customRoleId } = req.user;
    for (const accion of ['ver_todas', 'gestionar']) {
      if (await resolvePermission(userId, role, customRoleId ?? null, 'facturas_colaborador', accion)) return next();
    }
    next(new AppError('No tienes permiso para esta accion', 403, 'FORBIDDEN'));
  } catch (err) { next(err); }
};

router.get('/empresas', verifyToken, veOGestiona, ctrl.empresas);
router.get('/colaboradores', gestiona, ctrl.listar);
router.post('/colaboradores', gestiona, ctrl.crear);
router.get('/colaboradores/:id', gestiona, ctrl.ver);
router.patch('/colaboradores/:id', gestiona, ctrl.editar);
router.post('/colaboradores/:id/baja', gestiona, ctrl.darDeBaja);
router.post('/colaboradores/:id/alta', gestiona, ctrl.volverDeAlta);
router.get('/colaboradores/:id/registro', gestiona, ctrl.registro);

// ─── Administración: las facturas del mes ───

router.get('/mes', ve, facturas.delMes);
// Enviadas, Por pagar, Pagadas e Historial, y el coste por campus (segunda parte).
router.get('/facturas', ve, facturas.deLaVista);
router.get('/coste-por-campus', ve, facturas.costePorCampus);
router.get('/zip', ve, facturas.zip);
router.get('/facturas/:id/archivo', ve, facturas.archivo);
router.get('/facturas/:id/registro', ve, facturas.registro);
router.post('/facturas/:id/anular', anula, facturas.anular);
router.post('/facturas/:id/reenviar', gestiona, facturas.reenviar);

// ─── El pago (segunda parte): una o varias, con el justificante si se quiere ───

router.post('/facturas/pagar', paga, recibir('justificante'), facturas.pagar);
router.post('/facturas/:id/deshacer-pago', paga, facturas.deshacerPago);
router.get('/facturas/:id/justificante', ve, facturas.justificante);

export default router;
