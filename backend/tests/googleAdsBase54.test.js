import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * Google Ads (CRM#54) contra la base de verdad y con Google simulado (`buscarImpl`
 * falso: nada sale a la red).
 *
 *   · la vuelta guarda la cuenta, las campañas y el gasto por día de campañas,
 *     grupos y anuncios; repetirla no duplica nada;
 *   · las campañas cruzan con los prospectos por `utm_campaign` (id o nombre) y
 *     con las ventas con cobro: coste por venta;
 *   · una campaña se puede apuntar a otro campus;
 *   · «¿Dónde ponemos el dinero?» (#56) ya tiene el gasto de Google;
 *   · si Google falla, queda anotado y no se pierde lo que había;
 *   · filas repetidas en una tanda se suman (un anuncio en dos grupos son dos);
 *   · una cuenta va en un solo campus: el segundo que la pega no la sincroniza,
 *     salvo que el primero ya no tenga la credencial activa.
 *
 *   npm run db:preparar && npx vitest run tests/googleAdsBase54.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const ads = await import('../src/modules/google-ads/google-ads.service.js');
const { dineroPorCanal } = await import('../src/modules/reports/dondePonerElDinero.js');
const credenciales = await import('../src/modules/credentials/credentials.model.js');

const MARCA = `GA54${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
let P; let OTRO;
const ids = { leads: [], conversions: [] };
// Ids de Google al azar para no chocar con otra pasada.
const base = String(Date.now()).slice(-9);
// La cuenta también al azar: la vuelta reescribe el tramo de SU cuenta.
const CUENTA = `3${base}`;
const C1 = `7${base}`; const C2 = `8${base}`; const G1 = `5${base}`; const G2 = `6${base}`; const A1 = `4${base}`;

const metricas = (coste, imp, clics) => ({ costMicros: String(coste * 1e6), impressions: String(imp), clicks: String(clics), conversions: 1, conversionsValue: 0 });
const google = { falla: false, repetidas: false };
async function buscarFalso(_cred, gaql) {
  if (google.falla) throw new Error('Google Ads: User doesn\'t have permission to access customer.');
  if (gaql.includes('FROM customer')) return [{ customer: { id: CUENTA, descriptiveName: `${MARCA} cuenta`, currencyCode: 'EUR', timeZone: 'Europe/Madrid' } }];
  if (gaql.includes('FROM campaign WHERE campaign.status')) {
    return [
      { campaign: { id: C1, name: `${MARCA} Búsqueda duelo`, status: 'ENABLED', advertisingChannelType: 'SEARCH' }, campaignBudget: { amountMicros: '20000000' } },
      { campaign: { id: C2, name: `${MARCA} PMax`, status: 'PAUSED', advertisingChannelType: 'PERFORMANCE_MAX' } },
    ];
  }
  if (gaql.includes('FROM campaign WHERE segments.date')) {
    return [
      { campaign: { id: C1, name: `${MARCA} Búsqueda duelo` }, segments: { date: '2026-11-20' }, metrics: metricas(100, 1000, 50) },
      { campaign: { id: C1, name: `${MARCA} Búsqueda duelo` }, segments: { date: '2026-11-21' }, metrics: metricas(50, 500, 25) },
      { campaign: { id: C2, name: `${MARCA} PMax` }, segments: { date: '2026-11-20' }, metrics: metricas(30, 300, 3) },
    ];
  }
  if (gaql.includes('FROM ad_group WHERE')) {
    return [{ campaign: { id: C1 }, adGroup: { id: G1, name: 'Duelo exacta' }, segments: { date: '2026-11-20' }, metrics: metricas(100, 1000, 50) }];
  }
  if (gaql.includes('FROM ad_group_ad')) {
    const fila = (g, coste) => ({ campaign: { id: C1 }, adGroup: { id: g }, adGroupAd: { ad: { id: A1, name: null, type: 'RESPONSIVE_SEARCH_AD' } }, segments: { date: '2026-11-20' }, metrics: metricas(coste, 100, 5) });
    // El mismo anuncio en dos grupos, y una fila repetida tal cual.
    if (google.repetidas) return [fila(G1, 60), fila(G1, 40), fila(G2, 25)];
    return [{ campaign: { id: C1 }, adGroup: { id: G1 }, adGroupAd: { ad: { id: A1, name: null, type: 'RESPONSIVE_SEARCH_AD' } }, segments: { date: '2026-11-20' }, metrics: metricas(100, 1000, 50) }];
  }
  throw new Error(`consulta inesperada: ${gaql}`);
}
const ahora = new Date('2026-11-22T10:00:00Z');

async function lead(nombre, cuando, campana, proyecto = P) {
  const [l] = await q(
    `INSERT INTO leads (project_id, nombre, created_at, fecha_solicitud) VALUES ($1, $2, $3, $3) RETURNING id`,
    [proyecto, `${MARCA} ${nombre}`, cuando]);
  await q(`INSERT INTO lead_utms (lead_id, canal_detectado, utm_source, utm_medium, utm_campaign) VALUES ($1, 'google_ads', 'google', 'cpc', $2)`, [l.id, campana]);
  ids.leads.push(l.id);
  return l.id;
}

beforeAll(async () => {
  [{ id: P }] = await q(`INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
    [`${MARCA} Campus`, MARCA.toLowerCase(), `${MARCA}-key`]);
  [{ id: OTRO }] = await q(`INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
    [`${MARCA} Otro`, `${MARCA.toLowerCase()}-otro`, `${MARCA}-key2`]);
  await credenciales.upsert({
    project_id: P, service: ads.SERVICIO, entorno: 'produccion',
    value: JSON.stringify({ refresh_token: '1//x', customer_id: CUENTA }),
  });

  // Dos prospectos de la campaña 1 (uno por id, otro por nombre) y uno vende.
  const vende = await lead('vende', '2026-11-20 12:00+01', C1);
  await lead('por nombre', '2026-11-21 12:00+01', `${MARCA} búsqueda DUELO`);
  const [c] = await q(
    `INSERT INTO conversions (lead_id, project_id, producto_contratado, importe_total, importe_pagado, fecha_conversion)
     VALUES ($1, $2, 'curso', 400, 400, '2026-11-21') RETURNING id`, [vende, P]);
  ids.conversions.push(c.id);
  await q(`INSERT INTO conversion_payments (conversion_id, importe, fecha) VALUES ($1, 250, '2026-11-21')`, [c.id]);
}, 60000);

afterAll(async () => {
  await q(`DELETE FROM conversion_payments WHERE conversion_id = ANY($1)`, [ids.conversions]);
  await q(`DELETE FROM conversions WHERE id = ANY($1)`, [ids.conversions]);
  await q(`DELETE FROM leads WHERE id = ANY($1)`, [ids.leads]);
  await q(`DELETE FROM api_credentials WHERE project_id = $1`, [P]);
  await q(`DELETE FROM google_ads_diario WHERE project_id = ANY($1)`, [[P, OTRO]]);
  await q(`DELETE FROM google_ads_campanas WHERE campaign_id = ANY($1)`, [[C1, C2]]);
  await q(`DELETE FROM projects WHERE id = ANY($1)`, [[P, OTRO]]);
});

describe('Google Ads contra la base', () => {
  it('la primera vuelta trae 90 días y guarda cuenta, campañas y gasto por nivel', async () => {
    const r = await ads.ponerAlDia(P, { ahora, buscarImpl: buscarFalso });
    expect(r.ok).toBe(true);
    expect(r.desde).toBe('2026-08-24');
    const [cuenta] = await q(`SELECT * FROM google_ads_cuentas WHERE project_id = $1`, [P]);
    expect(cuenta).toMatchObject({ customer_id: CUENTA, moneda: 'EUR', last_status: 'ok', backfill_done: true });
    const niveles = await q(`SELECT nivel, COUNT(*)::int n, SUM(coste)::float coste FROM google_ads_diario WHERE customer_id = $2 AND campaign_id = ANY($1) GROUP BY nivel ORDER BY nivel`, [[C1, C2], CUENTA]);
    expect(niveles).toEqual([
      { nivel: 'anuncio', n: 1, coste: 100 },
      { nivel: 'campana', n: 3, coste: 180 },
      { nivel: 'grupo', n: 1, coste: 100 },
    ]);
  });

  it('repetirla no duplica nada y la segunda solo repasa los últimos días', async () => {
    const r = await ads.ponerAlDia(P, { ahora, buscarImpl: buscarFalso });
    expect(r.desde).toBe('2026-11-15');
    const [{ n }] = await q(`SELECT COUNT(*)::int n FROM google_ads_diario WHERE campaign_id = ANY($1)`, [[C1, C2]]);
    expect(n).toBe(5);
  });

  it('cada campaña con su gasto, sus prospectos (por id y por nombre) y su coste por venta', async () => {
    const d = await ads.campanas(P, '2026-11-01', '2026-11-30');
    const c1 = d.campanas.find((c) => c.campaign_id === C1);
    expect(c1).toMatchObject({ coste: 150, clics: 75, leads: 2, ventas: 1, cobrado: 250, coste_por_lead: 75, coste_por_venta: 150, retorno: 100, presupuesto_diario: 20 });
    expect(d.total).toMatchObject({ coste: 180, leads: 2, ventas: 1, coste_por_venta: 180 });
    const grupos = await ads.grupos(P, C1, '2026-11-01', '2026-11-30');
    expect(grupos).toHaveLength(1);
    expect(grupos[0].anuncios).toHaveLength(1);
    expect(grupos[0].anuncios[0].nombre).toBe('RESPONSIVE_SEARCH_AD');
  });

  it('«¿Dónde ponemos el dinero?» ya tiene el gasto de Google, con los prospectos por nombre juntos', async () => {
    const r = await dineroPorCanal({ projectId: P, from: '2026-11-01', to: '2026-11-30' });
    const g = r.canales.find((c) => c.canal === 'google_ads');
    expect(g).toMatchObject({ tiene_gasto: true, gasto: 180, leads: 2, ventas: 1, coste_por_venta: 180 });
    const c1 = g.campanas.find((c) => c.campana === C1);
    expect(c1).toMatchObject({ gasto: 150, leads: 2, ventas: 1, nombre: `${MARCA} Búsqueda duelo` });
    expect(r.gasto_completo).toBe(true);
  });

  it('una campaña se apunta a otro campus y vuelve', async () => {
    await ads.asignarCampus(P, C2, OTRO, null);
    expect((await ads.campanas(OTRO, '2026-11-01', '2026-11-30')).campanas.map((c) => c.campaign_id)).toEqual([C2]);
    expect((await ads.campanas(P, '2026-11-01', '2026-11-30')).total.coste).toBe(150);
    await expect(ads.grupos(P, C2, '2026-11-01', '2026-11-30')).rejects.toThrow(/no encontrada/);
    await ads.asignarCampus(OTRO, C2, null, null);
    expect((await ads.campanas(P, '2026-11-01', '2026-11-30')).total.coste).toBe(180);
  });

  it('si Google falla, queda anotado y no se pierde lo que había', async () => {
    google.falla = true;
    const r = await ads.ponerAlDia(P, { ahora, buscarImpl: buscarFalso });
    google.falla = false;
    expect(r.ok).toBe(false);
    const [cuenta] = await q(`SELECT last_status, last_error FROM google_ads_cuentas WHERE project_id = $1`, [P]);
    expect(cuenta.last_status).toBe('error');
    expect(cuenta.last_error).toMatch(/permission/);
    expect((await ads.campanas(P, '2026-11-01', '2026-11-30')).total.coste).toBe(180);
  });

  it('filas repetidas en la tanda se suman y un anuncio en dos grupos son dos filas', async () => {
    google.repetidas = true;
    const r = await ads.ponerAlDia(P, { ahora, buscarImpl: buscarFalso });
    google.repetidas = false;
    expect(r).toMatchObject({ ok: true });
    const filas = await q(
      `SELECT ad_group_id, coste::float coste, clics::int clics FROM google_ads_diario
        WHERE nivel = 'anuncio' AND elemento_id = $1 ORDER BY ad_group_id`, [A1]);
    expect(filas).toEqual([{ ad_group_id: G1, coste: 100, clics: 10 }, { ad_group_id: G2, coste: 25, clics: 5 }]);
    // Vuelve a lo de siempre para las pruebas de después.
    expect((await ads.ponerAlDia(P, { ahora, buscarImpl: buscarFalso })).ok).toBe(true);
  });

  it('una cuenta va en un solo campus: el segundo que la pega no la sincroniza ni pisa al primero', async () => {
    await credenciales.upsert({
      project_id: OTRO, service: ads.SERVICIO, entorno: 'produccion',
      value: JSON.stringify({ refresh_token: '1//y', customer_id: CUENTA }),
    });
    expect(await ads.campusConLaCuenta(CUENTA, OTRO)).toMatchObject({ project_id: P });
    expect(await ads.campusConLaCuenta(CUENTA, P)).toBeNull();
    const r = await ads.ponerAlDia(OTRO, { ahora, buscarImpl: buscarFalso });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ya está en el campus/);
    const [{ n }] = await q(`SELECT COUNT(*)::int n FROM google_ads_campanas WHERE campaign_id = ANY($1) AND project_id = $2`, [[C1, C2], P]);
    expect(n).toBe(2);
    expect((await ads.campanas(P, '2026-11-01', '2026-11-30')).total.coste).toBe(180);
    await q(`DELETE FROM api_credentials WHERE project_id = $1`, [OTRO]);
    await q(`DELETE FROM google_ads_cuentas WHERE project_id = $1`, [OTRO]);
  });

  it('si la cuenta se quita del primer campus, el segundo ya puede usarla (no queda bloqueada)', async () => {
    // google_ads_cuentas de P sigue ahí; lo que cuenta es la credencial activa.
    await q(`UPDATE api_credentials SET active = false WHERE project_id = $1 AND service = $2`, [P, ads.SERVICIO]);
    try {
      expect(await ads.campusConLaCuenta(CUENTA, OTRO)).toBeNull();
    } finally {
      await q(`UPDATE api_credentials SET active = true WHERE project_id = $1 AND service = $2`, [P, ads.SERVICIO]);
    }
    expect(await ads.campusConLaCuenta(CUENTA, OTRO)).toMatchObject({ project_id: P });
  });

  it('sin `customer_id` en la credencial lo dice', async () => {
    await credenciales.upsert({ project_id: OTRO, service: ads.SERVICIO, entorno: 'produccion', value: '1//solo-token' });
    const r = await ads.ponerAlDia(OTRO, { ahora, buscarImpl: buscarFalso });
    expect(r).toMatchObject({ ok: false });
    expect(r.error).toMatch(/customer_id/);
    await q(`DELETE FROM api_credentials WHERE project_id = $1`, [OTRO]);
  });
});
