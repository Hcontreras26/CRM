import crypto from 'node:crypto';
import { AppError } from '../../shared/utils/AppError.js';

/**
 * El cliente de la GA4 Data API (CRM#55), sin dependencias: la cuenta de
 * servicio firma un JWT (RS256, con `node:crypto`), Google lo cambia por un
 * token de acceso de una hora y con él se piden los informes.
 *
 * La credencial es el JSON que da Google al crear la clave de una cuenta de
 * servicio, con `property_id` añadido (el número de la propiedad de GA4, no el
 * «G-XXXX» de la web). La cuenta de servicio tiene que estar dada de alta como
 * «Lector» en esa propiedad.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

/**
 * Lee y comprueba la credencial guardada. Lanza un AppError 400 que dice qué
 * falta, para que quien la pegó sepa qué corregir.
 */
export function leerCredencial(valor) {
  let o;
  try {
    o = typeof valor === 'string' ? JSON.parse(valor) : valor;
  } catch {
    throw new AppError('La credencial de Google Analytics no es un JSON válido', 400, 'GA4_CREDENCIAL_INVALIDA');
  }
  const faltan = ['property_id', 'client_email', 'private_key'].filter((k) => !o?.[k]);
  if (faltan.length) {
    throw new AppError(`A la credencial de Google Analytics le falta: ${faltan.join(', ')}`, 400, 'GA4_CREDENCIAL_INVALIDA');
  }
  const propertyId = String(o.property_id).replace(/^properties\//, '').trim();
  if (!/^\d+$/.test(propertyId)) {
    throw new AppError('`property_id` es el número de la propiedad de GA4 (no el «G-…» de la web)', 400, 'GA4_CREDENCIAL_INVALIDA');
  }
  return {
    propertyId,
    clientEmail: o.client_email,
    // Al pegarla en un formulario los saltos de línea suelen llegar como «\n» literal.
    privateKey: String(o.private_key).replace(/\\n/g, '\n'),
  };
}

const b64url = (x) => Buffer.from(x).toString('base64url');

/** El JWT firmado que se cambia por un token de acceso. */
export function firmarJwt({ clientEmail, privateKey }, ahora = Date.now()) {
  const iat = Math.floor(ahora / 1000);
  const cabecera = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const cuerpo = b64url(JSON.stringify({
    iss: clientEmail, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600,
  }));
  const firma = crypto.sign('RSA-SHA256', Buffer.from(`${cabecera}.${cuerpo}`), privateKey).toString('base64url');
  return `${cabecera}.${cuerpo}.${firma}`;
}

// Un token por cuenta de servicio, mientras dure (una hora, menos un margen).
const tokens = new Map();

export async function tokenDeAcceso(cred) {
  const guardado = tokens.get(cred.clientEmail);
  if (guardado && guardado.vence > Date.now() + 60_000) return guardado.token;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: firmarJwt(cred),
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new AppError(
      `Google no acepta la cuenta de servicio: ${json.error_description || json.error || res.status}`,
      502, 'GA4_AUTH');
  }
  tokens.set(cred.clientEmail, { token: json.access_token, vence: Date.now() + (json.expires_in || 3600) * 1000 });
  return json.access_token;
}

/** Para las pruebas. */
export const olvidarTokens = () => tokens.clear();

/**
 * Un `runReport` paginado. Devuelve filas planas:
 * { [dimension]: string, [metrica]: number }.
 */
export async function informe(cred, { desde, hasta, dimensiones, metricas, limite = 100000 }) {
  const token = await tokenDeAcceso(cred);
  const filas = [];
  let offset = 0;
  for (;;) {
    const res = await fetch(`${DATA_API}/properties/${cred.propertyId}:runReport`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: desde, endDate: hasta }],
        dimensions: dimensiones.map((name) => ({ name })),
        metrics: metricas.map((name) => ({ name })),
        limit: limite,
        offset,
        keepEmptyRows: false,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      // 403: la cuenta de servicio no está dada de alta en la propiedad.
      throw new AppError(`Google Analytics: ${msg}`, res.status === 403 ? 403 : 502, 'GA4_API');
    }
    for (const r of json.rows || []) {
      const fila = {};
      dimensiones.forEach((d, i) => { fila[d] = r.dimensionValues?.[i]?.value ?? ''; });
      metricas.forEach((m, i) => { fila[m] = Number(r.metricValues?.[i]?.value ?? 0); });
      filas.push(fila);
    }
    offset += (json.rows || []).length;
    if (!json.rows?.length || offset >= (json.rowCount || 0)) break;
  }
  return filas;
}

/**
 * El botón «Probar» de Claves: que el JSON esté bien, que Google acepte la
 * cuenta de servicio y que tenga acceso a la propiedad (un informe de ayer).
 * Nunca lanza: devuelve { result: 'ok' | 'failed', message }.
 */
export async function probarCredencial(valor) {
  try {
    const cred = leerCredencial(valor);
    const filas = await informe(cred, { desde: 'yesterday', hasta: 'yesterday', dimensiones: [], metricas: ['sessions'] });
    const sesiones = filas[0]?.sessions ?? 0;
    return { result: 'ok', message: `Acceso a la propiedad ${cred.propertyId}: ${sesiones} sesiones ayer.` };
  } catch (err) {
    return { result: 'failed', message: err.message };
  }
}

/** «20261124» (formato de GA4) → «2026-11-24». */
export const fechaGa = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
