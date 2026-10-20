import dns from 'node:dns/promises';
import net from 'node:net';
import { AppError } from '../../shared/utils/AppError.js';

/**
 * LOS ARCHIVOS DEL FORMULARIO DE ADMISIÓN (#198).
 *
 * Cada web manda los documentos (DNI por las dos caras, foto, título, firma) a su
 * manera, y el webhook acepta las tres (Diego, 01/10):
 *   · como archivo (multipart): en el envío ya mapeado llega como
 *     `{ __archivo: 'campo', nombre, tamano }` y se busca en los archivos;
 *   · como imagen en texto: `data:image/png;base64,…` (los campos de firma de
 *     Elementor), o el base64 sin el prefijo;
 *   · como URL de la imagen (Gravity y Elementor suelen mandar el enlace al archivo
 *     subido): el CRM lo descarga.
 *
 * Tipos: JPG, PNG, WEBP y PDF, hasta 10 MB, MIRANDO EL TIPO REAL del contenido, no
 * la extensión ni lo que diga quien lo manda.
 *
 * La URL la elige quien manda el formulario, así que solo se descargan direcciones
 * públicas: nada de 127.0.0.1, la red interna ni los metadatos de la nube. Si no, el
 * webhook serviría para que alguien de fuera leyera servidores internos.
 */

export const MAX_BYTES = 10 * 1024 * 1024;
const TIEMPO_MAX_MS = 10_000;
const MAX_REDIRECCIONES = 3;

/** El tipo real por los primeros bytes: { ext, mime } o null si no es uno admitido. */
export function tipoReal(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  if (buffer.subarray(0, 4).toString('latin1') === '%PDF') return { ext: 'pdf', mime: 'application/pdf' };
  return null;
}

const rechazo = (motivo) => new AppError(motivo, 400, 'DOCUMENTO_NO_VALIDO');

function comprobado(buffer) {
  if (!buffer?.length) throw rechazo('El archivo está vacío.');
  if (buffer.length > MAX_BYTES) throw rechazo('El archivo pasa de 10 MB.');
  const tipo = tipoReal(buffer);
  if (!tipo) throw rechazo('No es un JPG, PNG, WEBP ni PDF.');
  return { buffer, ...tipo };
}

// ── Imagen en texto ───────────────────────────────────────────────────────────

const DATA_URI = /^data:[\w.+/-]+;base64,([\s\S]*)$/i;
const BASE64_PURO = /^[A-Za-z0-9+/\s]+=*\s*$/;

/** El base64 de un `data:…;base64,` o sin prefijo; null si el texto no lo es. */
function desdeTexto(texto) {
  const m = DATA_URI.exec(texto);
  const b64 = m ? m[1] : (texto.length >= 100 && BASE64_PURO.test(texto) ? texto : null);
  if (b64 === null) return null;
  // Antes de decodificar: 10 MB son ~13,4 M caracteres en base64.
  if (b64.length > Math.ceil(MAX_BYTES / 3) * 4 + 64) throw rechazo('El archivo pasa de 10 MB.');
  return Buffer.from(b64.replace(/\s/g, ''), 'base64');
}

// ── URL ───────────────────────────────────────────────────────────────────────

/** ¿Es una dirección de la red interna, del propio equipo o de servicio? */
export function ipPrivada(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return ipPrivada(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

async function urlPublica(url) {
  let u;
  try { u = new URL(url); } catch { throw rechazo('La dirección del archivo no es válida.'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw rechazo('La dirección del archivo tiene que ser http o https.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((r) => r.address);
  if (!ips.length) throw rechazo('No se encuentra el servidor del archivo.');
  if (ips.some(ipPrivada)) throw rechazo('La dirección del archivo no es pública.');
  return u;
}

/**
 * Descarga un archivo de una URL pública. `opciones.fetch` y
 * `opciones.permitirRedLocal` son para las pruebas (un servidor en 127.0.0.1).
 */
export async function desdeUrl(url, { fetch: fetchImpl = globalThis.fetch, permitirRedLocal = false } = {}) {
  let actual = url;
  for (let salto = 0; salto <= MAX_REDIRECCIONES; salto++) {
    if (!permitirRedLocal) await urlPublica(actual);
    else if (!/^https?:\/\//i.test(actual)) throw rechazo('La dirección del archivo tiene que ser http o https.');
    let res;
    try {
      res = await fetchImpl(actual, { redirect: 'manual', signal: AbortSignal.timeout(TIEMPO_MAX_MS) });
    } catch {
      throw rechazo('No se ha podido descargar el archivo.');
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      // Cada salto se vuelve a comprobar: una dirección pública puede redirigir a una interna.
      actual = new URL(res.headers.get('location'), actual).toString();
      continue;
    }
    if (!res.ok) throw rechazo(`El servidor del archivo contestó ${res.status}.`);
    if (Number(res.headers.get('content-length')) > MAX_BYTES) throw rechazo('El archivo pasa de 10 MB.');
    const partes = [];
    let total = 0;
    for await (const parte of res.body) {
      total += parte.length;
      if (total > MAX_BYTES) throw rechazo('El archivo pasa de 10 MB.');
      partes.push(Buffer.from(parte));
    }
    return Buffer.concat(partes);
  }
  throw rechazo('Demasiadas redirecciones al descargar el archivo.');
}

// ── Lo que llegue ─────────────────────────────────────────────────────────────

/** Un archivo del envío, venga como venga. Lanza AppError con el motivo si no vale. */
export async function obtenerArchivo(valor, archivos = [], opciones = {}) {
  // Gravity manda a veces una lista de URLs: vale el primero.
  const v = Array.isArray(valor) ? valor.find((x) => x != null && x !== '') : valor;
  if (v == null || v === '') return null;
  if (typeof v === 'object' && v.__archivo) {
    const f = (Number.isInteger(v.__indice) && archivos[v.__indice]?.fieldname === v.__archivo)
      ? archivos[v.__indice] : archivos.find((a) => a.fieldname === v.__archivo);
    if (!f) throw rechazo('No ha llegado el archivo.');
    return comprobado(f.buffer);
  }
  if (typeof v !== 'string') throw rechazo('No es un archivo, una URL ni una imagen en texto.');
  const texto = v.trim();
  // El nombre de un campo de archivo del multipart (mapeado a «campo.__archivo», o a mano).
  const delCampo = archivos.find((a) => a.fieldname === texto);
  if (delCampo) return comprobado(delCampo.buffer);
  if (/^https?:\/\//i.test(texto)) return comprobado(await desdeUrl(texto, opciones));
  const buffer = desdeTexto(texto);
  if (!buffer) throw rechazo('No es un archivo, una URL ni una imagen en texto.');
  return comprobado(buffer);
}

/**
 * El envío para mapear y guardar: los campos de texto tal cual y, por cada archivo
 * del multipart, una marca `{ __archivo, nombre, tamano }` en su campo. Así el modo
 * escucha los enseña y se pueden mapear igual que el resto.
 */
export function conArchivos(body, archivos = []) {
  const out = { ...(body || {}) };
  const porCampo = new Map();
  archivos.forEach((f, i) => {
    const marca = { __archivo: f.fieldname, __indice: i, nombre: f.originalname || null, tamano: f.size ?? f.buffer?.length ?? null };
    porCampo.set(f.fieldname, [...(porCampo.get(f.fieldname) || []), marca]);
  });
  // Varios archivos con el mismo nombre (`fotos[]`): una lista, y vale el primero.
  for (const [campo, marcas] of porCampo) out[campo] = marcas.length === 1 ? marcas[0] : marcas;
  return out;
}

/**
 * Lo que se guarda en `datos_admision`: el envío tal cual, pero sin las imágenes en
 * texto (pueden ser megas en cada matrícula); en su lugar, «[imagen en texto, N KB]».
 */
export function sinImagenesEnTexto(valor) {
  if (typeof valor === 'string') {
    if (DATA_URI.test(valor) || (valor.length > 2000 && BASE64_PURO.test(valor))) {
      return `[imagen en texto, ${Math.round((valor.length * 3) / 4 / 1024)} KB]`;
    }
    return valor;
  }
  if (Array.isArray(valor)) return valor.map(sinImagenesEnTexto);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, x]) => [k, sinImagenesEnTexto(x)]));
  }
  return valor;
}
