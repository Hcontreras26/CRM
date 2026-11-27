import crypto from 'node:crypto';
import { query } from '../../shared/config/db.js';
import { AppError } from '../../shared/utils/AppError.js';
import * as credenciales from '../credentials/credentials.model.js';
import { cuentaDeServicio } from '../../shared/services/googleCuentaServicio.service.js';
import * as ga4 from '../google-analytics/google-analytics.client.js';
import * as gsc from '../search-console/search-console.client.js';
import {
  syncActivo as ga4SyncActivo, ponerAlDia as ga4PonerAlDia,
} from '../google-analytics/google-analytics.service.js';
import {
  syncActivo as gscSyncActivo, ponerAlDia as gscPonerAlDia,
} from '../search-console/search-console.service.js';
import { umbralesDe, COLUMNA_UMBRAL, UMBRALES_DE_SERIE } from '../search-console/search-console.aviso.js';
import { interruptorDelCampus } from '../../shared/utils/interruptorCampus.js';
import { proximaVuelta as ga4ProximaVuelta } from '../../jobs/googleAnalyticsSyncScheduler.js';
import { proximaVuelta as gscProximaVuelta } from '../../jobs/searchConsoleSyncScheduler.js';

/**
 * GOOGLE ANALYTICS 4 Y SEARCH CONSOLE EN INTEGRACIONES (Diego, 25/11; CRM#1099).
 *
 * La credencial de cada campus se cargaba solo desde «Configuración › Claves», a
 * mano: pegar el JSON de la cuenta de servicio y añadirle a mano `property_id`
 * (GA4) o `site_url` (Search Console). Aquí se carga desde la tarjeta del campus
 * y se guarda EN EL MISMO SITIO Y CON EL MISMO FORMATO que ya leen los módulos de
 * Hugo (`credencialDe` / `proyectosConGA4` / `proyectosConGSC`):
 *
 *   api_credentials · service `google_analytics` | `gsc` · project_id del campus
 *   · entorno «produccion» · valor cifrado (AES-256-GCM, como todas) =
 *   el JSON de la cuenta de servicio con `property_id` o `site_url` añadido.
 *
 * Lo que NUNCA sale de aquí: la `private_key` (ni entera, ni un trozo). La
 * pantalla solo recibe el correo de la cuenta, la propiedad y el estado. Para
 * no descifrar al enseñar el estado, el correo y la propiedad van también en
 * `metadata` (no son secretos); las credenciales puestas antes desde Claves no
 * los tienen y se sacan del valor, quedándose solo con esos dos campos.
 */

export const SERVICIOS = {
  ga4: {
    servicio: 'google_analytics',
    nombre: 'Google Analytics 4',
    api: 'Google Analytics Data API',
    tablaSync: 'ga4_sincronizacion',
    syncActivo: ga4SyncActivo,
    variable: 'GA4_SYNC_ACTIVO',
    ponerAlDia: (...a) => ga4PonerAlDia(...a),
    proximaVuelta: (...a) => ga4ProximaVuelta(...a),
    tickMs: () => parseInt(process.env.GA4_SYNC_TICK_MS || String(6 * 60 * 60 * 1000), 10),
  },
  gsc: {
    servicio: 'gsc',
    nombre: 'Search Console',
    api: 'Google Search Console API',
    tablaSync: 'gsc_sincronizacion',
    syncActivo: gscSyncActivo,
    variable: 'GSC_SYNC_ACTIVO',
    ponerAlDia: (...a) => gscPonerAlDia(...a),
    proximaVuelta: (...a) => gscProximaVuelta(...a),
    tickMs: () => parseInt(process.env.GSC_SYNC_TICK_MS || String(6 * 60 * 60 * 1000), 10),
  },
};

export function servicioDe(clave) {
  const s = SERVICIOS[clave];
  if (!s) throw new AppError('Servicio de Google desconocido (ga4 o gsc)', 404, 'NOT_FOUND');
  return s;
}

const malJson = (mensaje) => new AppError(mensaje, 400, 'GOOGLE_JSON_INVALIDO');

/**
 * Comprueba que lo subido es la clave JSON de una CUENTA DE SERVICIO y la
 * devuelve como objeto. Dice en claro qué se ha subido si no lo es (lo más
 * común: el JSON del cliente OAuth, que también se descarga de Google Cloud).
 */
export function leerCuentaDeServicio(texto) {
  let o = texto;
  if (typeof texto === 'string') {
    try { o = JSON.parse(texto.trim()); } catch {
      throw malJson('No es un JSON válido. Sube el archivo .json tal cual lo descargaste de Google Cloud, sin cambiar nada.');
    }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw malJson('El JSON no es la clave de una cuenta de servicio.');
  if (o.installed || o.web) {
    throw malJson('Ese JSON es de un «ID de cliente de OAuth», no de una cuenta de servicio. En Google Cloud › Cuentas de servicio › (la cuenta) › Claves › Agregar clave › JSON.');
  }
  if (o.type !== 'service_account') {
    throw malJson(`El JSON no es de una cuenta de servicio (su «type» es «${o.type ?? 'ninguno'}» y debe ser «service_account»).`);
  }
  const faltan = ['client_email', 'private_key'].filter((k) => typeof o[k] !== 'string' || !o[k].trim());
  if (faltan.length) throw malJson(`Al JSON de la cuenta de servicio le falta: ${faltan.join(', ')}.`);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(o.client_email.trim())) {
    throw malJson('El «client_email» del JSON no es un correo.');
  }
  try {
    crypto.createPrivateKey(cuentaDeServicio(o).privateKey);
  } catch {
    throw malJson('La clave privada del JSON está dañada o incompleta. Descarga una clave nueva de la cuenta de servicio y súbela entera.');
  }
  return o;
}

/** «properties/123», « 123 » → «123». null si no son solo números. */
export function normalizarPropiedad(valor) {
  const s = String(valor ?? '').trim().replace(/^properties\//i, '');
  return /^\d{1,20}$/.test(s) ? s : null;
}

/** Lo que se enseña de una credencial: nunca la clave. */
function publico(o) {
  if (!o || typeof o !== 'object') return {};
  return {
    client_email: o.client_email || null,
    property_id: o.property_id != null ? String(o.property_id) : null,
    site_url: o.site_url || null,
  };
}

/** La fila de producción del campus, o null. Sin el valor cifrado. */
async function filaDe(servicio, projectId) {
  const { rows } = await query(
    `SELECT ac.id, ac.metadata, ac.created_at, ac.updated_at, ac.last_tested_at, ac.last_test_result,
            quien.nombre AS puesta_por
       FROM api_credentials ac
       LEFT JOIN users quien ON quien.id = (ac.metadata->>'updated_by')::int
      WHERE ac.service = $1 AND ac.project_id = $2 AND ac.active = true
        AND COALESCE(ac.metadata->>'entorno', 'produccion') = 'produccion'
      ORDER BY ac.updated_at DESC NULLS LAST
      LIMIT 1`,
    [servicio, projectId]
  );
  return rows[0] || null;
}

/** El JSON guardado (descifrado), solo para uso interno. null si no hay. */
async function valorGuardado(servicio, projectId) {
  const valor = await credenciales.getDecryptedValue(servicio, projectId, { marcar: false, soloProduccion: true });
  if (!valor) return null;
  try { return JSON.parse(valor); } catch { return null; }
}

async function sincronizacionDe(tabla, projectId) {
  // El interruptor y los umbrales son de la 342 (CRM#1210); sin ella, lo de antes.
  const gsc = tabla === 'gsc_sincronizacion';
  try {
    const { rows } = await query(
      `SELECT s.*, por.nombre AS sync_cambiado_por_nombre
              ${gsc ? ', um.nombre AS umbrales_cambiado_por_nombre' : ''}
         FROM ${tabla} s
         LEFT JOIN users por ON por.id = s.sync_cambiado_por
         ${gsc ? 'LEFT JOIN users um ON um.id = s.umbrales_cambiado_por' : ''}
        WHERE s.project_id = $1`,
      [projectId]
    );
    return rows[0] || null;
  } catch {
    try {
      const { rows } = await query(
        `SELECT last_synced_at, last_status, last_error, updated_at FROM ${tabla} WHERE project_id = $1`,
        [projectId]
      );
      return rows[0] || null;
    } catch {
      // La tabla es de la 323 / 334: si no se ha aplicado, no hay sincronización que enseñar.
      return null;
    }
  }
}

/**
 * La sincronización automática del campus, para la tarjeta (CRM#1210): si está
 * encendida, de dónde sale eso (pantalla, `.env` o de serie), quién la tocó, y
 * cuándo es la próxima vuelta (solo si está encendida y la tarea corre aquí).
 */
export function automaticaDe(s, sync, ahora = new Date()) {
  const { activo, origen } = interruptorDelCampus(sync?.sync_activo ?? null, s.syncActivo());
  const proxima = activo ? s.proximaVuelta(ahora) : null;
  return {
    activa: activo,
    origen,
    variable: s.variable,
    cambiada_por: origen === 'pantalla' ? sync?.sync_cambiado_por_nombre || null : null,
    cambiada_at: origen === 'pantalla' ? sync?.sync_cambiado_at || null : null,
    proxima_vuelta: proxima ? proxima.toISOString() : null,
    cada_horas: Math.round((s.tickMs() / 3600000) * 10) / 10,
  };
}

/** Los umbrales del aviso de caída del campus, para la tarjeta de Search Console. */
function umbralesParaTarjeta(sync) {
  const { origen, ...valores } = umbralesDe(sync);
  return {
    valores,
    origen,
    de_serie: { ...UMBRALES_DE_SERIE },
    cambiado_por: sync?.umbrales_cambiado_por_nombre || null,
    cambiado_at: sync?.umbrales_cambiado_at || null,
  };
}

/**
 * conectado | error | sin_probar | sin_conectar. Manda lo último que pasó: la
 * última prueba o la última sincronización, la que sea más reciente.
 */
export function estadoDe({ conectada, prueba, sync }) {
  if (!conectada) return 'sin_conectar';
  const hechos = [];
  if (prueba?.at) hechos.push({ at: new Date(prueba.at).getTime(), ok: prueba.ok });
  if (sync?.last_status) {
    hechos.push({ at: new Date(sync.updated_at || sync.last_synced_at || 0).getTime(), ok: sync.last_status === 'ok' });
  }
  if (!hechos.length) return 'sin_probar';
  hechos.sort((a, b) => b.at - a.at);
  return hechos[0].ok ? 'conectado' : 'error';
}

/** Lo que enseña la tarjeta de un campus. */
export async function estado(clave, projectId) {
  const s = servicioDe(clave);
  const fila = await filaDe(s.servicio, projectId);
  const otro = SERVICIOS[clave === 'ga4' ? 'gsc' : 'ga4'];
  const filaOtro = await filaDe(otro.servicio, projectId);

  let datos = publico(fila?.metadata);
  // Credencial puesta antes desde Claves: sin correo ni propiedad en metadata.
  if (fila && (!datos.client_email || (clave === 'ga4' ? !datos.property_id : !datos.site_url))) {
    const o = await valorGuardado(s.servicio, projectId);
    datos = { ...publico(o), ...Object.fromEntries(Object.entries(datos).filter(([, v]) => v)) };
  }
  if (fila && clave === 'gsc' && !datos.site_url) {
    const { rows } = await query(`SELECT gsc_property FROM projects WHERE id = $1`, [projectId]);
    datos.site_url = rows[0]?.gsc_property || null;
  }
  let correoOtro = filaOtro?.metadata?.client_email || null;
  if (filaOtro && !correoOtro) correoOtro = publico(await valorGuardado(otro.servicio, projectId)).client_email;

  const prueba = fila?.last_tested_at
    ? { at: fila.last_tested_at, ok: fila.last_test_result === 'ok', mensaje: fila.metadata?.ultima_prueba_mensaje || null }
    : null;
  // Aunque no haya credencial: el interruptor y los umbrales se conservan al quitarla.
  const sync = await sincronizacionDe(s.tablaSync, projectId);
  const automatica = automaticaDe(s, sync);

  return {
    servicio: clave,
    conectada: !!fila,
    estado: estadoDe({ conectada: !!fila, prueba, sync }),
    client_email: fila ? datos.client_email : null,
    ...(clave === 'ga4' ? { property_id: fila ? datos.property_id : null } : { site_url: fila ? datos.site_url : null }),
    puesta_por: fila?.puesta_por || null,
    actualizada_at: fila?.updated_at || null,
    ultima_prueba: prueba,
    ultima_sincronizacion: fila && sync && (sync.last_status || sync.last_synced_at)
      ? { at: sync.last_synced_at, estado: sync.last_status, error: sync.last_error || null }
      : null,
    // La automática de ESTE campus (CRM#1210). `sincronizacion_activa` se queda
    // por compatibilidad con quien la leía antes.
    sincronizacion_activa: automatica.activa,
    sincronizacion: automatica,
    sincronizando: enCurso.has(`${clave}:${projectId}`),
    ...(clave === 'gsc' ? { umbrales_aviso: umbralesParaTarjeta(sync) } : {}),
    // Para ofrecer «usar la misma cuenta» si el otro servicio ya está conectado.
    otra_cuenta: correoOtro ? { servicio: clave === 'ga4' ? 'gsc' : 'ga4', client_email: correoOtro } : null,
  };
}

/**
 * Guarda (o cambia) la credencial del campus.
 *
 * El JSON puede venir nuevo (`json`), copiarse del otro servicio del mismo
 * campus (`misma_cuenta`) o no venir: entonces se queda el guardado y solo
 * cambia la propiedad. Se valida la propiedad: sin ella los módulos no leen nada.
 */
export async function guardar(clave, projectId, { json, misma_cuenta, property_id, site_url }, userId) {
  const s = servicioDe(clave);
  let cuenta;
  if (json) cuenta = leerCuentaDeServicio(json);
  else if (misma_cuenta) {
    const otro = SERVICIOS[clave === 'ga4' ? 'gsc' : 'ga4'];
    const o = await valorGuardado(otro.servicio, projectId);
    if (!o) throw new AppError(`Este campus no tiene ${otro.nombre} conectado: sube el JSON de la cuenta de servicio.`, 400, 'GOOGLE_SIN_JSON');
    cuenta = leerCuentaDeServicio(o);
  } else {
    const o = await valorGuardado(s.servicio, projectId);
    if (!o) throw new AppError('Sube el JSON de la cuenta de servicio.', 400, 'GOOGLE_SIN_JSON');
    cuenta = leerCuentaDeServicio(o);
  }
  // Fuera lo que pudiera traer de otro servicio: cada credencial con lo suyo.
  const { property_id: _p, site_url: _s, ...base } = cuenta;
  const anterior = publico(await valorGuardado(s.servicio, projectId));

  let valor;
  let propiedad;
  if (clave === 'ga4') {
    const pedido = property_id ?? anterior.property_id ?? cuenta.property_id;
    if (pedido == null || String(pedido).trim() === '') {
      throw new AppError('Falta el ID de propiedad de GA4 (solo números).', 400, 'GA4_SIN_PROPIEDAD');
    }
    propiedad = normalizarPropiedad(pedido);
    if (!propiedad) {
      throw new AppError('El ID de propiedad son solo números (GA4 › Administrar › Detalles de la propiedad), no el «G-…» de la web.', 400, 'GA4_PROPIEDAD_INVALIDA');
    }
    valor = { ...base, property_id: propiedad };
    ga4.leerCredencial(valor); // la misma comprobación que hará el módulo al leerla
  } else {
    const pedido = site_url ?? anterior.site_url ?? cuenta.site_url;
    if (!pedido || !String(pedido).trim()) {
      throw new AppError('Falta la propiedad de Search Console: «sc-domain:web.com» o «https://web.com/».', 400, 'GSC_SIN_PROPIEDAD');
    }
    propiedad = gsc.normalizarSitio(pedido);
    if (!propiedad) {
      throw new AppError('La propiedad de Search Console se escribe «sc-domain:web.com» (dominio) o «https://web.com/» (prefijo de URL).', 400, 'GSC_PROPIEDAD_INVALIDA');
    }
    valor = { ...base, site_url: propiedad };
    gsc.leerCredencial(valor);
  }

  const previa = await filaDe(s.servicio, projectId);
  await credenciales.upsert({
    project_id: projectId,
    service: s.servicio,
    value: JSON.stringify(valor),
    entorno: 'produccion',
    userId,
    metadata: {
      client_email: valor.client_email,
      ...(clave === 'ga4' ? { property_id: propiedad } : { site_url: propiedad }),
      origen: 'integraciones',
      ultima_prueba_mensaje: null,
    },
  });
  // La prueba anterior era de otra clave o de otra propiedad: ya no vale.
  await query(
    `UPDATE api_credentials SET last_tested_at = NULL, last_test_result = NULL
      WHERE service = $1 AND project_id = $2 AND active = true
        AND COALESCE(metadata->>'entorno', 'produccion') = 'produccion'`,
    [s.servicio, projectId]
  );
  // Otra propiedad: el histórico guardado es de la anterior, se vuelve a traer entero.
  const columna = clave === 'ga4' ? 'property_id' : 'site_url';
  await query(
    `UPDATE ${s.tablaSync} SET backfill_done = false, updated_at = NOW()
      WHERE project_id = $1 AND ${columna} IS NOT NULL AND ${columna} IS DISTINCT FROM $2`,
    [projectId, propiedad]
  ).catch(() => { /* sin la tabla (323 / 334) no hay histórico que rehacer */ });

  return { nueva: !previa };
}

/** Desactiva la credencial de producción del campus (no borra lo sincronizado). */
export async function quitar(clave, projectId) {
  const s = servicioDe(clave);
  const fila = await filaDe(s.servicio, projectId);
  if (!fila) throw new AppError(`Este campus no tiene ${s.nombre} conectado.`, 404, 'NOT_FOUND');
  await credenciales.remove(fila.id);
  return { id: fila.id };
}

const detalleDe = (msg) => msg.replace(/^(Google Analytics|Search Console): /, '');

/**
 * El error de Google, en castellano y con qué hacer. `ctx`: el correo de la
 * cuenta y la propiedad, para decir cuál es cuál.
 */
export function explicarError(clave, err, { clientEmail, propertyId, siteUrl } = {}) {
  const msg = String(err?.message || err || '');
  const cuenta = clientEmail ? `la cuenta ${clientEmail}` : 'la cuenta de servicio';
  const api = SERVICIOS[clave]?.api || 'API de Google';
  if (/has not been used in project|it is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(msg)) {
    const enlace = /https:\/\/console\.(?:developers|cloud)\.google\.com\/apis\/api\/[^\s"')]+/.exec(msg)?.[0];
    return `La «${api}» no está activada en el proyecto de Google Cloud de ${cuenta}. Actívala en Google Cloud › APIs y servicios › Biblioteca${enlace ? ` (${enlace})` : ''}, espera un par de minutos y vuelve a probar.`;
  }
  if (err?.code === 'GA4_AUTH' || err?.code === 'GSC_AUTH' || /no acepta la cuenta de servicio/.test(msg)) {
    if (/not found|deleted/i.test(msg)) {
      return `Google no encuentra ${cuenta}: puede que se haya borrado en Google Cloud. Crea otra cuenta de servicio y sube su JSON.`;
    }
    if (/invalid_grant|JWT/i.test(msg)) {
      return `Google no acepta la clave de ${cuenta}: se borró o se cambió en Google Cloud (Cuentas de servicio › Claves). Crea una clave nueva en JSON y súbela otra vez.`;
    }
    return `Google no acepta ${cuenta} (${msg.replace(/^Google no acepta la cuenta de servicio: /, '')}). Revisa que la cuenta exista y que la clave sea la última que creaste.`;
  }
  if (/DECODER|PEM|asn1|private key/i.test(msg)) {
    return 'La clave privada guardada está dañada. Descarga una clave nueva de la cuenta de servicio y súbela otra vez.';
  }
  if (clave === 'ga4') {
    if (/sufficient permission|PERMISSION_DENIED/i.test(msg) || err?.statusCode === 403) {
      return `${cuenta[0].toUpperCase()}${cuenta.slice(1)} no tiene acceso a la propiedad ${propertyId}: añádela como «Lector» en GA4 › Administrar › Gestión de acceso a la propiedad. Si ya lo está, revisa que el ID sea el de la propiedad de esta web.`;
    }
    if (/not found|not a valid|INVALID_ARGUMENT|invalid/i.test(msg)) {
      return `Google no reconoce la propiedad ${propertyId}. El ID es el número de GA4 › Administrar › Detalles de la propiedad (no el «G-…» de la web).`;
    }
  } else {
    if (/sufficient permission|PERMISSION_DENIED/i.test(msg) || err?.statusCode === 403) {
      return `${cuenta[0].toUpperCase()}${cuenta.slice(1)} no tiene acceso a ${siteUrl}: añádela en Search Console › Configuración › Usuarios y permisos › Añadir usuario (con permiso «Restringido» basta).`;
    }
    if (/not found|not a valid|invalid/i.test(msg)) {
      return `Search Console no reconoce la propiedad ${siteUrl}. Tiene que estar escrita igual que en Search Console: «sc-domain:web.com» (dominio) o «https://web.com/» (prefijo de URL).`;
    }
  }
  if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|socket/i.test(msg)) {
    return 'No se ha podido hablar con Google (red o tiempo de espera). Vuelve a probar en un momento.';
  }
  return `Google ha contestado con un error: ${detalleDe(msg)}`;
}

const dia = (d) => d.toISOString().slice(0, 10);

/**
 * «Probar»: UNA llamada real y mínima a Google con la credencial guardada.
 *   GA4: las sesiones de ayer de la propiedad (`runReport`).
 *   Search Console: los clics de una semana ya cerrada de la propiedad.
 * Anota el resultado en la credencial. No lanza por un fallo de Google:
 * devuelve { ok, mensaje }.
 */
export async function probar(clave, projectId, { ahora = new Date() } = {}) {
  const s = servicioDe(clave);
  const fila = await filaDe(s.servicio, projectId);
  if (!fila) throw new AppError(`Este campus no tiene ${s.nombre} conectado.`, 404, 'NOT_FOUND');
  const o = await valorGuardado(s.servicio, projectId);
  const ctx = { ...publico(o) };
  let r;
  try {
    if (clave === 'ga4') {
      const cred = ga4.leerCredencial(o);
      ctx.propertyId = cred.propertyId;
      const filas = await ga4.informe(cred, { desde: 'yesterday', hasta: 'yesterday', dimensiones: [], metricas: ['sessions'] });
      const sesiones = filas[0]?.sessions ?? 0;
      r = { ok: true, mensaje: `Conectado: ${cred.clientEmail} lee la propiedad ${cred.propertyId} (ayer, ${sesiones} sesiones).` };
    } else {
      const { rows } = await query(`SELECT gsc_property FROM projects WHERE id = $1`, [projectId]);
      const cred = gsc.leerCredencial(o, rows[0]?.gsc_property || null);
      ctx.siteUrl = cred.siteUrl;
      const filas = await gsc.analitica(cred, {
        desde: dia(new Date(ahora.getTime() - 9 * 86400000)),
        hasta: dia(new Date(ahora.getTime() - 3 * 86400000)),
        dimensiones: [],
        maxFilas: 1,
      });
      const clics = filas[0]?.clics ?? 0;
      r = { ok: true, mensaje: `Conectado: ${cred.clientEmail} lee ${cred.siteUrl} (${clics} clics en la última semana con datos).` };
    }
  } catch (err) {
    let mensaje = err?.code?.endsWith?.('_CREDENCIAL_INVALIDA') ? err.message : explicarError(clave, err, {
      clientEmail: ctx.client_email, propertyId: ctx.propertyId, siteUrl: ctx.siteUrl,
    });
    // Search Console: si no tiene acceso a esa, decir a cuáles sí (suele ser
    // «https://…/» frente a «sc-domain:…»).
    if (clave === 'gsc' && err?.statusCode === 403 && !/no está activada/.test(mensaje)) {
      try {
        const lista = await gsc.sitios(cuentaDeServicio(o));
        mensaje += lista.length
          ? ` Esta cuenta sí ve: ${lista.map((x) => x.site_url).join(', ')}.`
          : ' Esta cuenta todavía no ve ninguna propiedad.';
      } catch { /* la pista es un extra */ }
    }
    r = { ok: false, mensaje };
  }
  await query(
    `UPDATE api_credentials
        SET last_tested_at = NOW(), last_test_result = $2,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('ultima_prueba_mensaje', $3::text)
      WHERE id = $1`,
    [fila.id, r.ok ? 'ok' : 'failed', r.mensaje.slice(0, 1000)]
  );
  return r;
}

/**
 * Las propiedades de Search Console que ve la cuenta: con el JSON recién subido
 * (aún sin guardar) o con el guardado del campus (o el de GA4, si se va a usar
 * la misma cuenta). Para el desplegable.
 */
export async function sitiosDeSearchConsole(projectId, { json, misma_cuenta } = {}) {
  let o;
  if (json) o = leerCuentaDeServicio(json);
  else {
    o = await valorGuardado(misma_cuenta ? SERVICIOS.ga4.servicio : SERVICIOS.gsc.servicio, projectId);
    if (!o) throw new AppError('Sube primero el JSON de la cuenta de servicio.', 400, 'GOOGLE_SIN_JSON');
    o = leerCuentaDeServicio(o);
  }
  try {
    return await gsc.sitios(cuentaDeServicio(o));
  } catch (err) {
    throw new AppError(explicarError('gsc', err, { clientEmail: o.client_email, siteUrl: 'la propiedad' }), 502, 'GSC_API');
  }
}

// ─── La sincronización del campus desde la tarjeta (CRM#1210) ────────────────

/** Los «Sincronizar ahora» en marcha, para no lanzar dos a la vez del mismo campus. */
const enCurso = new Set();

/**
 * Enciende o apaga la sincronización automática del campus. `activo` null =
 * «como diga el servidor» (vuelve a la reserva del `.env`). Devuelve cómo
 * estaba y cómo queda, para el registro.
 */
export async function ponerSincronizacion(clave, projectId, activo, userId) {
  const s = servicioDe(clave);
  const antes = await sincronizacionDe(s.tablaSync, projectId);
  await query(
    `INSERT INTO ${s.tablaSync} (project_id, sync_activo, sync_cambiado_por, sync_cambiado_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (project_id) DO UPDATE SET
       sync_activo = EXCLUDED.sync_activo,
       sync_cambiado_por = EXCLUDED.sync_cambiado_por,
       sync_cambiado_at = NOW(),
       updated_at = NOW()`,
    [projectId, activo, userId || null]
  );
  return {
    antes: interruptorDelCampus(antes?.sync_activo ?? null, s.syncActivo()),
    despues: interruptorDelCampus(activo, s.syncActivo()),
  };
}

/**
 * «Sincronizar ahora»: una vuelta ya para este campus, esté encendida la
 * automática o no (no la cambia). Hace falta la credencial. No lanza por un
 * fallo de Google: devuelve { ok, mensaje } con el error explicado.
 */
export async function sincronizarAhora(clave, projectId, { ahora = new Date() } = {}) {
  const s = servicioDe(clave);
  const fila = await filaDe(s.servicio, projectId);
  if (!fila) throw new AppError(`Este campus no tiene ${s.nombre} conectado: guarda primero la cuenta.`, 404, 'NOT_FOUND');
  const k = `${clave}:${projectId}`;
  if (enCurso.has(k)) {
    throw new AppError(`Ya se está sincronizando ${s.nombre} de este campus. Espera a que acabe.`, 409, 'GOOGLE_SYNC_EN_CURSO');
  }
  enCurso.add(k);
  try {
    const r = await s.ponerAlDia(projectId, { ahora });
    if (r.ok) return { ok: true, dias: r.dias, mensaje: `Hecho: datos de los últimos ${r.dias} días traídos de ${s.nombre}.` };
    const o = await valorGuardado(s.servicio, projectId);
    return {
      ok: false,
      dias: r.dias,
      mensaje: explicarError(clave, { message: r.error }, {
        clientEmail: o?.client_email, propertyId: o?.property_id, siteUrl: o?.site_url,
      }),
    };
  } finally {
    enCurso.delete(k);
  }
}

/**
 * Los umbrales del aviso de caída de Search Console del campus. `valores`: los
 * cuatro (ya validados con Zod), o null para volver a los del servidor / de
 * serie. Devuelve los de antes y los que quedan, para el registro.
 */
export async function guardarUmbrales(projectId, valores, userId) {
  const claves = Object.keys(UMBRALES_DE_SERIE);
  const { origen: _a, ...antes } = umbralesDe(await sincronizacionDe('gsc_sincronizacion', projectId));
  const cols = claves.map((k) => COLUMNA_UMBRAL[k]);
  await query(
    `INSERT INTO gsc_sincronizacion (project_id, ${cols.join(', ')}, umbrales_cambiado_por, umbrales_cambiado_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (project_id) DO UPDATE SET
       ${cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')},
       umbrales_cambiado_por = EXCLUDED.umbrales_cambiado_por,
       umbrales_cambiado_at = NOW(),
       updated_at = NOW()`,
    [projectId, ...claves.map((k) => (valores ? valores[k] : null)), userId || null]
  );
  const { origen: _d, ...despues } = umbralesDe(await sincronizacionDe('gsc_sincronizacion', projectId));
  return { antes, despues };
}
