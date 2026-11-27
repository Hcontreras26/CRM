import { query } from '../../shared/config/db.js';
import { AppError } from '../../shared/utils/AppError.js';
import { upsert, getDecryptedValue } from '../credentials/credentials.model.js';
import { appDeMeta, tokenDeLaApp, inspeccionarTokenMeta } from '../../shared/services/metaTokens.service.js';
import { vuelta } from '../../jobs/metaTokensScheduler.js';
import { unpackToken } from './meta-ads.service.js';
import {
  SERVICIO_APP, FALTA_LA_APP, POR_DEFECTO, VARIABLES,
  leerAjustes, filaDeAjustes, leerValorApp, appEnUso, delServidor,
} from './meta-app.config.js';

/**
 * LA TARJETA «APP DE META» (CRM#1209), en Meta Ads › Configuración.
 *
 *   · el ID y el secreto de la app, de todo el CRM. El secreto va cifrado
 *     (AES-256-GCM, `api_credentials`, servicio `meta_app`) y no se vuelve a
 *     enseñar: solo sus cuatro últimos caracteres;
 *   · «Probar»: pide el token de la app y comprueba con él uno de los tokens de
 *     campus;
 *   · la renovación automática (sí o no, con cuántos días renueva y con cuántos
 *     avisa) y cada cuántas horas se pide el gasto de toda la vida;
 *   · el estado: los tokens de cada campus, cuándo caducan, la última vuelta;
 *   · «Renovar ahora» y «Quitar».
 *
 * Nada de aquí devuelve el secreto ni un token. Los errores de Meta salen en
 * castellano (`explicarError`).
 */

const DIA_MS = 86400000;

// ── Los errores de Meta, en castellano ─────────────────────────────────────

const DONDE_LA_APP = 'developers.facebook.com › tu app › Configuración de la app › Básica';

/**
 * El error de Meta (`{ code, message }`) dicho para quien no sabe qué es un
 * OAuthException. `contexto`: 'app' cuando se pedía el token de la app (el
 * error es del ID o del secreto) y 'token' cuando se miraba el de un campus.
 */
export function explicarError({ code, message } = {}, contexto = 'token') {
  const c = String(code || '');
  const m = String(message || '');
  if (c === 'missing_app_config') return FALTA_LA_APP;
  if (c === 'missing_token') return 'La cuenta no tiene token guardado: vuelve a conectarla en Meta Ads.';
  if (c === 'token_ilegible') return 'El token guardado de la cuenta no se puede descifrar: vuelve a ponerlo con «Rotar token».';
  if (c === 'network_error') return 'No se ha podido hablar con Meta (fallo de red). Prueba otra vez en unos minutos.';
  if (/^meta_(4|17|32|613)(_|$)/.test(c)) return 'Meta está limitando las llamadas de esta app. Prueba otra vez dentro de un rato.';
  if (contexto === 'app') {
    if (/client secret/i.test(m) || c === 'meta_1') {
      return `Meta no acepta el secreto de la app. Cópialo otra vez de ${DONDE_LA_APP} › «Clave secreta de la app» (botón «Mostrar»).`;
    }
    if (c === 'meta_101' || /application id|invalid application/i.test(m)) {
      return `Meta no encuentra una app con ese ID. Es el «Identificador de la app» de ${DONDE_LA_APP}.`;
    }
    if (c.startsWith('meta_190')) return `Meta no acepta la pareja ID y secreto: comprueba los dos en ${DONDE_LA_APP}.`;
  }
  if (c === 'token_invalido' || c.startsWith('meta_190')) {
    return 'El token del campus ya no vale (caducado, revocado o la contraseña cambió): pon uno nuevo con «Rotar token».';
  }
  if (c.startsWith('meta_10') || c.startsWith('meta_200')) {
    return 'A la app le falta un permiso para esto. En Meta, la app tiene que tener «ads_read» y el usuario del sistema, acceso a la cuenta.';
  }
  return `Meta ha respondido: ${m || c || 'sin detalle'}`;
}

/** El `ultimo_error` guardado («código: mensaje») → castellano. */
function explicarGuardado(texto) {
  if (!texto) return null;
  const i = texto.indexOf(': ');
  const code = i > 0 ? texto.slice(0, i) : '';
  const message = i > 0 ? texto.slice(i + 2) : texto;
  return explicarError({ code, message }, 'token');
}

// ── Lo guardado ─────────────────────────────────────────────────────────────

async function filaDeLaApp() {
  try {
    const { rows } = await query(
      `SELECT ac.id, ac.metadata, ac.created_at, ac.updated_at, ac.last_tested_at, ac.last_test_result,
              u.nombre AS puesta_por
         FROM api_credentials ac
         LEFT JOIN users u ON u.id = (ac.metadata->>'updated_by')::int
        WHERE ac.service = $1 AND ac.project_id IS NULL AND ac.active = true
          AND COALESCE(ac.metadata->>'entorno', 'produccion') = 'produccion'
        LIMIT 1`,
      [SERVICIO_APP]
    );
    return { fila: rows[0] || null, faltaMigracion: false };
  } catch (err) {
    // 22P02: el enum aún no tiene `meta_app` (migración 341 sin aplicar).
    if (err?.code === '22P02') return { fila: null, faltaMigracion: true };
    throw err;
  }
}

async function hayTabla(nombre) {
  const { rows } = await query(`SELECT to_regclass($1) IS NOT NULL AS hay`, [`public.${nombre}`]);
  return rows[0]?.hay === true;
}

/** Los tokens de cada campus, con lo que sabe de ellos la renovación. */
async function tokensDeCampus(avisoDias, ahora = new Date()) {
  const { rows } = await query(
    `SELECT 'meta_ads' AS tipo, a.id AS cuenta_id, a.project_id, p.nombre AS project_nombre,
            COALESCE(a.ad_account_nombre, a.ad_account_id) AS nombre,
            t.expires_at, t.sin_caducidad, t.renovado_at, t.revisado_at, t.estado, t.ultimo_error
       FROM meta_ad_accounts a
       LEFT JOIN projects p ON p.id = a.project_id
       LEFT JOIN meta_tokens_renovacion t ON t.tipo = 'meta_ads' AND t.cuenta_id = a.id
      ORDER BY t.expires_at ASC NULLS LAST, p.nombre, a.id`
  );
  let instagram = [];
  if (await hayTabla('ig_accounts')) {
    ({ rows: instagram } = await query(
      `SELECT 'instagram' AS tipo, i.id AS cuenta_id, i.project_id, p.nombre AS project_nombre,
              COALESCE('@' || i.username, i.ig_user_id::text) AS nombre,
              COALESCE(t.expires_at, i.token_expires_at) AS expires_at, t.sin_caducidad,
              t.renovado_at, t.revisado_at, t.estado, t.ultimo_error
         FROM ig_accounts i
         LEFT JOIN projects p ON p.id = i.project_id
         LEFT JOIN meta_tokens_renovacion t ON t.tipo = 'instagram' AND t.cuenta_id = i.id
        ORDER BY 6 ASC NULLS LAST, p.nombre, i.id`
    ));
  }
  return [...rows, ...instagram].map((r) => {
    const quedanMs = r.expires_at ? new Date(r.expires_at).getTime() - ahora.getTime() : null;
    return {
      tipo: r.tipo,
      cuenta_id: r.cuenta_id,
      project_id: r.project_id,
      project_nombre: r.project_nombre,
      nombre: r.nombre,
      expires_at: r.expires_at,
      sin_caducidad: r.sin_caducidad === true,
      renovado_at: r.renovado_at,
      revisado_at: r.revisado_at,
      estado: r.estado || 'sin_revisar',
      error: explicarGuardado(r.ultimo_error),
      caducado: quedanMs !== null && quedanMs <= 0,
      caduca_pronto: quedanMs !== null && quedanMs > 0 && quedanMs < avisoDias * DIA_MS,
    };
  });
}

/** Todo lo que pinta la tarjeta. */
export async function estado() {
  const [{ fila, faltaMigracion }, filaAjustes] = await Promise.all([filaDeLaApp(), filaDeAjustes()]);
  const ajustes = await leerAjustes({ fila: filaAjustes });
  const servidor = appDeMeta();
  const enUso = fila ? 'pantalla' : (servidor.appId && servidor.appSecret ? 'servidor' : null);
  const prueba = fila?.last_tested_at
    ? { at: fila.last_tested_at, ok: fila.last_test_result === 'ok', mensaje: fila.metadata?.ultima_prueba_mensaje || null }
    : null;

  return {
    falta_migracion: faltaMigracion,
    app: {
      configurada: !!enUso,
      origen: enUso,
      guardada: !!fila,
      app_id: fila?.metadata?.app_id || (enUso === 'servidor' ? servidor.appId : null),
      secreto_cola: fila?.metadata?.cola || null,
      puesta_por: fila?.puesta_por || null,
      actualizada_at: fila?.updated_at || null,
      ultima_prueba: prueba,
      // El `.env` también tiene una: si se quita la de la pantalla, se usa esa.
      servidor_tiene_app: !!(servidor.appId && servidor.appSecret),
    },
    ajustes: Object.fromEntries(Object.entries(ajustes).map(([k, v]) => [k, {
      ...v, por_defecto: POR_DEFECTO[k], variable: VARIABLES[k],
    }])),
    ajustes_cambiados_por: filaAjustes?.cambiado_por || null,
    ajustes_cambiados_at: filaAjustes?.updated_by ? filaAjustes.updated_at : null,
    ultima_vuelta: filaAjustes?.ultima_vuelta_at
      ? { at: filaAjustes.ultima_vuelta_at, resumen: filaAjustes.ultima_vuelta_resumen || null }
      : null,
    tokens: await tokensDeCampus(ajustes.aviso_dias.valor),
  };
}

// ── Guardar, quitar ─────────────────────────────────────────────────────────

/**
 * Guarda el ID y el secreto. Sin secreto, se queda el guardado (para cambiar
 * solo el ID). → { nueva }
 */
export async function guardar({ app_id, app_secret }, userId) {
  const { fila, faltaMigracion } = await filaDeLaApp();
  if (faltaMigracion) {
    throw new AppError('Falta aplicar la migración 341 en este servidor: hasta entonces la app no se puede guardar.', 409, 'FALTA_MIGRACION');
  }
  let secreto = app_secret ? String(app_secret).trim() : '';
  if (!secreto && fila) {
    secreto = leerValorApp(await getDecryptedValue(SERVICIO_APP, null, { marcar: false, soloProduccion: true }))?.appSecret || '';
  }
  if (!secreto) throw new AppError('Falta el secreto de la app.', 400, 'VALIDATION_ERROR');
  const appId = String(app_id).trim();
  await upsert({
    project_id: null,
    service: SERVICIO_APP,
    value: JSON.stringify({ app_id: appId, app_secret: secreto }),
    metadata: { app_id: appId, ultima_prueba_mensaje: null },
    userId,
    entorno: 'produccion',
  });
  // Otra pareja: la prueba de antes ya no dice nada de esta.
  await query(
    `UPDATE api_credentials SET last_tested_at = NULL, last_test_result = NULL
      WHERE service = $1 AND project_id IS NULL AND active = true`,
    [SERVICIO_APP]
  );
  return { nueva: !fila };
}

/** «Quitar»: la de la pantalla deja de usarse (si el servidor tiene una, se usa esa). */
export async function quitar() {
  const { fila, faltaMigracion } = await filaDeLaApp();
  if (faltaMigracion || !fila) return { habia: false };
  await query(`UPDATE api_credentials SET active = false, updated_at = NOW() WHERE id = $1`, [fila.id]);
  return { habia: true };
}

/** Los ajustes. `null` en uno = volver al del servidor o al de siempre. */
export async function guardarAjustes(datos, userId) {
  const actuales = await leerAjustes();
  const cols = Object.keys(POR_DEFECTO);
  const nuevo = Object.fromEntries(cols.map((k) => [k, datos[k] === undefined ? undefined : datos[k]]));
  // Lo que valdría después, para comprobar que avisar va antes que renovar.
  const valdra = (k) => {
    if (nuevo[k] === undefined) return actuales[k].valor;
    if (nuevo[k] !== null) return nuevo[k];
    return delServidor(k) ?? POR_DEFECTO[k];
  };
  if (valdra('aviso_dias') >= valdra('renovar_dias')) {
    throw new AppError('El aviso tiene que ser con menos días que la renovación: si no, avisaría de tokens que aún se van a renovar.', 400, 'VALIDATION_ERROR');
  }
  const fijar = cols.filter((k) => nuevo[k] !== undefined);
  if (!fijar.length) return;
  try {
    await query(
      `INSERT INTO meta_app_ajustes (id, ${fijar.join(', ')}, updated_by, updated_at)
       VALUES (1, ${fijar.map((_, i) => `$${i + 1}`).join(', ')}, $${fijar.length + 1}, NOW())
       ON CONFLICT (id) DO UPDATE SET
         ${fijar.map((k) => `${k} = EXCLUDED.${k}`).join(', ')},
         updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [...fijar.map((k) => nuevo[k]), userId || null]
    );
  } catch (err) {
    if (err?.code === '42P01') {
      throw new AppError('Falta aplicar la migración 341 en este servidor: hasta entonces los ajustes no se pueden guardar.', 409, 'FALTA_MIGRACION');
    }
    throw err;
  }
}

// ── Probar ──────────────────────────────────────────────────────────────────

async function apuntarPrueba(ok, mensaje) {
  await query(
    `UPDATE api_credentials
        SET last_tested_at = NOW(), last_test_result = $2,
            metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('ultima_prueba_mensaje', $3::text)
      WHERE service = $1 AND project_id IS NULL AND active = true
        AND COALESCE(metadata->>'entorno', 'produccion') = 'produccion'`,
    [SERVICIO_APP, ok ? 'ok' : 'failed', mensaje]
  );
}

/** El primer token de campus que se pueda leer, para comprobarlo. */
async function unTokenDeCampus() {
  const { rows } = await query(
    `SELECT a.id, a.access_token_enc, COALESCE(a.ad_account_nombre, a.ad_account_id) AS nombre, p.nombre AS campus
       FROM meta_ad_accounts a LEFT JOIN projects p ON p.id = a.project_id
      WHERE a.access_token_enc IS NOT NULL
      ORDER BY a.id`
  );
  for (const r of rows) {
    try {
      const token = unpackToken(r.access_token_enc);
      if (token) return { token, nombre: `${r.campus || 'sin campus'} · ${r.nombre}` };
    } catch { /* la siguiente */ }
  }
  return null;
}

/**
 * Una llamada real y mínima. Con `app_id` y `app_secret` prueba esos (antes de
 * guardar); sin ellos, la app que se está usando, y apunta el resultado.
 * → { ok, mensaje }
 */
export async function probar({ app_id, app_secret } = {}) {
  const deFuera = !!(app_id && app_secret);
  const app = deFuera
    ? { appId: String(app_id).trim(), appSecret: String(app_secret).trim(), origen: 'formulario' }
    : await appEnUso({ marcar: false });
  const resultado = await (async () => {
    if (!app.appId || !app.appSecret) return { ok: false, mensaje: FALTA_LA_APP };
    const t = await tokenDeLaApp(app);
    if (!t.ok) return { ok: false, mensaje: explicarError(t, 'app') };
    const campus = await unTokenDeCampus();
    if (!campus) {
      return { ok: true, mensaje: 'La app responde y Meta acepta el ID y el secreto. Todavía no hay ninguna cuenta de Meta Ads conectada cuyo token comprobar.' };
    }
    const i = await inspeccionarTokenMeta({ token: campus.token, appId: app.appId, appSecret: app.appSecret });
    if (!i.ok) return { ok: false, mensaje: `La app responde, pero al mirar el token de ${campus.nombre}: ${explicarError(i, 'token')}` };
    if (i.appId && i.appId !== app.appId) {
      return { ok: false, mensaje: `La app responde, pero el token de ${campus.nombre} es de otra app (ID ${i.appId}). Con esta no se puede renovar: pon aquí la app de la que salió el token, o genera el token con esta.` };
    }
    if (!i.valido) return { ok: false, mensaje: `La app responde, pero el token de ${campus.nombre} ya no vale: pon uno nuevo con «Rotar token».` };
    const cuando = i.sinCaducidad
      ? 'no caduca (usuario del sistema)'
      : i.expiresAt ? `caduca el ${i.expiresAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' })}` : 'Meta no dice cuándo caduca';
    return { ok: true, mensaje: `Todo bien: Meta acepta la app y el token de ${campus.nombre} vale (${cuando}).` };
  })();
  if (!deFuera && app.origen === 'pantalla') await apuntarPrueba(resultado.ok, resultado.mensaje);
  return resultado;
}

/** «Renovar ahora»: una vuelta, aunque la automática esté apagada. */
export async function renovarAhora() {
  return vuelta({ forzar: true });
}
