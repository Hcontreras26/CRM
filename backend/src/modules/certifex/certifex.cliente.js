import { AppError } from '../../shared/utils/AppError.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * Como se habla con la API de Certifex (/api/crm/v1). Vive aparte para que Emisiones,
 * Diplomas, la emision comun y el alcance por campus lo usen sin importarse entre si.
 *
 * Se habla con Certifex SIEMPRE desde este servidor. La clave (`CERTIFEX_CRM_CLAVE`,
 * con forma `cfx_crm_...`) vive solo en el .env del servidor: el navegador no la ve.
 * Contrato: docs/integracion-crm.md en el repo de Certifex.
 */

export function config() {
  const url = (process.env.CERTIFEX_API_URL || '').trim().replace(/\/+$/, '');
  const clave = (process.env.CERTIFEX_CRM_CLAVE || '').trim();
  return url && clave ? { url, clave } : null;
}

/**
 * La web publica de Certifex, donde viven la verificacion y el diploma de cada titulo.
 * Por defecto la misma que la API; `CERTIFEX_PUBLICO_URL` por si alguna vez se separan.
 * No es secreta: es lo que ve cualquiera que escanee el QR de un diploma.
 */
export function urlPublica() {
  return ((process.env.CERTIFEX_PUBLICO_URL || process.env.CERTIFEX_API_URL || '').trim().replace(/\/+$/, '')) || null;
}

/**
 * Una llamada a la API de Certifex. Los errores salen con un mensaje que la pantalla
 * puede ensenar tal cual; la clave no aparece nunca en un log.
 */
export async function certifex(metodo, ruta, cuerpo, { timeoutMs = 20_000 } = {}) {
  const c = config();
  if (!c) throw new AppError('Certifex no esta conectado: faltan CERTIFEX_API_URL y CERTIFEX_CRM_CLAVE en el servidor.', 503, 'CERTIFEX_SIN_CONFIGURAR');
  let r;
  try {
    r = await fetch(`${c.url}/api/crm/v1${ruta}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${c.clave}`, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    logger.error({ err: e.message, ruta }, 'Certifex: no responde');
    throw new AppError('Certifex no responde. Prueba de nuevo en un momento.', 502, 'CERTIFEX_NO_RESPONDE');
  }
  const datos = await r.json().catch(() => null);
  if (r.status === 401) throw new AppError('Certifex no acepta la clave de este CRM (CERTIFEX_CRM_CLAVE).', 502, 'CERTIFEX_CLAVE');
  if (!r.ok) throw new AppError(datos?.error || `Certifex respondio ${r.status}`, r.status >= 500 ? 502 : r.status, 'CERTIFEX_ERROR');
  return datos;
}

// ─────────────────────────────────────────────── recorrer paginas de Certifex

/** Lo mas grande que da Certifex por pagina, y hasta donde se recorre (10 000 filas). */
export const TAM_CERTIFEX = 200;
const MAX_PAGINAS = 50;

/**
 * Recorre un listado de Certifex pagina a pagina, quedandose con lo que pasa `filtro`.
 *
 *  · `completo(filas)`: ya esta todo lo que se buscaba; se deja de pedir. No depende
 *    del orden.
 *  · `antiguo(fila)` con `fecha(fila)`: Certifex no filtra por fechas, pero en su base
 *    ordena lo mas reciente primero. Se deja de pedir cuando una pagina ENTERA llega
 *    ordenada (tambien respecto a la anterior) y su ultima fila ya es anterior a lo que
 *    se busca. Si alguna vez llega desordenada, no se para por fecha: se recorre todo.
 *    (El Certifex de pruebas, con el repositorio en memoria, no ordena: con una parada
 *    por la primera fila antigua, «desde hoy» devolvia vacio.)
 */
export async function recorrer(ruta, params, { filtro = () => true, completo = () => false, antiguo = null, fecha = null } = {}) {
  const filas = [];
  let ordenado = true;
  let previa = null;
  for (let p = 1; p <= MAX_PAGINAS; p++) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    qs.set('pagina', String(p));
    qs.set('tam', String(TAM_CERTIFEX));
    const d = await certifex('GET', `${ruta}?${qs.toString()}`);
    const lote = Array.isArray(d?.filas) ? d.filas : [];
    for (const f of lote) {
      if (filtro(f)) filas.push(f);
      if (completo(filas)) return { filas, truncado: false };
      if (fecha) {
        const t = fecha(f) || null;
        if (previa && t && t > previa) ordenado = false;
        if (t) previa = t;
      }
    }
    if (lote.length < TAM_CERTIFEX || p * TAM_CERTIFEX >= Number(d?.total ?? 0)) return { filas, truncado: false };
    const ultima = lote[lote.length - 1];
    if (antiguo && fecha && ordenado && ultima && antiguo(ultima)) return { filas, truncado: false };
  }
  return { filas, truncado: true };
}
