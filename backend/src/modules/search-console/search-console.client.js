import { AppError } from '../../shared/utils/AppError.js';
import {
  tokenDeAccesoGoogle, olvidarTokensGoogle, cuentaDeServicio,
} from '../../shared/services/googleCuentaServicio.service.js';
import { normalizarRuta } from '../google-analytics/google-analytics.service.js';

/**
 * El cliente de la API de Search Console (CRM#36), sin dependencias, con la
 * misma cuenta de servicio que GA4 (`googleCuentaServicio`).
 *
 * La credencial es el JSON de la clave de la cuenta de servicio con `site_url`
 * añadido: la propiedad tal cual la nombra Search Console, `sc-domain:web.com`
 * (propiedad de dominio: entran todos los subdominios de país) o
 * `https://web.com/` (prefijo de URL). La cuenta de servicio tiene que estar
 * dada de alta como usuario («Restringido» basta) en esa propiedad.
 */

const API = 'https://www.googleapis.com/webmasters/v3';
const INSPECCION = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
/** Lo más que da Search Console por petición. */
export const FILAS_POR_PETICION = 25000;

/**
 * `sc-domain:Web.com` → `sc-domain:web.com`; `https://web.com` → `https://web.com/`.
 * null si no es ninguna de las dos formas.
 */
export function normalizarSitio(site) {
  const s = String(site || '').trim();
  const dominio = /^sc-domain:([a-z0-9.-]+\.[a-z]{2,})$/i.exec(s);
  if (dominio) return `sc-domain:${dominio[1].toLowerCase()}`;
  if (/^https?:\/\/[^/\s]+/i.test(s)) {
    try {
      const u = new URL(s);
      return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`}`;
    } catch { return null; }
  }
  return null;
}

/**
 * Lee y comprueba la credencial guardada. `sitioDelCampus` (projects.gsc_property)
 * vale si el JSON no trae `site_url`. Lanza un AppError 400 que dice qué falta.
 */
export function leerCredencial(valor, sitioDelCampus = null) {
  let o;
  try {
    o = typeof valor === 'string' ? JSON.parse(valor) : valor;
  } catch {
    throw new AppError('La credencial de Search Console no es un JSON válido', 400, 'GSC_CREDENCIAL_INVALIDA');
  }
  const faltan = ['client_email', 'private_key'].filter((k) => !o?.[k]);
  if (!o?.site_url && !sitioDelCampus) faltan.unshift('site_url');
  if (faltan.length) {
    throw new AppError(`A la credencial de Search Console le falta: ${faltan.join(', ')}`, 400, 'GSC_CREDENCIAL_INVALIDA');
  }
  const siteUrl = normalizarSitio(o.site_url || sitioDelCampus);
  if (!siteUrl) {
    throw new AppError('`site_url` es la propiedad de Search Console: «sc-domain:web.com» o «https://web.com/»', 400, 'GSC_CREDENCIAL_INVALIDA');
  }
  return { siteUrl, ...cuentaDeServicio(o) };
}

export const tokenDeAcceso = (cred) => tokenDeAccesoGoogle(cred, SCOPE, 'GSC_AUTH');
/** Para las pruebas. */
export const olvidarTokens = olvidarTokensGoogle;

async function llamar(cred, url, cuerpo) {
  const token = await tokenDeAcceso(cred);
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    // 403: la cuenta de servicio no es usuaria de la propiedad.
    throw new AppError(`Search Console: ${msg}`, res.status === 403 ? 403 : 502, 'GSC_API');
  }
  return json;
}

/**
 * `searchAnalytics.query` paginado (web, con los días aún sin cerrar). Devuelve
 * filas planas: { [dimension]: string, clics, impresiones, posicion }.
 */
export async function analitica(cred, { desde, hasta, dimensiones, maxFilas = 500000 }) {
  const url = `${API}/sites/${encodeURIComponent(cred.siteUrl)}/searchAnalytics/query`;
  const filas = [];
  for (let startRow = 0; startRow < maxFilas; startRow += FILAS_POR_PETICION) {
    const json = await llamar(cred, url, {
      startDate: desde,
      endDate: hasta,
      dimensions: dimensiones,
      type: 'web',
      dataState: 'all',
      rowLimit: FILAS_POR_PETICION,
      startRow,
    });
    const rows = json.rows || [];
    for (const r of rows) {
      const fila = { clics: Number(r.clicks || 0), impresiones: Number(r.impressions || 0), posicion: Number(r.position || 0) };
      dimensiones.forEach((d, i) => { fila[d] = r.keys?.[i] ?? ''; });
      filas.push(fila);
    }
    if (rows.length < FILAS_POR_PETICION) break;
  }
  return filas;
}

/**
 * La inspección de URL: si Google tiene la página indexada. Cuota de Google:
 * 2.000 al día y 600 al minuto por propiedad.
 */
export async function inspeccionar(cred, url) {
  const json = await llamar(cred, INSPECCION, { inspectionUrl: url, siteUrl: cred.siteUrl, languageCode: 'es' });
  const r = json?.inspectionResult?.indexStatusResult || {};
  return {
    veredicto: r.verdict || 'VERDICT_UNSPECIFIED',
    cobertura: r.coverageState || null,
    ultimoRastreo: r.lastCrawlTime || null,
  };
}

/** `https://WWW.Web.com/Curso/?a=1` → { host: 'web.com', ruta: '/curso' }. */
export function partirUrl(url) {
  let host = '';
  try { host = new URL(String(url)).host.toLowerCase().replace(/^www\./, ''); } catch { /* ruta suelta */ }
  return { host, ruta: normalizarRuta(url) || '/' };
}

/** Si una URL es de la propiedad: Google rechaza inspeccionar las de fuera. */
export function esDelSitio(url, siteUrl) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  const host = u.host.toLowerCase();
  if (siteUrl.startsWith('sc-domain:')) {
    const dominio = siteUrl.slice('sc-domain:'.length);
    return host === dominio || host.endsWith(`.${dominio}`);
  }
  return `${u.protocol}//${host}${u.pathname}`.startsWith(siteUrl);
}

const dia = (d) => d.toISOString().slice(0, 10);

/**
 * El botón «Probar» de Claves: que el JSON esté bien, que Google acepte la
 * cuenta de servicio y que sea usuaria de la propiedad (los clics de la
 * última semana). Nunca lanza: devuelve { result: 'ok' | 'failed', message }.
 */
export async function probarCredencial(valor, sitioDelCampus = null, ahora = new Date()) {
  try {
    const cred = leerCredencial(valor, sitioDelCampus);
    const filas = await analitica(cred, {
      desde: dia(new Date(ahora.getTime() - 9 * 86400000)),
      hasta: dia(new Date(ahora.getTime() - 3 * 86400000)),
      dimensiones: [],
    });
    const clics = filas[0]?.clics ?? 0;
    return { result: 'ok', message: `Acceso a ${cred.siteUrl}: ${clics} clics en la última semana con datos.` };
  } catch (err) {
    return { result: 'failed', message: err.message };
  }
}
