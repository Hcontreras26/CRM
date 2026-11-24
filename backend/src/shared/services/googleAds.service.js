// F2-014: validacion del refresh token de Google Ads. Llama al endpoint OAuth2
// de Google para intentar refresh del access_token; sirve tanto al scheduler
// diario como al endpoint manual /credentials/:id/test.
//
// La pareja client_id/client_secret es compartida para toda la app (una unica
// "Google Cloud project" registra el OAuth consent screen). Vienen de env.
// El refresh_token es por-credencial (api_credentials.encrypted_value).

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * CRM#54: la credencial «google_ads» de un campus. Antes era solo el refresh
 * token; para traer campañas hace falta además la cuenta. Se aceptan las dos:
 *
 *   · `1//0g…`                                  (solo el token, lo de siempre)
 *   · `{"refresh_token":"1//0g…","customer_id":"123-456-7890",
 *      "login_customer_id":"111-222-3333"}`      (token + cuenta [+ MCC])
 *
 * Los ids de cliente se guardan sin guiones. No lanza: quien lo usa decide si
 * le basta con el token (el cron de validez) o necesita la cuenta (la sincronización).
 */
export function leerCredencialGoogleAds(valor) {
  const limpio = (v) => (v == null || v === '' ? null : String(v).replace(/[^0-9]/g, '') || null);
  const texto = String(valor ?? '').trim();
  if (texto.startsWith('{')) {
    let o = {};
    try { o = JSON.parse(texto); } catch { return { refreshToken: null, customerId: null, loginCustomerId: null, error: 'La credencial de Google Ads no es un JSON válido' }; }
    return {
      refreshToken: o.refresh_token || null,
      customerId: limpio(o.customer_id),
      loginCustomerId: limpio(o.login_customer_id),
      error: null,
    };
  }
  return { refreshToken: texto || null, customerId: null, loginCustomerId: null, error: null };
}

/**
 * @param {object} args
 * @param {string} args.clientId      - Google OAuth client_id (env)
 * @param {string} args.clientSecret  - Google OAuth client_secret (env)
 * @param {string} args.refreshToken  - Refresh token de la credencial
 * @returns {Promise<{ok:true, accessToken:string, expiresIn:number}
 *                  | {ok:false, code:string, message:string}>}
 */
export async function refreshGoogleAdsAccessToken({ clientId, clientSecret, refreshToken }) {
  if (!clientId || !clientSecret) {
    return { ok: false, code: 'missing_oauth_config', message: 'Faltan GOOGLE_OAUTH_CLIENT_ID o GOOGLE_OAUTH_CLIENT_SECRET' };
  }
  if (!refreshToken) {
    return { ok: false, code: 'missing_refresh_token', message: 'La credencial no tiene refresh_token' };
  }

  let res;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
  } catch (err) {
    return { ok: false, code: 'network_error', message: err.message };
  }

  let body = {};
  try { body = await res.json(); } catch { /* respuesta no-json */ }

  if (!res.ok) {
    return {
      ok: false,
      // Google devuelve `error: 'invalid_grant'` cuando el refresh_token fue
      // revocado o expiro. `unauthorized_client` cuando el OAuth client esta
      // desactivado. Pasamos el code raw para que la alerta sea precisa.
      code: body.error || `http_${res.status}`,
      message: body.error_description || `HTTP ${res.status}`,
    };
  }

  if (!body.access_token) {
    return { ok: false, code: 'no_access_token', message: 'Respuesta de Google sin access_token' };
  }

  return {
    ok: true,
    accessToken: body.access_token,
    expiresIn: body.expires_in || 3600,
  };
}
