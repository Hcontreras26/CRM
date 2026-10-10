import crypto from 'node:crypto';
import { uploadToR2 } from '../../shared/services/r2.service.js';
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

// La firma del enlace de descarga: separada de cualquier otro uso del secreto.
const firma = (id, exp) => crypto.createHmac('sha256', `facturas-colaborador:descarga:${process.env.JWT_SECRET || ''}`)
  .update(`${id}.${exp}`).digest('base64url');

/** ¿Vale el enlace de descarga? Sin caducar y con su firma. */
export function firmaValida(id, exp, sig, ahora = Date.now()) {
  const n = Number(exp);
  if (!Number.isFinite(n) || n * 1000 < ahora || typeof sig !== 'string') return false;
  const esperada = Buffer.from(firma(Number(id), n));
  const recibida = Buffer.from(sig);
  return esperada.length === recibida.length && crypto.timingSafeEqual(esperada, recibida);
}

/** El enlace de descarga, de 15 minutos: el de R2 o el de la propia API. */
export async function urlDeDescarga(id, archivoKey) {
  if (!esLocal(archivoKey)) return generatePresignedUrl(archivoKey);
  const exp = Math.floor(Date.now() / 1000) + QUINCE_MINUTOS;
  // Relativa a la API: la completa el frontal con la suya (/testeo/api, /crm/api). Con
  // CRM_BASE_URL salía la de producción en /testeo, que allí apunta a /crm (QA del 10/10).
  return `/facturas-colaborador/archivo-local/${id}?exp=${exp}&sig=${firma(Number(id), exp)}`;
}
