import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

/**
 * Search Console (CRM#36) contra la base de verdad y con Google simulado
 * (`fetch` falso: nada sale a la red).
 *
 *   · la vuelta trae el sitio, las páginas y las búsquedas y los guarda por
 *     día (las URL que quedan en la misma ruta se suman, con la posición
 *     ponderada; los subdominios de país NO se mezclan);
 *   · revisa la indexación de las páginas de formación de la propiedad, y
 *     solo esas;
 *   · repetirla no duplica nada;
 *   · la lectura compara con el periodo anterior y marca las oportunidades;
 *   · si Google falla, queda anotado y no se pierde lo que había.
 *
 *   npm run db:preparar && npx vitest run tests/searchConsoleBase36.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const gsc = await import('../src/modules/search-console/search-console.service.js');
const { olvidarTokens } = await import('../src/modules/search-console/search-console.client.js');
const credenciales = await import('../src/modules/credentials/credentials.model.js');

const MARCA = `GSC36${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
let P;
const productos = {};

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const CRED = {
  site_url: 'sc-domain:psikoaprende.com',
  client_email: `${MARCA.toLowerCase()}@x.iam.gserviceaccount.com`,
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
};

const fila = (keys, clicks, impressions, position) => ({ keys, clicks, impressions, ctr: 0, position });
const google = {
  sitio: [
    fila(['2026-11-19'], 5, 100, 10),
    fila(['2026-11-20'], 20, 1000, 8),
  ],
  paginas: [
    fila(['2026-11-19', 'https://psikoaprende.com/curso/duelo'], 4, 80, 9),
    fila(['2026-11-20', 'https://psikoaprende.com/curso/duelo/'], 2, 400, 6),
    fila(['2026-11-20', 'https://www.psikoaprende.com/Curso/Duelo'], 1, 100, 9),
    fila(['2026-11-20', 'https://mx.psikoaprende.com/curso/duelo'], 15, 300, 4),
  ],
  consultas: [
    fila(['2026-11-19', 'master duelo'], 4, 50, 9),
    fila(['2026-11-20', 'master duelo'], 10, 300, 5),
    fila(['2026-11-20', 'curso duelo'], 3, 200, 7),
  ],
  falla: false,
};
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body });
let fetchOriginal;
let inspecciones;

beforeAll(async () => {
  [{ id: P }] = await q(
    `INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
    [`${MARCA} Campus`, MARCA.toLowerCase(), `${MARCA}-key`]);
  await credenciales.upsert({ project_id: P, service: gsc.SERVICIO, value: JSON.stringify(CRED), entorno: 'produccion' });

  const producto = async (clave, nombre, url, active = true) => {
    const [r] = await q(
      `INSERT INTO products (project_id, nombre, url_info, active) VALUES ($1, $2, $3, $4) RETURNING id`,
      [P, `${MARCA} ${nombre}`, url, active]);
    productos[clave] = r.id;
  };
  await producto('duelo', 'Máster en duelo', 'https://psikoaprende.com/curso/duelo/');
  await producto('dueloMx', 'Maestría en duelo', 'https://mx.psikoaprende.com/curso/duelo');
  await producto('fuera', 'De otra web', 'https://otraweb.com/curso');
  await producto('inactivo', 'Ya no se vende', 'https://psikoaprende.com/curso/viejo', false);
}, 60000);

afterAll(async () => {
  await q(`DELETE FROM api_credentials WHERE project_id = $1`, [P]);
  await q(`DELETE FROM products WHERE project_id = $1`, [P]);
  await q(`DELETE FROM projects WHERE id = $1`, [P]); // gsc_* caen en cascada
});

beforeEach(() => {
  olvidarTokens();
  google.falla = false;
  inspecciones = [];
  fetchOriginal = globalThis.fetch;
  globalThis.fetch = vi.fn(async (url, opts) => {
    if (url.startsWith('https://oauth2.googleapis.com/token')) return resp(200, { access_token: 'tok', expires_in: 3600 });
    if (google.falla) return resp(403, { error: { message: "User does not have sufficient permission for site 'sc-domain:psikoaprende.com'." } });
    const body = JSON.parse(opts.body);
    if (url.includes('/searchAnalytics/query')) {
      const d = body.dimensions.join(',');
      const rows = d === 'date' ? google.sitio : d === 'date,page' ? google.paginas : google.consultas;
      return resp(200, { rows: body.startRow === 0 ? rows : [] });
    }
    if (url.includes('urlInspection/index:inspect')) {
      inspecciones.push(body.inspectionUrl);
      const indexada = body.inspectionUrl.includes('://mx.');
      return resp(200, { inspectionResult: { indexStatusResult: indexada
        ? { verdict: 'PASS', coverageState: 'Submitted and indexed', lastCrawlTime: '2026-11-18T10:00:00Z' }
        : { verdict: 'NEUTRAL', coverageState: 'Crawled - currently not indexed' } } });
    }
    throw new Error(`llamada inesperada a ${url}`);
  });
});
afterEach(() => { globalThis.fetch = fetchOriginal; });

const AHORA = new Date('2026-11-21T12:00:00Z');

describe('Search Console por campus (CRM#36)', () => {
  it('sale en la lista de campus con Search Console', async () => {
    expect((await gsc.proyectosConGSC()).map((p) => p.project_id)).toContain(P);
  });

  it('la primera vuelta trae el histórico y guarda sitio, páginas y búsquedas por día', async () => {
    const r = await gsc.ponerAlDia(P, { ahora: AHORA });
    expect(r).toMatchObject({
      ok: true, dias: gsc.DIAS_HISTORICO, siteUrl: 'sc-domain:psikoaprende.com',
      dias_con_datos: 2, paginas: 3, consultas: 3,
      indexacion: { revisadas: 2, errores: 0, fuera: 1 },
    });

    const [estado] = await q(`SELECT * FROM gsc_sincronizacion WHERE project_id = $1`, [P]);
    expect(estado).toMatchObject({ site_url: 'sc-domain:psikoaprende.com', last_status: 'ok', backfill_done: true, last_error: null });
    expect(estado.indexacion_at).not.toBeNull();

    const pags = await q(
      `SELECT host, ruta, clics, impresiones, posicion_suma::float AS ps FROM gsc_paginas_diarias
        WHERE project_id = $1 AND fecha = '2026-11-20' ORDER BY host`, [P]);
    expect(pags).toEqual([
      { host: 'mx.psikoaprende.com', ruta: '/curso/duelo', clics: 15, impresiones: 300, ps: 1200 },
      // las dos URL de psikoaprende.com quedan en una: 2·400·… → 6·400 + 9·100
      { host: 'psikoaprende.com', ruta: '/curso/duelo', clics: 3, impresiones: 500, ps: 3300 },
    ]);
  });

  it('solo inspecciona las páginas de formación activas de la propiedad', async () => {
    const filas = await q(`SELECT url, product_id, veredicto, cobertura FROM gsc_indexacion WHERE project_id = $1 ORDER BY url`, [P]);
    expect(filas).toEqual([
      { url: 'https://mx.psikoaprende.com/curso/duelo', product_id: productos.dueloMx, veredicto: 'PASS', cobertura: 'Submitted and indexed' },
      { url: 'https://psikoaprende.com/curso/duelo/', product_id: productos.duelo, veredicto: 'NEUTRAL', cobertura: 'Crawled - currently not indexed' },
    ]);
  });

  it('repetirla no duplica nada, solo repasa los últimos días y no vuelve a inspeccionar en el día', async () => {
    const r = await gsc.ponerAlDia(P, { ahora: AHORA });
    expect(r).toMatchObject({ ok: true, dias: gsc.DIAS_REPASO, indexacion: null });
    expect(inspecciones).toEqual([]);
    const [{ c }] = await q(`SELECT SUM(clics)::int AS c FROM gsc_diario WHERE project_id = $1`, [P]);
    expect(c).toBe(25);
  });

  it('el resumen: totales, el periodo anterior y la serie por día', async () => {
    const r = await gsc.resumen(P, '2026-11-20', '2026-11-21');
    expect(r.total).toEqual({ clics: 20, impresiones: 1000, ctr: 2, posicion: 8, dias: 1 });
    expect(r.anterior).toEqual({ desde: '2026-11-18', hasta: '2026-11-19', clics: 5, impresiones: 100, ctr: 5, posicion: 10, dias: 1 });
    expect(r.ultimo_dia).toBe('2026-11-20');
    expect(r.dias).toEqual([
      { fecha: '2026-11-20', clics: 20, impresiones: 1000, ctr: 2, posicion: 8 },
      { fecha: '2026-11-21', clics: null, impresiones: null, ctr: null, posicion: null },
    ]);
  });

  it('las búsquedas, con sus clics del periodo anterior', async () => {
    expect(await gsc.consultas(P, '2026-11-20', '2026-11-20')).toEqual([
      { consulta: 'master duelo', clics: 10, impresiones: 300, ctr: 3.33, posicion: 5, clics_antes: 4 },
      { consulta: 'curso duelo', clics: 3, impresiones: 200, ctr: 1.5, posicion: 7, clics_antes: null },
    ]);
    expect((await gsc.consultas(P, '2026-11-20', '2026-11-20', { buscar: 'curso' })).map((c) => c.consulta)).toEqual(['curso duelo']);
  });

  it('las páginas: oportunidad, indexación y cada subdominio por su lado', async () => {
    const p = await gsc.paginas(P, '2026-11-20', '2026-11-20');
    expect(p.ctr_medio).toBe(2);
    expect(p.filas).toEqual([
      {
        host: 'psikoaprende.com', ruta: '/curso/duelo', clics: 3, impresiones: 500, ctr: 0.6, posicion: 6.6, clics_antes: 4,
        indexacion: { veredicto: 'NEUTRAL', cobertura: 'Crawled - currently not indexed' }, oportunidad: true,
      },
      {
        host: 'mx.psikoaprende.com', ruta: '/curso/duelo', clics: 15, impresiones: 300, ctr: 5, posicion: 4, clics_antes: null,
        indexacion: { veredicto: 'PASS', cobertura: 'Submitted and indexed' }, oportunidad: false,
      },
    ]);
  });

  it('la indexación: primero las que no están, con el nombre de la formación', async () => {
    const i = await gsc.indexacion(P);
    expect(i).toMatchObject({ indexadas: 1, no_indexadas: 1, errores: 0 });
    expect(i.paginas[0]).toMatchObject({ url: 'https://psikoaprende.com/curso/duelo/', producto: `${MARCA} Máster en duelo`, veredicto: 'NEUTRAL' });
  });

  it('si Google falla, lo anota y no borra lo que ya había', async () => {
    google.falla = true;
    const r = await gsc.ponerAlDia(P, { ahora: AHORA });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/sufficient permission/);
    const [estado] = await q(`SELECT * FROM gsc_sincronizacion WHERE project_id = $1`, [P]);
    expect(estado).toMatchObject({ last_status: 'error', backfill_done: true });
    expect(estado.last_synced_at).not.toBeNull();
    const [{ c }] = await q(`SELECT SUM(clics)::int AS c FROM gsc_diario WHERE project_id = $1`, [P]);
    expect(c).toBe(25);
  });
});
