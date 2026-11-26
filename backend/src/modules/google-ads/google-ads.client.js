import { AppError } from '../../shared/utils/AppError.js';
import { refreshGoogleAdsAccessToken, leerCredencialGoogleAds } from '../../shared/services/googleAds.service.js';

/**
 * El cliente de la API de Google Ads (CRM#54), sin dependencias: REST + GAQL.
 *
 * Hacen falta cuatro cosas, y ninguna se inventa:
 *   · el cliente OAuth de la app (GOOGLE_OAUTH_CLIENT_ID / _SECRET, ya estaban);
 *   · el developer token de la cuenta de administrador (GOOGLE_ADS_DEVELOPER_TOKEN);
 *   · por campus, en Claves › «google_ads»: el refresh token y la cuenta
 *     (`customer_id`), y si se entra por una cuenta de administrador, su id
 *     (`login_customer_id`, o GOOGLE_ADS_LOGIN_CUSTOMER_ID para todas).
 *
 * El gasto llega en micros (millonésimas de la moneda de la cuenta).
 */

const API = 'https://googleads.googleapis.com';
const version = () => process.env.GOOGLE_ADS_API_VERSION || 'v22';

/** La credencial completa para pedir datos. Lanza 400 diciendo qué falta. */
export function credencialParaDatos(valor) {
  const c = leerCredencialGoogleAds(valor);
  if (c.error) throw new AppError(c.error, 400, 'GOOGLE_ADS_CREDENCIAL_INVALIDA');
  const faltan = [];
  if (!c.refreshToken) faltan.push('refresh_token');
  if (!c.customerId) faltan.push('customer_id');
  if (faltan.length) {
    throw new AppError(
      `A la credencial de Google Ads le falta: ${faltan.join(', ')}. Se guarda como {"refresh_token":"…","customer_id":"123-456-7890"}`,
      400, 'GOOGLE_ADS_CREDENCIAL_INVALIDA'
    );
  }
  return { ...c, loginCustomerId: c.loginCustomerId || (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || '').replace(/[^0-9]/g, '') || null };
}

export async function tokenDeAcceso(cred) {
  const r = await refreshGoogleAdsAccessToken({
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    refreshToken: cred.refreshToken,
  });
  if (!r.ok) throw new AppError(`Google no renovó el token (${r.code}): ${r.message}`, 502, 'GOOGLE_ADS_TOKEN');
  return r.accessToken;
}

/** El mensaje útil de un error de la API (vienen anidados en `details`). */
function mensajeDeError(body, status) {
  const det = body?.error?.details?.[0]?.errors?.[0];
  if (det?.message) return det.message;
  return body?.error?.message || `HTTP ${status}`;
}

/**
 * Una consulta GAQL, con todas sus páginas. Devuelve las filas tal cual las da
 * Google (objetos anidados: `campaign.name`, `metrics.costMicros`…).
 * `fetchImpl` y `token` se pueden pasar en las pruebas.
 */
export async function buscar(cred, gaql, { fetchImpl = fetch, token = null } = {}) {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!developerToken) throw new AppError('Falta GOOGLE_ADS_DEVELOPER_TOKEN en el servidor', 500, 'GOOGLE_ADS_SIN_DEVELOPER_TOKEN');
  const acceso = token || await tokenDeAcceso(cred);
  const headers = {
    Authorization: `Bearer ${acceso}`,
    'developer-token': developerToken,
    'Content-Type': 'application/json',
  };
  if (cred.loginCustomerId) headers['login-customer-id'] = cred.loginCustomerId;

  const filas = [];
  let pageToken;
  for (let vuelta = 0; vuelta < 200; vuelta++) {
    const res = await fetchImpl(`${API}/${version()}/customers/${cred.customerId}/googleAds:search`, {
      method: 'POST',
      headers,
      body: JSON.stringify(pageToken ? { query: gaql, pageToken } : { query: gaql }),
    });
    let body = {};
    try { body = await res.json(); } catch { /* sin cuerpo */ }
    if (!res.ok) throw new AppError(`Google Ads: ${mensajeDeError(body, res.status)}`, 502, 'GOOGLE_ADS_API');
    filas.push(...(body.results || []));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return filas;
}

export const deMicros = (m) => Math.round(Number(m || 0) / 10000) / 100;

const ENTRE = (desde, hasta) => `segments.date BETWEEN '${desde}' AND '${hasta}'`;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Las consultas, en un sitio. Las fechas se validan antes de meterlas en el GAQL. */
export function consultas(desde, hasta) {
  if (!FECHA.test(desde) || !FECHA.test(hasta)) throw new AppError('Fechas AAAA-MM-DD', 400, 'VALIDATION_ERROR');
  const metricas = 'metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value';
  return {
    cuenta: 'SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1',
    // GAQL no tiene OR: las borradas con gasto en el tramo entran por el diario.
    campanas: `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'`,
    diarioCampanas: `SELECT campaign.id, campaign.name, segments.date, ${metricas} FROM campaign WHERE ${ENTRE(desde, hasta)} AND metrics.impressions > 0`,
    diarioGrupos: `SELECT campaign.id, ad_group.id, ad_group.name, segments.date, ${metricas} FROM ad_group WHERE ${ENTRE(desde, hasta)} AND metrics.impressions > 0`,
    diarioAnuncios: `SELECT campaign.id, ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, segments.date, ${metricas} FROM ad_group_ad WHERE ${ENTRE(desde, hasta)} AND metrics.impressions > 0`,
  };
}

/** «Probar» en Claves: renueva el token y, si hay cuenta, la lee. */
export async function probarCredencial(valor, opciones = {}) {
  const c = leerCredencialGoogleAds(valor);
  if (c.error) return { result: 'failed', message: c.error };
  const r = await refreshGoogleAdsAccessToken({
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    refreshToken: c.refreshToken,
  });
  if (!r.ok) return { result: 'expired', code: r.code, message: r.message };
  if (!c.customerId) {
    return { result: 'ok', message: `Token refrescado, expira en ${r.expiresIn}s. Falta «customer_id» para traer campañas.` };
  }
  try {
    const cred = credencialParaDatos(valor);
    const [fila] = await buscar(cred, consultas('2000-01-01', '2000-01-01').cuenta, { ...opciones, token: r.accessToken });
    const nombre = fila?.customer?.descriptiveName || cred.customerId;
    return { result: 'ok', message: `Cuenta «${nombre}» (${fila?.customer?.currencyCode || '—'}) leída bien.` };
  } catch (err) {
    return { result: 'failed', message: err.message };
  }
}
