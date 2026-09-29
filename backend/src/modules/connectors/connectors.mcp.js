import dns from 'node:dns';
import net from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AppError } from '../../shared/utils/AppError.js';
import { logger } from '../../shared/utils/logger.js';
import { registrarAuditoria } from '../mcp/mcp.model.js';

/**
 * Conector de tipo «Servidor MCP»: el CRM se conecta a un servidor MCP de fuera
 * —como hace Claude— y trae de ahí los datos que luego se mapean e importan.
 *
 * Diego, 29/09: «servidor MCP, y ahí tienes las limitaciones que dio Diana».
 * Son las del MCP del CRM (`modules/mcp`), vistas desde el otro lado:
 *
 *   · SOLO CONSULTA. Solo se llama a herramientas que el servidor declara de
 *     solo lectura (`readOnlyHint` y no `destructiveHint`). Se mira en CADA
 *     llamada: si el servidor cambia la herramienta, deja de usarse. Sin la
 *     marca no se llama, aunque el nombre suene inofensivo.
 *   · CADA LLAMADA QUEDA REGISTRADA en `mcp_auditoria` (quién, qué herramienta,
 *     con qué argumentos, si fue bien y cuánto tardó). El token no.
 *   · TOPES: 20 s por llamada, 5 MB de respuesta, 5000 elementos por
 *     importación y 20 llamadas por minuto a cada servidor.
 *   · EL TOKEN no vuelve nunca al navegador (`bearer_token` se tapa en el
 *     controlador, como el de «API propia»).
 *   · El ámbito lo pone el conector: lo que traiga solo puede entrar en los
 *     campus de su alcance (ver `importFromConnector`).
 *
 * Y una más, propia de que sea el CRM quien llama: solo servidores PÚBLICOS por
 * https. Una dirección de la red interna (localhost, 10.x, 192.168.x…) se
 * rechaza, y las redirecciones también: si no, un conector serviría para
 * asomarse a la base de datos o a la API desde dentro del propio servidor.
 */

export const LIMITES = Object.freeze({
  TIEMPO_MS: 20_000,
  MAX_CARACTERES: 5_000_000,
  MAX_ELEMENTOS: 5000,
  LLAMADAS_POR_MINUTO: 20,
});

/** Lo que el servidor dice de la herramienta. Sin la marca, no es de consulta. */
export function esDeSoloLectura(tool) {
  const a = tool?.annotations || {};
  return a.readOnlyHint === true && a.destructiveHint !== true;
}

export function ipPrivada(ip) {
  const v = String(ip).toLowerCase().replace(/^::ffff:/, '');
  if (net.isIPv4(v)) {
    const [a, b] = v.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168);
  }
  return v === '::1' || v === '::' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
}

/** La dirección, solo si es https y de un servidor público. */
export async function comprobarUrl(texto) {
  let url;
  try {
    url = new URL(String(texto || '').trim());
  } catch {
    throw new AppError('La dirección del servidor MCP no es válida', 400, 'MCP_URL');
  }
  if (url.protocol !== 'https:') throw new AppError('El servidor MCP tiene que ir por https://', 400, 'MCP_URL');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const interno = new AppError('Ese servidor está en una red interna: el CRM solo se conecta a servidores públicos.', 400, 'MCP_URL_INTERNA');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw interno;
  let direcciones;
  try {
    direcciones = net.isIP(host) ? [{ address: host }] : await dns.promises.lookup(host, { all: true });
  } catch {
    throw new AppError(`No se encuentra el servidor ${host}`, 400, 'MCP_URL');
  }
  if (!direcciones.length || direcciones.some((d) => ipPrivada(d.address))) throw interno;
  return url;
}

// 20 llamadas por minuto a cada servidor: de sobra para mapear e importar, y
// corta un bucle. En memoria: tras un reinicio empieza de cero, y basta.
const llamadas = new Map();
function frenar(clave) {
  const ahora = Date.now();
  const recientes = (llamadas.get(clave) || []).filter((t) => ahora - t < 60_000);
  if (recientes.length >= LIMITES.LLAMADAS_POR_MINUTO) {
    throw new AppError('Demasiadas llamadas a este servidor MCP. Espera un minuto.', 429, 'MCP_LIMITE');
  }
  recientes.push(ahora);
  llamadas.set(clave, recientes);
}

async function conTiempo(promesa, que) {
  let reloj;
  const tope = new Promise((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new AppError(
      `El servidor MCP tardó más de ${LIMITES.TIEMPO_MS / 1000} s en ${que} y se cortó.`, 504, 'MCP_LENTO')), LIMITES.TIEMPO_MS);
  });
  try {
    return await Promise.race([promesa, tope]);
  } finally {
    clearTimeout(reloj);
  }
}

async function auditar({ userId = null, connectorId = null, servidor = null }, herramienta, argumentos, fn) {
  const inicio = Date.now();
  let ok = true;
  let error = null;
  try {
    return await fn();
  } catch (err) {
    ok = false;
    error = err.message;
    throw err;
  } finally {
    registrarAuditoria({
      userId, tokenId: null, herramienta: `conector:${herramienta}`.slice(0, 60),
      parametros: { connector_id: connectorId, servidor, argumentos: argumentos ?? null },
      ok, error, duracionMs: Date.now() - inicio,
    }).catch((e) => logger.warn({ err: e.message }, 'Conector MCP: no se pudo guardar la auditoria'));
  }
}

/** Abre la conexión, hace lo que toque y la cierra siempre. */
async function conCliente(config, url, fn) {
  const headers = { 'User-Agent': 'CRM-ISEIH-Connector/1.0' };
  if (config.bearer_token) headers.Authorization = `Bearer ${config.bearer_token}`;
  // `redirect: 'error'`: una redireccion podria llevar a la red interna
  // despues de haber pasado la comprobacion de la direccion.
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers, redirect: 'error' } });
  const client = new Client({ name: 'crm-iseih-conectores', version: '1.0.0' });
  try {
    await conTiempo(client.connect(transport), 'conectar');
    return await fn(client);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(`No se pudo hablar con el servidor MCP: ${err.message}`.slice(0, 300), 502, 'MCP_SERVIDOR');
  } finally {
    client.close().catch(() => {});
  }
}

async function todasLasHerramientas(client) {
  const tools = [];
  let cursor;
  for (let i = 0; i < 10; i++) {
    const r = await conTiempo(client.listTools(cursor ? { cursor } : undefined), 'listar sus herramientas');
    tools.push(...(r.tools || []));
    cursor = r.nextCursor;
    if (!cursor) break;
  }
  return tools;
}

/** Las herramientas del servidor, diciendo cuáles se pueden usar. */
export async function listarHerramientas(config, ctx = {}) {
  const url = await comprobarUrl(config.url);
  frenar(url.origin);
  return auditar({ ...ctx, servidor: url.host }, 'tools/list', null, () => conCliente(config, url, async (client) => {
    const tools = await todasLasHerramientas(client);
    return tools.map((t) => ({
      nombre: t.name,
      titulo: t.title || t.annotations?.title || null,
      descripcion: t.description || '',
      soloLectura: esDeSoloLectura(t),
      argumentos: t.inputSchema || null,
    }));
  }));
}

/** Lo que devuelve la herramienta, ya como datos (JSON), para mapear. */
function datosDe(res) {
  if (res.structuredContent !== undefined && res.structuredContent !== null) {
    if (JSON.stringify(res.structuredContent).length > LIMITES.MAX_CARACTERES) throw demasiado();
    return res.structuredContent;
  }
  const textos = (res.content || []).filter((c) => c.type === 'text').map((c) => c.text || '');
  if (textos.reduce((n, t) => n + t.length, 0) > LIMITES.MAX_CARACTERES) throw demasiado();
  for (const t of textos) {
    try { return JSON.parse(t); } catch { /* el siguiente */ }
  }
  throw new AppError('La herramienta no devolvió datos en JSON: el CRM necesita datos que mapear, no texto.', 422, 'MCP_NO_JSON');
}
function demasiado() {
  return new AppError(`La respuesta pasa de ${LIMITES.MAX_CARACTERES / 1_000_000} MB. Acota con los argumentos.`, 413, 'MCP_GRANDE');
}

/**
 * Llama a la herramienta del conector y devuelve lo que trae.
 * `config`: { url, bearer_token?, herramienta, argumentos? (JSON) }.
 */
export async function traerDatos(config, ctx = {}) {
  const nombre = String(config.herramienta || '').trim();
  if (!nombre) throw new AppError('Elige la herramienta del servidor MCP que trae los datos.', 400, 'MCP_SIN_HERRAMIENTA');
  let argumentos = {};
  if (config.argumentos && String(config.argumentos).trim()) {
    try {
      argumentos = JSON.parse(config.argumentos);
    } catch {
      throw new AppError('Los argumentos tienen que ir en JSON, por ejemplo {"limite": 100}.', 400, 'MCP_ARGUMENTOS');
    }
    if (!argumentos || typeof argumentos !== 'object' || Array.isArray(argumentos)) {
      throw new AppError('Los argumentos tienen que ser un objeto JSON, por ejemplo {"limite": 100}.', 400, 'MCP_ARGUMENTOS');
    }
  }
  const url = await comprobarUrl(config.url);
  frenar(url.origin);
  return auditar({ ...ctx, servidor: url.host }, nombre, argumentos, () => conCliente(config, url, async (client) => {
    const tool = (await todasLasHerramientas(client)).find((t) => t.name === nombre);
    if (!tool) throw new AppError(`El servidor no tiene la herramienta «${nombre}».`, 404, 'MCP_SIN_HERRAMIENTA');
    if (!esDeSoloLectura(tool)) {
      throw new AppError(`«${nombre}» no está marcada como de solo lectura en el servidor, y el CRM solo usa herramientas de consulta.`, 403, 'MCP_NO_SOLO_LECTURA');
    }
    const res = await conTiempo(client.callTool({ name: nombre, arguments: argumentos }, undefined, { timeout: LIMITES.TIEMPO_MS }), 'contestar');
    if (res.isError) {
      const texto = (res.content || []).map((c) => c.text || '').join(' ').trim();
      throw new AppError(`El servidor MCP contestó con un error: ${texto || 'sin detalle'}`.slice(0, 300), 502, 'MCP_ERROR_REMOTO');
    }
    return datosDe(res);
  }));
}
