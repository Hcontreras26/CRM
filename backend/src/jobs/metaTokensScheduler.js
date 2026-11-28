// Renovación diaria de los tokens de Meta e Instagram de cada campus (#471, épica #464).
//
// Los tokens de larga duración de Meta caducan a los 60 días. Si nadie los
// renueva, un día la sincronización de Meta Ads (y, con la épica, el bot de
// Instagram) se para sin avisar. Una vez al día, por cada cuenta:
//
//   · Meta Ads (meta_ad_accounts): debug_token dice si vale y cuándo caduca;
//     si quedan menos de «renovar con N días» (40, o sea: tokens con más de
//     20 días) se cambia por otro con grant_type=fb_exchange_token. Los de un
//     usuario del sistema no caducan (expires_at = 0) y se dejan como están.
//   · Instagram (ig_accounts, cuando exista: #465/#467): grant_type=
//     ig_refresh_token con la misma regla. TODAS las cuentas, también las
//     desactivadas: la cuenta nace apagada hasta tener cerebro y su token
//     tiene que seguir vivo mientras tanto.
//
// El token nuevo se guarda cifrado (AES-256-GCM, '<iv>:<tag>:<cifrado>', el
// formato de meta_ad_accounts.access_token_enc) y la caducidad y el resultado
// quedan en meta_tokens_renovacion (migración 295).
//
// Avisos a quien puede volver a conectar la cuenta de ESE campus (#1192)
// —campana y correo con la plantilla común—:
//   · si la renovación falla: UNA vez por fallo, no uno al día. Vuelve a avisar
//     solo después de haber ido bien alguna vez.
//   · si el token caduca en menos de «avisar con N días» (7): una vez por
//     fecha de caducidad (Meta no siempre alarga un token largo; entonces hay
//     que volver a conectar la cuenta a mano).
//   · si en el campus nadie puede reconectarla, no se avisa a nadie (tampoco a
//     los de otros campus) y no se apunta como avisado: se vuelve a intentar en
//     la vuelta siguiente, por si ya hay alguien.
//
// APAGADO DE SERIE: sin encenderla, `vuelta()` no llama a Meta ni toca la base.
//
// DESDE LA PANTALLA (CRM#1209): la app de Meta (ID y secreto), el interruptor y
// los días se ponen en Meta Ads › Configuración › App de Meta. El `.env`
// (META_APP_*, META_TOKENS_*) queda de reserva: ver meta-app.config.js. La tarea
// arranca siempre y en cada vuelta mira si está encendida, para que encenderla
// o apagarla en la pantalla no pida reiniciar el servidor.

import { logger } from '../shared/utils/logger.js';
import { query } from '../shared/config/db.js';
import { sendEmail } from '../shared/services/brevo.service.js';
import * as P from '../shared/services/email-plantilla.service.js';
import { notifyUsers } from '../modules/notifications/notifications.service.js';
import { explicarPermisos } from '../modules/permissions/permissions.service.js';
import { packToken, unpackToken } from '../modules/meta-ads/meta-ads.service.js';
import {
  inspeccionarTokenMeta, renovarTokenMeta, renovarTokenInstagram,
} from '../shared/services/metaTokens.service.js';
import { appEnUso, valoresDeAjustes, FALTA_LA_APP } from '../modules/meta-ads/meta-app.config.js';
import { vigilar } from './latido.js';

const DIA_MS = 24 * 60 * 60 * 1000;
const TICK_MS = parseInt(process.env.META_TOKENS_TICK_MS || String(DIA_MS), 10);

export const TIPO_AVISO = 'meta_token';

/** El interruptor DEL SERVIDOR (la reserva). Apagado de serie. */
export function renovacionActiva() {
  const v = String(process.env.META_TOKENS_RENOVACION_ACTIVA || '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

/** El interruptor que vale: el de la pantalla y, si no hay, el del servidor (#1209). */
export async function renovacionEncendida() {
  return (await valoresDeAjustes()).renovacion_activa === true;
}

const mismaFecha = (a, b) => !!a && !!b && new Date(a).getTime() === new Date(b).getTime();

// ── Las cuentas ─────────────────────────────────────────────────────────────

async function cuentasMetaAds(proyectoId) {
  const { rows } = await query(
    `SELECT a.id, a.project_id, a.ad_account_id, a.ad_account_nombre, a.access_token_enc,
            p.nombre AS project_nombre, p.slug AS project_slug, p.logo_url AS project_logo, p.emoji AS project_emoji
       FROM meta_ad_accounts a
       LEFT JOIN projects p ON p.id = a.project_id
      WHERE ($1::int IS NULL OR a.project_id = $1)
      ORDER BY a.id`,
    [proyectoId]
  );
  return rows.map((r) => ({
    tipo: 'meta_ads', id: r.id, project_id: r.project_id,
    nombre: r.ad_account_nombre || r.ad_account_id,
    tokenCifrado: r.access_token_enc, expiresAtGuardada: null,
    proyecto: r,
  }));
}

async function hayTabla(nombre) {
  const { rows } = await query(`SELECT to_regclass($1) IS NOT NULL AS hay`, [`public.${nombre}`]);
  return rows[0]?.hay === true;
}

// ig_accounts la crea #465 con (épica #464): project_id, ig_user_id, username,
// access_token_cifrado (así lo nombra la migración 284), token_expires_at,
// token_refreshed_at, active.
async function cuentasInstagram(proyectoId) {
  if (!(await hayTabla('ig_accounts'))) return [];
  const { rows } = await query(
    `SELECT i.id, i.project_id, i.username, i.ig_user_id, i.access_token_cifrado, i.token_expires_at,
            p.nombre AS project_nombre, p.slug AS project_slug, p.logo_url AS project_logo, p.emoji AS project_emoji
       FROM ig_accounts i
       LEFT JOIN projects p ON p.id = i.project_id
      WHERE ($1::int IS NULL OR i.project_id = $1)
      ORDER BY i.id`,
    [proyectoId]
  );
  return rows.map((r) => ({
    tipo: 'instagram', id: r.id, project_id: r.project_id,
    nombre: r.username ? `@${r.username}` : r.ig_user_id,
    tokenCifrado: r.access_token_cifrado, expiresAtGuardada: r.token_expires_at,
    proyecto: r,
  }));
}

// ── El estado de cada token ─────────────────────────────────────────────────

async function leerEstado(tipo, cuentaId) {
  const { rows } = await query(
    `SELECT * FROM meta_tokens_renovacion WHERE tipo = $1 AND cuenta_id = $2`, [tipo, cuentaId]);
  return rows[0] || null;
}

async function guardarEstado(cuenta, e) {
  await query(
    `INSERT INTO meta_tokens_renovacion
       (tipo, cuenta_id, project_id, expires_at, sin_caducidad, renovado_at, revisado_at,
        estado, ultimo_error, aviso_fallo_at, aviso_caduca_para)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (tipo, cuenta_id) DO UPDATE SET
       project_id = EXCLUDED.project_id, expires_at = EXCLUDED.expires_at,
       sin_caducidad = EXCLUDED.sin_caducidad, renovado_at = EXCLUDED.renovado_at,
       revisado_at = EXCLUDED.revisado_at, estado = EXCLUDED.estado,
       ultimo_error = EXCLUDED.ultimo_error, aviso_fallo_at = EXCLUDED.aviso_fallo_at,
       aviso_caduca_para = EXCLUDED.aviso_caduca_para, updated_at = NOW()`,
    [cuenta.tipo, cuenta.id, cuenta.project_id, e.expiresAt, e.sinCaducidad, e.renovadoAt,
      e.revisadoAt, e.estado, e.error, e.avisoFalloAt, e.avisoCaducaPara]
  );
}

// Las filas de cuentas que ya no están (desconectadas). Sin FK: ver la migración 295.
async function limpiarHuerfanas(hayInstagram) {
  await query(
    `DELETE FROM meta_tokens_renovacion t
      WHERE t.tipo = 'meta_ads' AND NOT EXISTS (SELECT 1 FROM meta_ad_accounts a WHERE a.id = t.cuenta_id)`);
  if (hayInstagram) {
    await query(
      `DELETE FROM meta_tokens_renovacion t
        WHERE t.tipo = 'instagram' AND NOT EXISTS (SELECT 1 FROM ig_accounts i WHERE i.id = t.cuenta_id)`);
  }
}

// ── Renovar ─────────────────────────────────────────────────────────────────

const fallo = (code, message, expiresAt = null) => ({ ok: false, code, error: message, expiresAt });

function venceAntesDe(expiresAt, ahora, dias) {
  return !!expiresAt && new Date(expiresAt).getTime() - ahora.getTime() < dias * DIA_MS;
}

async function revisarMetaAds(cuenta, token, ahora, cfg) {
  const { appId, appSecret } = cfg.app;
  if (!appId || !appSecret) return fallo('missing_app_config', FALTA_LA_APP);
  const insp = await inspeccionarTokenMeta({ token, appId, appSecret });
  if (!insp.ok) return fallo(insp.code, insp.message);
  if (!insp.valido) return fallo('token_invalido', insp.message || 'Meta dice que el token ya no es válido', insp.expiresAt);
  if (insp.sinCaducidad) return { ok: true, sinCaducidad: true, expiresAt: null, renovado: false };
  // Sin fecha y sin «no caduca»: se renueva igual, que es lo seguro.
  if (insp.expiresAt && !venceAntesDe(insp.expiresAt, ahora, cfg.renovar_dias)) {
    return { ok: true, sinCaducidad: false, expiresAt: insp.expiresAt, renovado: false };
  }
  const r = await renovarTokenMeta({ token, appId, appSecret });
  if (!r.ok) return fallo(r.code, r.message, insp.expiresAt);
  let expiresAt = r.expiresIn ? new Date(ahora.getTime() + r.expiresIn * 1000) : null;
  if (!expiresAt) {
    // Meta no siempre manda expires_in: se pregunta por el nuevo.
    const otra = await inspeccionarTokenMeta({ token: r.accessToken, appId, appSecret });
    expiresAt = otra.ok ? otra.expiresAt : insp.expiresAt;
  }
  await query(
    `UPDATE meta_ad_accounts SET access_token_enc = $1, updated_at = NOW() WHERE id = $2`,
    [packToken(r.accessToken), cuenta.id]
  );
  return { ok: true, sinCaducidad: false, expiresAt, renovado: true };
}

async function revisarInstagram(cuenta, token, ahora, cfg) {
  const guardada = cuenta.expiresAtGuardada;
  if (guardada && !venceAntesDe(guardada, ahora, cfg.renovar_dias)) {
    return { ok: true, sinCaducidad: false, expiresAt: guardada, renovado: false };
  }
  const r = await renovarTokenInstagram({ token });
  if (!r.ok) return fallo(r.code, r.message, guardada);
  const expiresAt = new Date(ahora.getTime() + (r.expiresIn || 60 * 24 * 60 * 60) * 1000);
  await query(
    `UPDATE ig_accounts SET access_token_cifrado = $1, token_expires_at = $2, token_refreshed_at = $3 WHERE id = $4`,
    [packToken(r.accessToken), expiresAt, ahora, cuenta.id]
  );
  return { ok: true, sinCaducidad: false, expiresAt, renovado: true };
}

// ── Avisar ──────────────────────────────────────────────────────────────────

/**
 * A quién avisar (#1192): quien puede VOLVER A CONECTAR la cuenta de ese campus,
 * igual que `quienPuedeVerlo` de Search Console (#1165) y `destinatariosDeAcceso`
 * de soporte.
 *
 *   · El ALCANCE: super admin y soporte ven todos los campus; el resto, los suyos
 *     (`user_projects` activos). El rol solo cuenta para esto.
 *   · De ahí, solo quien tenga `meta_ads.edit` según `explicarPermisos`: al admin
 *     al que se le ha quitado no le llega; a quien lo tiene por excepción, sí.
 *
 * Una cuenta sin campus solo se la avisa a quien ve todos. Vacío = no se avisa.
 */
export async function quienPuedeReconectar(projectId) {
  const { rows } = await query(
    `SELECT u.id, u.email FROM users u
      WHERE u.active AND (u.role IN ('superadmin', 'soporte')
         OR ($1::int IS NOT NULL AND EXISTS (SELECT 1 FROM user_projects up
              WHERE up.user_id = u.id AND up.project_id = $1 AND up.active)))
      ORDER BY u.id`,
    [projectId ?? null]
  );
  const out = [];
  for (const { id, email } of rows) {
    try {
      const e = await explicarPermisos(id);
      if (e?.mapa?.['meta_ads.edit'] === true) out.push({ id, email });
    } catch (err) {
      logger.warn({ err: err.message, userId: id }, 'Tokens de Meta: no se pudieron leer los permisos de un destinatario');
    }
  }
  return out;
}

const MARCA_GENERAL = { nombre: 'MultiCRM' };
const marcaDe = (p) => (p?.project_nombre
  ? { nombre: p.project_nombre, slug: p.project_slug, logo_url: p.project_logo, emoji: p.project_emoji }
  : MARCA_GENERAL);

const fechaLegible = (d) => new Date(d).toLocaleDateString('es-ES', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid',
});

function textos(motivo, cuenta, { error, expiresAt }) {
  const que = cuenta.tipo === 'instagram' ? `Instagram ${cuenta.nombre}` : `Meta Ads (${cuenta.nombre})`;
  const campus = cuenta.proyecto?.project_nombre || 'sin campus';
  const efecto = cuenta.tipo === 'instagram'
    ? 'el bot dejará de recibir y contestar mensajes'
    : 'las métricas de Meta Ads dejarán de sincronizarse';
  const cuando = expiresAt ? ` Caduca el ${fechaLegible(expiresAt)}.` : '';
  if (motivo === 'fallo') {
    return {
      titulo: `No se pudo renovar el token de ${que}`,
      mensaje: `${campus}: Meta rechazó la renovación (${error || 'sin detalle'}).${cuando} Si caduca, ${efecto}.`,
      asunto: `Token de Meta sin renovar · ${campus}`,
    };
  }
  return {
    titulo: `El token de ${que} caduca pronto`,
    mensaje: `${campus}:${cuando} Hay que volver a conectar la cuenta antes o ${efecto}.`,
    asunto: `Token de Meta a punto de caducar · ${campus}`,
  };
}

// Devuelve si se avisó a alguien. `notifyUsers` con la lista vacía avisa a
// TODOS los admin: por eso, sin destinatarios, ni se llama.
async function avisar(motivo, cuenta, datos, ahora, destinatarios) {
  if (!destinatarios.length) {
    logger.warn({ motivo, tipo: cuenta.tipo, cuentaId: cuenta.id, projectId: cuenta.project_id },
      'Tokens de Meta: en el campus nadie puede reconectar la cuenta; no se avisa');
    return false;
  }
  const t = textos(motivo, cuenta, datos);
  const enlace = cuenta.tipo === 'meta_ads' ? '/meta-ads' : null;
  await notifyUsers({
    targetUserIds: destinatarios.map((d) => d.id),
    type: TIPO_AVISO, title: t.titulo, message: t.mensaje, link_path: enlace,
    metadata: { motivo, tipo: cuenta.tipo, cuenta_id: cuenta.id, project_id: cuenta.project_id },
  });
  const correos = destinatarios.map((d) => d.email).filter(Boolean);
  if (!correos.length) return true;
  try {
    const correo = P.correo({
      proyecto: marcaDe(cuenta.proyecto),
      titulo: t.titulo,
      resumen: t.mensaje,
      bloques: [
        P.parrafo(P.esc(t.mensaje)),
        ...(motivo === 'fallo' && datos.error ? [P.nota(`Respuesta de Meta: <strong>${P.esc(datos.error)}</strong>`)] : []),
        ...(enlace ? [P.boton({ texto: 'Abrir Meta Ads', url: P.enlace(enlace) })] : []),
        P.parrafo('<span style="font-size:13px;line-height:20px;color:#71717a">El CRM renueva estos tokens solo una vez al día. Si se retiró el acceso a la app o cambió la contraseña de la cuenta, hay que volver a conectarla.</span>'),
      ],
    });
    // La clave evita repetir el correo si la vuelta se repite (reinicios).
    const sufijo = motivo === 'fallo'
      ? ahora.toISOString().slice(0, 10)
      : new Date(datos.expiresAt).toISOString().slice(0, 10);
    await sendEmail({
      to: correos.join(','),
      subject: t.asunto,
      ...correo,
      projectId: cuenta.project_id ?? null,
      tags: ['meta-token', `${cuenta.tipo}-${cuenta.id}`],
      clave: `meta-token-${motivo}-${cuenta.tipo}-${cuenta.id}-${sufijo}`,
    });
  } catch (err) {
    logger.warn({ err: err.message, tipo: cuenta.tipo, cuentaId: cuenta.id }, 'Tokens de Meta: el correo de aviso falló');
  }
  return true;
}

// ── Una cuenta ──────────────────────────────────────────────────────────────

// `cfg`: los ajustes que valen (pantalla o servidor) y la app en uso (#1209);
// `cfg.a_mano` es «Renovar ahora». `destinatarios`: quien puede reconectar la
// cuenta de ese campus (#1192).
async function revisarCuenta(cuenta, ahora, destinatarios, cfg) {
  const previo = await leerEstado(cuenta.tipo, cuenta.id);
  let r;
  try {
    let token;
    try {
      token = unpackToken(cuenta.tokenCifrado);
    } catch {
      token = null;
    }
    if (!token) {
      r = fallo('token_ilegible', 'El token guardado no se puede descifrar', cuenta.expiresAtGuardada);
    } else {
      r = cuenta.tipo === 'instagram'
        ? await revisarInstagram(cuenta, token, ahora, cfg)
        : await revisarMetaAds(cuenta, token, ahora, cfg);
    }
  } catch (err) {
    r = fallo('error_interno', err?.message || String(err));
  }

  const expiresAt = r.expiresAt ?? (r.ok ? null : previo?.expires_at ?? null);
  let avisoFalloAt = previo?.aviso_fallo_at ?? null;
  let avisoCaducaPara = previo?.aviso_caduca_para ?? null;
  const avisos = [];

  // «Renovar ahora» sin app guardada (CRM#1222): el que lo pulsa ya ve en la
  // tarjeta que falta la app; no se avisa por cada cuenta a quien puede
  // reconectarla ni se da por avisado, así que la vuelta diaria sí avisará.
  const sinAvisoDeFallo = !r.ok && r.code === 'missing_app_config' && cfg.a_mano === true;

  if (!r.ok) {
    if (!avisoFalloAt && !sinAvisoDeFallo && await avisar('fallo', cuenta, { error: r.error, expiresAt }, ahora, destinatarios)) {
      avisoFalloAt = ahora;
      avisos.push('fallo');
      // El de fallo ya dice cuándo caduca: no se manda otro de caducidad por la misma fecha.
      if (venceAntesDe(expiresAt, ahora, cfg.aviso_dias)) avisoCaducaPara = expiresAt;
    }
  } else {
    avisoFalloAt = null;
  }

  if (venceAntesDe(expiresAt, ahora, cfg.aviso_dias) && !mismaFecha(avisoCaducaPara, expiresAt)
      && !sinAvisoDeFallo
      && await avisar('caduca', cuenta, { expiresAt }, ahora, destinatarios)) {
    avisoCaducaPara = expiresAt;
    avisos.push('caduca');
  }

  await guardarEstado(cuenta, {
    expiresAt,
    sinCaducidad: r.ok && r.sinCaducidad === true,
    renovadoAt: r.ok && r.renovado ? ahora : (previo?.renovado_at ?? null),
    revisadoAt: ahora,
    estado: !r.ok ? 'error' : (r.sinCaducidad ? 'sin_caducidad' : 'ok'),
    error: r.ok ? null : `${r.code}: ${r.error}`.slice(0, 1000),
    avisoFalloAt,
    avisoCaducaPara,
  });

  if (!r.ok) {
    logger.warn({ tipo: cuenta.tipo, cuentaId: cuenta.id, code: r.code, err: r.error }, 'Tokens de Meta: renovación fallida');
  }
  return { ok: r.ok, renovado: r.ok && r.renovado === true, avisos };
}

// ── La vuelta ───────────────────────────────────────────────────────────────

/** Apunta la última vuelta, para el estado de la pantalla. Sin la migración 341, nada. */
async function apuntarVuelta(ahora, resumen) {
  try {
    await query(
      `INSERT INTO meta_app_ajustes (id, ultima_vuelta_at, ultima_vuelta_resumen)
       VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE SET ultima_vuelta_at = EXCLUDED.ultima_vuelta_at,
                                      ultima_vuelta_resumen = EXCLUDED.ultima_vuelta_resumen`,
      [ahora, JSON.stringify(resumen)]
    );
  } catch (err) {
    if (err?.code !== '42P01') logger.warn({ err: err.message }, 'Tokens de Meta: no se pudo apuntar la vuelta');
  }
}

/**
 * Una pasada por todas las cuentas (o las de un campus, con `proyectoId`).
 * Apagada, vuelve sin hacer nada; `forzar: true` es «Renovar ahora» de la
 * pantalla, que va aunque la automática esté apagada.
 */
export async function vuelta({ ahora = new Date(), proyectoId = null, forzar = false } = {}) {
  const ajustes = await valoresDeAjustes();
  if (!forzar && !ajustes.renovacion_activa) return { apagado: true };
  const cfg = { ...ajustes, app: await appEnUso(), a_mano: forzar };
  const resumen = { revisadas: 0, renovadas: 0, fallidas: 0, avisos: 0, ...(forzar ? { a_mano: true } : {}) };

  const hayInstagram = await hayTabla('ig_accounts');
  const cuentas = [
    ...(await cuentasMetaAds(proyectoId)),
    ...(await cuentasInstagram(proyectoId)),
  ];
  if (!proyectoId) await limpiarHuerfanas(hayInstagram);
  if (!cuentas.length) {
    await apuntarVuelta(ahora, resumen);
    return resumen;
  }

  // Los destinatarios, una vez por campus en cada vuelta.
  const porCampus = new Map();
  const destinatariosDe = async (projectId) => {
    const k = projectId ?? 'sin_campus';
    if (!porCampus.has(k)) porCampus.set(k, await quienPuedeReconectar(projectId));
    return porCampus.get(k);
  };
  for (const cuenta of cuentas) {
    const r = await revisarCuenta(cuenta, ahora, await destinatariosDe(cuenta.project_id), cfg);
    resumen.revisadas += 1;
    if (r.renovado) resumen.renovadas += 1;
    if (!r.ok) resumen.fallidas += 1;
    resumen.avisos += r.avisos.length;
  }
  await apuntarVuelta(ahora, resumen);
  logger.info(resumen, 'Tokens de Meta: vuelta hecha');
  return resumen;
}

export function startMetaTokensScheduler() {
  // Arranca siempre: si está apagada (en la pantalla o, sin nada ahí, en el
  // servidor), cada vuelta vuelve sin hacer nada. Así se enciende sin reiniciar.
  // Primera vuelta a los 15 min del arranque (la app ya estable), luego una al día.
  vigilar('tokens_meta', 'Renovación de tokens de Meta e Instagram', () => vuelta(), TICK_MS,
    { alArrancarMs: 15 * 60 * 1000 });
  logger.info({ tickMs: TICK_MS }, 'Renovación de tokens de Meta lista (se enciende en Meta Ads › Configuración › App de Meta)');
}

export const _internals = { revisarCuenta, leerEstado };
