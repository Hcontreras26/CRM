import {
  describe, it, expect, beforeAll, afterAll,
} from 'vitest';
import crypto from 'node:crypto';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import { query } from '../src/shared/config/db.js';
import { errorHandler } from '../src/shared/middleware/errorHandler.js';
import feedbackModule from '../src/modules/feedback/index.js';
import { respuestasEnCsv, CABECERA_CSV } from '../src/modules/feedback/feedback.service.js';
import { POR_CLAVE } from '../src/modules/permissions/catalogo.js';

/**
 * «Exportar CSV» del panel de Feedback (#1157), por la ruta de verdad y contra
 * la base:
 *   · respeta el alcance: una gestora, solo lo suyo; un admin, sus campus; el
 *     super admin, todo;
 *   · respeta los filtros de campus y periodo;
 *   · no lleva ni el correo, ni el teléfono, ni el token de la encuesta;
 *   · solo lleva las RESPONDIDAS, con fecha, campus, gestora, motivo,
 *     puntuación y comentario.
 */

const marca = `x1157${Date.now()}`;
const ids = { users: [], projects: [], leads: [], envios: [] };
let hayBase = true;
let porQueNo = null;
const U = {};
const P = {};
const tokens = [];

const uno = async (sql, p) => (await query(sql, p)).rows[0];

const app = express();
app.use(express.json());
app.use(feedbackModule.prefix, feedbackModule.router);
app.use(errorHandler);
const como = (clave) => {
  const token = jwt.sign({ userId: U[clave].id, role: U[clave].role }, process.env.JWT_SECRET);
  return (url) => supertest(app).get(url).set('Authorization', `Bearer ${token}`)
    .buffer(true).parse((res, cb) => { let s = ''; res.on('data', (c) => { s += c; }); res.on('end', () => cb(null, s)); });
};

async function envio({ campus, gestora, respondido, comentario, respuestas, estado = 'enviado' }) {
  const telefono = `+3460${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const email = `alumno${ids.leads.length}@${marca}.test`;
  const lead = await uno('INSERT INTO leads (project_id, nombre, email, telefono, responsable_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [P[campus], `Alumno ${ids.leads.length} ${marca}`, email, telefono, U[gestora].id]);
  ids.leads.push(lead.id);
  const token = crypto.randomBytes(24).toString('base64url');
  tokens.push({ token, email, telefono });
  const f = await uno(
    `INSERT INTO feedback_envios (lead_id, project_id, gestora_id, disparador, estado, token, email, enviado_at,
                                  respondido_at, motivo, comentario, respuestas)
     VALUES ($1, $2, $3, 'dia7', $4, $5, $6, $7::timestamptz - interval '1 day', $7::timestamptz, $8, $9, $10::jsonb) RETURNING id`,
    [lead.id, P[campus], U[gestora].id, estado, token, email, respondido,
      respuestas?.motivo || null, comentario || null, JSON.stringify(respuestas || {})]);
  ids.envios.push(f.id);
}

beforeAll(async () => {
  try {
    for (const c of ['Cedia', 'Ictess']) {
      P[c] = (await uno('INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id',
        [`${c} ${marca}`, `${c.toLowerCase()}-${marca}`, `${c}-${marca}-key`])).id;
      ids.projects.push(P[c]);
    }
    for (const [clave, role, campus] of [
      ['adminCedia', 'admin', ['Cedia']], ['gestora', 'gestor', ['Cedia', 'Ictess']],
      ['otraGestora', 'gestor', ['Cedia']], ['super', 'superadmin', []],
    ]) {
      const u = await uno("INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, role",
        [`${clave} ${marca}`, `${clave.toLowerCase()}@${marca}.test`, role]);
      ids.users.push(u.id);
      U[clave] = u;
      for (const c of campus) await query('INSERT INTO user_projects (user_id, project_id, active) VALUES ($1, $2, true)', [u.id, P[c]]);
    }
    await envio({
      campus: 'Cedia', gestora: 'gestora', respondido: '2026-10-10T10:00:00Z',
      respuestas: { motivo: 'precio', nota_atencion: 2, nota_atencion_otro: 'Tardó una semana', comentarios: '=HYPERLINK("http://x")' },
    });
    await envio({
      campus: 'Cedia', gestora: 'otraGestora', respondido: '2026-11-05T10:00:00Z',
      respuestas: { motivo: 'otro', motivo_otro: 'Me mudo', nota_atencion: 5 },
    });
    await envio({ campus: 'Ictess', gestora: 'gestora', respondido: '2026-11-06T10:00:00Z', respuestas: { motivo: 'fechas' } });
    // La encuesta de antes: solo motivo y comentario (el «Otro motivo»).
    await envio({ campus: 'Ictess', gestora: 'gestora', respondido: '2026-11-07T10:00:00Z', comentario: 'Lo de antes', respuestas: null });
    await query("UPDATE feedback_envios SET motivo = 'otro', respuestas = '{}'::jsonb WHERE id = $1", [ids.envios.at(-1)]);
    // Sin responder: no sale.
    await envio({ campus: 'Cedia', gestora: 'gestora', respondido: null, respuestas: {} });
  } catch (err) {
    hayBase = false;
    porQueNo = err.message;
  }
});

afterAll(async () => {
  for (const [sql, p] of [
    ['DELETE FROM feedback_envios WHERE id = ANY($1::int[])', [ids.envios]],
    ['DELETE FROM leads WHERE id = ANY($1::int[])', [ids.leads]],
    ['DELETE FROM user_projects WHERE user_id = ANY($1::int[])', [ids.users]],
    ['DELETE FROM users WHERE id = ANY($1::int[])', [ids.users]],
    ['DELETE FROM projects WHERE id = ANY($1::int[])', [ids.projects]],
  ]) {
    try { await query(sql, p); } catch { /* sigue limpiando */ }
  }
});

const filas = (csv) => {
  expect(csv.charCodeAt(0)).toBe(0xFEFF); // con BOM, para que Excel lea las tildes
  return csv.slice(1).trim().split('\r\n');
};
const sinDatosDeContacto = (csv) => {
  for (const { token, email, telefono } of tokens) {
    expect(csv).not.toContain(token);
    expect(csv).not.toContain(email);
    expect(csv).not.toContain(telefono);
  }
  expect(csv).not.toContain('@');
  expect(csv).not.toContain(`Alumno`);
};

describe('exportar las respuestas de Feedback a CSV (#1157)', () => {
  it('contra la que probar', () => { expect(hayBase, porQueNo || '').toBe(true); });

  it('el permiso está en el catálogo y pide feedback.view', () => {
    const exportar = POR_CLAVE['feedback.exportar'];
    expect(exportar).toBeTruthy();
    expect(exportar.requiere).toEqual(['feedback.view']);
    expect(exportar.roles).toEqual(expect.arrayContaining(['admin', 'gestor']));
  });

  it('el super admin baja todas las respondidas de los dos campus, sin correo, teléfono ni token', async () => {
    if (!hayBase) return;
    const r = await como('super')(`/api/feedback/exportar?projectIds=${P.Cedia},${P.Ictess}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv/);
    expect(r.headers['content-disposition']).toMatch(/attachment; filename="feedback-respuestas-desde-siempre\.csv"/);
    const lineas = filas(r.body);
    expect(lineas[0]).toBe(CABECERA_CSV.map((c) => `"${c}"`).join(','));
    expect(lineas).toHaveLength(1 + 4);
    sinDatosDeContacto(r.body);
  });

  it('una gestora, solo lo suyo (aunque pida los dos campus)', async () => {
    if (!hayBase) return;
    const r = await como('gestora')(`/api/feedback/exportar?projectIds=${P.Cedia},${P.Ictess}`);
    expect(r.status).toBe(200);
    const lineas = filas(r.body);
    expect(lineas).toHaveLength(1 + 3);
    expect(r.body).not.toContain(`otraGestora ${marca}`);
    sinDatosDeContacto(r.body);
  });

  it('un admin, solo sus campus, aunque pida el de otro', async () => {
    if (!hayBase) return;
    const r = await como('adminCedia')(`/api/feedback/exportar?projectIds=${P.Cedia},${P.Ictess}`);
    expect(r.status).toBe(200);
    expect(r.body).not.toContain(`Ictess ${marca}`);
    expect(filas(r.body)).toHaveLength(1 + 2);
    const soloIctess = await como('adminCedia')(`/api/feedback/exportar?projectId=${P.Ictess}`);
    expect(soloIctess.body).not.toContain(`Ictess ${marca}`);
  });

  it('respeta campus y periodo', async () => {
    if (!hayBase) return;
    const r = await como('super')(`/api/feedback/exportar?projectIds=${P.Cedia},${P.Ictess}&desde=2026-11-01&hasta=2026-11-30`);
    const lineas = filas(r.body);
    expect(lineas).toHaveLength(1 + 3);
    expect(r.headers['content-disposition']).toMatch(/feedback-respuestas-2026-11-01_2026-11-30\.csv/);
    const soloCedia = await como('super')(`/api/feedback/exportar?projectId=${P.Cedia}`);
    expect(filas(soloCedia.body)).toHaveLength(1 + 2);
  });

  it('cada fila: fecha, campus, gestora, motivo, puntuación y comentario', async () => {
    if (!hayBase) return;
    const r = await como('super')(`/api/feedback/exportar?projectId=${P.Cedia}`);
    const [, masNueva, masVieja] = filas(r.body);
    expect(masNueva).toBe(`"2026-11-05","Cedia ${marca}","otraGestora ${marca}","Otro motivo: «Me mudo»","5",""`);
    expect(masVieja).toBe(`"2026-10-10","Cedia ${marca}","gestora ${marca}","El precio","2","Sobre la atención: Tardó una semana · =HYPERLINK(""http://x"")"`);
  });

  it('sin feedback.exportar no se baja (un tutor)', async () => {
    if (!hayBase) return;
    const u = await uno("INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', 'tutor') RETURNING id, role",
      [`tutor ${marca}`, `tutor@${marca}.test`]);
    ids.users.push(u.id);
    U.tutor = u;
    expect((await como('tutor')('/api/feedback/exportar')).status).toBe(403);
  });
});

describe('respuestasEnCsv (#1157)', () => {
  it('la encuesta de antes: el comentario era el «Otro motivo»', () => {
    const csv = respuestasEnCsv([{ fecha: '2026-01-02', campus: 'A', gestora: null, motivo: 'otro', comentario: 'Me caso', respuestas: null }]);
    expect(filas(csv)[1]).toBe('"2026-01-02","A","Sin gestora","Otro motivo: «Me caso»","",""');
  });

  it('un comentario que empieza como fórmula sale con apóstrofo', () => {
    const csv = respuestasEnCsv([{ fecha: '2026-01-02', campus: 'A', gestora: 'G', respuestas: { comentarios: '=HYPERLINK("http://x")' } }]);
    expect(filas(csv)[1]).toBe('"2026-01-02","A","G","","","\'=HYPERLINK(""http://x"")"');
  });
});
