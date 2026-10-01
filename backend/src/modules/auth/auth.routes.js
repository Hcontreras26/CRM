import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { verifyToken } from '../../shared/middleware/auth.js';
import * as authController from './auth.controller.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.', code: 'RATE_LIMITED' },
});

// POST /api/auth/login — email + password → accessToken + refreshToken cookie
router.post('/login', loginLimiter, authController.login);

// POST /api/auth/refresh — refreshToken cookie → nuevo accessToken + rotacion cookie
router.post('/refresh', authController.refresh);

// POST /api/auth/logout — revoca refreshToken + limpia cookie
router.post('/logout', verifyToken, authController.logout);

// POST /api/auth/set-password — token unico → establecer contrasena
router.post('/set-password', authController.setPassword);

// GET /api/auth/me — datos del usuario autenticado + proyectos
router.get('/me', verifyToken, authController.me);

// «Mi perfil». La pantalla tenia los dos formularios pero no llamaban a nada:
// esperaban medio segundo y decian «Contraseña actualizada» sin cambiarla.
// Carlos, 01/10. Son las mismas dos rutas que tiene ISEIE.
const changePasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Demasiados intentos. Intenta de nuevo en 15 minutos.', code: 'RATE_LIMITED' },
});

// POST /api/auth/change-password — la propia, sabiendo la actual
router.post('/change-password', changePasswordLimiter, verifyToken, authController.changePassword);

// PATCH /api/auth/me — el propio nombre (el correo no: es con lo que se entra)
router.patch('/me', verifyToken, authController.updateMyProfile);

export default router;
