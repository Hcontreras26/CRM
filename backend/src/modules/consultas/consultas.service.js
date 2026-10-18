/*
  CONSULTAS DE ALUMNOS · FASE 2 (#188): reparto, entrada desde el campus, aviso
  al tutor y respuesta de vuelta al campus.

  ENTRADA (campus piloto). Hoy el alumno pregunta por la mensajería privada de
  Moodle: el «Chat» del curso le lleva a un mensaje privado con su tutor (estudio
  de la fase 0). Así que se leen las conversaciones de cada tutor MATRICULADO en
  el campus, cada pocos minutos (decisión 3 de la fase 0: «empezar leyendo cada
  5 minutos en el piloto, que no necesita instalar nada»). Solo los campus que
  tienen marcado «Leer las consultas» en Integraciones, y solo lo escrito desde
  que se marcó: no se trae el historial.

  REPARTO (decisión 2). El alumno ya le escribe a un tutor: si ese tutor puede
  recibir consultas (matriculado, activo y disponible), es suyo. Si no, va al
  tutor del campus (o de su empresa) con menos consultas abiertas. El reparto
  «por curso o especialidad» no tiene de dónde salir todavía (nadie lo ha
  definido), y la carga «completa» (decisión 10) llega con la fase 3: aquí queda
  el hueco para las dos.

  RESPUESTA (decisión 1 de la fase 0, sin decidir). Con un token común la
  respuesta no sale como el tutor, así que se usa EL TOKEN DEL TUTOR, guardado
  cifrado en su ficha (opción «a»): funciona con cualquier Moodle sin instalar
  nada. La #285 (plugin `local_certifex`) cambiaría solo `enviarAlCampus`.
*/
import crypto from 'node:crypto';
import { query } from '../../shared/config/db.js';
import { encrypt, decrypt, maskSecret } from '../../shared/utils/crypto.js';
import { logger } from '../../shared/utils/logger.js';
import { sendEmail } from '../../shared/services/brevo.service.js';
import {
  correo, parrafo, boton, nota, enlace, esc,
} from '../../shared/services/email-plantilla.service.js';
import { NO_ESCRIBIR_A_TUTORES } from '../../shared/config/frenoTutores.js';
import {
  conversacionesDe, mensajesDeConversacion, usuarioPorId, enviarMensaje, MoodleError,
} from '../../shared/services/moodle.client.js';
import { tutoresQueRecibenConsultas, conexionDelCampus } from '../tutores/tutor.campus.js';
import * as model from './consultas.model.js';

// ─── Reparto ─────────────────────────────────────────────────────────────────

/**
 * El tutor de una consulta de ese campus.
 *
 *   · `preferido` (al que escribió el alumno) si puede recibir consultas;
 *   · si no, el que tenga menos consultas abiertas; a igualdad, el que lleva
 *     más tiempo sin recibir una, y luego el de id más bajo (para que sea fijo);
 *   · null si no hay nadie: la consulta queda «sin tutor» en el panel.
 */
export async function elegirTutor(projectId, { preferido = null } = {}) {
  const candidatos = await tutoresQueRecibenConsultas(projectId);
  if (!candidatos.length) return null;
  if (preferido && candidatos.some((t) => t.id === Number(preferido))) return Number(preferido);
  const carga = await model.abiertasPorTutor(candidatos.map((t) => t.id));
  const ordenados = [...candidatos].sort((a, b) => {
    const ca = carga.get(a.id) || { n: 0, ultima: null };
    const cb = carga.get(b.id) || { n: 0, ultima: null };
    if (ca.n !== cb.n) return ca.n - cb.n;
    const ua = ca.ultima ? new Date(ca.ultima).getTime() : 0;
    const ub = cb.ultima ? new Date(cb.ultima).getTime() : 0;
    if (ua !== ub) return ua - ub;
    return a.id - b.id;
  });
  return ordenados[0].id;
}

// ─── Entrada ─────────────────────────────────────────────────────────────────

/**
 * Mete un mensaje del alumno y avisa a su tutor. Lo usa la lectura del campus
 * y lo usarían otras entradas (un webhook del campus) sin cambiar nada.
 */
export async function entraMensajeDelAlumno(datos, { tutorPreferido = null, avisar = true } = {}) {
  const r = await model.guardarMensajeDelAlumno(datos,
    (actual) => elegirTutor(datos.projectId, { preferido: tutorPreferido ?? actual }));
  if (r.duplicado) return r;
  if (avisar && r.consulta.tutor_id) {
    await avisarAlTutor(r.consulta, datos.texto, { nueva: r.nueva || r.reabierta })
      .catch((err) => logger.warn({ consultaId: r.consulta.id, err: err.message }, 'consultas: el aviso al tutor ha fallado'));
  }
  return r;
}

const MARGEN_LECTURA_MS = 10 * 60 * 1000;

/** Los campus con «Leer las consultas» marcado en su conexión de Moodle. */
export async function campusConConsultas() {
  const { rows } = await query(
    `SELECT pi.project_id, pi.config_public
       FROM project_integrations pi
       JOIN projects p ON p.id = pi.project_id AND p.active
      WHERE pi.provider = 'moodle' AND pi.active AND pi.encrypted_value IS NOT NULL
        AND COALESCE((pi.config_public->>'consultas')::boolean, false)`);
  return rows.map((r) => ({
    projectId: Number(r.project_id),
    desde: r.config_public?.consultas_desde ? new Date(r.config_public.consultas_desde) : new Date(),
  }));
}

/** Los tutores matriculados en ese campus, con su id de Moodle. */
async function tutoresDelCampus(projectId) {
  const { rows } = await query(
    `SELECT tc.tutor_id, tc.moodle_user_id
       FROM tutor_campus tc JOIN users u ON u.id = tc.tutor_id AND u.active
      WHERE tc.project_id = $1 AND tc.estado = 'activa' AND tc.moodle_user_id IS NOT NULL`, [projectId]);
  return rows.map((r) => ({ tutorId: Number(r.tutor_id), moodleId: Number(r.moodle_user_id) }));
}

/**
 * Lee el campus: las conversaciones privadas de sus tutores y lo nuevo de cada
 * una. Un mensaje del alumno entra como consulta (o en la suya); uno del tutor
 * escrito en el campus cuenta como respuesta.
 */
export async function leerCampus(projectId, { desde = new Date(0), ...opciones } = {}) {
  const conexion = await conexionDelCampus(projectId);
  if (!conexion || conexion.error) return { projectId, sinConexion: true, error: conexion?.error || null };
  const resumen = { projectId, conversaciones: 0, nuevos: 0, respuestas: 0, consultasNuevas: 0, errores: [] };
  const alumnos = new Map();
  for (const tutor of await tutoresDelCampus(projectId)) {
    let conversaciones;
    try {
      conversaciones = await conversacionesDe(conexion, tutor.moodleId, {}, opciones);
    } catch (err) {
      resumen.errores.push(err instanceof MoodleError ? err.message : 'No se han podido leer sus conversaciones.');
      continue;
    }
    for (const conv of conversaciones) {
      // Individual: el otro miembro es el alumno (Moodle no lista al propio usuario).
      const alumno = conv.miembros.find((m) => m.id !== tutor.moodleId);
      if (!alumno) continue;
      resumen.conversaciones += 1;
      // Desde el último mensaje guardado, con un margen: la hora de una
      // respuesta enviada desde el CRM es la del CRM, y el reloj del campus
      // puede ir unos segundos por detrás. Lo repetido lo descarta su id.
      const ultimo = await model.ultimoDeLaConversacion(projectId, conv.id);
      const desdeAqui = new Date(Math.max(desde.getTime(),
        ultimo ? new Date(ultimo).getTime() - MARGEN_LECTURA_MS : 0));
      let mensajes;
      try {
        mensajes = await mensajesDeConversacion(conexion, tutor.moodleId, conv.id, { desde: desdeAqui.getTime() / 1000 }, opciones);
      } catch (err) {
        resumen.errores.push(err instanceof MoodleError ? err.message : 'No se ha podido leer una conversación.');
        continue;
      }
      for (const m of mensajes) {
        if (m.fecha < desde) continue;
        if (await model.existeMensajeExterno(projectId, m.id)) continue;
        if (m.de === tutor.moodleId) {
          const r = await model.guardarRespuestaDesdeElCampus({
            projectId, conversacionId: conv.id, alumnoMoodleId: alumno.id,
            tutorId: tutor.tutorId, texto: m.texto, externoId: m.id, escritoAt: m.fecha,
          });
          if (!r.duplicado && !r.sinConsulta) resumen.respuestas += 1;
          continue;
        }
        if (m.de !== alumno.id) continue;
        if (!alumnos.has(alumno.id)) {
          alumnos.set(alumno.id, await usuarioPorId(conexion, alumno.id, opciones).catch(() => null));
        }
        const datos = alumnos.get(alumno.id);
        const r = await entraMensajeDelAlumno({
          projectId, conversacionId: conv.id,
          alumno: { moodleId: alumno.id, nombre: datos?.nombre || alumno.nombre, email: datos?.email || null },
          texto: m.texto, externoId: m.id, escritoAt: m.fecha,
        }, { tutorPreferido: tutor.tutorId, avisar: opciones.avisar !== false });
        if (!r.duplicado) {
          resumen.nuevos += 1;
          if (r.nueva) resumen.consultasNuevas += 1;
        }
      }
    }
  }
  return resumen;
}

/** Una vuelta por todos los campus con consultas. La llama el trabajo programado. */
export async function leerTodosLosCampus(opciones = {}) {
  const resultados = [];
  for (const c of await campusConConsultas()) {
    try {
      resultados.push(await leerCampus(c.projectId, { desde: c.desde, ...opciones }));
    } catch (err) {
      logger.warn({ projectId: c.projectId, err: err.message }, 'consultas: fallo al leer el campus');
      resultados.push({ projectId: c.projectId, errores: [err.message] });
    }
  }
  return resultados;
}

// ─── Aviso al tutor ──────────────────────────────────────────────────────────

/**
 * El correo al tutor: proyecto, curso, alumno, primeras líneas y «Responder en
 * el CRM». No se responde desde el correo (#188).
 *
 * Con el freno de correos a tutores puesto (Diego, 15/09) no sale: se apunta y
 * ya. La consulta está igual en su bandeja.
 */
export async function avisarAlTutor(consulta, texto, { nueva = true } = {}) {
  const { rows } = await query(
    `SELECT u.nombre, u.email, p.nombre AS campus, p.slug, p.logo_url, p.emoji
       FROM users u, projects p WHERE u.id = $1 AND p.id = $2`, [consulta.tutor_id, consulta.project_id]);
  const d = rows[0];
  if (!d?.email) return { sent: false, motivo: 'sin correo' };
  const asunto = nueva
    ? `[${d.campus}] Consulta nueva de ${consulta.alumno_nombre || 'un alumno'}`
    : `[${d.campus}] ${consulta.alumno_nombre || 'El alumno'} ha vuelto a escribir`;
  if (NO_ESCRIBIR_A_TUTORES) {
    logger.info({ consultaId: consulta.id, tutorId: consulta.tutor_id, asunto }, 'consultas: aviso al tutor sin enviar (freno de correos a tutores)');
    return { sent: false, frenado: true };
  }
  const primeras = String(texto || '').slice(0, 280);
  const { htmlContent, textContent } = correo({
    proyecto: { nombre: d.campus, logo_url: d.logo_url, emoji: d.emoji },
    titulo: nueva ? 'Tienes una consulta nueva' : 'El alumno ha vuelto a escribir',
    saludo: `Hola ${esc(d.nombre || '')},`,
    resumen: primeras,
    bloques: [
      parrafo(`<strong>${esc(consulta.alumno_nombre || 'Un alumno')}</strong>${consulta.curso_nombre ? `, de <strong>${esc(consulta.curso_nombre)}</strong>,` : ''} ha escrito en el campus de <strong>${esc(d.campus)}</strong>:`),
      parrafo(`«${esc(primeras)}${String(texto || '').length > 280 ? '…' : ''}»`),
      boton({ texto: 'Responder en el CRM', url: enlace(`consultas/${consulta.id}`) }),
      nota('Responde desde el CRM, no desde este correo: así el alumno recibe la respuesta en el campus y queda medido.'),
    ],
  });
  return sendEmail({
    to: d.email, subject: asunto, htmlContent, textContent,
    tags: ['consultas', 'tutor'], projectId: consulta.project_id,
    clave: `consulta-${consulta.id}-${Date.now()}`,
  });
}

// ─── Respuesta de vuelta al campus ───────────────────────────────────────────

const DIAS_ENLACE_ADJUNTO = Number(process.env.CONSULTAS_ADJUNTO_DIAS || 90);

/** El token del tutor en ese campus (descifrado), o null. */
export async function tokenDelTutor(tutorId, projectId) {
  const { rows } = await query(
    `SELECT token_cifrado, token_iv, token_tag, moodle_user_id FROM tutor_campus
      WHERE tutor_id = $1 AND project_id = $2`, [tutorId, projectId]);
  const r = rows[0];
  if (!r?.token_cifrado) return null;
  try { return decrypt(r.token_cifrado, r.token_iv, r.token_tag); } catch { return null; }
}

/** Guarda (o quita, con null) el token del tutor en ese campus. */
export async function guardarTokenDelTutor(tutorId, projectId, token) {
  if (!token) {
    await query(
      `UPDATE tutor_campus SET token_cifrado = NULL, token_iv = NULL, token_tag = NULL
        WHERE tutor_id = $1 AND project_id = $2`, [tutorId, projectId]);
    return null;
  }
  const enc = encrypt(token.trim());
  const { rowCount } = await query(
    `UPDATE tutor_campus SET token_cifrado = $3, token_iv = $4, token_tag = $5
      WHERE tutor_id = $1 AND project_id = $2`, [tutorId, projectId, enc.encrypted, enc.iv, enc.authTag]);
  return rowCount ? maskSecret(token.trim()) : false;
}

/** El texto que llega al alumno: la respuesta y, si hay, el enlace a cada adjunto. */
export function textoParaElCampus(texto, adjuntos = []) {
  const lineas = [String(texto || '').trim()];
  if (adjuntos.length) {
    lineas.push('', adjuntos.length === 1 ? 'Archivo adjunto:' : 'Archivos adjuntos:');
    for (const a of adjuntos) lineas.push(`· ${a.nombre}: ${enlace(`api/adjunto-consulta/${a.token_descarga}`)}`);
  }
  return lineas.join('\n');
}

/**
 * Manda al campus una respuesta ya guardada. Si no puede (sin token del tutor,
 * campus caído…), se queda guardada con el motivo y se puede reintentar.
 */
export async function enviarAlCampus(mensaje, consulta, adjuntos = [], opciones = {}) {
  const conexion = await conexionDelCampus(consulta.project_id);
  let error = null;
  let externoId = null;
  if (!conexion || conexion.error) {
    error = conexion?.error || 'El campus no está conectado en Integraciones.';
  } else if (!consulta.alumno_moodle_id) {
    error = 'No se sabe quién es el alumno en el campus.';
  } else {
    const token = await tokenDelTutor(consulta.tutor_id, consulta.project_id);
    if (!token) {
      error = 'Falta el token del tutor en este campus: ponlo en su ficha (Tutores → Consultas de alumnos).';
    } else {
      try {
        const r = await enviarMensaje({ url: conexion.url, token }, consulta.alumno_moodle_id,
          textoParaElCampus(mensaje.texto, adjuntos), opciones);
        externoId = r.id;
      } catch (err) {
        error = err instanceof MoodleError ? err.message : 'No se ha podido enviar al campus.';
      }
    }
  }
  await model.apuntarEnvio(mensaje.id, { externoId, error });
  return { enviado: Boolean(externoId), error };
}

/**
 * Responder desde el CRM: se guarda, se suben los adjuntos y se manda al campus.
 * Aunque el campus falle, la respuesta queda guardada (y cuenta como respondida:
 * el tutor ha contestado; lo que falta es que llegue).
 */
export async function responder(consultaId, tutorId, texto, archivos = [], { guardarArchivo, ...opciones } = {}) {
  const r = await model.guardarRespuestaDelCrm(consultaId, tutorId, texto);
  if (!r) return null;
  const adjuntos = [];
  for (const f of archivos) {
    const token = crypto.randomBytes(24).toString('hex');
    const nombreSeguro = f.originalname.replace(/[^\w.\- ]+/g, '_').slice(0, 120);
    const key = `consultas/${r.consulta.project_id}/${r.consulta.id}/${token.slice(0, 12)}-${nombreSeguro}`;
    await guardarArchivo(key, f.buffer);
    adjuntos.push(await model.guardarAdjunto(r.mensaje.id, {
      nombre: f.originalname, tipo: f.mimetype, tamano: f.size, storageKey: key, token,
      expiraAt: new Date(Date.now() + DIAS_ENLACE_ADJUNTO * 86400000),
    }));
  }
  const envio = await enviarAlCampus(r.mensaje, r.consulta, adjuntos, opciones);
  return { mensajeId: r.mensaje.id, ...envio };
}

/** Reintentar una respuesta que no llegó al campus. */
export async function reintentar(mensajeId, opciones) {
  const { rows } = await query(
    `SELECT m.*, c.project_id AS c_project, c.tutor_id AS c_tutor, c.alumno_moodle_id AS c_alumno
       FROM consulta_mensajes m JOIN consultas c ON c.id = m.consulta_id
      WHERE m.id = $1 AND m.autor = 'tutor' AND m.enviado_campus_at IS NULL`, [mensajeId]);
  const m = rows[0];
  if (!m) return null;
  const adj = await query(
    'SELECT nombre, token_descarga FROM consulta_adjuntos WHERE mensaje_id = $1 ORDER BY id', [mensajeId]);
  return enviarAlCampus(m, { project_id: m.c_project, tutor_id: m.c_tutor, alumno_moodle_id: m.c_alumno }, adj.rows, opciones);
}
