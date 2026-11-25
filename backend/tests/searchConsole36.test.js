import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Search Console (CRM#36). Sin base y sin red: la credencial, la propiedad,
 * `searchAnalytics.query` paginado y la inspección de URL (con `fetch` falso),
 * cómo se parte una URL para cruzarla con GA4, la media de posición ponderada,
 * el periodo anterior y qué es una «oportunidad».
 *
 *   npx vitest run tests/searchConsole36.test.js
 */

const cliente = await import('../src/modules/search-console/search-console.client.js');
const servicio = await import('../src/modules/search-console/search-console.service.js');
const { SERVICIOS } = await import('../src/modules/credentials/credentials.validation.js');
const { CLAVES } = await import('../src/modules/permissions/catalogo.js');

const {
  leerCredencial, normalizarSitio, analitica, inspeccionar, probarCredencial, olvidarTokens,
  partirUrl, esDelSitio, FILAS_POR_PETICION,
} = cliente;
const { agrupar, periodoAnterior, esOportunidad, syncActivo } = servicio;

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const CRED = {
  type: 'service_account',
  site_url: 'sc-domain:psikoaprende.com',
  client_email: 'crm@proyecto.iam.gserviceaccount.com',
  private_key: PEM,
};

describe('la credencial', () => {
  it('lee el JSON de la cuenta de servicio con site_url', () => {
    const c = leerCredencial(JSON.stringify(CRED));
    expect(c).toMatchObject({ siteUrl: 'sc-domain:psikoaprende.com', clientEmail: CRED.client_email });
    expect(c.privateKey).toBe(PEM);
  });

  it('sin site_url vale la propiedad de la ficha del campus (projects.gsc_property)', () => {
    const { site_url, ...sinSitio } = CRED;
    expect(leerCredencial(sinSitio, 'https://Fonoaprende.com').siteUrl).toBe('https://fonoaprende.com/');
    expect(() => leerCredencial(sinSitio)).toThrow(/site_url/);
  });

  it('dice qué falta o qué está mal', () => {
    expect(() => leerCredencial('no es json')).toThrow(/JSON válido/);
    expect(() => leerCredencial({ site_url: 'sc-domain:a.com' })).toThrow(/client_email, private_key/);
    expect(() => leerCredencial({ ...CRED, site_url: 'psikoaprende.com' })).toThrow(/sc-domain/);
  });

  it('la propiedad, como la nombra Search Console', () => {
    expect(normalizarSitio('sc-domain:PsikoAprende.com')).toBe('sc-domain:psikoaprende.com');
    expect(normalizarSitio('https://mx.psikoaprende.com')).toBe('https://mx.psikoaprende.com/');
    expect(normalizarSitio('https://web.com/blog')).toBe('https://web.com/blog/');
    expect(normalizarSitio('web.com')).toBeNull();
  });

  it('el servicio «gsc» se puede guardar en Claves', () => {
    expect(SERVICIOS).toContain('gsc');
  });

  it('el permiso está en el catálogo, con ver y sincronizar', () => {
    expect(CLAVES.has('search_console.view')).toBe(true);
    expect(CLAVES.has('search_console.edit')).toBe(true);
  });
});

describe('la API', () => {
  const resp = (status, body) => ({ ok: status < 400, status, json: async () => body });
  let fetchOriginal;
  let llamadas;

  beforeEach(() => {
    olvidarTokens();
    llamadas = [];
    fetchOriginal = globalThis.fetch;
  });
  afterEach(() => { globalThis.fetch = fetchOriginal; });

  function fetchFalso({ token = () => resp(200, { access_token: 'tok', expires_in: 3600 }), consulta = () => resp(200, {}), inspeccion = () => resp(200, {}) }) {
    globalThis.fetch = vi.fn(async (url, opts) => {
      const esToken = url.startsWith('https://oauth2.googleapis.com/token');
      llamadas.push({ url, body: opts?.body && !esToken ? JSON.parse(opts.body) : null });
      if (url.startsWith('https://oauth2.googleapis.com/token')) return token(opts);
      if (url.includes('/searchAnalytics/query')) return consulta(JSON.parse(opts.body));
      if (url.includes('urlInspection/index:inspect')) return inspeccion(JSON.parse(opts.body));
      throw new Error(`llamada inesperada a ${url}`);
    });
  }

  it('pide solo lectura de Search Console con la cuenta de servicio', async () => {
    fetchFalso({ consulta: () => resp(200, { rows: [] }) });
    await analitica(leerCredencial(CRED), { desde: '2026-11-01', hasta: '2026-11-02', dimensiones: ['date'] });
    const cuerpoToken = globalThis.fetch.mock.calls[0][1].body;
    const jwt = new URLSearchParams(cuerpoToken.toString()).get('assertion');
    const [cab, cuerpo, firma] = jwt.split('.');
    expect(crypto.verify('RSA-SHA256', Buffer.from(`${cab}.${cuerpo}`), publicKey, Buffer.from(firma, 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(cuerpo, 'base64url').toString()).scope)
      .toBe('https://www.googleapis.com/auth/webmasters.readonly');
  });

  it('pagina de 25.000 en 25.000 y deja las filas planas', async () => {
    const fila = (i) => ({ keys: ['2026-11-20', `consulta ${i}`], clicks: 1, impressions: 10, ctr: 0.1, position: 3.5 });
    fetchFalso({
      consulta: (b) => resp(200, { rows: b.startRow === 0 ? Array.from({ length: FILAS_POR_PETICION }, (_, i) => fila(i)) : [fila('última')] }),
    });
    const filas = await analitica(leerCredencial(CRED), { desde: '2026-11-20', hasta: '2026-11-20', dimensiones: ['date', 'query'] });
    expect(filas).toHaveLength(FILAS_POR_PETICION + 1);
    expect(filas.at(-1)).toEqual({ date: '2026-11-20', query: 'consulta última', clics: 1, impresiones: 10, posicion: 3.5 });
    const consultas = llamadas.filter((l) => l.url.includes('/searchAnalytics/query'));
    expect(consultas.map((l) => l.body.startRow)).toEqual([0, FILAS_POR_PETICION]);
    expect(consultas[0].url).toContain(`/sites/${encodeURIComponent('sc-domain:psikoaprende.com')}/`);
    expect(consultas[0].body).toMatchObject({ type: 'web', dataState: 'all', dimensions: ['date', 'query'] });
  });

  it('la inspección de URL devuelve el veredicto y por qué', async () => {
    fetchFalso({
      inspeccion: (b) => {
        expect(b).toEqual({ inspectionUrl: 'https://psikoaprende.com/curso/duelo/', siteUrl: 'sc-domain:psikoaprende.com', languageCode: 'es' });
        return resp(200, { inspectionResult: { indexStatusResult: { verdict: 'NEUTRAL', coverageState: 'Crawled - currently not indexed', lastCrawlTime: '2026-11-10T08:00:00Z' } } });
      },
    });
    expect(await inspeccionar(leerCredencial(CRED), 'https://psikoaprende.com/curso/duelo/')).toEqual({
      veredicto: 'NEUTRAL', cobertura: 'Crawled - currently not indexed', ultimoRastreo: '2026-11-10T08:00:00Z',
    });
  });

  it('«Probar» dice si la cuenta no es usuaria de la propiedad, sin lanzar', async () => {
    fetchFalso({ consulta: () => resp(403, { error: { message: "User does not have sufficient permission for site 'sc-domain:psikoaprende.com'." } }) });
    const r = await probarCredencial(JSON.stringify(CRED));
    expect(r.result).toBe('failed');
    expect(r.message).toMatch(/sufficient permission/);
  });

  it('«Probar» dice si Google rechaza la cuenta de servicio', async () => {
    fetchFalso({ token: () => resp(400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }) });
    expect(await probarCredencial(JSON.stringify(CRED)))
      .toEqual({ result: 'failed', message: 'Google no acepta la cuenta de servicio: Invalid JWT Signature.' });
  });

  it('«Probar» va bien con acceso y mira una semana con datos', async () => {
    fetchFalso({ consulta: () => resp(200, { rows: [{ keys: [], clicks: 412, impressions: 9000, ctr: 0.04, position: 12 }] }) });
    const r = await probarCredencial(JSON.stringify(CRED), null, new Date('2026-11-25T10:00:00Z'));
    expect(r).toEqual({ result: 'ok', message: 'Acceso a sc-domain:psikoaprende.com: 412 clics en la última semana con datos.' });
    expect(llamadas.at(-1).body).toMatchObject({ startDate: '2026-11-16', endDate: '2026-11-22' });
  });
});

describe('la URL', () => {
  it('se parte en dominio (sin www) y la misma ruta que GA4', () => {
    expect(partirUrl('https://WWW.PsikoAprende.com/Curso/Duelo/?utm_source=fb#form')).toEqual({ host: 'psikoaprende.com', ruta: '/curso/duelo' });
    expect(partirUrl('https://mx.psikoaprende.com/')).toEqual({ host: 'mx.psikoaprende.com', ruta: '/' });
  });

  it('solo se inspeccionan las de la propiedad', () => {
    expect(esDelSitio('https://mx.psikoaprende.com/curso', 'sc-domain:psikoaprende.com')).toBe(true);
    expect(esDelSitio('https://psikoaprende.com/curso', 'sc-domain:psikoaprende.com')).toBe(true);
    expect(esDelSitio('https://fonoaprende.com/curso', 'sc-domain:psikoaprende.com')).toBe(false);
    expect(esDelSitio('https://falsopsikoaprende.com/', 'sc-domain:psikoaprende.com')).toBe(false);
    expect(esDelSitio('https://web.com/blog/x', 'https://web.com/blog/')).toBe(true);
    expect(esDelSitio('https://web.com/otra', 'https://web.com/blog/')).toBe(false);
    expect(esDelSitio('no es url', 'sc-domain:web.com')).toBe(false);
  });
});

describe('las cuentas', () => {
  it('suma lo que cae en la misma clave y pondera la posición por impresiones', () => {
    const g = agrupar([
      { k: 'a', clics: 1, impresiones: 10, posicion: 2 },
      { k: 'a', clics: 3, impresiones: 30, posicion: 6 },
      { k: 'b', clics: 0, impresiones: 5, posicion: 40 },
      { k: null, clics: 9, impresiones: 9, posicion: 1 },
    ], (f) => (f.k ? [f.k] : null));
    expect(g).toEqual([
      { k: ['a'], clics: 4, impresiones: 40, posicion_suma: 200 }, // media: 5, no (2+6)/2 = 4
      { k: ['b'], clics: 0, impresiones: 5, posicion_suma: 200 },
    ]);
  });

  it('el periodo anterior tiene la misma longitud y acaba el día antes', () => {
    expect(periodoAnterior('2026-11-01', '2026-11-28')).toEqual({ desde: '2026-10-04', hasta: '2026-10-31' });
    expect(periodoAnterior('2026-03-01', '2026-03-01')).toEqual({ desde: '2026-02-28', hasta: '2026-02-28' });
  });

  it('oportunidad: muchas impresiones, en las dos primeras páginas y la mitad del CTR medio', () => {
    const p = { impresiones: 500, posicion: 8, ctr: 1 };
    expect(esOportunidad(p, 4)).toBe(true);
    expect(esOportunidad({ ...p, ctr: 2.5 }, 4)).toBe(false); // no está tan por debajo
    expect(esOportunidad({ ...p, impresiones: 99 }, 4)).toBe(false); // poca muestra
    expect(esOportunidad({ ...p, posicion: 35 }, 4)).toBe(false); // el problema es la posición
    expect(esOportunidad(p, null)).toBe(false);
  });
});

describe('el interruptor', () => {
  const antes = process.env.GSC_SYNC_ACTIVO;
  afterEach(() => { if (antes === undefined) delete process.env.GSC_SYNC_ACTIVO; else process.env.GSC_SYNC_ACTIVO = antes; });

  it('está apagado de serie', () => {
    delete process.env.GSC_SYNC_ACTIVO;
    expect(syncActivo()).toBe(false);
    process.env.GSC_SYNC_ACTIVO = '1';
    expect(syncActivo()).toBe(true);
  });
});
