import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * CRM#1099 · Google Analytics 4 y Search Console en Integraciones (Diego, 25/11).
 *
 * Por las rutas de verdad (token, permiso y campus), con Google simulado (`fetch`
 * falso) y las credenciales en memoria:
 *   · guardar sin devolver NUNCA la `private_key`;
 *   · validar que el JSON sea de una cuenta de servicio y la propiedad;
 *   · el alcance por campus y el permiso (ver ≠ guardar);
 *   · «Probar» con una llamada real mínima, en castellano claro;
 *   · y que lo guardado lo lean tal cual `credencialDe` de GA4 y de Search Console.
 *
 *   npx vitest run tests/googleIntegraciones1099.test.js
 */

// Ana es admin del campus 10. Sofía es soporte (ve Integraciones, no conecta
// Google). Laura es gestora del 10. El 20 es de otra empresa.
const CAMPUS_DE = { 2: [10], 3: [10], 4: [10] };
const MAPAS = {
  1: { 'integrations.view': true, 'integrations.google': true },
  2: { 'integrations.view': true, 'integrations.google': true },
  3: {},
  4: { 'integrations.view': true, 'integrations.edit': true },
};
vi.mock('../src/modules/permissions/permissions.service.js', () => ({
  explicarPermisos: vi.fn(async (id) => (MAPAS[id] ? { mapa: MAPAS[id] } : null)),
}));

// Las credenciales, en memoria: «servicio|campus» → fila (el valor, en claro aquí;
// el cifrado real lo hace `credentials.model.upsert`, que no cambia).
const mem = vi.hoisted(() => ({ creds: new Map(), log: [], sigId: 1 }));
vi.mock('../src/modules/credentials/credentials.model.js', () => ({
  getDecryptedValue: vi.fn(async (service, projectId) => mem.creds.get(`${service}|${projectId}`)?.value ?? null),
  upsert: vi.fn(async ({ project_id, service, value, metadata, userId }) => {
    const k = `${service}|${project_id}`;
    const antes = mem.creds.get(k);
    const fila = {
      id: antes?.id ?? mem.sigId++, value, project_id, service,
      metadata: { ...(antes?.metadata || {}), ...(metadata || {}), entorno: 'produccion', updated_by: userId },
      updated_at: new Date().toISOString(), last_tested_at: antes?.last_tested_at ?? null, last_test_result: antes?.last_test_result ?? null,
    };
    mem.creds.set(k, fila);
    return fila;
  }),
  remove: vi.fn(async (id) => {
    for (const [k, f] of mem.creds) if (f.id === id) mem.creds.delete(k);
  }),
}));

const porId = (id) => [...mem.creds.values()].find((f) => f.id === id);
vi.mock('../src/shared/config/db.js', () => ({
  getClient: vi.fn(),
  query: vi.fn(async (sql, params = []) => {
    if (sql.includes('FROM user_projects WHERE user_id = $1 AND project_id = $2')) {
      return { rows: (CAMPUS_DE[params[0]] || []).includes(Number(params[1])) ? [{ '?column?': 1 }] : [] };
    }
    if (sql.includes('FROM api_credentials ac') && sql.includes('quien.nombre AS puesta_por')) {
      const f = mem.creds.get(`${params[0]}|${params[1]}`);
      return { rows: f ? [{ ...f, puesta_por: 'Ana' }] : [] };
    }
    if (sql.includes('SET last_tested_at = NULL')) {
      const f = mem.creds.get(`${params[0]}|${params[1]}`);
      if (f) { f.last_tested_at = null; f.last_test_result = null; }
      return { rows: [] };
    }
    if (sql.includes('SET last_tested_at = NOW()')) {
      const f = porId(params[0]);
      if (f) {
        f.last_tested_at = new Date().toISOString();
        f.last_test_result = params[1];
        f.metadata = { ...f.metadata, ultima_prueba_mensaje: params[2] };
      }
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO user_activity_log')) { mem.log.push({ action: params[1], details: params[2] }); return { rows: [] }; }
    if (sql.includes('SELECT gsc_property FROM projects')) return { rows: [{ gsc_property: null }] };
    return { rows: [] }; // las tablas de sincronización: sin datos
  }),
}));

const { default: rutas } = await import('../src/modules/integrations/integrations.routes.js');
const { errorHandler } = await import('../src/shared/middleware/errorHandler.js');
const ga4Service = await import('../src/modules/google-analytics/google-analytics.service.js');
const gscService = await import('../src/modules/search-console/search-console.service.js');
const { olvidarTokensGoogle } = await import('../src/shared/services/googleCuentaServicio.service.js');
const { estadoDe, explicarError } = await import('../src/modules/integrations/google.service.js');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/api/integrations', rutas);
app.use(errorHandler);
const api = supertest(app);

const como = (userId, role) => ({ Authorization: `Bearer ${jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: '5m' })}` });
const MANUEL = como(1, 'superadmin');
const ANA = como(2, 'admin');
const LAURA = como(3, 'gestor');
const SOFIA = como(4, 'admin'); // admin de rol, pero su mapa no trae `integrations.google`

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const CUENTA = {
  type: 'service_account',
  project_id: 'crm-analitica',
  private_key_id: 'abc123def456',
  private_key: PEM,
  client_email: 'crm-lector@crm-analitica.iam.gserviceaccount.com',
  client_id: '1234567890',
  token_uri: 'https://oauth2.googleapis.com/token',
};
const JSON_CUENTA = JSON.stringify(CUENTA, null, 2);

/** Nada de la clave en lo que sale: ni la clave, ni un trozo. */
function sinClave(body) {
  const texto = JSON.stringify(body);
  expect(texto).not.toContain('PRIVATE KEY');
  expect(texto).not.toContain('private_key');
  expect(texto).not.toContain(PEM.split('\n')[1].slice(0, 20));
}

// ─── Google simulado ─────────────────────────────────────────────────────
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body });
let fetchOriginal;
let google;
function simularGoogle(o = {}) {
  google = {
    token: () => resp(200, { access_token: 'tok', expires_in: 3600 }),
    informe: () => resp(200, { rowCount: 1, rows: [{ dimensionValues: [], metricValues: [{ value: '57' }] }] }),
    analitica: () => resp(200, { rows: [{ keys: [], clicks: 12, impressions: 400, position: 8 }] }),
    sitios: () => resp(200, { siteEntry: [
      { siteUrl: 'sc-domain:psikoaprende.com', permissionLevel: 'siteRestrictedUser' },
      { siteUrl: 'https://otra.com/', permissionLevel: 'siteUnverifiedUser' },
    ] }),
    ...o,
  };
  globalThis.fetch = vi.fn(async (url) => {
    if (url.startsWith('https://oauth2.googleapis.com/token')) return google.token();
    if (url.includes(':runReport')) return google.informe();
    if (url.includes('/searchAnalytics/query')) return google.analitica();
    if (url.endsWith('/webmasters/v3/sites')) return google.sitios();
    throw new Error(`llamada inesperada a ${url}`);
  });
}

beforeEach(() => {
  mem.creds.clear(); mem.log.length = 0; mem.sigId = 1;
  olvidarTokensGoogle();
  fetchOriginal = globalThis.fetch;
  simularGoogle();
});
afterEach(() => { globalThis.fetch = fetchOriginal; });

const guardarGA4 = (quien = ANA, extra = {}) => api.put('/api/integrations/google/ga4').set(quien)
  .send({ projectId: 10, json: JSON_CUENTA, property_id: '123456789', ...extra });

describe('guardar la credencial', () => {
  it('GA4: la guarda con property_id en el JSON y devuelve solo el correo y la propiedad', async () => {
    const r = await guardarGA4();
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      servicio: 'ga4', conectada: true, estado: 'sin_probar',
      client_email: CUENTA.client_email, property_id: '123456789',
    });
    sinClave(r.body);
    // Guardada donde y como la leen los módulos de Hugo.
    const guardada = JSON.parse(mem.creds.get('google_analytics|10').value);
    expect(guardada).toMatchObject({ ...CUENTA, property_id: '123456789' });
    expect(mem.creds.get('google_analytics|10').metadata).toMatchObject({
      entorno: 'produccion', client_email: CUENTA.client_email, property_id: '123456789',
    });
    // Queda anotado, sin el valor.
    expect(mem.log.map((l) => l.action)).toContain('credencial.crear');
    expect(mem.log.map((l) => l.details).join(' ')).not.toContain('PRIVATE');
  });

  it('el GET tampoco enseña la clave', async () => {
    await guardarGA4();
    const r = await api.get('/api/integrations/google/ga4?projectId=10').set(ANA);
    expect(r.status).toBe(200);
    expect(r.body.data.client_email).toBe(CUENTA.client_email);
    sinClave(r.body);
  });

  it('lo guardado lo leen tal cual `credencialDe` de GA4 y de Search Console', async () => {
    await guardarGA4();
    await api.put('/api/integrations/google/gsc').set(ANA)
      .send({ projectId: 10, json: JSON_CUENTA, site_url: 'sc-domain:PsikoAprende.com' }).expect(200);
    await expect(ga4Service.credencialDe(10)).resolves.toMatchObject({ propertyId: '123456789', clientEmail: CUENTA.client_email });
    await expect(gscService.credencialDe(10)).resolves.toMatchObject({ siteUrl: 'sc-domain:psikoaprende.com' });
  });

  it('acepta «properties/123» y cambiar solo la propiedad deja la clave', async () => {
    await guardarGA4(ANA, { property_id: 'properties/42' });
    expect(JSON.parse(mem.creds.get('google_analytics|10').value).property_id).toBe('42');
    const r = await api.put('/api/integrations/google/ga4').set(ANA).send({ projectId: 10, property_id: '777' });
    expect(r.status).toBe(200);
    const guardada = JSON.parse(mem.creds.get('google_analytics|10').value);
    expect(guardada.property_id).toBe('777');
    expect(guardada.private_key).toBe(PEM);
    expect(mem.log.map((l) => l.action)).toContain('credencial.cambiar');
  });

  it('Search Console con la misma cuenta que GA4, sin volver a subir el JSON', async () => {
    await guardarGA4();
    const antes = await api.get('/api/integrations/google/gsc?projectId=10').set(ANA);
    expect(antes.body.data).toMatchObject({ conectada: false, estado: 'sin_conectar', otra_cuenta: { servicio: 'ga4', client_email: CUENTA.client_email } });
    const r = await api.put('/api/integrations/google/gsc').set(ANA)
      .send({ projectId: 10, misma_cuenta: true, site_url: 'https://www.psikoaprende.com' });
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ client_email: CUENTA.client_email, site_url: 'https://www.psikoaprende.com/' });
    const guardada = JSON.parse(mem.creds.get('gsc|10').value);
    expect(guardada.site_url).toBe('https://www.psikoaprende.com/');
    expect(guardada.property_id).toBeUndefined(); // cada credencial con lo suyo
  });

  it('una credencial puesta antes desde Claves (sin metadata) se enseña igual, sin la clave', async () => {
    mem.creds.set('google_analytics|10', {
      id: 99, value: JSON.stringify({ ...CUENTA, property_id: '555' }), metadata: { entorno: 'produccion' },
      updated_at: '2026-11-20T10:00:00Z', last_tested_at: null, last_test_result: null,
    });
    const r = await api.get('/api/integrations/google/ga4?projectId=10').set(ANA);
    expect(r.body.data).toMatchObject({ conectada: true, client_email: CUENTA.client_email, property_id: '555' });
    sinClave(r.body);
  });
});

describe('validar el JSON y la propiedad', () => {
  const con = (json, extra = {}) => api.put('/api/integrations/google/ga4').set(ANA)
    .send({ projectId: 10, json, property_id: '123', ...extra });

  it.each([
    ['no es JSON', 'esto no es json', /no es un JSON válido/i],
    ['cliente OAuth', JSON.stringify({ installed: { client_id: 'x' } }), /ID de cliente de OAuth/],
    ['otro type', JSON.stringify({ ...CUENTA, type: 'authorized_user' }), /service_account/],
    ['sin private_key', JSON.stringify({ ...CUENTA, private_key: '' }), /le falta: private_key/],
    ['sin client_email', JSON.stringify({ ...CUENTA, client_email: undefined }), /le falta: client_email/],
    ['clave dañada', JSON.stringify({ ...CUENTA, private_key: '-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n' }), /dañada/],
  ])('%s → 400 que dice qué pasa, y no guarda nada', async (_n, json, msg) => {
    const r = await con(json);
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(msg);
    expect(mem.creds.size).toBe(0);
  });

  it('GA4: el ID de propiedad son solo números (no el G-…)', async () => {
    const r = await con(JSON_CUENTA, { property_id: 'G-ABC123' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/solo números/);
    expect((await con(JSON_CUENTA, { property_id: '' })).body.error).toMatch(/Falta el ID de propiedad/);
  });

  it('Search Console: «sc-domain:…» o «https://…/»', async () => {
    const r = await api.put('/api/integrations/google/gsc').set(ANA)
      .send({ projectId: 10, json: JSON_CUENTA, site_url: 'psikoaprende.com' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/sc-domain:web\.com/);
  });

  it('sin JSON y sin nada guardado, lo pide', async () => {
    const r = await api.put('/api/integrations/google/ga4').set(ANA).send({ projectId: 10, property_id: '1' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/Sube el JSON/);
  });

  it('un servicio que no es ga4 ni gsc → 404', async () => {
    expect((await api.get('/api/integrations/google/meta?projectId=10').set(ANA)).status).toBe(404);
  });
});

describe('quién y en qué campus', () => {
  it('un admin no toca el campus de otra empresa', async () => {
    const r = await api.put('/api/integrations/google/ga4').set(ANA)
      .send({ projectId: 20, json: JSON_CUENTA, property_id: '1' });
    expect(r.status).toBe(403);
    expect((await api.get('/api/integrations/google/ga4?projectId=20').set(ANA)).status).toBe(403);
    expect((await api.delete('/api/integrations/google/ga4?projectId=20').set(ANA)).status).toBe(403);
    expect(mem.creds.size).toBe(0);
  });

  it('el superadmin entra en cualquiera', async () => {
    expect((await guardarGA4(MANUEL, { projectId: 20 })).status).toBe(200);
    expect(mem.creds.has('google_analytics|20')).toBe(true);
  });

  it('quien ve Integraciones sin `integrations.google` ve, pero no guarda, ni prueba, ni quita', async () => {
    await guardarGA4();
    expect((await api.get('/api/integrations/google/ga4?projectId=10').set(SOFIA)).status).toBe(200);
    expect((await guardarGA4(SOFIA)).status).toBe(403);
    expect((await api.post('/api/integrations/google/ga4/probar').set(SOFIA).send({ projectId: 10 })).status).toBe(403);
    expect((await api.delete('/api/integrations/google/ga4?projectId=10').set(SOFIA)).status).toBe(403);
    expect(mem.creds.has('google_analytics|10')).toBe(true);
  });

  it('una gestora ni lo ve', async () => {
    expect((await api.get('/api/integrations/google/ga4?projectId=10').set(LAURA)).status).toBe(403);
  });
});

describe('«Probar», con Google simulado', () => {
  const probar = (s = 'ga4') => api.post(`/api/integrations/google/${s}/probar`).set(ANA).send({ projectId: 10 });

  it('GA4 bien: lo dice, con las sesiones de ayer, y queda «Conectado»', async () => {
    await guardarGA4();
    const r = await probar();
    expect(r.status).toBe(200);
    expect(r.body.data.ok).toBe(true);
    expect(r.body.data.mensaje).toMatch(/Conectado: .* lee la propiedad 123456789 \(ayer, 57 sesiones\)/);
    expect(r.body.data.estado.estado).toBe('conectado');
    expect(r.body.data.estado.ultima_prueba).toMatchObject({ ok: true });
    sinClave(r.body);
    expect(globalThis.fetch.mock.calls.filter(([u]) => u.includes(':runReport'))).toHaveLength(1);
  });

  it('sin acceso a la propiedad: «añádela como Lector»', async () => {
    simularGoogle({ informe: () => resp(403, { error: { message: 'User does not have sufficient permissions for this property.', status: 'PERMISSION_DENIED' } }) });
    await guardarGA4();
    const r = await probar();
    expect(r.body.data.ok).toBe(false);
    expect(r.body.data.mensaje).toContain(`La cuenta ${CUENTA.client_email} no tiene acceso a la propiedad 123456789`);
    expect(r.body.data.mensaje).toMatch(/«Lector» en GA4 › Administrar › Gestión de acceso/);
    expect(r.body.data.estado.estado).toBe('error');
  });

  it('API sin activar: dice cuál y dónde', async () => {
    simularGoogle({ informe: () => resp(403, { error: { message: 'Google Analytics Data API has not been used in project 42 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/analyticsdata.googleapis.com/overview?project=42 then retry.' } }) });
    await guardarGA4();
    const r = await probar();
    expect(r.body.data.mensaje).toMatch(/«Google Analytics Data API» no está activada/);
    expect(r.body.data.mensaje).toContain('https://console.developers.google.com/apis/api/analyticsdata.googleapis.com/overview?project=42');
  });

  it('clave borrada en Google: que suba una nueva', async () => {
    simularGoogle({ token: () => resp(400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }) });
    await guardarGA4();
    const r = await probar();
    expect(r.body.data.mensaje).toMatch(/Google no acepta la clave de la cuenta .*Crea una clave nueva/);
  });

  it('Search Console sin acceso: dónde darlo y qué propiedades sí ve', async () => {
    simularGoogle({ analitica: () => resp(403, { error: { message: "User does not have sufficient permission for site 'https://psikoaprende.com/'." } }) });
    await api.put('/api/integrations/google/gsc').set(ANA)
      .send({ projectId: 10, json: JSON_CUENTA, site_url: 'https://psikoaprende.com/' }).expect(200);
    const r = await probar('gsc');
    expect(r.body.data.ok).toBe(false);
    expect(r.body.data.mensaje).toMatch(/no tiene acceso a https:\/\/psikoaprende\.com\/: añádela en Search Console › Configuración › Usuarios y permisos/);
    expect(r.body.data.mensaje).toContain('Esta cuenta sí ve: sc-domain:psikoaprende.com.');
  });

  it('Search Console bien', async () => {
    await api.put('/api/integrations/google/gsc').set(ANA)
      .send({ projectId: 10, json: JSON_CUENTA, site_url: 'sc-domain:psikoaprende.com' }).expect(200);
    const r = await probar('gsc');
    expect(r.body.data).toMatchObject({ ok: true });
    expect(r.body.data.mensaje).toMatch(/lee sc-domain:psikoaprende\.com \(12 clics/);
  });

  it('sin credencial → 404', async () => {
    expect((await probar()).status).toBe(404);
  });
});

describe('el desplegable de Search Console y «Quitar»', () => {
  it('lista las propiedades que ve la cuenta del JSON recién subido (sin guardarlo)', async () => {
    const r = await api.post('/api/integrations/google/gsc/sitios').set(ANA).send({ projectId: 10, json: JSON_CUENTA });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual([{ site_url: 'sc-domain:psikoaprende.com', permiso: 'siteRestrictedUser' }]);
    expect(mem.creds.size).toBe(0);
  });

  it('quitar desactiva la credencial y queda «sin conectar»', async () => {
    await guardarGA4();
    const r = await api.delete('/api/integrations/google/ga4?projectId=10').set(ANA);
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({ conectada: false, estado: 'sin_conectar' });
    expect(mem.creds.has('google_analytics|10')).toBe(false);
    expect(mem.log.map((l) => l.action)).toContain('credencial.borrar');
  });
});

describe('el estado', () => {
  it('manda lo más reciente: la prueba o la sincronización', () => {
    expect(estadoDe({ conectada: false })).toBe('sin_conectar');
    expect(estadoDe({ conectada: true })).toBe('sin_probar');
    expect(estadoDe({ conectada: true, prueba: { at: '2026-11-25T10:00:00Z', ok: true }, sync: { last_status: 'error', updated_at: '2026-11-25T11:00:00Z' } })).toBe('error');
    expect(estadoDe({ conectada: true, prueba: { at: '2026-11-25T12:00:00Z', ok: true }, sync: { last_status: 'error', updated_at: '2026-11-25T11:00:00Z' } })).toBe('conectado');
  });

  it('un fallo de red se dice como tal', () => {
    expect(explicarError('ga4', new Error('fetch failed'))).toMatch(/No se ha podido hablar con Google/);
  });
});
