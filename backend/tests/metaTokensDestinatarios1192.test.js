import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

/**
 * A quién llega el aviso de los tokens de Meta (CRM#1192), contra la base de
 * verdad y con la Graph API simulada (nada sale a la red):
 *
 *   · a quien puede VOLVER A CONECTAR la cuenta de ESE campus (alcance + el
 *     permiso `meta_ads.edit`), no a todos los admin;
 *   · un admin de otro campus no lo recibe; uno del campus al que se le ha
 *     quitado el permiso, tampoco; una gestora con el permiso por excepción, sí;
 *   · si en el campus no hay nadie, no se avisa a los de otros campus; y sin
 *     nadie a quien avisar, no se da por avisado (se reintenta);
 *   · se mantienen «un aviso por fallo» y «uno por fecha de caducidad».
 *
 *   npm run db:preparar && npx vitest run tests/metaTokensDestinatarios1192.test.js
 */

const correos = vi.hoisted(() => ({ sendEmail: vi.fn(async () => ({ sent: true })) }));
vi.mock('../src/shared/services/brevo.service.js', async (original) => ({ ...(await original()), ...correos }));

const { default: pool } = await import('../src/shared/config/db.js');
const { vuelta, quienPuedeReconectar, TIPO_AVISO, _internals } = await import('../src/jobs/metaTokensScheduler.js');
const { packToken } = await import('../src/modules/meta-ads/meta-ads.service.js');

const MARCA = `TOK1192${Date.now().toString(36)}`;
const DIA = 86400 * 1000;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const correoDe = (clave) => `${clave}.${MARCA}@prueba.test`.toLowerCase();

let P;
let OTRO;
let VACIO;
const u = {};
const cuentas = {};

const resp = (status, body) => ({ ok: status < 400, status, json: async () => body });
const graph = { debug: null, cambio: null };
let fetchOriginal;

const debugQueCaduca = (enDias) => () => resp(200, {
  data: { is_valid: true, expires_at: Math.floor((Date.now() + enDias * DIA) / 1000) },
});
const falla = () => resp(400, { error: { message: 'Error validating access token: session invalidated', code: 190 } });

const avisosDe = (cuentaId, motivo) => q(
  `SELECT * FROM admin_notifications
    WHERE type = $1 AND metadata->>'tipo' = 'meta_ads' AND metadata->>'cuenta_id' = $2
      AND ($3::text IS NULL OR metadata->>'motivo' = $3)
    ORDER BY id`,
  [TIPO_AVISO, String(cuentaId), motivo ?? null]
);
const correosDe = (cuentaId, motivo) => correos.sendEmail.mock.calls
  .filter(([a]) => String(a.clave || '').startsWith(`meta-token-${motivo}-meta_ads-${cuentaId}-`))
  .map(([a]) => a);

beforeAll(async () => {
  const campus = async (n) => (await q(
    `INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
    [`${MARCA} ${n}`, `${MARCA}-${n}`.toLowerCase(), `${MARCA}-${n}-key`]))[0].id;
  P = await campus('uno');
  OTRO = await campus('dos');
  VACIO = await campus('tres');

  const usuario = async (clave, role, projectId) => {
    const [r] = await q(
      `INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id`,
      [`${MARCA} ${clave}`, correoDe(clave), role]);
    if (projectId) await q(`INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)`, [r.id, projectId]);
    u[clave] = r.id;
  };
  const excepcion = (clave, allowed) => q(
    `INSERT INTO user_permission_overrides (user_id, resource, action, allowed) VALUES ($1, 'meta_ads', 'edit', $2)`,
    [u[clave], allowed]);

  await usuario('admin', 'admin', P);
  await usuario('adminOtro', 'admin', OTRO);
  await usuario('adminSinPermiso', 'admin', P);
  await excepcion('adminSinPermiso', false);
  await usuario('gestora', 'gestor', P);
  await usuario('gestoraConPermiso', 'gestor', P);
  await excepcion('gestoraConPermiso', true);
  // En el campus «tres» solo hay un admin sin el permiso: nadie puede reconectar.
  await usuario('adminVacioSinPermiso', 'admin', VACIO);
  await excepcion('adminVacioSinPermiso', false);
}, 60000);

afterAll(async () => {
  const campus = [P, OTRO, VACIO];
  await q(`DELETE FROM admin_notifications WHERE type = $1 AND metadata->>'project_id' = ANY($2::text[])`,
    [TIPO_AVISO, campus.map(String)]);
  await q(`DELETE FROM meta_tokens_renovacion WHERE project_id = ANY($1::int[])`, [campus]);
  await q(`DELETE FROM meta_ad_accounts WHERE project_id = ANY($1::int[])`, [campus]);
  await q(`DELETE FROM user_permission_overrides WHERE user_id = ANY($1::int[])`, [Object.values(u)]);
  await q(`DELETE FROM user_projects WHERE user_id = ANY($1::int[])`, [Object.values(u)]);
  await q(`DELETE FROM users WHERE id = ANY($1::int[])`, [Object.values(u)]);
  await q(`DELETE FROM projects WHERE id = ANY($1::int[])`, [campus]);
  await pool.end();
});

beforeEach(async () => {
  process.env.META_TOKENS_RENOVACION_ACTIVA = '1';
  process.env.META_APP_ID = 'app-de-prueba';
  process.env.META_APP_SECRET = 'secreto-de-prueba';
  correos.sendEmail.mockClear();
  fetchOriginal = globalThis.fetch;
  globalThis.fetch = vi.fn(async (url) => {
    const x = new URL(url);
    if (x.pathname.endsWith('/debug_token')) return graph.debug();
    if (x.pathname.endsWith('/oauth/access_token')) return graph.cambio();
    throw new Error(`llamada inesperada a ${x.hostname}${x.pathname}`);
  });
  // Una cuenta nueva por campus en cada prueba: el estado y los avisos empiezan de cero.
  for (const id of [P, OTRO, VACIO]) {
    await q(`DELETE FROM meta_tokens_renovacion WHERE project_id = $1`, [id]);
    await q(`DELETE FROM meta_ad_accounts WHERE project_id = $1`, [id]);
    [{ id: cuentas[id] }] = await q(
      `INSERT INTO meta_ad_accounts (project_id, ad_account_id, access_token_enc, ad_account_nombre)
       VALUES ($1, $2, $3, 'Cuenta de prueba') RETURNING id`,
      [id, `act_${MARCA}_${id}`, packToken(`token-de-prueba-${id}-000000000000`)]);
  }
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env.META_TOKENS_RENOVACION_ACTIVA;
  delete process.env.META_APP_ID;
  delete process.env.META_APP_SECRET;
});

describe('a quién llega el aviso de un token de Meta (#1192)', () => {
  it('quienPuedeReconectar: el alcance del campus y, de ahí, quien tiene meta_ads.edit', async () => {
    const ids = (await quienPuedeReconectar(P)).map((d) => d.id);
    expect(ids).toContain(u.admin);
    expect(ids).toContain(u.gestoraConPermiso);
    expect(ids).not.toContain(u.adminOtro);
    expect(ids).not.toContain(u.adminSinPermiso);
    expect(ids).not.toContain(u.gestora);
    expect(ids).not.toContain(u.adminVacioSinPermiso);
  });

  it('si la renovación falla: campana y correo solo a quien puede reconectarla en ese campus, una vez', async () => {
    graph.debug = debugQueCaduca(20);
    graph.cambio = falla;

    await vuelta({ proyectoId: P });
    await vuelta({ proyectoId: P });

    const campana = await avisosDe(cuentas[P], 'fallo');
    expect(campana).toHaveLength(1);
    const para = campana[0].target_user_ids;
    expect(para).toContain(u.admin);
    expect(para).toContain(u.gestoraConPermiso);
    expect(para).not.toContain(u.adminOtro);
    expect(para).not.toContain(u.adminSinPermiso);
    expect(para).not.toContain(u.gestora);

    const enviados = correosDe(cuentas[P], 'fallo');
    expect(enviados).toHaveLength(1);
    const to = enviados[0].to.split(',');
    expect(to).toContain(correoDe('admin'));
    expect(to).toContain(correoDe('gestoraConPermiso'));
    expect(to).not.toContain(correoDe('adminOtro'));
    expect(to).not.toContain(correoDe('adminSinPermiso'));
    expect(to).not.toContain(correoDe('gestora'));

    // Sin datos personales en el aviso: ni correos ni nombres de quien lo recibe.
    const texto = `${campana[0].title} ${campana[0].message} ${JSON.stringify(campana[0].metadata)}`;
    expect(texto).not.toContain('@');
    expect(texto).not.toContain(`${MARCA} admin`);
  });

  it('a punto de caducar: un aviso por fecha, a los mismos', async () => {
    graph.cambio = () => resp(200, { access_token: 'token-de-prueba-nuevo-1111111111' });
    // Meta no alarga el token: la fecha se queda igual.
    const fecha = Math.floor((Date.now() + 3 * DIA) / 1000);
    graph.debug = () => resp(200, { data: { is_valid: true, expires_at: fecha } });

    await vuelta({ proyectoId: P });
    await vuelta({ proyectoId: P });

    const campana = await avisosDe(cuentas[P], 'caduca');
    expect(campana).toHaveLength(1);
    expect(campana[0].target_user_ids).toContain(u.admin);
    expect(campana[0].target_user_ids).not.toContain(u.adminOtro);
    expect(campana[0].target_user_ids).not.toContain(u.adminSinPermiso);
    expect(correosDe(cuentas[P], 'caduca')).toHaveLength(1);
  });

  it('en un campus donde nadie del campus puede reconectarla, no llega a los admin de otros', async () => {
    graph.debug = debugQueCaduca(20);
    graph.cambio = falla;

    await vuelta({ proyectoId: VACIO });
    // Solo quien ve todos los campus (super admin o soporte con el permiso), si lo hay.
    const globales = (await q(
      `SELECT id FROM users WHERE active AND role IN ('superadmin', 'soporte')`)).map((r) => r.id);
    for (const n of await avisosDe(cuentas[VACIO])) {
      for (const id of n.target_user_ids) expect(globales).toContain(id);
      expect(n.target_user_ids).not.toContain(u.admin);
      expect(n.target_user_ids).not.toContain(u.adminOtro);
      expect(n.target_user_ids).not.toContain(u.adminVacioSinPermiso);
    }
  });

  it('sin nadie a quien avisar no se manda nada ni se da por avisado (se reintenta)', async () => {
    graph.debug = debugQueCaduca(3);
    graph.cambio = falla;
    const [cuenta] = await q(
      `SELECT a.id, a.project_id, a.access_token_enc FROM meta_ad_accounts a WHERE a.id = $1`, [cuentas[VACIO]]);

    const r = await _internals.revisarCuenta({
      tipo: 'meta_ads', id: cuenta.id, project_id: cuenta.project_id, nombre: 'Cuenta de prueba',
      tokenCifrado: cuenta.access_token_enc, expiresAtGuardada: null, proyecto: null,
    }, new Date(), []);
    expect(r).toMatchObject({ ok: false, avisos: [] });
    expect(await avisosDe(cuentas[VACIO])).toHaveLength(0);
    expect(correos.sendEmail).not.toHaveBeenCalled();
    const e = await _internals.leerEstado('meta_ads', cuentas[VACIO]);
    expect(e.aviso_fallo_at).toBeNull();
    expect(e.aviso_caduca_para).toBeNull();
  });
});
