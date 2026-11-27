import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * CRM#1210 · GA4 y Search Console: la sincronización por campus y los umbrales
 * del aviso, desde la tarjeta de Integraciones, sin `.env`.
 *
 * Lo que pide la issue en «Cómo se comprueba», sin GA4_SYNC_ACTIVO ni
 * GSC_SYNC_ACTIVO:
 *   1. se enciende un campus y la vuelta trae ese campus, y ningún otro;
 *   2. «Sincronizar ahora» trae los datos al momento;
 *   3. con los umbrales bajados, el aviso de caída sale con los nuevos;
 *   4. sin `integrations.google` no se toca nada (403).
 *
 * Las rutas de verdad (token, permiso y campus); la base y Google, simulados.
 *
 *   npx vitest run tests/syncGooglePorCampus1210.test.js
 */

// Ana es admin del campus 10 (conecta Google). Sofía ve Integraciones, sin `integrations.google`.
const CAMPUS_DE = { 2: [10], 4: [10] };
const MAPAS = {
  2: { 'integrations.view': true, 'integrations.google': true },
  4: { 'integrations.view': true, 'integrations.edit': true },
};
vi.mock('../src/modules/permissions/permissions.service.js', () => ({
  explicarPermisos: vi.fn(async (id) => (MAPAS[id] ? { mapa: MAPAS[id] } : null)),
}));

// La base, en memoria: las credenciales conectadas y las filas de `*_sincronizacion`.
const mem = vi.hoisted(() => ({ creds: new Set(), sync: { ga4_sincronizacion: new Map(), gsc_sincronizacion: new Map() }, log: [] }));

vi.mock('../src/modules/credentials/credentials.model.js', () => ({
  getDecryptedValue: vi.fn(async (service, projectId) => (mem.creds.has(`${service}|${projectId}`)
    ? JSON.stringify({ type: 'service_account', client_email: 'lector@x.iam.gserviceaccount.com', property_id: '123', site_url: 'sc-domain:web.com' })
    : null)),
  upsert: vi.fn(),
  remove: vi.fn(),
}));

const COLS_UMBRAL = ['aviso_caida_clics', 'aviso_caida_impresiones', 'aviso_min_clics', 'aviso_min_impresiones'];
vi.mock('../src/shared/config/db.js', () => ({
  getClient: vi.fn(),
  query: vi.fn(async (sql, params = []) => {
    if (sql.includes('FROM user_projects WHERE user_id = $1 AND project_id = $2')) {
      return { rows: (CAMPUS_DE[params[0]] || []).includes(Number(params[1])) ? [{ '?column?': 1 }] : [] };
    }
    if (sql.includes('FROM api_credentials ac') && sql.includes('quien.nombre AS puesta_por')) {
      return { rows: mem.creds.has(`${params[0]}|${params[1]}`) ? [{ id: 1, metadata: { client_email: 'lector@x.iam.gserviceaccount.com', property_id: '123', site_url: 'sc-domain:web.com' } }] : [] };
    }
    const tabla = /(ga4|gsc)_sincronizacion/.exec(sql)?.[0];
    if (tabla && /^\s*SELECT s\.\*/.test(sql)) {
      const f = mem.sync[tabla].get(Number(params[0]));
      return { rows: f ? [{ ...f, sync_cambiado_por_nombre: f.sync_cambiado_por ? 'Ana' : null, umbrales_cambiado_por_nombre: f.umbrales_cambiado_por ? 'Ana' : null }] : [] };
    }
    if (tabla && sql.includes('INSERT INTO') && sql.includes('sync_activo')) {
      const [pid, activo, por] = params;
      const f = mem.sync[tabla].get(pid) || {};
      mem.sync[tabla].set(pid, { ...f, sync_activo: activo, sync_cambiado_por: por, sync_cambiado_at: new Date().toISOString() });
      return { rows: [] };
    }
    if (tabla && sql.includes('INSERT INTO') && sql.includes('aviso_caida_clics')) {
      const [pid, ...resto] = params;
      const f = mem.sync[tabla].get(pid) || {};
      const nuevos = Object.fromEntries(COLS_UMBRAL.map((c, i) => [c, resto[i]]));
      mem.sync[tabla].set(pid, { ...f, ...nuevos, umbrales_cambiado_por: resto[4], umbrales_cambiado_at: new Date().toISOString() });
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO user_activity_log')) { mem.log.push({ action: params[1], details: JSON.parse(params[2]) }); return { rows: [] }; }
    if (sql.includes('SELECT gsc_property FROM projects')) return { rows: [{ gsc_property: null }] };
    return { rows: [] };
  }),
}));

// La vuelta de cada campus, simulada: qué campus se han puesto al día.
const puestos = vi.hoisted(() => ({ ga4: [], gsc: [], fallar: false }));
vi.mock('../src/modules/google-analytics/google-analytics.service.js', async (original) => ({
  ...(await original()),
  proyectosConGA4: vi.fn(async () => [...mem.creds].filter((k) => k.startsWith('google_analytics|'))
    .map((k) => Number(k.split('|')[1]))
    .map((pid) => ({ project_id: pid, nombre: `Campus ${pid}`, ...(mem.sync.ga4_sincronizacion.get(pid) || {}) }))),
  ponerAlDia: vi.fn(async (pid) => {
    puestos.ga4.push(pid);
    return puestos.fallar ? { ok: false, dias: 3, error: 'User does not have sufficient permissions for this property' } : { ok: true, dias: 90 };
  }),
}));
vi.mock('../src/modules/search-console/search-console.service.js', async (original) => ({
  ...(await original()),
  proyectosConGSC: vi.fn(async () => [...mem.creds].filter((k) => k.startsWith('gsc|'))
    .map((k) => Number(k.split('|')[1]))
    .map((pid) => ({ project_id: pid, nombre: `Campus ${pid}`, ...(mem.sync.gsc_sincronizacion.get(pid) || {}) }))),
  ponerAlDia: vi.fn(async (pid) => { puestos.gsc.push(pid); return { ok: true, dias: 180 }; }),
}));
const avisos = vi.hoisted(() => ({ revisados: null }));
vi.mock('../src/modules/search-console/search-console.aviso.js', async (original) => ({
  ...(await original()),
  revisarCaidas: vi.fn(async ({ campus }) => { avisos.revisados = campus.map((c) => c.project_id); return { campus: campus.length }; }),
}));

const { default: rutas } = await import('../src/modules/integrations/integrations.routes.js');
const { errorHandler } = await import('../src/shared/middleware/errorHandler.js');
const ga4Job = await import('../src/jobs/googleAnalyticsSyncScheduler.js');
const gscJob = await import('../src/jobs/searchConsoleSyncScheduler.js');
const { interruptorDelCampus } = await import('../src/shared/utils/interruptorCampus.js');
const { reloj } = await import('../src/jobs/relojDeVueltas.js');
const { umbralesDe, caidas, umbrales } = await vi.importActual('../src/modules/search-console/search-console.aviso.js');

const app = express();
app.use(express.json());
app.use('/api/integrations', rutas);
app.use(errorHandler);
const api = supertest(app);
const como = (userId, role) => ({ Authorization: `Bearer ${jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '5m' })}` });
const ANA = como(2, 'admin');
const SOFIA = como(4, 'admin');

const ENV = ['GA4_SYNC_ACTIVO', 'GSC_SYNC_ACTIVO', 'GSC_AVISO_CAIDA_CLICS', 'GSC_AVISO_CAIDA_IMPRESIONES', 'GSC_AVISO_MIN_CLICS', 'GSC_AVISO_MIN_IMPRESIONES'];
const envAntes = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));

beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  mem.creds = new Set(['google_analytics|10', 'google_analytics|11', 'gsc|10', 'gsc|11']);
  mem.sync.ga4_sincronizacion.clear(); mem.sync.gsc_sincronizacion.clear(); mem.log.length = 0;
  puestos.ga4 = []; puestos.gsc = []; puestos.fallar = false; avisos.revisados = null;
});
afterEach(() => {
  for (const k of ENV) { if (envAntes[k] === undefined) delete process.env[k]; else process.env[k] = envAntes[k]; }
});

describe('de dónde sale el interruptor', () => {
  it('manda la pantalla; si nadie lo ha tocado, el `.env`; si no, apagado', () => {
    expect(interruptorDelCampus(true, false)).toEqual({ activo: true, origen: 'pantalla' });
    expect(interruptorDelCampus(false, true)).toEqual({ activo: false, origen: 'pantalla' });
    expect(interruptorDelCampus(null, true)).toEqual({ activo: true, origen: 'servidor' });
    expect(interruptorDelCampus(null, false)).toEqual({ activo: false, origen: 'serie' });
  });

  it('la próxima vuelta: la de arrancar y después cada intervalo', () => {
    const r = reloj(6 * 3600000, 120000);
    expect(r.proxima(0)).toBeNull(); // la tarea no corre en este proceso
    r.arranca(1000);
    expect(r.proxima(1000).getTime()).toBe(1000 + 120000);
    expect(r.proxima(1000 + 200000).getTime()).toBe(1000 + 6 * 3600000);
    expect(r.proxima(1000 + 6 * 3600000).getTime()).toBe(1000 + 12 * 3600000);
  });
});

describe('1 · se enciende un campus y la vuelta trae ese, y ningún otro', () => {
  it('sin GA4_SYNC_ACTIVO ni nada encendido, la vuelta no pone al día a nadie', async () => {
    const r = await ga4Job.vuelta();
    expect(r).toMatchObject({ campus: 0, apagados: 2 });
    expect(puestos.ga4).toEqual([]);
  });

  it('GA4: encendido en el 10 desde la tarjeta → solo el 10', async () => {
    const r = await api.put('/api/integrations/google/ga4/sincronizacion').set(ANA).send({ projectId: 10, activo: true });
    expect(r.status).toBe(200);
    expect(r.body.data.sincronizacion).toMatchObject({ activa: true, origen: 'pantalla', cambiada_por: 'Ana', variable: 'GA4_SYNC_ACTIVO' });
    expect(r.body.data.sincronizacion_activa).toBe(true);
    await ga4Job.vuelta();
    expect(puestos.ga4).toEqual([10]);
  });

  it('Search Console: igual, y el aviso de los lunes solo mira los encendidos', async () => {
    await api.put('/api/integrations/google/gsc/sincronizacion').set(ANA).send({ projectId: 10, activo: true }).expect(200);
    await gscJob.vuelta({ ahora: new Date('2026-11-23T10:00:00Z') }); // lunes
    expect(puestos.gsc).toEqual([10]);
    expect(avisos.revisados).toEqual([10]);
  });

  it('con el `.env` a 1 todos van, salvo el que se apaga en su tarjeta', async () => {
    process.env.GA4_SYNC_ACTIVO = '1';
    let e = await api.get('/api/integrations/google/ga4?projectId=10').set(ANA);
    expect(e.body.data.sincronizacion).toMatchObject({ activa: true, origen: 'servidor' });
    await api.put('/api/integrations/google/ga4/sincronizacion').set(ANA).send({ projectId: 10, activo: false }).expect(200);
    await ga4Job.vuelta();
    expect(puestos.ga4).toEqual([11]);
    // «Como diga el servidor» devuelve el 10 a la reserva.
    e = await api.put('/api/integrations/google/ga4/sincronizacion').set(ANA).send({ projectId: 10, activo: null });
    expect(e.body.data.sincronizacion).toMatchObject({ activa: true, origen: 'servidor' });
  });

  it('queda anotado quién lo cambió, de qué a qué', async () => {
    await api.put('/api/integrations/google/ga4/sincronizacion').set(ANA).send({ projectId: 10, activo: true }).expect(200);
    expect(mem.log).toContainEqual({
      action: 'integracion.google.sincronizacion',
      details: expect.objectContaining({
        servicio: 'google_analytics', project_id: 10,
        antes: { activo: false, origen: 'serie' }, despues: { activo: true, origen: 'pantalla' },
      }),
    });
  });

  it('el interruptor tiene que ser sí, no o null', async () => {
    const r = await api.put('/api/integrations/google/ga4/sincronizacion').set(ANA).send({ projectId: 10, activo: 'quizá' });
    expect(r.status).toBe(400);
  });
});

describe('2 · «Sincronizar ahora»', () => {
  it('trae los datos del campus al momento, aunque la automática esté apagada', async () => {
    const r = await api.post('/api/integrations/google/ga4/sincronizar').set(ANA).send({ projectId: 10 });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ ok: true, dias: 90 });
    expect(r.body.data.mensaje).toMatch(/90 días/);
    expect(puestos.ga4).toEqual([10]);
    expect(r.body.data.estado.sincronizacion.activa).toBe(false); // no la enciende
    expect(mem.log.map((l) => l.action)).toContain('integracion.google.sincronizar_ahora');
  });

  it('si Google falla, lo dice en castellano', async () => {
    puestos.fallar = true;
    const r = await api.post('/api/integrations/google/ga4/sincronizar').set(ANA).send({ projectId: 10 });
    expect(r.status).toBe(200);
    expect(r.body.data.ok).toBe(false);
    expect(r.body.data.mensaje).toMatch(/no tiene acceso a la propiedad 123/);
  });

  it('sin la cuenta conectada → 404', async () => {
    mem.creds.delete('gsc|10');
    const r = await api.post('/api/integrations/google/gsc/sincronizar').set(ANA).send({ projectId: 10 });
    expect(r.status).toBe(404);
    expect(puestos.gsc).toEqual([]);
  });
});

describe('3 · los umbrales del aviso de caída', () => {
  it('de serie, del `.env` o de la pantalla, y cada uno dice de dónde sale', () => {
    expect(umbralesDe(null, {})).toMatchObject({ clics: 30, impresiones: 30, minClics: 20, minImpresiones: 200, origen: { clics: 'serie' } });
    expect(umbralesDe(null, { GSC_AVISO_CAIDA_CLICS: '50' })).toMatchObject({ clics: 50, origen: { clics: 'servidor', impresiones: 'serie' } });
    expect(umbralesDe({ aviso_caida_clics: 10, aviso_min_clics: 0 }, { GSC_AVISO_CAIDA_CLICS: '50' }))
      .toMatchObject({ clics: 10, minClics: 0, origen: { clics: 'pantalla', minClics: 'pantalla', impresiones: 'serie' } });
    expect(umbrales({})).toEqual({ clics: 30, impresiones: 30, minClics: 20, minImpresiones: 200 });
  });

  it('con los umbrales bajados, una caída del 20 % avisa (con los de serie, no)', () => {
    const semana = {
      con_datos: true, completa: true,
      actual: { clics: 80, impresiones: 950 }, anterior: { clics: 100, impresiones: 1000 },
      variacion: { clics: -20, impresiones: -5 },
    };
    expect(caidas(semana, umbralesDe(null, {}))).toEqual([]);
    const bajados = umbralesDe({ aviso_caida_clics: 15, aviso_caida_impresiones: 30, aviso_min_clics: 20, aviso_min_impresiones: 200 }, {});
    expect(caidas(semana, bajados)).toEqual([expect.objectContaining({ metrica: 'clics', variacion: -20, umbral: 15 })]);
  });

  it('se guardan desde la tarjeta, se validan y se vuelve a los de serie', async () => {
    let r = await api.put('/api/integrations/google/gsc/umbrales').set(ANA)
      .send({ projectId: 10, umbrales: { clics: 15, impresiones: 25, minClics: 10, minImpresiones: 100 } });
    expect(r.status).toBe(200);
    expect(r.body.data.umbrales_aviso).toMatchObject({
      valores: { clics: 15, impresiones: 25, minClics: 10, minImpresiones: 100 },
      origen: { clics: 'pantalla' }, cambiado_por: 'Ana',
    });
    expect(mem.log).toContainEqual({
      action: 'integracion.google.umbrales_aviso',
      details: expect.objectContaining({ antes: expect.objectContaining({ clics: 30 }), despues: expect.objectContaining({ clics: 15 }) }),
    });

    for (const mal of [{ clics: 150 }, { clics: -1 }, { minClics: 2.5 }, { minImpresiones: 'mucho' }]) {
      r = await api.put('/api/integrations/google/gsc/umbrales').set(ANA)
        .send({ projectId: 10, umbrales: { clics: 15, impresiones: 25, minClics: 10, minImpresiones: 100, ...mal } });
      expect(r.status).toBe(400);
    }

    r = await api.put('/api/integrations/google/gsc/umbrales').set(ANA).send({ projectId: 10, umbrales: null });
    expect(r.body.data.umbrales_aviso).toMatchObject({ valores: { clics: 30 }, origen: { clics: 'serie' } });
  });

  it('la tarjeta de GA4 no trae umbrales', async () => {
    const r = await api.get('/api/integrations/google/ga4?projectId=10').set(ANA);
    expect(r.body.data.umbrales_aviso).toBeUndefined();
  });
});

describe('4 · sin `integrations.google`', () => {
  it('ve la tarjeta, pero las tres rutas le dan 403 y no cambia nada', async () => {
    expect((await api.get('/api/integrations/google/gsc?projectId=10').set(SOFIA)).status).toBe(200);
    expect((await api.put('/api/integrations/google/gsc/sincronizacion').set(SOFIA).send({ projectId: 10, activo: true })).status).toBe(403);
    expect((await api.post('/api/integrations/google/gsc/sincronizar').set(SOFIA).send({ projectId: 10 })).status).toBe(403);
    expect((await api.put('/api/integrations/google/gsc/umbrales').set(SOFIA)
      .send({ projectId: 10, umbrales: { clics: 1, impresiones: 1, minClics: 1, minImpresiones: 1 } })).status).toBe(403);
    expect(mem.sync.gsc_sincronizacion.size).toBe(0);
    expect(puestos.gsc).toEqual([]);
  });

  it('ni en un campus que no es suyo', async () => {
    const r = await api.put('/api/integrations/google/ga4/sincronizacion').set(ANA).send({ projectId: 20, activo: true });
    expect(r.status).toBe(403);
  });
});
