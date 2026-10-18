import {
  describe, it, expect, beforeAll, afterAll, vi,
} from 'vitest';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import { query } from '../src/shared/config/db.js';
import { encrypt } from '../src/shared/utils/crypto.js';
import { verifyToken } from '../src/shared/middleware/auth.js';
import { errorHandler } from '../src/shared/middleware/errorHandler.js';
import * as servicio from '../src/modules/consultas/consultas.service.js';
import * as model from '../src/modules/consultas/consultas.model.js';
import consultasModule from '../src/modules/consultas/index.js';
import { testMoodle } from '../src/modules/integrations/integrations.controller.js';

/**
 * Consultas de alumnos, fase 2 (#188), contra la base de verdad.
 *
 * Las cuatro pruebas de la issue:
 *   · el reparto sale equilibrado;
 *   · la consulta se reabre cuando el alumno vuelve a escribir;
 *   · un mensaje repetido no se duplica;
 *   · un tutor no ve las consultas de otro.
 *
 * Y la entrada desde el campus y la respuesta de vuelta, con un Moodle de
 * mentira que contesta como uno de verdad (lo probado contra un Moodle 4.5).
 */

const marca = `t188${Date.now()}`;
const ids = { users: [], projects: [] };
let hayBase = true;
let porQueNo = null;
let alumnoN = 1000;

/** Un Moodle de mentira con conversaciones y mensajes. */
function moodle({ conversaciones = {}, usuarios = {}, enviados = [], token = 'campus', tokensTutor = {} } = {}) {
  return vi.fn(async (_url, { body }) => {
    const p = new URLSearchParams(body);
    const json = (d) => ({ ok: true, status: 200, json: async () => d });
    const wstoken = p.get('wstoken');
    const f = p.get('wsfunction');
    if (f === 'core_message_send_instant_messages') {
      const de = tokensTutor[wstoken];
      if (!de) return json({ exception: 'moodle_exception', errorcode: 'invalidtoken', message: 'Invalid token' });
      const id = 900000 + enviados.length;
      enviados.push({ de, para: Number(p.get('messages[0][touserid]')), texto: p.get('messages[0][text]'), id });
      return json([{ msgid: id }]);
    }
    if (wstoken !== token) return json({ exception: 'moodle_exception', errorcode: 'invalidtoken', message: 'Invalid token' });
    if (f === 'core_message_get_conversations') {
      const uid = Number(p.get('userid'));
      return json({ conversations: Object.entries(conversaciones)
        .filter(([, c]) => c.tutor === uid)
        .map(([id, c]) => ({ id: Number(id), members: [{ id: c.alumno, fullname: `Alumno ${c.alumno}` }] })) });
    }
    if (f === 'core_message_get_conversation_messages') {
      const c = conversaciones[p.get('convid')];
      const desde = Number(p.get('timefrom') || 0);
      return json({ messages: (c?.mensajes || []).filter((m) => m.timecreated >= desde) });
    }
    if (f === 'core_user_get_users_by_field') {
      const u = usuarios[p.get('values[0]')];
      return json(u ? [u] : []);
    }
    return json({ exception: 'moodle_exception', errorcode: 'accessexception', message: 'Access control exception' });
  });
}

async function crearUsuario(role) {
  const { rows } = await query(
    `INSERT INTO users (nombre, email, password_hash, role, active) VALUES ($1, $2, 'x', $3, true) RETURNING id`,
    [`${role} ${ids.users.length} ${marca}`, `${role}.${ids.users.length}.${marca}@test.local`, role]);
  ids.users.push(rows[0].id);
  return Number(rows[0].id);
}

async function crearCampus(nombre) {
  const n = ids.projects.length;
  const { rows } = await query(
    `INSERT INTO projects (nombre, slug, webhook_api_key, active) VALUES ($1, $2, $3, true) RETURNING id`,
    [`${nombre} ${marca}`, `${nombre.toLowerCase()}-${marca}-${n}`, `k-${marca}-${n}`]);
  ids.projects.push(rows[0].id);
  return Number(rows[0].id);
}

/** Un tutor matriculado en el campus (con su id de Moodle). */
async function tutorMatriculado(projectId, moodleId, { disponible = true } = {}) {
  const t = await crearUsuario('tutor');
  await query('INSERT INTO user_projects (user_id, project_id, active) VALUES ($1, $2, true)', [t, projectId]);
  await query(
    `INSERT INTO tutor_campus (tutor_id, project_id, estado, moodle_user_id) VALUES ($1, $2, 'activa', $3)`,
    [t, projectId, moodleId]);
  if (!disponible) await query('UPDATE users SET is_available = false WHERE id = $1', [t]);
  return t;
}

async function conectar(projectId, { consultas = true, desde = '2026-01-01T00:00:00Z' } = {}) {
  const enc = encrypt('campus');
  await query(
    `INSERT INTO project_integrations (project_id, provider, active, encrypted_value, iv, auth_tag, config_public)
     VALUES ($1, 'moodle', true, $2, $3, $4, $5)`,
    [projectId, enc.encrypted, enc.iv, enc.authTag,
     JSON.stringify({ url: 'https://campus.prueba.local', consultas, consultas_desde: desde })]);
}

const mensajeAlumno = (projectId, extra = {}) => {
  alumnoN += 1;
  return {
    projectId, conversacionId: alumnoN, alumno: { moodleId: alumnoN, nombre: `Alumno ${alumnoN}` },
    texto: '¿Dónde está el tema 3?', externoId: alumnoN * 10, escritoAt: new Date(), ...extra,
  };
};

beforeAll(async () => {
  try {
    const t = await query("SELECT to_regclass('public.consultas') AS a, to_regclass('public.tutor_campus') AS b");
    if (!t.rows[0].a || !t.rows[0].b) throw new Error('Faltan las migraciones 208 y 209.');
  } catch (err) {
    hayBase = false;
    porQueNo = err.message;
  }
});

afterAll(async () => {
  for (const [sql, p] of [
    ['DELETE FROM consultas WHERE project_id = ANY($1::int[])', [ids.projects]],
    ['DELETE FROM tutor_campus WHERE tutor_id = ANY($1::int[])', [ids.users]],
    ['DELETE FROM user_projects WHERE user_id = ANY($1::int[])', [ids.users]],
    ['DELETE FROM project_integrations WHERE project_id = ANY($1::int[])', [ids.projects]],
    ['DELETE FROM activity_log WHERE user_id = ANY($1::int[])', [ids.users]],
    ['DELETE FROM users WHERE id = ANY($1::int[])', [ids.users]],
    ['DELETE FROM projects WHERE id = ANY($1::int[])', [ids.projects]],
  ]) {
    try { await query(sql, p); } catch { /* sigue limpiando */ }
  }
});

describe('hay base', () => {
  it('contra la que probar', () => { expect(hayBase, porQueNo || '').toBe(true); });
});

describe('#188 · el reparto sale equilibrado', () => {
  it('seis consultas sin tutor preferido entre tres tutores: dos para cada uno', async () => {
    if (!hayBase) return;
    const p = await crearCampus('Reparto');
    const tutores = [await tutorMatriculado(p, 1), await tutorMatriculado(p, 2), await tutorMatriculado(p, 3)];
    for (let i = 0; i < 6; i += 1) await servicio.entraMensajeDelAlumno(mensajeAlumno(p), { avisar: false });
    const { rows } = await query(
      'SELECT tutor_id, COUNT(*)::int AS n FROM consultas WHERE project_id = $1 GROUP BY tutor_id', [p]);
    expect(rows.map((r) => Number(r.tutor_id)).sort()).toEqual([...tutores].sort());
    expect(rows.every((r) => r.n === 2)).toBe(true);
  });

  it('va al tutor al que escribió el alumno; si está «No disponible», a otro del campus', async () => {
    if (!hayBase) return;
    const p = await crearCampus('Preferido');
    const a = await tutorMatriculado(p, 11);
    const b = await tutorMatriculado(p, 12, { disponible: false });
    const r1 = await servicio.entraMensajeDelAlumno(mensajeAlumno(p), { tutorPreferido: a, avisar: false });
    expect(r1.consulta.tutor_id).toBe(a);
    const r2 = await servicio.entraMensajeDelAlumno(mensajeAlumno(p), { tutorPreferido: b, avisar: false });
    expect(r2.consulta.tutor_id).toBe(a);
  });

  it('sin nadie que pueda recibirla, queda «sin tutor» para el panel', async () => {
    if (!hayBase) return;
    const p = await crearCampus('SinNadie');
    const r = await servicio.entraMensajeDelAlumno(mensajeAlumno(p), { avisar: false });
    expect(r.consulta.tutor_id).toBeNull();
    expect((await model.listar({ projectIds: [p], sinTutor: true })).length).toBe(1);
  });
});

describe('#188 · la consulta se reabre cuando el alumno vuelve a escribir', () => {
  it('cerrada → abierta, con su hora y su evento; respondida → abierta otra vez', async () => {
    if (!hayBase) return;
    const p = await crearCampus('Reabre');
    const t = await tutorMatriculado(p, 21);
    const primero = mensajeAlumno(p);
    const { consulta } = await servicio.entraMensajeDelAlumno(primero, { tutorPreferido: t, avisar: false });

    await model.guardarRespuestaDelCrm(consulta.id, t, 'Mira la sección 2.');
    expect((await model.cabecera(consulta.id)).estado).toBe('respondida');
    const segundo = { ...primero, externoId: primero.externoId + 1, texto: 'No lo veo', escritoAt: new Date() };
    await servicio.entraMensajeDelAlumno(segundo, { avisar: false });
    expect((await model.cabecera(consulta.id)).estado).toBe('abierta');

    await model.cerrar(consulta.id, t);
    const tercero = { ...primero, externoId: primero.externoId + 2, texto: 'Otra duda', escritoAt: new Date() };
    const r = await servicio.entraMensajeDelAlumno(tercero, { avisar: false });
    expect(r.reabierta).toBe(true);
    const d = await model.detalle(consulta.id);
    expect(d.estado).toBe('abierta');
    expect(d.reabierta_at).not.toBeNull();
    expect(d.eventos.map((e) => e.tipo)).toEqual(expect.arrayContaining(['entrada', 'asignada', 'respondida', 'cerrada', 'reabierta']));
    expect(d.mensajes).toHaveLength(4);
  });
});

describe('#188 · un mensaje repetido no se duplica', () => {
  it('el mismo id de Moodle dos veces: un solo mensaje', async () => {
    if (!hayBase) return;
    const p = await crearCampus('Duplicado');
    await tutorMatriculado(p, 31);
    const m = mensajeAlumno(p);
    const a = await servicio.entraMensajeDelAlumno(m, { avisar: false });
    const b = await servicio.entraMensajeDelAlumno(m, { avisar: false });
    expect(b.duplicado).toBe(true);
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM consulta_mensajes WHERE consulta_id = $1', [a.consulta.id]);
    expect(rows[0].n).toBe(1);
  });
});

describe('#188 · un tutor no ve las consultas de otro (API)', () => {
  const app = express();
  app.use(express.json());
  app.use(consultasModule.prefix, consultasModule.router);
  app.use(consultasModule.publicMount.prefix, consultasModule.publicMount.router);
  app.use(errorHandler);
  const como = (user) => {
    const token = jwt.sign(user, process.env.JWT_SECRET);
    return {
      get: (u) => supertest(app).get(u).set('Authorization', `Bearer ${token}`),
      post: (u, b) => supertest(app).post(u).send(b).set('Authorization', `Bearer ${token}`),
    };
  };

  it('su bandeja trae solo las suyas, y la de otro da «no encontrada»', async () => {
    if (!hayBase) return;
    const p = await crearCampus('Ajena');
    const a = await tutorMatriculado(p, 41);
    const b = await tutorMatriculado(p, 42);
    const deA = await servicio.entraMensajeDelAlumno(mensajeAlumno(p), { tutorPreferido: a, avisar: false });
    const deB = await servicio.entraMensajeDelAlumno(mensajeAlumno(p), { tutorPreferido: b, avisar: false });
    const tutorA = como({ userId: a, role: 'tutor' });
    const mias = await tutorA.get('/api/consultas/mias');
    expect(mias.status).toBe(200);
    expect(mias.body.data.consultas.map((c) => c.id)).toEqual([deA.consulta.id]);
    expect((await tutorA.get(`/api/consultas/${deB.consulta.id}`)).status).toBe(404);
    expect((await tutorA.post(`/api/consultas/${deB.consulta.id}/cerrar`, {})).status).toBe(404);
    // El panel es de administración.
    expect((await tutorA.get('/api/consultas')).status).toBe(403);
    // Abrir la suya la marca como leída (primera lectura).
    const abierta = await tutorA.get(`/api/consultas/${deA.consulta.id}`);
    expect(abierta.status).toBe(200);
    expect(abierta.body.data.primera_lectura_at).not.toBeNull();
    expect(abierta.body.data.puedes).toBe('tutor');
  });

  it('el superadmin ve el panel y reasigna solo a quien puede recibir consultas', async () => {
    if (!hayBase) return;
    const p = await crearCampus('Panel');
    const a = await tutorMatriculado(p, 51);
    const ocupado = await tutorMatriculado(p, 52, { disponible: false });
    const libre = await tutorMatriculado(p, 53);
    const { consulta } = await servicio.entraMensajeDelAlumno(mensajeAlumno(p), { tutorPreferido: a, avisar: false });
    const sa = como({ userId: await crearUsuario('superadmin'), role: 'superadmin' });
    const panel = await sa.get(`/api/consultas?projectId=${p}`);
    expect(panel.body.data.consultas.map((c) => c.id)).toContain(consulta.id);
    const mal = await sa.post(`/api/consultas/${consulta.id}/reasignar`, { tutorId: ocupado });
    expect(mal.status).toBe(400);
    expect(mal.body.error).toMatch(/No disponible/);
    const bien = await sa.post(`/api/consultas/${consulta.id}/reasignar`, { tutorId: libre });
    expect(bien.status).toBe(200);
    expect(bien.body.data.tutor_id).toBe(libre);
    expect(bien.body.data.eventos.map((e) => e.tipo)).toContain('reasignada');
  });

  it('el tutor pasa la lista cerrada del servidor para sus consultas, y nada más', () => {
    const pasa = (url) => {
      let error = null;
      verifyToken({ headers: { authorization: `Bearer ${jwt.sign({ userId: 1, role: 'tutor' }, process.env.JWT_SECRET)}` }, originalUrl: url },
        {}, (e) => { error = e || null; });
      return error ? error.statusCode : 'ok';
    };
    expect(pasa('/api/consultas/mias')).toBe('ok');
    expect(pasa('/api/consultas/7/responder')).toBe('ok');
    expect(pasa('/api/leads')).toBe(403);
  });

  it('el enlace del adjunto: sin sesión con su token, y caducado da «no existe»', async () => {
    if (!hayBase) return;
    const p = await crearCampus('Adjunto');
    const t = await tutorMatriculado(p, 61);
    const { consulta } = await servicio.entraMensajeDelAlumno(mensajeAlumno(p), { tutorPreferido: t, avisar: false });
    const guardados = new Map();
    const { saveLocal } = await import('../src/shared/services/localStorage.service.js');
    const guardarArchivo = async (k, b) => { guardados.set(k, b); await saveLocal(k, b); };
    await servicio.responder(consulta.id, t, 'Te paso el temario.', [
      { originalname: 'temario.pdf', mimetype: 'application/pdf', size: 8, buffer: Buffer.from('%PDF-1.4') },
    ], { guardarArchivo, fetchImpl: moodle() });
    const { rows } = await query(
      `SELECT a.token_descarga, a.storage_key FROM consulta_adjuntos a JOIN consulta_mensajes m ON m.id = a.mensaje_id
        WHERE m.consulta_id = $1`, [consulta.id]);
    const r = await supertest(app).get(`/api/adjunto-consulta/${rows[0].token_descarga}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toMatch(/temario\.pdf/);
    await query('UPDATE consulta_adjuntos SET expira_at = NOW() - INTERVAL \'1 day\' WHERE token_descarga = $1', [rows[0].token_descarga]);
    const caducado = await supertest(app).get(`/api/adjunto-consulta/${rows[0].token_descarga}`);
    expect(caducado.status).toBe(404);
    expect(caducado.body.error).toMatch(/caducado/);
    const { deleteLocal } = await import('../src/shared/services/localStorage.service.js');
    await deleteLocal(rows[0].storage_key).catch(() => {});
  });
});

describe('#188 · entrada desde el campus y respuesta de vuelta', () => {
  it('lee las conversaciones de sus tutores: abre la consulta, cuenta la respuesta del campus y no repite', async () => {
    if (!hayBase) return;
    const p = await crearCampus('Lectura');
    await conectar(p, { desde: '2026-10-01T00:00:00Z' });
    const t = await tutorMatriculado(p, 3);
    const s = (iso) => Math.floor(new Date(iso).getTime() / 1000);
    const fetchImpl = moodle({
      conversaciones: {
        77: { tutor: 3, alumno: 4, mensajes: [
          // Antes de marcar «Leer las consultas»: no entra.
          { id: 500, useridfrom: 4, text: '<p>Hola de septiembre</p>', timecreated: s('2026-09-20T10:00:00Z') },
          { id: 501, useridfrom: 4, text: '<p>No encuentro el tema 3</p>', timecreated: s('2026-10-18T10:00:00Z') },
          { id: 502, useridfrom: 3, text: 'Está en la sección 2.', timecreated: s('2026-10-18T11:00:00Z') },
        ] },
      },
      usuarios: { 4: { id: 4, fullname: 'Alumna Cuatro', email: 'alumna4@campus.es' } },
    });
    const r = await servicio.leerCampus(p, { desde: new Date('2026-10-01T00:00:00Z'), fetchImpl, avisar: false });
    expect(r).toMatchObject({ nuevos: 1, respuestas: 1, consultasNuevas: 1 });
    const [c] = await model.listar({ projectIds: [p] });
    expect(c).toMatchObject({ tutor_id: t, estado: 'respondida', alumno_nombre: 'Alumna Cuatro', alumno_email: 'alumna4@campus.es' });
    expect(c.primera_respuesta_at).not.toBeNull();
    // Otra vuelta: nada nuevo.
    const otra = await servicio.leerCampus(p, { desde: new Date('2026-10-01T00:00:00Z'), fetchImpl, avisar: false });
    expect(otra.nuevos + otra.respuestas).toBe(0);
  });

  it('la respuesta del CRM sale al campus con el token del tutor; sin token, se guarda y dice por qué', async () => {
    if (!hayBase) return;
    const p = await crearCampus('Respuesta');
    await conectar(p);
    const t = await tutorMatriculado(p, 3);
    const { consulta } = await servicio.entraMensajeDelAlumno(mensajeAlumno(p), { tutorPreferido: t, avisar: false });
    const enviados = [];
    const fetchImpl = moodle({ enviados, tokensTutor: { 'token-del-tutor': 3 } });

    const sinToken = await servicio.responder(consulta.id, t, 'Primera respuesta', [], { guardarArchivo: async () => {}, fetchImpl });
    expect(sinToken.enviado).toBe(false);
    expect(sinToken.error).toMatch(/Falta el token del tutor/);
    expect((await model.cabecera(consulta.id)).estado).toBe('respondida');

    expect(await servicio.guardarTokenDelTutor(t, p, 'token-del-tutor')).toMatch(/\*|\./);
    const reintento = await servicio.reintentar(sinToken.mensajeId, { fetchImpl });
    expect(reintento.enviado).toBe(true);
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ de: 3, para: Number(consulta.alumno_moodle_id), texto: 'Primera respuesta' });
    const d = await model.detalle(consulta.id);
    expect(d.mensajes.find((m) => m.autor === 'tutor')).toMatchObject({ en_el_campus: true, error_envio: null });
  });

  it('el aviso al tutor no sale con el freno de correos a tutores puesto', async () => {
    if (!hayBase) return;
    const p = await crearCampus('Aviso');
    const t = await tutorMatriculado(p, 71);
    const { consulta } = await servicio.entraMensajeDelAlumno(mensajeAlumno(p), { tutorPreferido: t, avisar: false });
    const r = await servicio.avisarAlTutor(consulta, 'Hola');
    expect(r).toMatchObject({ sent: false, frenado: true });
  });

  it('«Probar conexión» con «Leer las consultas» pide también las funciones de mensajería', async () => {
    const soloFase1 = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({
      sitename: 'Campus', release: '4.5', functions: [{ name: 'core_webservice_get_site_info' }, { name: 'core_user_get_users_by_field' }],
    }) }));
    expect((await testMoodle('t', 'campus.es', { fetchImpl: soloFase1 })).ok).toBe(true);
    const r = await testMoodle('t', 'campus.es', { fetchImpl: soloFase1 }, { consultas: true });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/core_message_get_conversations/);
  });
});
