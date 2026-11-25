import crypto from 'node:crypto';
import { AppError } from '../utils/AppError.js';

/**
 * Entrar en una API de Google con una cuenta de servicio, sin dependencias:
 * se firma un JWT (RS256, con `node:crypto`) y Google lo cambia por un token de
 * acceso de una hora. Lo usan Google Analytics (CRM#55) y Search Console (CRM#36),
 * cada uno con su `scope` de solo lectura.
 *
 * `cred` es `{ clientEmail, privateKey }`, ya leído del JSON de la clave.
 */

export const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const b64url = (x) => Buffer.from(x).toString('base64url');

/** El JWT firmado que se cambia por un token de acceso. */
export function firmarJwtGoogle({ clientEmail, privateKey }, scope, ahora = Date.now()) {
  const iat = Math.floor(ahora / 1000);
  const cabecera = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = b64url(JSON.stringify({
    iss: clientEmail, scope, aud: TOKEN_URL, iat, exp: iat + 3600,
  }));
  const firma = crypto.sign('RSA-SHA256', Buffer.from(`${cabecera}.${cuerpo}`), privateKey).toString('base64url');
  return `${cabecera}.${cuerpo}.${firma}`;
}

// Un token por cuenta de servicio y scope, mientras dure (una hora, menos un margen).
const tokens = new Map();

/**
 * @param {string} codigo  el `code` del AppError si Google rechaza la cuenta
 *                         (`GA4_AUTH`, `GSC_AUTH`…), para que se sepa de dónde viene.
 */
export async function tokenDeAccesoGoogle(cred, scope, codigo = 'GOOGLE_AUTH') {
  const clave = `${cred.clientEmail}|${scope}`;
  const guardado = tokens.get(clave);
  if (guardado && guardado.vence > Date.now() + 60_000) return guardado.token;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: firmarJwtGoogle(cred, scope),
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new AppError(
      `Google no acepta la cuenta de servicio: ${json.error_description || json.error || res.status}`,
      502, codigo);
  }
  tokens.set(clave, { token: json.access_token, vence: Date.now() + (json.expires_in || 3600) * 1000 });
  return json.access_token;
}

/** Para las pruebas. */
export const olvidarTokensGoogle = () => tokens.clear();

/**
 * Lee `client_email` y `private_key` del JSON de la clave. Al pegarla en un
 * formulario los saltos de línea suelen llegar como «\n» literal.
 */
export const cuentaDeServicio = (o) => ({
  clientEmail: o.client_email,
  privateKey: String(o.private_key).replace(/\\n/g, '\n'),
});
