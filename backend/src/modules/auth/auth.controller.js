import * as authService from './auth.service.js';
import { sanitizeProjects } from './auth.service.js';
import * as authModel from './auth.model.js';
import { loginSchema, setPasswordSchema } from './auth.validation.js';
import { AppError } from '../../shared/utils/AppError.js';
import { buildPermissionsMap, resolveUserView } from '../permissions/permissions.service.js';

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
}

// El flag 'secure' obliga a HTTPS — pero estamos sirviendo por HTTP en beta.
// Si NODE_ENV=production fuerza secure=true, el navegador descarta la cookie
// al recargar (no la envía de vuelta sobre HTTP) y el usuario queda deslogueado.
// Solución: COOKIE_SECURE opcional en .env (default false hasta tener HTTPS).
const COOKIE_SECURE = String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true';

function setRefreshCookie(res, refreshToken, expiryDays) {
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',  // 'lax' funciona sobre HTTP; 'strict' a veces lo bloquea al refrescar
    maxAge: expiryDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearRefreshCookie(res) {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
    path: '/',
  });
}

export async function login(req, res, next) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    }

    const { email, password } = parsed.data;
    const ip = getClientIp(req);

    const result = await authService.login(email, password, ip);

    setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiryDays);

    res.json({
      success: true,
      data: {
        accessToken: result.accessToken,
        user: result.user,
        projects: result.projects,
        activeProjectId: result.activeProjectId,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      throw new AppError('Refresh token no encontrado', 401, 'REFRESH_REQUIRED');
    }

    const result = await authService.refresh(refreshToken);

    setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiryDays);

    res.json({
      success: true,
      data: { accessToken: result.accessToken },
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const refreshToken = req.cookies?.refreshToken;
    const userId = req.user?.userId;
    const ip = getClientIp(req);

    await authService.logout(refreshToken, userId, ip);
    clearRefreshCookie(res);

    res.json({ success: true, data: { message: 'Sesion cerrada' } });
  } catch (err) {
    next(err);
  }
}

export async function setPassword(req, res, next) {
  try {
    const parsed = setPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.errors[0].message, 400, 'VALIDATION_ERROR');
    }

    const { token, password } = parsed.data;
    const result = await authService.setPassword(token, password);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    const user = await authModel.findUserById(req.user.userId);

    if (!user) {
      throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
    }

    const [projects, permissions, view] = await Promise.all([
      authModel.getUserProjects(user.id, user.role),
      buildPermissionsMap(user.id, user.role, user.custom_role_id, user.roles_extra),
      resolveUserView(user.id, user.role, user.custom_role_id),
    ]);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          nombre: user.nombre,
          email: user.email,
          role: user.role,
          // Los roles de mas, para que la pantalla pueda enseñar lo de cada uno.
          roles_extra: user.roles_extra || [],
          avatar_url: user.avatar_url,
          custom_role_id: user.custom_role_id,
          custom_role_label: user.custom_role_label,
          factura_manager: !!user.factura_manager,
          gestor_colaboraciones: !!user.gestor_colaboraciones,
          editar_fechas_factura: !!user.editar_fechas_factura,
        },
        permissions,
        view,
        projects: sanitizeProjects(projects, user.role),
      },
    });
  } catch (err) {
    next(err);
  }
}
