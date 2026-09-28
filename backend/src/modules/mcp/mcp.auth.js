import { construirAmbito, huella, pareceToken, puedeUsarMcp } from './mcp.acceso.js';
import * as model from './mcp.model.js';

/**
 * La puerta del MCP: el token personal de `Authorization: Bearer crm_mcp_…`.
 *
 * No se usa el JWT del CRM: dura 8 horas y vive en la memoria del navegador.
 * Claude necesita algo que se pegue una vez en su configuracion.
 *
 * En CADA peticion se vuelve a mirar en la base si la persona sigue activa,
 * si sigue teniendo acceso y cuales son sus campus. Quitarle la casilla o un
 * campus tiene efecto en la siguiente pregunta, no cuando caduque el token.
 *
 * Los errores van en JSON-RPC y con 401/403: es lo que entiende un cliente MCP.
 */
function rechazar(res, status, message) {
  return res.status(status).json({ jsonrpc: '2.0', error: { code: -32001, message }, id: null });
}

export async function verificarTokenMcp(req, res, next) {
  try {
    const cabecera = req.headers.authorization || '';
    const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : null;
    if (!pareceToken(token)) {
      res.set('WWW-Authenticate', 'Bearer realm="crm-mcp"');
      return rechazar(res, 401, 'Falta el token MCP. Créalo en el CRM: Conexión → MCP.');
    }

    const vivo = await model.findTokenVivo(huella(token));
    if (!vivo) {
      res.set('WWW-Authenticate', 'Bearer realm="crm-mcp", error="invalid_token"');
      return rechazar(res, 401, 'Token MCP no válido, caducado o revocado.');
    }

    const user = await model.findUserById(vivo.user_id);
    if (!puedeUsarMcp(user)) {
      return rechazar(res, 403, 'Tu usuario no tiene acceso al MCP del CRM.');
    }

    const proyectos = await model.proyectosDeLaPersona(user);
    req.mcp = { ambito: construirAmbito(user, proyectos), tokenId: vivo.token_id };
    model.marcarUso(vivo.token_id).catch(() => {});
    next();
  } catch (err) {
    next(err);
  }
}
