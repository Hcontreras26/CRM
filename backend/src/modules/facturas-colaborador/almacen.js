import crypto from 'node:crypto';
import { getFromR2, uploadToR2 } from '../../shared/services/r2.service.js';
import { generatePresignedUrl } from '../../shared/utils/presignedUrl.js';
import { saveLocal, getLocal } from '../../shared/services/localStorage.service.js';

/**
 * Dónde se guardan los archivos de las facturas de colaboradores.
 *
 * R2 si está configurado; si no, el disco del servidor, igual que los documentos
 * y los adjuntos de WhatsApp. Revisión del 10/10: R2 no está configurado ni en
 * /testeo ni en producción, y sin esto la subida del colaborador daba un 500 (el
 * cliente de R2 apuntaba a «https://undefined.r2.cloudflarestorage.com»).
 *
 * Lo guardado en disco lleva el prefijo «local:» en `archivo_key`, para saber
 * dónde buscarlo aunque más adelante se configure R2. Para descargarlo se da,
 * como con R2, un enlace firmado de 15 minutos, aquí hacia la propia API
 * (`GET /api/facturas-colaborador/archivo-local/:id?exp=&sig=`), como ruta relativa a la API
 * que el frontal completa con la suya.
 */

const LOCAL = 'local:';
const QUINCE_MINUTOS = 15 * 60;

/** El mismo criterio que documents.controller.js: credenciales de verdad, no las de prueba. */
export function r2Configurado(env = process.env) {
  return Boolean(env.CLOUDFLARE_R2_ACCOUNT_ID && env.CLOUDFLARE_R2_ACCOUNT_ID !== 'test'
    && env.CLOUDFLARE_R2_ACCESS_KEY && env.CLOUDFLARE_R2_ACCESS_KEY !== 'test'
    && env.CLOUDFLARE_R2_BUCKET);
}

/** Guarda el archivo y devuelve la clave tal como se apunta en `archivo_key`. */
export async function guardar(clave, buffer, mime) {
  if (r2Configurado()) {
    await uploadToR2(clave, buffer, mime);
    return clave;
  }
  await saveLocal(clave, buffer);
  return LOCAL + clave;
}

export const esLocal = (archivoKey) => String(archivoKey || '').startsWith(LOCAL);

/** Lee un archivo guardado en el disco del servidor. */
export async function leerLocal(archivoKey) {
  // getLocal da { buffer, size }: aquí solo hace falta el contenido (QA del 10/10).
  const { buffer } = await getLocal(String(archivoKey).slice(LOCAL.length));
  return buffer;
}

/** Lee un archivo, esté en R2 o en el disco (el ZIP del mes, segunda parte). */
export async function leer(archivoKey) {
  if (esLocal(archivoKey)) return leerLocal(archivoKey);
  const { body } = await getFromR2(archivoKey);
  return Buffer.from(await body.transformToByteArray());
}

// La firma del enlace de descarga: separada de cualquier otro uso del secreto.
// El justificante del pago (segunda parte) firma aparte: su enlace no abre la factura, ni al revés.
const firma = (id, exp, que = 'archivo') => crypto.createHmac('sha256',
  `facturas-colaborador:${que === 'archivo' ? 'descarga' : `descarga-${que}`}:${process.env.JWT_SECRET || ''}`)
  .update(`${id}.${exp}`).digest('base64url');

/** ¿Vale el enlace de descarga? Sin caducar y con su firma (`que`: 'archivo' o 'justificante'). */
export function firmaValida(id, exp, sig, ahora = Date.now(), que = 'archivo') {
  const n = Number(exp);
  if (!Number.isFinite(n) || n * 1000 < ahora || typeof sig !== 'string') return false;
  const esperada = Buffer.from(firma(Number(id), n, que));
  const recibida = Buffer.from(sig);
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

/** El enlace de descarga, de 15 minutos: el de R2 o el de la propia API (`que`: 'archivo' o 'justificante'). */
export async function urlDeDescarga(id, archivoKey, que = 'archivo') {
  if (!esLocal(archivoKey)) return generatePresignedUrl(archivoKey);
  const exp = Math.floor(Date.now() / 1000) + QUINCE_MINUTOS;
  // Relativa a la API: la completa el frontal con la suya (/testeo/api, /crm/api). Con
  // CRM_BASE_URL salía la de producción en /testeo, que allí apunta a /crm (QA del 10/10).
  return `/facturas-colaborador/${que}-local/${id}?exp=${exp}&sig=${firma(Number(id), exp, que)}`;
}
