import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * Google Ads (CRM#54), lo que no necesita base: la credencial, el cliente de la
 * API (cabeceras, páginas, errores) y las consultas.
 *
 *   npx vitest run tests/googleAds54.test.js
 */

const { leerCredencialGoogleAds } = await import('../src/shared/services/googleAds.service.js');
const { credencialParaDatos, buscar, consultas, deMicros } = await import('../src/modules/google-ads/google-ads.client.js');

const ENV = { ...process.env };
beforeEach(() => {
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'dev-tok';
  delete process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
});
afterEach(() => { process.env = { ...ENV }; });

describe('la credencial «google_ads»', () => {
  it('acepta el token solo, como hasta ahora', () => {
    expect(leerCredencialGoogleAds('1//abc')).toEqual({ refreshToken: '1//abc', customerId: null, loginCustomerId: null, error: null });
  });

  it('acepta el JSON con la cuenta y quita los guiones', () => {
    const c = leerCredencialGoogleAds('{"refresh_token":"1//abc","customer_id":"123-456-7890","login_customer_id":"111-222-3333"}');
    expect(c).toMatchObject({ refreshToken: '1//abc', customerId: '1234567890', loginCustomerId: '1112223333', error: null });
  });

  it('un JSON roto no lanza: lo dice', () => {
    expect(leerCredencialGoogleAds('{roto').error).toMatch(/JSON/);
  });

  it('para traer datos hace falta la cuenta, y lo dice', () => {
    expect(() => credencialParaDatos('1//abc')).toThrow(/customer_id/);
    expect(() => credencialParaDatos('{"customer_id":"1"}')).toThrow(/refresh_token/);
  });

  it('la MCC del servidor vale para todos si la credencial no trae la suya', () => {
    process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = '999-000-1111';
    expect(credencialParaDatos('{"refresh_token":"x","customer_id":"1"}').loginCustomerId).toBe('9990001111');
    expect(credencialParaDatos('{"refresh_token":"x","customer_id":"1","login_customer_id":"5"}').loginCustomerId).toBe('5');
  });
});

describe('el cliente de la API', () => {
  const cred = { refreshToken: 'x', customerId: '1234567890', loginCustomerId: '555' };

  it('manda developer token, login-customer-id y recorre todas las páginas', async () => {
    const llamadas = [];
    const paginas = [
      { results: [{ campaign: { id: '1' } }], nextPageToken: 'p2' },
      { results: [{ campaign: { id: '2' } }] },
    ];
    const fetchImpl = async (url, init) => {
      llamadas.push({ url, init });
      return { ok: true, status: 200, json: async () => paginas[llamadas.length - 1] };
    };
    const filas = await buscar(cred, 'SELECT campaign.id FROM campaign', { fetchImpl, token: 'acc' });
    expect(filas.map((f) => f.campaign.id)).toEqual(['1', '2']);
    expect(llamadas).toHaveLength(2);
    expect(llamadas[0].url).toMatch(/\/customers\/1234567890\/googleAds:search$/);
    expect(llamadas[0].init.headers).toMatchObject({ Authorization: 'Bearer acc', 'developer-token': 'dev-tok', 'login-customer-id': '555' });
    expect(JSON.parse(llamadas[1].init.body).pageToken).toBe('p2');
  });

  it('un error de Google sale con su mensaje, no con «HTTP 400»', async () => {
    const fetchImpl = async () => ({
      ok: false, status: 403,
      json: async () => ({ error: { message: 'The caller does not have permission', details: [{ errors: [{ message: 'User doesn\'t have permission to access customer.' }] }] } }),
    });
    await expect(buscar(cred, 'SELECT', { fetchImpl, token: 'a' })).rejects.toThrow(/permission to access customer/);
  });

  it('sin developer token no llama a Google', async () => {
    delete process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
    let llamado = false;
    await expect(buscar(cred, 'SELECT', { fetchImpl: async () => { llamado = true; }, token: 'a' })).rejects.toThrow(/DEVELOPER_TOKEN/);
    expect(llamado).toBe(false);
  });
});

describe('las consultas', () => {
  it('las fechas se validan antes de ir al GAQL', () => {
    expect(() => consultas("2026-01-01' OR 1=1", '2026-01-02')).toThrow(/AAAA-MM-DD/);
    expect(consultas('2026-11-01', '2026-11-07').diarioCampanas).toContain("segments.date BETWEEN '2026-11-01' AND '2026-11-07'");
  });

  it('GAQL no tiene OR: ninguna consulta lo usa', () => {
    for (const q of Object.values(consultas('2026-11-01', '2026-11-07'))) expect(q).not.toMatch(/\bOR\b/);
  });

  it('los micros pasan a moneda con dos decimales', () => {
    expect(deMicros('12345678')).toBe(12.35);
    expect(deMicros(null)).toBe(0);
  });
});
