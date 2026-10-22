import { Router } from 'express';
import multer from 'multer';
import { verifyToken } from '../../shared/middleware/auth.js';
import { AppError } from '../../shared/utils/AppError.js';
import * as ctrl from './consultas.controller.js';

// Los adjuntos de la respuesta: PDF, imágenes y los documentos de siempre, hasta
// 10 MB cada uno y 5 por respuesta (#188: «tamaño máximo y tipos permitidos»).
const TIPOS = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);
const subir = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (_req, f, cb) => (TIPOS.has(f.mimetype)
    ? cb(null, true)
    : cb(new AppError(`«${f.originalname}»: solo PDF, imágenes, Word, Excel o texto.`, 400, 'TIPO_NO_ADMITIDO'), false)),
}).array('adjuntos', 5);

function conAdjuntos(req, res, next) {
  subir(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError('Un adjunto pasa de 10 MB.', 400, 'ADJUNTO_GRANDE'));
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new AppError('Como mucho 5 adjuntos por respuesta.', 400, 'DEMASIADOS_ADJUNTOS'));
    }
    return next(err);
  });
}

const router = Router();
router.use(verifyToken);

// Las concretas antes que /:id.
router.get('/mias', ctrl.mias);
router.post('/leer-ahora', ctrl.leerAhora);
router.get('/adjuntos/:id', ctrl.adjunto);
router.post('/mensajes/:mensajeId/reintentar', ctrl.reintentar);
router.get('/tutores/:tutorId/tokens', ctrl.tokensDelTutor);
router.put('/tutores/:tutorId/token', ctrl.guardarToken);
// Fase 3 (#189).
router.get('/alumnos-sin-mensajes', ctrl.alumnosSinMensajes);
router.post('/alumnos/:id/escribir', ctrl.escribirAlAlumno);
router.get('/carga', ctrl.miCarga);
router.post('/carga', ctrl.guardarMiCarga);
router.get('/tutores-panel', ctrl.panelDeTutores);
router.get('/campus-sin-tutor', ctrl.campusSinTutor);
router.post('/sincronizar-alumnos', ctrl.sincronizarAlumnosAhora);
router.get('/metricas', ctrl.verMetricas);

router.get('/', ctrl.panel);
router.get('/:id', ctrl.ver);
router.post('/:id/responder', conAdjuntos, ctrl.responder);
router.post('/:id/cerrar', ctrl.cerrar);
router.get('/:id/tutores', ctrl.tutoresPosibles);
router.post('/:id/reasignar', ctrl.reasignar);

// El enlace del adjunto que recibe el alumno en el campus: sin sesión, con su
// token largo y su caducidad. Va aparte porque el router de arriba pide sesión.
export const publico = Router();
publico.get('/:token', ctrl.adjuntoPublico);

export default router;
