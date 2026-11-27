import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * «google_ads_campanas» en el MCP (#1195): lo que ya guardó la sincronización
 * de Google Ads (#54), por campus y periodo, con las MISMAS cifras que la
 * pantalla «Publicidad › Google Ads». Contra la base de verdad; nada va a
 * Google (aquí no hay ni `fetch`).
 *
 *   npx vitest run tests/mcpGoogleAds.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const { HERRAMIENTAS } = await import('../src/modules/mcp/mcp.tools.js');
const { construirAmbito } = await import('../src/modules/mcp/mcp.acceso.js');
const ads = await import('../src/modules/google-ads/google-ads.service.js');

const MARCA = `MGA${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const ids = { users: [], projects: [], leads: [], conversions: [] };
let P; let SIN_ADS; let SIN_DATOS; let OTRO; let ADMIN; let LAURA;
const herramienta = HERRAMIENTAS.find((h) => h.nombre === 'google_ads_campanas');
const ambito = (u, campus) => construirAmbito({ id: u.id, nombre: u.nombre, role: u.role, active: true },
  campus.map((c) => ({ id: c, nombre: `Campus ${c}`, sociedad_id: null, sociedad_nombre: null })));
const correr = (u, args = {}, campus = [P]) => herramienta.ejecutar(ambito(u, campus), { limite: 30, ...args });

const PERIODO = { desde: '2026-11-01', hasta: '2026-11-21' };
// Ids de Google al azar para no chocar con otra pasada.
const base = String(Date.now()).slice(-9);
const CUENTA = `3${base}`; const CUENTA_OTRO = `2${base}`;
const C1 = `7${base}`; const C2 = `8${base}`; const C3 = `9${base}`; const C_OTRO = `6${base}`;

const credencial = (projectId) => q(
  `INSERT INTO api_credentials (project_id, service, encrypted_value, iv, auth_tag, active) VALUES ($1, 'google_ads', 'x', 'x', 'x', true)`,
  [projectId]);

async function lead(nombre, cuando, campana) {
  const [l] = await q(
    `INSERT INTO leads (project_id, nombre, created_at, fecha_solicitud) VALUES ($1, $2, $3, $3) RETURNING id`,
    [P, `${MARCA} ${nombre}`, cuando]);
  await q(`INSERT INTO lead_utms (lead_id, canal_detectado, utm_source, utm_medium, utm_campaign) VALUES ($1, 'google_ads', 'google', 'cpc', $2)`, [l.id, campana]);
  ids.leads.push(l.id);
  return l.id;
}

beforeAll(async () => {
  const proy = async (c) => {
    const [p] = await q(`INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
      [`${MARCA} ${c}`, `${MARCA.toLowerCase()}-${c}`, `${MARCA}-key-${c}`]);
    ids.projects.push(p.id);
    return p.id;
  };
  P = await proy('a'); SIN_ADS = await proy('b'); SIN_DATOS = await proy('c'); OTRO = await proy('d');
  const persona = async (n, role) => {
    const [u] = await q(`INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, role, nombre`,
      [`${MARCA} ${n}`, `${n.toLowerCase()}@${MARCA.toLowerCase()}.test`, role]);
    ids.users.push(u.id);
    return u;
  };
  ADMIN = await persona('ADMIN', 'admin'); LAURA = await persona('LAURA', 'gestor');

  await credencial(P); await credencial(SIN_DATOS); await credencial(OTRO);
  await q(`INSERT INTO google_ads_cuentas (project_id, customer_id, nombre, moneda, last_synced_at, last_status, last_error, backfill_done)
           VALUES ($1, $2, $3, 'EUR', '2026-11-22T06:00:00Z', 'ok', NULL, true)`, [P, CUENTA, `${MARCA} cuenta`]);
  await q(`INSERT INTO google_ads_cuentas (project_id, customer_id, nombre, moneda, last_status, last_error)
           VALUES ($1, NULL, NULL, NULL, 'error', 'invalid_grant: el refresh_token de Ana García')`, [SIN_DATOS]);

  await q(`INSERT INTO google_ads_campanas (campaign_id, customer_id, project_id, nombre, estado, tipo, presupuesto_diario) VALUES
           ($1, $4, $5, $6, 'ENABLED', 'SEARCH', 20),
           ($2, $4, $5, $7, 'PAUSED', 'PERFORMANCE_MAX', NULL),
           ($3, $4, $5, $8, 'REMOVED', 'SEARCH', NULL)`,
  [C1, C2, C3, CUENTA, P, `${MARCA} Búsqueda duelo`, `${MARCA} PMax`, `${MARCA} Vieja`]);
  const dia = (campana, fecha, coste, imp, clics, conv, proyecto = P, cuenta = CUENTA) => q(
    `INSERT INTO google_ads_diario (nivel, elemento_id, fecha, campaign_id, customer_id, project_id, coste, impresiones, clics, conversiones)
     VALUES ('campana', $1, $2, $1, $3, $4, $5, $6, $7, $8)`, [campana, fecha, cuenta, proyecto, coste, imp, clics, conv]);
  await dia(C1, '2026-11-20', 100, 1000, 50, 2);
  await dia(C1, '2026-11-21', 50, 500, 25, 1);
  await dia(C2, '2026-11-20', 30, 300, 3, 0);
  await dia(C1, '2026-10-15', 999, 9999, 999, 9); // fuera del periodo

  // Lo de otro campus no se cuela.
  await q(`INSERT INTO google_ads_campanas (campaign_id, customer_id, project_id, nombre, estado) VALUES ($1, $2, $3, $4, 'ENABLED')`,
    [C_OTRO, CUENTA_OTRO, OTRO, `${MARCA} Ajena`]);
  await dia(C_OTRO, '2026-11-20', 7777, 1, 1, 0, OTRO, CUENTA_OTRO);

  // Dos prospectos de la campaña 1 (uno por id, otro por nombre) y uno vende con un cobro de 250.
  const vende = await lead('vende', '2026-11-20 12:00+01', C1);
  await lead('por nombre', '2026-11-21 12:00+01', `${MARCA} búsqueda DUELO`);
  const [c] = await q(
    `INSERT INTO conversions (lead_id, project_id, producto_contratado, importe_total, importe_pagado, fecha_conversion)
     VALUES ($1, $2, 'curso', 400, 400, '2026-11-21') RETURNING id`, [vende, P]);
  ids.conversions.push(c.id);
  await q(`INSERT INTO conversion_payments (conversion_id, importe, fecha) VALUES ($1, 250, '2026-11-21')`, [c.id]);
}, 60000);

afterAll(async () => {
  await q(`DELETE FROM user_permission_overrides WHERE user_id = ANY($1::int[])`, [ids.users]);
  await q(`DELETE FROM conversion_payments WHERE conversion_id = ANY($1)`, [ids.conversions]);
  await q(`DELETE FROM conversions WHERE id = ANY($1)`, [ids.conversions]);
  await q(`DELETE FROM leads WHERE id = ANY($1)`, [ids.leads]);
  await q(`DELETE FROM api_credentials WHERE project_id = ANY($1::int[])`, [ids.projects]);
  await q(`DELETE FROM users WHERE id = ANY($1::int[])`, [ids.users]);
  // google_ads_* caen con el campus (ON DELETE CASCADE).
  await q(`DELETE FROM projects WHERE id = ANY($1::int[])`, [ids.projects]);
  await pool.end();
}, 60000);

describe('google_ads_campanas', () => {
  it('las mismas cifras que la pantalla «Google Ads» (la función `campanas`)', async () => {
    const [r, pantalla] = await Promise.all([correr(ADMIN, PERIODO), ads.campanas(P, PERIODO.desde, PERIODO.hasta)]);
    expect(r).toMatchObject(PERIODO);
    const c = r.campus[0];
    expect(c).toMatchObject({ campus_id: P, ultimo_dia: '2026-11-21', cuenta: { customer_id: CUENTA, moneda: 'EUR' } });
    expect(c.total).toEqual(pantalla.total);
    expect(c.campanas).toEqual(pantalla.campanas);
    expect(c.total_campanas).toBe(pantalla.campanas.length);
  });

  it('gasto, clics, prospectos, ventas y coste por venta', async () => {
    const c = (await correr(ADMIN, PERIODO)).campus[0];
    expect(c.total).toMatchObject({ coste: 180, impresiones: 1800, clics: 78, leads: 2, ventas: 1, vendido: 400, cobrado: 250, coste_por_venta: 180, coste_por_lead: 90, retorno: 70 });
    expect(c.campanas.map((x) => x.campaign_id)).toEqual([C1, C2]); // la borrada sin gasto no sale
    expect(c.campanas[0]).toMatchObject({ coste: 150, clics: 75, ctr: 5, cpc: 2, conversiones_google: 3, leads: 2, ventas: 1, coste_por_venta: 150 });
    expect(c.aviso).toBeUndefined();
  });

  it('«limite» recorta las campañas; el total sigue siendo de todas', async () => {
    const c = (await correr(ADMIN, { ...PERIODO, limite: 1 })).campus[0];
    expect(c.campanas).toHaveLength(1);
    expect(c.total_campanas).toBe(2);
    expect(c.total.coste).toBe(180);
  });

  it('sin fechas, de hace 30 días a ayer, como la pantalla', () => {
    expect(ads.periodoPorDefecto({ ahora: new Date('2026-11-27T10:00:00Z') })).toEqual({ desde: '2026-10-28', hasta: '2026-11-26' });
    expect(ads.periodoPorDefecto({ desde: '2026-11-01', ahora: new Date('2026-11-27T10:00:00Z') })).toEqual({ desde: '2026-11-01', hasta: '2026-11-26' });
  });

  it('un campus sin Google Ads, o aún sin datos, lo dice; no sale como cero gastado', async () => {
    const r = await correr(ADMIN, PERIODO, [SIN_ADS, SIN_DATOS]);
    expect(r.campus[0]).toEqual({ campus_id: SIN_ADS, campus: `Campus ${SIN_ADS}`, aviso: 'sin Google Ads conectado' });
    expect(r.campus[1]).toMatchObject({ campus_id: SIN_DATOS, aviso: expect.stringContaining('aún no hay datos') });
    expect(r.campus[1].total).toBeUndefined();
    // El texto del error de Google (puede llevar nombres) no se le pasa a Claude.
    expect(JSON.stringify(r)).not.toMatch(/Ana García|invalid_grant/);
  });

  it('un periodo sin gasto ni prospectos también es un aviso, no ceros', async () => {
    const c = (await correr(ADMIN, { desde: '2026-09-01', hasta: '2026-09-30' })).campus[0];
    expect(c.aviso).toMatch(/sin gasto ni prospectos/);
    expect(c.total).toBeUndefined();
  });

  it('si los datos acaban antes que el periodo, o la sincronización falló, se avisa', async () => {
    expect((await correr(ADMIN, { desde: '2026-11-01', hasta: '2026-11-25' })).campus[0].aviso).toMatch(/último día guardado es 2026-11-21/);
    await q(`UPDATE google_ads_cuentas SET last_status = 'error' WHERE project_id = $1`, [P]);
    try {
      expect((await correr(ADMIN, PERIODO)).campus[0].aviso).toMatch(/falló/);
    } finally {
      await q(`UPDATE google_ads_cuentas SET last_status = 'ok' WHERE project_id = $1`, [P]);
    }
  });

  it('cada campus con lo suyo: lo de otro no se cuela', async () => {
    const r = await correr(ADMIN, PERIODO, [P, SIN_ADS]);
    expect(r.campus.map((c) => c.campus_id)).toEqual([P, SIN_ADS]);
    expect(r.campus[0].total.coste).toBe(180);
    expect(JSON.stringify(r)).not.toContain(C_OTRO);
  });

  it('sin datos personales: ni nombres de prospectos ni correos', async () => {
    const texto = JSON.stringify(await correr(ADMIN, PERIODO));
    expect(texto).not.toContain(`${MARCA} vende`);
    expect(texto).not.toContain(`${MARCA} por nombre`);
    expect(texto).not.toMatch(/@/);
  });

  it('un campus que no es suyo, 403', async () => {
    await expect(correr(ADMIN, { proyecto_id: OTRO })).rejects.toMatchObject({ code: 'MCP_FUERA_DE_AMBITO' });
  });

  it('sin «Ver Google Ads» (una gestora, de serie), 403', async () => {
    await expect(correr(LAURA, PERIODO)).rejects.toMatchObject({ code: 'MCP_SIN_PERMISO', statusCode: 403 });
  });

  it('con el permiso dado a la gestora, sí; y quitárselo cierra la puerta en la siguiente', async () => {
    const quitar = () => q(`DELETE FROM user_permission_overrides WHERE user_id = $1`, [LAURA.id]);
    try {
      await q(`INSERT INTO user_permission_overrides (user_id, resource, action, allowed) VALUES ($1, 'google_ads', 'view', true)`, [LAURA.id]);
      expect((await correr(LAURA, PERIODO)).campus[0].total.coste).toBe(180);
      await quitar();
      await expect(correr(LAURA, PERIODO)).rejects.toMatchObject({ code: 'MCP_SIN_PERMISO' });
    } finally {
      await quitar();
    }
  });

  it('un periodo al revés, o de más de 400 días, no da «0 de todo»', async () => {
    await expect(correr(ADMIN, { desde: '2026-11-21', hasta: '2026-11-01' })).rejects.toMatchObject({ code: 'MCP_PERIODO_AL_REVES' });
    await expect(correr(ADMIN, { desde: '2025-01-01', hasta: '2026-11-01' })).rejects.toMatchObject({ code: 'MCP_PERIODO_LARGO' });
  });
});
