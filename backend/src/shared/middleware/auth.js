import jwt from 'jsonwebtoken';
import { AppError } from '../utils/AppError.js';
// Una persona puede tener mas de un rol: el principal y los añadidos. Quien
// decide cuales son vive en un solo sitio.
import { tieneRol, soloEsColaborador, colaboradorPuede } from '../utils/roles.js';

export function verifyToken(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('Token no proporcionado', 401, 'AUTH_REQUIRED'));
  }

  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch {
    return next(new AppError('Token invalido o expirado', 401, 'TOKEN_INVALID'));
  }

  // El colaborador solo ve «Tareas» (#210, fase 5). Se corta aqui y no en cada
  // modulo porque muchas rutas solo piden token —/api/leads entre ellas— y un
  // roleGuard olvidado le abriria prospectos, ventas o finanzas.
  if (soloEsColaborador(req.user) && !colaboradorPuede(req.originalUrl)) {
    return next(new AppError('No tienes permisos para esta accion', 403, 'FORBIDDEN'));
  }
  next();
}

/**
 * Como `roleGuard`, pero SIN el atajo.
 *
 * `roleGuard` deja pasar a `superadmin` y a `soporte` antes de mirar la lista:
 *
 *     if (req.user.role === 'superadmin' || req.user.role === 'soporte') return next();
 *
 * O sea que `roleGuard('admin')` tambien admite a soporte. Para casi todo el CRM
 * eso es lo que se quiere y no se toca — lo usan decenas de rutas y cambiarlo
 * seria mover los permisos de todo a ciegas.
 *
 * Pero donde se guardan CREDENCIALES no vale «quien no encaje cae por el else»:
 * se declara quien entra y no entra nadie mas. Es lo que pide la #80, y lo que
 * hace que añadir un rol nuevo el año que viene no le regale el acceso.
 */
export function soloRoles(...rolesPermitidos) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('No autenticado', 401, 'AUTH_REQUIRED'));
    }
    if (!tieneRol(req.user, ...rolesPermitidos)) {
      return next(new AppError('No tienes permisos para esta accion', 403, 'FORBIDDEN'));
    }
    next();
  };
}

export function roleGuard(...allowedRoles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('No autenticado', 401, 'AUTH_REQUIRED'));
    }
    if (tieneRol(req.user, 'superadmin', 'soporte')) return next();
    if (!tieneRol(req.user, ...allowedRoles)) {
      return next(new AppError('No tienes permisos para esta accion', 403, 'FORBIDDEN'));
    }
    next();
  };
}
