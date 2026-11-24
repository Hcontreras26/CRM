import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Google Analytics: lo que pasa antes del lead (CRM#55). Sin base y sin red:
 * la credencial, el JWT de la cuenta de servicio, el `runReport` paginado
 * (con `fetch` falso) y la ruta de página con la que se cruza con los leads.
 *
 *   npx vitest run tests/googleAnalytics55.test.js
 */

const {
  leerCredencial, firmarJwt, informe, probarCredencial, olvidarTokens, fechaGa,
} = await import('../src/modules/google-analytics/google-analytics.client.js');
const { normalizarRuta, syncActivo } = await import('../src/modules/google-analytics/google-analytics.service.js');
const { SERVICIOS } = await import('../src/modules/credentials/credentials.validation.js');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
const CRED = {
  type: 'service_account',
  property_id: '123456789',
  client_email: 'crm@proyecto.iam.gserviceaccount.com',
  private_key: PEM,
};

describe('la credencial', () => {
  it('lee el JSON de la cuenta de servicio con property_id', () => {
    const c = leerCredencial(JSON.stringify(CRED));
    expect(c).toMatchObject({ propertyId: '123456789', clientEmail: CRED.client_email });
    expect(c.privateKey).toContain('BEGIN PRIVATE KEY');
  });

  it('acepta «properties/123» y los \\n escritos a mano en la clave', () => {
    const c = leerCredencial({ ...CRED, property_id: 'properties/42', private_key: PEM.replace(/\n/g, '\\n') });
    expect(c.propertyId).toBe('42');
    expect(c.privateKey).toBe(PEM);
  });

  it('dice qué falta o qué está mal', () => {
    expect(() => leerCredencial('no es json')).toThrow(/JSON válido/);
    expect(() => leerCredencial({ client_email: 'x' })).toThrow(/property_id, private_key/);
    expect(() => leerCredencial({ ...CRED, property_id: 'G-ABC123' })).toThrow(/número de la propiedad/);
  });

  it('el servicio se puede guardar en Claves', () => {
    expect(SERVICIOS).toContain('google_analytics');
  });
});

describe('el JWT', () => {
  it('va firmado con la clave de la cuenta de servicio y pide solo lectura', () => {
    const jwt = firmarJwt(leerCredencial(CRED), Date.UTC(2026, 10, 24));
    const [cab, cuerpo, firma] = jwt.split('.');
    expect(crypto.verify('RSA-SHA256', Buffer.from(`${cab}.${cuerpo}`), publicKey, Buffer.from(firma, 'base64url'))).toBe(true);
    const c = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
    expect(c).toMatchObject({ iss: CRED.client_email, scope: 'https://www.googleapis.com/auth/analytics.readonly' });
    expect(c.exp - c.iat).toBe(3600);
  });
});

describe('runReport', () => {
  const resp = (status, body) => ({ ok: status < 400, status, json: async () => body });
  let fetchOriginal;
  let llamadas;

  beforeEach(() => {
    olvidarTokens();
    llamadas = [];
    fetchOriginal = globalThis.fetch;
  });
  afterEach(() => { globalThis.fetch = fetchOriginal; });

  function fetchFalso({ token = () => resp(200, { access_token: 'tok', expires_in: 3600 }), informe: inf }) {
    globalThis.fetch = vi.fn(async (url, opts) => {
      llamadas.push({ url, body: opts?.body });
      if (url.startsWith('https://oauth2.googleapis.com/token')) return token();
      if (url.includes(':runReport')) return inf(JSON.parse(opts.body), opts.headers);
      throw new Error(`llamada inesperada a ${url}`);
    });
  }

  it('pagina hasta traer todas las filas y las deja planas', async () => {
    const todas = [
      { dimensionValues: [{ value: '20261120' }, { value: 'Organic Search' }], metricValues: [{ value: '10' }, { value: '2' }] },
      { dimensionValues: [{ value: '20261120' }, { value: 'Paid Social' }], metricValues: [{ value: '5' }, { value: '1' }] },
      { dimensionValues: [{ value: '20261121' }, { value: 'Direct' }], metricValues: [{ value: '3' }, { value: '0' }] },
    ];
    fetchFalso({
      informe: (body, headers) => {
        expect(headers.Authorization).toBe('Bearer tok');
        return resp(200, { rowCount: 3, rows: todas.slice(body.offset, body.offset + 2) });
      },
    });
    const filas = await informe(leerCredencial(CRED), {
      desde: '2026-11-20', hasta: '2026-11-21', dimensiones: ['date', 'sessionDefaultChannelGroup'], metricas: ['sessions', 'keyEvents'], limite: 2,
    });
    expect(filas).toEqual([
      { date: '20261120', sessionDefaultChannelGroup: 'Organic Search', sessions: 10, keyEvents: 2 },
      { date: '20261120', sessionDefaultChannelGroup: 'Paid Social', sessions: 5, keyEvents: 1 },
      { date: '20261121', sessionDefaultChannelGroup: 'Direct', sessions: 3, keyEvents: 0 },
    ]);
    expect(llamadas.filter((l) => l.url.includes(':runReport'))).toHaveLength(2);
    expect(llamadas[1].url).toContain('/properties/123456789:runReport');
  });

  it('reutiliza el token mientras vale', async () => {
    fetchFalso({ informe: () => resp(200, { rowCount: 0 }) });
    const c = leerCredencial(CRED);
    await informe(c, { desde: 'yesterday', hasta: 'yesterday', dimensiones: [], metricas: ['sessions'] });
    await informe(c, { desde: 'yesterday', hasta: 'yesterday', dimensiones: [], metricas: ['sessions'] });
    expect(llamadas.filter((l) => l.url.includes('oauth2'))).toHaveLength(1);
  });

  it('«Probar» dice si la cuenta no tiene acceso a la propiedad, sin lanzar', async () => {
    fetchFalso({ informe: () => resp(403, { error: { message: 'User does not have sufficient permissions for this property.' } }) });
    const r = await probarCredencial(JSON.stringify(CRED));
    expect(r.result).toBe('failed');
    expect(r.message).toMatch(/sufficient permissions/);
  });

  it('«Probar» dice si Google rechaza la cuenta de servicio', async () => {
    fetchFalso({ token: () => resp(400, { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' }), informe: () => resp(200, {}) });
    const r = await probarCredencial(JSON.stringify(CRED));
    expect(r).toEqual({ result: 'failed', message: 'Google no acepta la cuenta de servicio: Invalid JWT Signature.' });
  });

  it('«Probar» va bien con acceso', async () => {
    fetchFalso({ informe: () => resp(200, { rowCount: 1, rows: [{ dimensionValues: [], metricValues: [{ value: '87' }] }] }) });
    expect(await probarCredencial(JSON.stringify(CRED))).toEqual({ result: 'ok', message: 'Acceso a la propiedad 123456789: 87 sesiones ayer.' });
  });
});

describe('la ruta de la página', () => {
  it('es la misma venga de GA4 o de leads.landing_url', () => {
    expect(normalizarRuta('https://psikoaprende.com/curso/Duelo/?utm_source=fb#form')).toBe('/curso/duelo');
    expect(normalizarRuta('/curso/duelo/')).toBe('/curso/duelo');
    expect(normalizarRuta('https://psikoaprende.com')).toBe('/');
    expect(normalizarRuta('/')).toBe('/');
    expect(normalizarRuta('')).toBeNull();
  });

  it('la fecha de GA4 pasa a ISO', () => {
    expect(fechaGa('20261124')).toBe('2026-11-24');
  });
});

describe('el interruptor', () => {
  const antes = process.env.GA4_SYNC_ACTIVO;
  afterEach(() => { process.env.GA4_SYNC_ACTIVO = antes; });

  it('está apagado de serie', () => {
    delete process.env.GA4_SYNC_ACTIVO;
    expect(syncActivo()).toBe(false);
    process.env.GA4_SYNC_ACTIVO = '1';
    expect(syncActivo()).toBe(true);
  });
});
