/**
 * De dónde viene un prospecto: la regla, en UN solo sitio (#48).
 *
 * Make no deduce el canal (si lo hiciera, cada escenario acabaría con su
 * versión y dejarían de cuadrar entre sí) ni lo hace la web: manda lo que ve
 * —las UTM, el `document.referrer`, la dirección completa— y lo decide el CRM.
 * Esta función es lo que usa el alta de un prospecto y también el script que
 * aplica la regla hacia atrás (`scripts/recalcular-canal.mjs`).
 *
 * LA REGLA, por orden (gana la primera que case):
 *
 *   1. IA generativa. `chatgpt.com`, `chat.openai.com`, `openai.com` → `chatgpt_ia`.
 *      Se mira el referrer Y `utm_source`: ChatGPT a veces no manda referrer y a
 *      veces llega como `utm_source=chatgpt.com`. Mirar solo uno pierde la mitad.
 *   2. `gclid` en la dirección → `google_ads`; `fbclid` → `meta_ads`; `ttclid` →
 *      `tiktok_ads`. Un identificador de clic no se escribe a mano: es de pago.
 *   3. `utm_source` de una red: fb/ig/facebook/instagram/meta → `meta_ads`;
 *      tiktok → `tiktok_ads`; google con medium cpc/ppc/paid → `google_ads`;
 *      whatsapp → `whatsapp`.
 *   4. `utm_medium`: `referral` → `referido`; `organic` → `organico`.
 *   5. `utm_source` de buscador (google, bing…) sin pago → `organico`.
 *   6. Referrer: un buscador → `organico`; la propia web → no cuenta (es
 *      navegación interna); cualquier otra web → `referido`.
 *   7. Una `utm_source` que no es ninguna de las de arriba (un boletín, una
 *      alianza) → `referido`: viene de alguien que no es el propio sitio.
 *   8. Sin ninguna pista → `directo`.
 *
 * LAS OTRAS IA (Perplexity, Gemini, Copilot, Claude). Decidido por Diego el
 * 25/11/2026 en la #48: «ChatGPT» cuando el referrer es chatgpt.com U OTRA IA.
 * Van a `chatgpt_ia`, que en pantalla ya se llama «ChatGPT / IA», y en el
 * informe a la categoría fija «IA». Cuál fue exactamente no se pierde: se
 * guardan `utm_source`, `referrer` y `landing_url`. Antes iban a `referido`;
 * `scripts/recalcular-canal.mjs` los pasa hacia atrás (`planearRecalculo`).
 *
 * LOS IDENTIFICADORES DE CLIC pueden llegar pegados a la dirección o como campo
 * suelto (un campo oculto de Elementor, Make): `gclid`, `fbclid`, `ttclid`.
 * Valen igual por las dos vías.
 */

export const CANAL_DE_LAS_OTRAS_IA = 'chatgpt_ia';

/**
 * LAS CATEGORÍAS FIJAS del informe (Diego, 25/11/2026, #48): Pago Google,
 * Pago Meta, Orgánico, IA, Directo, Referido y Otros. El canal guardado es más
 * fino (TikTok, WhatsApp, Instagram…); en el informe se agrupan aquí. Lo que no
 * se sabe de dónde vino va aparte como «Sin origen» y no es una categoría: no se
 * reparte entre las demás, y su porcentaje dice si la tubería funciona.
 */
export const CATEGORIAS = [
  { clave: 'pago_google', texto: 'Pago Google', canales: ['google_ads'] },
  { clave: 'pago_meta', texto: 'Pago Meta', canales: ['meta_ads'] },
  { clave: 'organico', texto: 'Orgánico', canales: ['organico'] },
  { clave: 'ia', texto: 'IA', canales: ['chatgpt_ia'] },
  { clave: 'directo', texto: 'Directo', canales: ['directo'] },
  { clave: 'referido', texto: 'Referido', canales: ['referido'] },
  // TikTok, WhatsApp, Instagram y cualquier canal que se añada mañana.
  { clave: 'otros', texto: 'Otros', canales: [] },
];
export const SIN_ORIGEN = 'sin_origen';

/** La categoría fija de un canal guardado; un canal que no está en ninguna, «otros». */
export function categoriaDelCanal(canal) {
  if (canal === SIN_ORIGEN) return SIN_ORIGEN;
  return CATEGORIAS.find((c) => c.canales.includes(canal))?.clave || 'otros';
}

/**
 * Lo mismo en SQL, sobre una expresión que da el canal como texto. Se monta a
 * partir de `CATEGORIAS` para que el informe y el código no puedan separarse.
 */
export function categoriaEnSql(exprCanal) {
  const ramas = CATEGORIAS.flatMap((c) => c.canales.map((canal) => `WHEN '${canal}' THEN '${c.clave}'`));
  return `CASE (${exprCanal}) WHEN '${SIN_ORIGEN}' THEN '${SIN_ORIGEN}' ${ramas.join(' ')} ELSE 'otros' END`;
}

const HOSTS_CHATGPT = ['chatgpt.com', 'chat.openai.com', 'openai.com'];
const HOSTS_OTRAS_IA = ['perplexity.ai', 'gemini.google.com', 'copilot.microsoft.com', 'claude.ai', 'you.com', 'poe.com'];
const BUSCADORES = [
  'google', 'bing.com', 'duckduckgo.com', 'yahoo.com', 'ecosia.org', 'ask.com', 'baidu.com', 'yandex', 'startpage.com', 'qwant.com',
];
const REDES_META = /(^|[^a-z0-9])(fb|ig|facebook|instagram|meta)([^a-z0-9]|$)/;

/** El host de una dirección o de un texto tipo «chatgpt.com»; null si no hay. Sin «www.». */
export function hostDe(valor) {
  if (!valor || typeof valor !== 'string') return null;
  const v = valor.trim().toLowerCase();
  if (!v) return null;
  let host = null;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(v) ? v : `https://${v}`).hostname;
  } catch {
    return null;
  }
  return host.replace(/^www\./, '') || null;
}

/** ¿`host` es `base` o un subdominio suyo? («chat.openai.com» es de «openai.com»). */
const esDe = (host, base) => !!host && (host === base || host.endsWith(`.${base}`));
const esDeAlguno = (host, bases) => bases.some((b) => esDe(host, b));
const esBuscador = (host) => !!host && BUSCADORES.some((b) => (b.includes('.') ? esDe(host, b) : host.split('.').includes(b)));

function parametros(url) {
  try { return new URL(url).searchParams; } catch { return new URLSearchParams(); }
}

/**
 * El canal de un prospecto, a partir de lo que se sepa de él. Cualquier campo
 * puede faltar. Devuelve siempre uno de los valores del enum `utm_channel`.
 */
export function deducirCanal({ utm_source, utm_medium, referrer, landing_url, gclid, fbclid, ttclid } = {}) {
  const fuente = String(utm_source || '').trim().toLowerCase();
  const medio = String(utm_medium || '').trim().toLowerCase();
  const hostRef = hostDe(referrer);
  const hostFuente = fuente.includes('.') ? hostDe(fuente) : null;
  const deLaUrl = parametros(landing_url);
  // El identificador de clic, de la dirección o del campo suelto.
  const suelto = { gclid, fbclid, ttclid };
  const clics = { get: (k) => deLaUrl.get(k) || (typeof suelto[k] === 'string' && suelto[k].trim()) || null };
  const hostPropio = hostDe(landing_url);

  // 1 · IA generativa
  if (esDeAlguno(hostRef, HOSTS_CHATGPT) || esDeAlguno(hostFuente, HOSTS_CHATGPT) || /^(chatgpt|openai)$/.test(fuente)) return 'chatgpt_ia';
  if (esDeAlguno(hostRef, HOSTS_OTRAS_IA) || esDeAlguno(hostFuente, HOSTS_OTRAS_IA)
    || /^(perplexity|gemini|copilot|claude)$/.test(fuente)) return CANAL_DE_LAS_OTRAS_IA;

  // 2 · identificadores de clic
  if (clics.get('gclid')) return 'google_ads';
  if (clics.get('fbclid')) return 'meta_ads';
  if (clics.get('ttclid')) return 'tiktok_ads';

  // 3 · utm_source de una red
  if (fuente) {
    if (REDES_META.test(fuente)) return 'meta_ads';
    if (fuente.includes('tiktok')) return 'tiktok_ads';
    if (fuente.includes('google') && ['cpc', 'ppc', 'paid', 'paidsearch', 'paid_search'].includes(medio)) return 'google_ads';
    if (fuente === 'whatsapp') return 'whatsapp';
  }

  // 4 · utm_medium
  if (medio === 'referral') return 'referido';
  if (medio === 'organic') return 'organico';

  // 5 · utm_source de buscador sin pago
  if (fuente && (esBuscador(hostFuente) || /^(google|bing|duckduckgo|yahoo|ecosia)$/.test(fuente))) return 'organico';

  // 6 · el referrer
  if (hostRef && hostRef !== hostPropio) {
    if (esBuscador(hostRef)) return 'organico';
    if (hostRef.includes('tiktok.com')) return 'tiktok_ads';
    return 'referido';
  }

  // 7 · una fuente que no es ninguna de las de arriba
  if (fuente) return 'referido';

  // 8 · sin pistas
  return 'directo';
}

/**
 * ¿Hay alguna pista de origen? Es lo que separa un «directo» de verdad
 * (llegó con su dirección y sin referrer) de un prospecto del que no se sabe
 * nada porque la tubería no se lo trajo. El porcentaje de estos últimos es el
 * que dice si #48 funciona.
 */
export function tienePistaDeOrigen({ utm_source, utm_medium, utm_campaign, referrer, landing_url, gclid, ttclid } = {}) {
  return [utm_source, utm_medium, utm_campaign, referrer, landing_url, gclid, ttclid].some((v) => typeof v === 'string' && v.trim() !== '');
}

/**
 * Lo que cabe de cada UTM en `lead_utms` (001_initial_schema.sql) y lo que ya
 * exige la ruta de Make (lead.validation.js). Una UTM que vino en la dirección
 * no pasó por ninguna validación: un `utm_content={{ad.name}}` de Meta pasa de
 * 255 sin esfuerzo y el INSERT tumbaba el alta entera (#48, revisión de Diego).
 */
export const TOPE_UTM = Object.freeze({
  utm_source: 100, utm_medium: 100, utm_campaign: 255, utm_content: 255, utm_term: 255,
});

/** Una UTM recortada a lo que cabe en su columna; sin texto → null. */
export function recortarUtm(clave, valor) {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  const v = valor.trim();
  return TOPE_UTM[clave] ? v.slice(0, TOPE_UTM[clave]) : v;
}

/** Las UTM que lleva pegadas una dirección (solo las que tengan texto), ya recortadas a su columna. */
export function utmsDeLaDireccion(url) {
  const p = parametros(url);
  const sacar = (k) => recortarUtm(k, p.get(k));
  return {
    utm_source: sacar('utm_source'),
    utm_medium: sacar('utm_medium'),
    utm_campaign: sacar('utm_campaign'),
    utm_content: sacar('utm_content'),
    utm_term: sacar('utm_term'),
  };
}

const CANALES_DEBILES = new Set([null, undefined, 'directo']);

/**
 * Aplicar la regla HACIA ATRÁS (#48), sin tocar la base: recibe las filas y dice
 * qué cambiaría. Lo usa `scripts/recalcular-canal.mjs`, que es quien lee y
 * escribe.
 *
 * Qué toca y qué no:
 *   · Solo recalcula el canal de las filas «débiles»: sin canal o en `directo`,
 *     que es lo que el alta ponía cuando no sabía leer la pista. Un canal puesto
 *     a mano o por Make (meta_ads, whatsapp…) se respeta SIEMPRE.
 *   · Rellena las UTM que faltan con las que lleve pegada la dirección
 *     (`landing_url`), sin pisar ninguna que ya esté escrita. Un lead de Meta
 *     entró como «directo» teniendo `utm_source=fb` en la dirección.
 *   · No inventa: sin ninguna pista, la fila se queda como está.
 *   · Un canal «nuevo» igual que el que ya tenía, sin UTM que rellenar, no es un cambio.
 *
 * `filas`: { lead_id, canal_detectado, utm_source, utm_medium, utm_campaign,
 *            utm_content, utm_term, referrer, landing_url }.
 * Devuelve { cambios, sinPista, respetadas }.
 */
export function planearRecalculo(filas) {
  const cambios = [];
  let sinPista = 0;
  let respetadas = 0;
  for (const f of filas) {
    // Una IA que no es ChatGPT entraba como «referido» hasta el 25/11/2026: esa
    // sí se revisa, pero solo para pasarla a IA. Cualquier otro «referido» se respeta.
    const iaComoReferido = f.canal_detectado === 'referido' && deducirCanal(f) === CANAL_DE_LAS_OTRAS_IA;
    if (!CANALES_DEBILES.has(f.canal_detectado) && !iaComoReferido) { respetadas += 1; continue; }
    const deLaUrl = utmsDeLaDireccion(f.landing_url);
    const utms = {};
    for (const k of Object.keys(deLaUrl)) {
      const actual = typeof f[k] === 'string' && f[k].trim() ? f[k] : null;
      if (!actual && deLaUrl[k]) utms[k] = deLaUrl[k];
    }
    const completa = { ...f, ...utms };
    if (!tienePistaDeOrigen(completa)) { sinPista += 1; continue; }
    const canal = deducirCanal(completa);
    if (canal === (f.canal_detectado ?? null) && !Object.keys(utms).length) continue;
    cambios.push({
      lead_id: f.lead_id,
      canal_antes: f.canal_detectado ?? null,
      canal_nuevo: canal,
      utms_nuevas: utms,
    });
  }
  return { cambios, sinPista, respetadas };
}

/**
 * El `fbclid` de una dirección, o null. Mismo parámetro que ya mira el canal
 * (arriba); aquí es para convertirlo a `fbc` (#474).
 */
export function extraerFbclid(url) {
  const v = parametros(url).get('fbclid');
  return v && v.trim() ? v.trim() : null;
}

/** 
 * El `fbclid` en el formato que espera Meta para `fbc`: `fb.1.{ms}.{fbclid}`
 * (#474). El `1` es el índice de subdominio; con un solo dominio (el nuestro)
 * siempre es 1. `ts` son los milisegundos de cuando se vio el fbclid — por
 * defecto, ahora mismo.
 */
export function fbclidAFbc(fbclid, ts = Date.now()) {
  if (!fbclid) return null;
  return `fb.1.${ts}.${fbclid}`;
}

/** El `gclid` de una dirección, o null. */
export function extraerGclid(url) {
  const v = parametros(url).get('gclid');
  return v && v.trim() ? v.trim() : null;
}

/** El `ttclid` de TikTok de una dirección, o null (#1246). */
export function extraerTtclid(url) {
  const v = parametros(url).get('ttclid');
  return v && v.trim() ? v.trim().slice(0, 500) : null;
}

const suelto = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 500) : null);

/**
 * Lo que se guarda de los identificadores de clic de un alta (#48), venga por
 * donde venga: el `gclid` y el `ttclid` (#1246) tal cual y el `fbclid` como
 * `fbc` (#474). Primero el de la dirección; si no trae, el campo suelto.
 */
export function clicsDelOrigen({ landing_url, gclid, fbclid, ttclid } = {}) {
  return {
    gclid: extraerGclid(landing_url) || suelto(gclid),
    ttclid: extraerTtclid(landing_url) || suelto(ttclid),
    fbc: fbclidAFbc(extraerFbclid(landing_url) || suelto(fbclid)),
  };
}

const FBP_META =/^fb\.\d\.\d+\.[\w-]+$/;

/**
 * El `fbp` tal como lo manda el formulario externo, validado contra el
 * formato de Meta y el límite de la columna (VARCHAR(255)); si no cumple,
 * null — mejor perder el dato que perder el prospecto entero (#474).
 */
export function limpiarFbp(fbp) {
  if (!fbp || typeof fbp !== 'string') return null;
  const v = fbp.trim();
  return v && v.length <= 255 && FBP_META.test(v) ? v : null;
}
 
