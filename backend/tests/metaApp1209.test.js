import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * La app de Meta y la renovación de los tokens desde la pantalla, sin `.env`
 * (CRM#1209), contra la base de verdad y con la Graph API simulada (nada sale
 * a la red):
 *
 *   · el ID y el secreto se guardan cifrados y ninguna respuesta los devuelve;
 *   · «Probar» da verde con la pareja buena y explica en castellano la mala;
 *   · la renovación usa la app y los ajustes de la pantalla sin META_* en el
 *     `.env`; el `.env` solo hace de reserva y la pantalla dice de dónde sale;
 *   · «Renovar ahora» renueva aunque la automática esté apagada;
 *   · sin `meta_ads.edit`, o sin `meta_ads.app`, 403;
 *   · la app es de todo el CRM: un admin recortado a sus campus no entra ni
 *     con `meta_ads.app` por excepción (403 en ver y en «Renovar ahora»).
 *
 *   cd backend && npx vitest run tests/metaApp1209.test.js
 */

const correos = vi.hoisted(() => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));
vi.mock('../src/shared/services/brevo.service.js', async (original) => ({ ...(await original()), ...correos }));

const { default: app } = await import('../src/app.js');
const { default: pool } = await import('../src/shared/config/db.js');
const { packToken, unpackToken } = await import('../src/modules/meta-ads/meta-ads.service.js');
const { appEnUso, leerAjustes } = await import('../src/modules/meta-ads/meta-app.config.js');
const { explicarError } = await import('../src/modules/meta-ads/meta-app.service.js');

const request = supertest(app);
const MARCA = `APP1209${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const one = async (sql, p) => (await q(sql, p))[0];
const DIA = 86400 * 1000;

const APP_ID = '1234567890123';
const SECRETO = 'abcdef0123456789abcdef0123456789';
const SECRETO_MALO = 'ffffffffffffffffffffffffffffffff';
const TOKEN_VIEJO = 'token-de-prueba-1209-viejo-00000000000';
const TOKEN_NUEVO = 'token-de-prueba-1209-nuevo-11111111111';

const U = {};
const T = {};
let PROYECTO;
let CUENTA;

async function persona(clave, role, overrides = []) {
  const u = await one(`INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, email`,
    [`${MARCA} ${clave}`, `${clave.toLowerCase()}_${MARCA.toLowerCase()}@test.local`, role]);
  for (const [resource, action, allowed] of overrides) {
    await q(`INSERT INTO user_permission_overrides (user_id, resource, action, allowed) VALUES ($1, $2, $3, $4)`,
      [u.id, resource, action, allowed]);
  }
  U[clave] = u;
  T[clave] = jwt.sign({ userId: u.id, email: u.email, role, roles_extra: [], customRoleId: null }, process.env.JWT_SECRET, { expiresIn: '1h' });
}
const como = (c) => ({ Authorization: `Bearer ${T[c]}` });

// ── La Graph API de mentira ─────────────────────────────────────────────────
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body });
const llamadas = [];
function graphFalsa(url) {
  const u = new URL(url);
  llamadas.push(u.pathname + '?' + u.searchParams.get('grant_type'));
  const secreto = u.searchParams.get('client_secret') || String(u.searchParams.get('access_token') || '').split('|')[1];
  if (secreto && secreto !== SECRETO) {
    return resp(400, { error: { message: 'Error validating client secret.', type: 'OAuthException', code: 1 } });
  }
  if (u.pathname.endsWith('/oauth/access_token') && u.searchParams.get('grant_type') === 'client_credentials') {
    return resp(200, { access_token: `${APP_ID}|token-de-app`, token_type: 'bearer' });
  }
  if (u.pathname.endsWith('/debug_token')) {
    const t = u.searchParams.get('input_token');
    const dias = t === TOKEN_NUEVO ? 60 : 3;
    return resp(200, { data: { app_id: APP_ID, is_valid: true, expires_at: Math.floor((Date.now() + dias * DIA) / 1000) } });
  }
  if (u.pathname.endsWith('/oauth/access_token') && u.searchParams.get('grant_type') === 'fb_exchange_token') {
    return resp(200, { access_token: TOKEN_NUEVO, expires_in: 60 * 86400 });
  }
  throw new Error(`llamada inesperada a ${u.hostname}${u.pathname}`);
}

let fetchOriginal;
const ENV = ['META_APP_ID', 'META_APP_SECRET', 'IG_APP_ID', 'IG_APP_SECRET', 'META_TOKENS_RENOVACION_ACTIVA',
  'META_TOKENS_RENOVAR_DIAS', 'META_TOKENS_AVISO_DIAS', 'META_GASTO_TOTAL_CADA_HORAS'];
const envAntes = {};

beforeAll(async () => {
  for (const k of ENV) { envAntes[k] = process.env[k]; delete process.env[k]; }
  ({ id: PROYECTO } = await one(
    `INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
    [`${MARCA} Campus`, MARCA.toLowerCase(), `${MARCA}-key`]));
  ({ id: CUENTA } = await one(
    `INSERT INTO meta_ad_accounts (project_id, ad_account_id, ad_account_nombre, access_token_enc)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [PROYECTO, `act_${Date.now()}`, `${MARCA} Ads`, packToken(TOKEN_VIEJO)]));
  // Quien configura la app: solo el superadmin la trae (CRM#1222, Diego 28/11).
  await persona('admin', 'superadmin');
  await persona('soporte', 'soporte'); // tiene meta_ads.edit, no meta_ads.app
  await persona('adminDeCampus', 'admin'); // ni la trae su rol
  await persona('adminConApp', 'admin', [['meta_ads', 'app', true]]); // por excepción, pero de un campus
  // Soporte ve todo el CRM: con la app por excepción y sin `edit`, el que falla es el permiso.
  await persona('sinEdit', 'soporte', [['meta_ads', 'app', true], ['meta_ads', 'edit', false]]);
  for (const c of ['adminDeCampus', 'adminConApp']) {
    await q('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [U[c].id, PROYECTO]);
  }
  // Que no quede nada de otra pasada.
  await q(`UPDATE api_credentials SET active = false WHERE service = 'meta_app'`);
  await q(`DELETE FROM meta_app_ajustes`);
});

afterAll(async () => {
  for (const k of ENV) { if (envAntes[k] === undefined) delete process.env[k]; else process.env[k] = envAntes[k]; }
  const us = Object.values(U).map((u) => u.id);
  await q(`DELETE FROM api_credentials WHERE service = 'meta_app'`);
  await q(`DELETE FROM meta_app_ajustes`);
  await q(`DELETE FROM admin_notifications WHERE metadata->>'project_id' = $1`, [String(PROYECTO)]);
  await q(`DELETE FROM meta_tokens_renovacion WHERE project_id = $1`, [PROYECTO]);
  await q(`DELETE FROM meta_ad_accounts WHERE project_id = $1`, [PROYECTO]);
  await q('DELETE FROM user_permission_overrides WHERE user_id = ANY($1::int[])', [us]);
  await q('DELETE FROM user_projects WHERE user_id = ANY($1::int[])', [us]);
  await q('DELETE FROM user_activity_log WHERE user_id = ANY($1::int[])', [us]);
  await q('DELETE FROM users WHERE id = ANY($1::int[])', [us]);
  await q(`DELETE FROM projects WHERE id = $1`, [PROYECTO]);
  await pool.end();
}, 60000);

beforeEach(() => {
  fetchOriginal = globalThis.fetch;
  globalThis.fetch = vi.fn(async (url, opts) => {
    if (String(url).includes('graph.facebook.com')) return graphFalsa(String(url));
    return fetchOriginal(url, opts);
  });
  llamadas.length = 0;
});
afterEach(() => { globalThis.fetch = fetchOriginal; });

// Solo la fila de este test: en la base puede haber otras cuentas.
const miToken = (estado) => estado.tokens.find((t) => t.tipo === 'meta_ads' && t.cuenta_id === CUENTA);

describe('permisos', () => {
  it('sin meta_ads.app (soporte, o un admin, que ya no la trae): 403', async () => {
    for (const quien of ['soporte', 'adminDeCampus']) {
      const r = await request.get('/api/meta-ads/app').set(como(quien));
      expect(r.status, quien).toBe(403);
      const p = await request.put('/api/meta-ads/app').set(como(quien)).send({ app_id: APP_ID, app_secret: SECRETO });
      expect(p.status, quien).toBe(403);
    }
  });

  it('sin meta_ads.edit: 403 aunque tenga meta_ads.app', async () => {
    const r = await request.post('/api/meta-ads/app/renovar').set(como('sinEdit')).send({});
    expect(r.status).toBe(403);
  });

  it('un admin de un campus con meta_ads.app por excepción: 403, no ve los tokens de todos ni renueva', async () => {
    const r = await request.get('/api/meta-ads/app').set(como('adminConApp'));
    expect(r.status, JSON.stringify(r.body)).toBe(403);
    expect(r.body.code).toBe('FORBIDDEN');
    expect(r.body.data).toBeUndefined();
    const renovar = await request.post('/api/meta-ads/app/renovar').set(como('adminConApp')).send({});
    expect(renovar.status).toBe(403);
    expect(llamadas).toHaveLength(0); // no ha llegado a Meta
    const quitar = await request.delete('/api/meta-ads/app').set(como('adminConApp'));
    expect(quitar.status).toBe(403);
  });
});

describe('sin nada en el .env', () => {
  it('la tarjeta dice que no hay app y los ajustes son los de siempre', async () => {
    const r = await request.get('/api/meta-ads/app').set(como('admin'));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.app).toMatchObject({ configurada: false, origen: null, guardada: false });
    expect(r.body.data.ajustes.renovacion_activa).toMatchObject({ valor: false, origen: 'defecto' });
    expect(miToken(r.body.data)).toMatchObject({ estado: 'sin_revisar' });
  });

  it('valida en el servidor: un secreto mal copiado no se guarda', async () => {
    const r = await request.put('/api/meta-ads/app').set(como('admin')).send({ app_id: APP_ID, app_secret: 'corto' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/32 caracteres/);
  });

  it('«Probar» con un secreto malo lo explica en castellano', async () => {
    const r = await request.post('/api/meta-ads/app/probar').set(como('admin')).send({ app_id: APP_ID, app_secret: SECRETO_MALO });
    expect(r.status).toBe(200);
    expect(r.body.data.ok).toBe(false);
    expect(r.body.data.mensaje).toMatch(/Meta no acepta el secreto de la app/);
    expect(r.body.data.mensaje).not.toMatch(/validating/);
  });

  it('guarda el ID y el secreto cifrados, los prueba y no devuelve el secreto', async () => {
    const r = await request.put('/api/meta-ads/app').set(como('admin')).send({ app_id: APP_ID, app_secret: SECRETO });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain(SECRETO);
    expect(r.body.data.prueba.ok, r.body.data.prueba.mensaje).toBe(true);
    expect(r.body.data.estado.app).toMatchObject({
      configurada: true, origen: 'pantalla', guardada: true, app_id: APP_ID, secreto_cola: SECRETO.slice(-4),
    });
    expect(r.body.data.estado.app.ultima_prueba.ok).toBe(true);
    const fila = await one(`SELECT encrypted_value, metadata FROM api_credentials WHERE service = 'meta_app' AND active = true`);
    expect(fila.encrypted_value).not.toContain(SECRETO);
    expect(JSON.stringify(fila.metadata)).not.toContain(SECRETO);
    // Quién y qué, en el registro; nunca el valor.
    const log = await q(`SELECT action, details FROM user_activity_log WHERE user_id = $1 ORDER BY id`, [U.admin.id]);
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(['credencial.crear', 'credencial.probar']));
    expect(JSON.stringify(log)).not.toContain(SECRETO);
  });

  it('cambiar solo el ID deja el secreto guardado', async () => {
    const r = await request.put('/api/meta-ads/app').set(como('admin')).send({ app_id: APP_ID });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((await appEnUso()).appSecret).toBe(SECRETO);
  });

  it('«Renovar ahora» renueva el token que caduca pronto aunque la automática esté apagada', async () => {
    const r = await request.post('/api/meta-ads/app/renovar').set(como('admin')).send({});
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.resumen).toMatchObject({ a_mano: true });
    expect(r.body.data.resumen.renovadas).toBeGreaterThanOrEqual(1);
    const t = miToken(r.body.data.estado);
    expect(t.estado).toBe('ok');
    expect(new Date(t.expires_at).getTime()).toBeGreaterThan(Date.now() + 50 * DIA);
    expect(r.body.data.estado.ultima_vuelta.at).toBeTruthy();
    const { access_token_enc } = await one(`SELECT access_token_enc FROM meta_ad_accounts WHERE id = $1`, [CUENTA]);
    expect(unpackToken(access_token_enc)).toBe(TOKEN_NUEVO);
  });
});

describe('ajustes', () => {
  it('se guardan, dicen que salen de la pantalla y el aviso va antes que la renovación', async () => {
    const mal = await request.put('/api/meta-ads/app/ajustes').set(como('admin')).send({ renovar_dias: 5, aviso_dias: 7 });
    expect(mal.status).toBe(400);
    const r = await request.put('/api/meta-ads/app/ajustes').set(como('admin'))
      .send({ renovacion_activa: true, renovar_dias: 30, aviso_dias: 5, gasto_total_cada_horas: 24 });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.ajustes.renovacion_activa).toMatchObject({ valor: true, origen: 'pantalla' });
    expect(r.body.data.ajustes.renovar_dias).toMatchObject({ valor: 30, origen: 'pantalla' });
    expect(r.body.data.ajustes_cambiados_por).toBe(`${MARCA} admin`); // el superadmin
  });

  it('con null vuelven al del servidor, y si no hay, al de siempre', async () => {
    process.env.META_TOKENS_AVISO_DIAS = '9';
    try {
      const r = await request.put('/api/meta-ads/app/ajustes').set(como('admin'))
        .send({ renovacion_activa: null, renovar_dias: null, aviso_dias: null, gasto_total_cada_horas: null });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      const a = await leerAjustes();
      expect(a.aviso_dias).toEqual({ valor: 9, origen: 'servidor' });
      expect(a.renovar_dias).toEqual({ valor: 40, origen: 'defecto' });
    } finally {
      delete process.env.META_TOKENS_AVISO_DIAS;
    }
  });
});

describe('la reserva del .env', () => {
  it('la de la pantalla gana a la del servidor; quitada, se usa la del servidor', async () => {
    process.env.META_APP_ID = '999999';
    process.env.META_APP_SECRET = 'del-servidor';
    try {
      expect((await appEnUso()).origen).toBe('pantalla');
      const r = await request.delete('/api/meta-ads/app').set(como('admin'));
      expect(r.status).toBe(200);
      expect(r.body.data.app).toMatchObject({ configurada: true, origen: 'servidor', guardada: false, app_id: '999999' });
      expect(await appEnUso()).toMatchObject({ appId: '999999', origen: 'servidor' });
    } finally {
      delete process.env.META_APP_ID;
      delete process.env.META_APP_SECRET;
    }
  });

  it('sin ninguna, «Probar» dice dónde ponerla, sin nombres de variables', async () => {
    const r = await request.post('/api/meta-ads/app/probar').set(como('admin')).send({});
    expect(r.body.data.ok).toBe(false);
    expect(r.body.data.mensaje).toMatch(/Meta Ads › Configuración › App de Meta/);
    expect(r.body.data.mensaje).not.toMatch(/META_APP/);
  });
});

describe('explicarError', () => {
  it('traduce lo que más pasa', () => {
    expect(explicarError({ code: 'meta_101', message: 'Error validating application. Invalid application ID.' }, 'app')).toMatch(/no encuentra una app con ese ID/);
    expect(explicarError({ code: 'meta_190', message: 'Error validating access token' }, 'token')).toMatch(/token del campus ya no vale/);
    expect(explicarError({ code: 'network_error', message: 'fetch failed' })).toMatch(/fallo de red/);
    expect(explicarError({ code: 'meta_4', message: 'Application request limit reached' })).toMatch(/limitando/);
  });
});
