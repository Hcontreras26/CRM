import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

/**
 * Google Analytics (CRM#55) contra la base de verdad y con GA4 simulado (`fetch`
 * falso: nada sale a la red).
 *
 *   · la vuelta trae canales y páginas y los guarda por día (las rutas que solo
 *     difieren en mayúsculas o barra final se suman);
 *   · repetirla no duplica nada;
 *   · el embudo cruza sesiones con leads y ventas (venta = con cobro);
 *   · por página, los leads salen por su `landing_url`;
 *   · si Google falla, queda anotado y no se pierde lo que había.
 *
 *   npm run db:preparar && npx vitest run tests/googleAnalyticsBase55.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const ga = await import('../src/modules/google-analytics/google-analytics.service.js');
const { olvidarTokens } = await import('../src/modules/google-analytics/google-analytics.client.js');
const credenciales = await import('../src/modules/credentials/credentials.model.js');

const MARCA = `GA55${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
let P;
const ids = { leads: [], conversions: [] };

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const CRED = {
  property_id: '987654321',
  client_email: `${MARCA.toLowerCase()}@x.iam.gserviceaccount.com`,
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
};

const fila = (dims, mets) => ({
  dimensionValues: dims.map((value) => ({ value })),
  metricValues: mets.map((v) => ({ value: String(v) })),
});
const google = {
  canales: [
    fila(['20261120', 'Organic Search'], [10, 9, 7, 1]),
    fila(['20261120', 'Paid Social'], [5, 5, 5, 1]),
  ],
  paginas: [
    fila(['20261120', '/curso/duelo/'], [30, 25, 2]),
    fila(['20261120', '/Curso/Duelo'], [5, 5, 0]),
    fila(['20261120', '/'], [10, 9, 0]),
  ],
  falla: false,
};
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body });
let fetchOriginal;

async function lead(nombre, cuando, landing) {
  const [l] = await q(
    `INSERT INTO leads (project_id, nombre, created_at, fecha_solicitud, landing_url)
     VALUES ($1, $2, $3, $3, $4) RETURNING id`,
    [P, `${MARCA} ${nombre}`, cuando, landing]);
  ids.leads.push(l.id);
  return l.id;
}

beforeAll(async () => {
  [{ id: P }] = await q(
    `INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
    [`${MARCA} Campus`, MARCA.toLowerCase(), `${MARCA}-key`]);
  await credenciales.upsert({ project_id: P, service: ga.SERVICIO, value: JSON.stringify(CRED), entorno: 'produccion' });

  const vendido = await lead('vende', '2026-11-20 12:00+01', 'https://web.test/curso/duelo?utm_source=fb');
  await lead('no vende', '2026-11-20 18:00+01', 'https://web.test/curso/duelo/');
  await lead('otra', '2026-11-21 10:00+01', 'https://web.test/curso/otra');
  const [c] = await q(
    `INSERT INTO conversions (lead_id, project_id, producto_contratado, importe_total, importe_pagado, fecha_conversion)
     VALUES ($1, $2, 'curso', 300, 300, '2026-11-21') RETURNING id`, [vendido, P]);
  ids.conversions.push(c.id);
  await q(`INSERT INTO conversion_payments (conversion_id, importe, fecha) VALUES ($1, 300, '2026-11-21')`, [c.id]);
}, 60000);

afterAll(async () => {
  await q(`DELETE FROM conversion_payments WHERE conversion_id = ANY($1)`, [ids.conversions]);
  await q(`DELETE FROM conversions WHERE id = ANY($1)`, [ids.conversions]);
  await q(`DELETE FROM leads WHERE id = ANY($1)`, [ids.leads]);
  await q(`DELETE FROM api_credentials WHERE project_id = $1`, [P]);
  await q(`DELETE FROM projects WHERE id = $1`, [P]); // ga4_* caen en cascada
});

beforeEach(() => {
  olvidarTokens();
  google.falla = false;
  fetchOriginal = globalThis.fetch;
  globalThis.fetch = vi.fn(async (url, opts) => {
    if (url.startsWith('https://oauth2.googleapis.com/token')) return resp(200, { access_token: 'tok', expires_in: 3600 });
    if (url.includes(`/properties/${CRED.property_id}:runReport`)) {
      if (google.falla) return resp(403, { error: { message: 'User does not have sufficient permissions for this property.' } });
      const body = JSON.parse(opts.body);
      const rows = body.dimensions[1].name === 'landingPage' ? google.paginas : google.canales;
      return resp(200, { rowCount: rows.length, rows });
    }
    throw new Error(`llamada inesperada a ${url}`);
  });
});
afterEach(() => { globalThis.fetch = fetchOriginal; });

const AHORA = new Date('2026-11-21T12:00:00Z');

describe('Google Analytics por campus (CRM#55)', () => {
  it('sale en la lista de campus con GA4', async () => {
    expect((await ga.proyectosConGA4()).map((p) => p.project_id)).toContain(P);
  });

  it('la primera vuelta trae el histórico y guarda canales y páginas por día', async () => {
    const r = await ga.ponerAlDia(P, { ahora: AHORA });
    expect(r).toMatchObject({ ok: true, dias: ga.DIAS_HISTORICO, propertyId: CRED.property_id, canales: 2, paginas: 2 });

    const [estado] = await q(`SELECT * FROM ga4_sincronizacion WHERE project_id = $1`, [P]);
    expect(estado).toMatchObject({ property_id: CRED.property_id, last_status: 'ok', backfill_done: true, last_error: null });

    const pags = await q(
      `SELECT pagina, sesiones, usuarios, eventos_clave::float AS eventos FROM ga4_paginas_diarias
        WHERE project_id = $1 ORDER BY pagina`, [P]);
    expect(pags).toEqual([
      { pagina: '/', sesiones: 10, usuarios: 9, eventos: 0 },
      { pagina: '/curso/duelo', sesiones: 35, usuarios: 30, eventos: 2 },
    ]);
  });

  it('repetirla no duplica nada y la siguiente solo repasa los últimos días', async () => {
    const r = await ga.ponerAlDia(P, { ahora: AHORA });
    expect(r.dias).toBe(ga.DIAS_REPASO);
    const [{ s }] = await q(`SELECT SUM(sesiones)::int AS s FROM ga4_canales_diarios WHERE project_id = $1`, [P]);
    expect(s).toBe(15);
  });

  it('el embudo: sesiones → leads → ventas, y sin dato de GA4 es null, no cero', async () => {
    const e = await ga.embudo(P, '2026-11-20', '2026-11-21');
    expect(e.dias).toEqual([
      { fecha: '2026-11-20', sesiones: 15, usuarios: 14, eventos_clave: 2, leads: 2, ventas: 1 },
      { fecha: '2026-11-21', sesiones: null, usuarios: null, eventos_clave: null, leads: 1, ventas: 0 },
    ]);
    expect(e.total).toEqual({ sesiones: 15, leads: 3, ventas: 1, lead_por_sesion: 20, venta_por_lead: 33.33 });
    expect(e.canales.map((c) => [c.canal, c.sesiones])).toEqual([['Organic Search', 10], ['Paid Social', 5]]);
  });

  it('por página: los leads por su landing_url, también donde GA4 no tiene visitas', async () => {
    const p = await ga.paginas(P, '2026-11-20', '2026-11-21');
    expect(p).toEqual([
      { pagina: '/curso/duelo', sesiones: 35, usuarios: 30, eventos_clave: 2, leads: 2, ventas: 1, lead_por_sesion: 5.71 },
      { pagina: '/', sesiones: 10, usuarios: 9, eventos_clave: 0, leads: 0, ventas: 0, lead_por_sesion: 0 },
      { pagina: '/curso/otra', sesiones: 0, usuarios: 0, eventos_clave: 0, leads: 1, ventas: 0, lead_por_sesion: null },
    ]);
  });

  it('si Google falla, lo anota y no borra lo que ya había', async () => {
    google.falla = true;
    const r = await ga.ponerAlDia(P, { ahora: AHORA });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/sufficient permissions/);
    const [estado] = await q(`SELECT * FROM ga4_sincronizacion WHERE project_id = $1`, [P]);
    expect(estado).toMatchObject({ last_status: 'error', backfill_done: true });
    expect(estado.last_synced_at).not.toBeNull();
    const [{ s }] = await q(`SELECT SUM(sesiones)::int AS s FROM ga4_canales_diarios WHERE project_id = $1`, [P]);
    expect(s).toBe(15);
  });
});
