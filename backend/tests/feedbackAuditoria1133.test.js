import {
  describe, it, expect, beforeAll, afterAll,
} from 'vitest';
import crypto from 'crypto';
import { query } from '../src/shared/config/db.js';
import * as model from '../src/modules/feedback/feedback.model.js';
import { fechaValida } from '../src/modules/feedback/feedback.controller.js';
import { limpiarRespuestas } from '../src/modules/feedback/preguntas.js';

/**
 * Lo que quedaba de la auditoría de Feedback del 02/11 (#593 → #1133):
 *   · 20: una fecha imposible no tumba el panel;
 *   · 9: los campus de pruebas no cuentan salvo que se pida ese campus;
 *   · 14: los días se cuentan en hora de Madrid;
 *   · 23: no se escribe a prospectos de campus desactivados;
 *   · menores: respuestas raras y correos sin forma de correo.
 */

describe('fechas del panel (punto 20)', () => {
  it('una fecha que existe pasa tal cual', () => {
    expect(fechaValida('2026-02-28')).toBe('2026-02-28');
    expect(fechaValida('2028-02-29')).toBe('2028-02-29');
  });

  it('una imposible o mal escrita se ignora en vez de dar un 500', () => {
    for (const f of ['2026-02-30', '2026-13-01', '2026-04-31', '2026-2-3', 'ayer', '', undefined]) {
      expect(fechaValida(f)).toBeNull();
    }
  });
});

describe('respuestas raras de la encuesta (menores)', () => {
  it('`true` no es una nota de 1/5', () => {
    expect(limpiarRespuestas({ motivo: 'precio', nota_atencion: true })).not.toHaveProperty('nota_atencion');
    expect(limpiarRespuestas({ motivo: 'precio', nota_atencion: '4' })).toMatchObject({ nota_atencion: 4 });
  });

  it('un objeto no se guarda como «[object Object]»', () => {
    const r = limpiarRespuestas({ motivo: 'otro', motivo_otro: { a: 1 }, comentarios: { b: 2 } });
    expect(r).not.toHaveProperty('motivo_otro');
    expect(r).not.toHaveProperty('comentarios');
    expect(limpiarRespuestas({ motivo: 'precio', comentarios: ' bien ' })).toMatchObject({ comentarios: 'bien' });
  });
});

// ── Contra la base ────────────────────────────────────────────────────────────

const marca = `a1133${Date.now()}`;
const ids = { users: [], projects: [], leads: [] };
let hayBase = true;
let porQueNo = null;
let gestora;
let real;
let pruebas;
let apagado;
let n = 0;

const uno = async (sql, p) => (await query(sql, p)).rows[0];

async function campus(nombre, { esPrueba = false, activo = true } = {}) {
  const p = await uno(
    'INSERT INTO projects (nombre, slug, webhook_api_key, es_prueba, active) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [`${nombre} ${marca}`, `${nombre.toLowerCase()}-${marca}`, `${nombre}-${marca}-key`, esPrueba, activo]);
  ids.projects.push(p.id);
  return p.id;
}

beforeAll(async () => {
  try {
    const t = await query("SELECT 1 FROM information_schema.columns WHERE table_name = 'feedback_envios' AND column_name = 'intentos'");
    if (!t.rows.length) throw new Error('Falta la migración 301.');
    real = await campus('Real');
    pruebas = await campus('Pruebas', { esPrueba: true });
    apagado = await campus('Apagado', { activo: false });
    const u = await uno(
      "INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', 'gestor') RETURNING id",
      [`Ana ${marca}`, `ana@${marca}.test`]);
    ids.users.push(u.id);
    gestora = u.id;
  } catch (err) {
    hayBase = false;
    porQueNo = err.message;
  }
});

afterAll(async () => {
  for (const [sql, p] of [
    ['DELETE FROM lead_interactions WHERE lead_id = ANY($1::int[])', [ids.leads]],
    ['DELETE FROM feedback_envios WHERE lead_id = ANY($1::int[])', [ids.leads]],
    ['DELETE FROM leads WHERE id = ANY($1::int[])', [ids.leads]],
    ['DELETE FROM users WHERE id = ANY($1::int[])', [ids.users]],
    ['DELETE FROM projects WHERE id = ANY($1::int[])', [ids.projects]],
  ]) {
    try { await query(sql, p); } catch { /* sigue limpiando */ }
  }
});

/** Una ficha con su primer contacto hace 10 días. */
async function ficha(projectId, email) {
  n += 1;
  const l = await uno('INSERT INTO leads (project_id, nombre, email, responsable_id) VALUES ($1, $2, $3, $4) RETURNING id',
    [projectId, `Persona ${n} ${marca}`, email, gestora]);
  ids.leads.push(l.id);
  await query(
    "INSERT INTO lead_interactions (lead_id, tipo, nota, created_by, fecha) VALUES ($1, 'llamada', 'Primer contacto', $2, NOW() - INTERVAL '10 days')",
    [l.id, gestora]);
  return l.id;
}

/** Un correo que salió en ese instante. */
async function envio(projectId, enviadoAt) {
  const leadId = await ficha(projectId, `envio${n + 1}@${marca}.test`);
  await query(
    `INSERT INTO feedback_envios (lead_id, project_id, gestora_id, disparador, estado, token, email, enviado_at)
     VALUES ($1, $2, $3, 'dia7', 'enviado', $4, $5, $6)`,
    [leadId, projectId, gestora, crypto.randomBytes(24).toString('base64url'), `envio${n}@${marca}.test`, enviadoAt]);
  return leadId;
}

const candidatos = async () => (await model.candidatosDelDia7({ tope: 500 })).filter((id) => ids.leads.includes(id));

describe('a quién le toca el correo del día 7 (punto 23 y menores)', () => {
  it('contra la que probar', () => { expect(hayBase, porQueNo || '').toBe(true); });

  it('un campus desactivado no recibe correos', async () => {
    if (!hayBase) return;
    const si = await ficha(real, `activo@${marca}.test`);
    const no = await ficha(apagado, `apagado@${marca}.test`);
    const c = await candidatos();
    expect(c).toContain(si);
    expect(c).not.toContain(no);
    expect(await model.sigueTocandole(no)).toBe(false);
  });

  it('un correo sin forma de correo no se elige', async () => {
    if (!hayBase) return;
    const malos = [await ficha(real, `juan@${marca}`), await ficha(real, 'no tiene'), await ficha(real, `a b@${marca}.test`)];
    const c = await candidatos();
    for (const id of malos) expect(c).not.toContain(id);
  });
});

describe('el panel (puntos 9 y 14)', () => {
  it('los campus de pruebas no suman al pedir varios, sí al pedir ese campus', async () => {
    if (!hayBase) return;
    await envio(real, new Date());
    await envio(pruebas, new Date());
    const varios = await model.panel({ projectIds: [real, pruebas] });
    expect(varios.totales.enviados).toBe(1);
    const ese = await model.panel({ projectIds: [pruebas], conPruebas: true });
    expect(ese.totales.enviados).toBe(1);
  });

  it('lo enviado a las 00:30 de Madrid cuenta en ese día, no en el anterior', async () => {
    if (!hayBase) return;
    const p = await campus('Medianoche');
    // 23:30 UTC del 9 de marzo = 00:30 del 10 en Madrid (invierno, UTC+1).
    await envio(p, '2026-03-09T23:30:00Z');
    const del10 = await model.panel({ projectIds: [p], desde: '2026-03-10', hasta: '2026-03-10' });
    const del9 = await model.panel({ projectIds: [p], desde: '2026-03-09', hasta: '2026-03-09' });
    expect(del10.totales.enviados).toBe(1);
    expect(del9.totales.enviados).toBe(0);
    expect(del10.porMes.map((m) => m.mes)).toEqual(['2026-03']);
  });
});
