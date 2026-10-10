import { describe, it, expect, vi, beforeEach } from 'vitest';

// Revisión de la PR #293 (#202, Diana), 10/10: lo que se arregló antes de montarla.

const guardados = [];
vi.mock('../src/shared/services/localStorage.service.js', () => ({
  saveLocal: vi.fn(async (k, b) => { guardados.push({ k, b }); return k; }),
  // Como el de verdad: { buffer, size }.
  getLocal: vi.fn(async () => ({ buffer: Buffer.from('%PDF-1.4'), size: 8 })),
}));
const subidosR2 = [];
vi.mock('../src/shared/services/r2.service.js', () => ({ uploadToR2: vi.fn(async (k) => { subidosR2.push(k); }) }));
vi.mock('../src/shared/utils/presignedUrl.js', () => ({ generatePresignedUrl: vi.fn(async (k) => `https://r2.example/${k}?firmado`) }));
const llamadas = [];
vi.mock('../src/modules/facturas-colaborador/facturas.service.js', () => ({
  prepararYMandar: vi.fn(async (p) => { llamadas.push(['preparar', p]); return { preparados: 0, mandados: 0 }; }),
  recordar: vi.fn(async (p) => { llamadas.push(['recordar', p]); return { recordados: 0 }; }),
}));
vi.mock('../src/jobs/latido.js', () => ({ vigilar: vi.fn() }));

const almacen = await import('../src/modules/facturas-colaborador/almacen.js');
const { facturasColaboradorActivas, tareasActivas } = await import('../src/shared/config/soloEnPruebas.js');
const { runFacturasColaborador } = await import('../src/jobs/facturasColaboradorJob.js');

beforeEach(() => {
  guardados.length = 0; subidosR2.length = 0; llamadas.length = 0;
  process.env.JWT_SECRET = 'secreto-de-prueba-para-firmar';
  process.env.CRM_BASE_URL = 'https://360crm.tech/testeo';
  delete process.env.CLOUDFLARE_R2_ACCOUNT_ID; delete process.env.CLOUDFLARE_R2_ACCESS_KEY; delete process.env.CLOUDFLARE_R2_BUCKET;
});

describe('sin R2, el archivo va al disco del servidor (antes: 500 al subir)', () => {
  it('guarda en disco con el prefijo «local:» y no llama a R2', async () => {
    const k = await almacen.guardar('facturas-colaborador/2026-09/7-abcd/f.pdf', Buffer.from('x'), 'application/pdf');
    expect(k).toBe('local:facturas-colaborador/2026-09/7-abcd/f.pdf');
    expect(guardados).toHaveLength(1);
    expect(subidosR2).toHaveLength(0);
  });
  it('con R2 configurado, va a R2 como antes', async () => {
    Object.assign(process.env, { CLOUDFLARE_R2_ACCOUNT_ID: 'cuenta', CLOUDFLARE_R2_ACCESS_KEY: 'clave', CLOUDFLARE_R2_BUCKET: 'cubo' });
    const k = await almacen.guardar('a/b.pdf', Buffer.from('x'), 'application/pdf');
    expect(k).toBe('a/b.pdf');
    expect(subidosR2).toEqual(['a/b.pdf']);
  });
  it('la descarga de lo guardado en disco: enlace firmado a la propia API, que caduca a los 15 min', async () => {
    const url = await almacen.urlDeDescarga(7, 'local:a/b.pdf');
    expect(url).toMatch(/^\/facturas-colaborador\/archivo-local\/7\?exp=\d+&sig=/);
    const u = new URL(url, 'https://ejemplo.invalid/api');
    const exp = u.searchParams.get('exp'); const sig = u.searchParams.get('sig');
    expect(almacen.firmaValida(7, exp, sig)).toBe(true);
    expect(almacen.firmaValida(8, exp, sig)).toBe(false); // otra factura
    expect(almacen.firmaValida(7, exp, sig + 'x')).toBe(false); // firma tocada
    expect(almacen.firmaValida(7, exp, sig, (Number(exp) + 1) * 1000)).toBe(false); // caducado
  });
  it('leer lo guardado en disco devuelve el contenido del archivo, no el objeto', async () => {
    const b = await almacen.leerLocal('local:a/b.pdf');
    expect(Buffer.isBuffer(b)).toBe(true);
    expect(b.toString()).toBe('%PDF-1.4');
  });
  it('lo que está en R2 sigue con su enlace firmado de R2', async () => {
    expect(await almacen.urlDeDescarga(7, 'a/b.pdf')).toBe('https://r2.example/a/b.pdf?firmado');
  });
});

describe('solo en pruebas también en el servidor (antes: la API y la tarea iban también en producción)', () => {
  it('en producción no, salvo que se apruebe con su interruptor; en /testeo y en local, sí', () => {
    expect(facturasColaboradorActivas({ NODE_ENV: 'production', CRM_BASE_URL: 'https://360crm.tech/crm' })).toBe(false);
    expect(facturasColaboradorActivas({ NODE_ENV: 'production', CRM_BASE_URL: 'https://360crm.tech/testeo' })).toBe(true);
    expect(facturasColaboradorActivas({ NODE_ENV: 'development' })).toBe(true);
    expect(facturasColaboradorActivas({ NODE_ENV: 'production', FACTURAS_COLABORADOR_EN_PRODUCCION: '1' })).toBe(true);
    // El interruptor del tablero no enciende este, ni al revés.
    expect(facturasColaboradorActivas({ NODE_ENV: 'production', TAREAS_EN_PRODUCCION: '1' })).toBe(false);
    expect(tareasActivas({ NODE_ENV: 'production', FACTURAS_COLABORADOR_EN_PRODUCCION: '1' })).toBe(false);
  });
});

describe('la tarea del mes recupera el mes anterior del 1 al 4 (antes: si fallaba el último día, se perdía)', () => {
  const madrid = (iso) => new Date(iso);
  it('el día 2 a las 11:00 de Madrid prepara septiembre', async () => {
    const r = await runFacturasColaborador({ ahora: madrid('2026-10-02T09:00:00Z') });
    expect(r.tarea).toBe('recuperar');
    expect(llamadas).toEqual([['preparar', '2026-09-01']]);
  });
  it('en enero recupera diciembre del año anterior', async () => {
    await runFacturasColaborador({ ahora: madrid('2027-01-03T10:00:00Z') });
    expect(llamadas).toEqual([['preparar', '2026-12-01']]);
  });
  it('el último día sigue preparando el mes en curso, y el 5 el recordatorio', async () => {
    await runFacturasColaborador({ ahora: madrid('2026-10-31T10:00:00Z') });
    await runFacturasColaborador({ ahora: madrid('2026-11-05T10:00:00Z') });
    expect(llamadas).toEqual([['preparar', '2026-10-01'], ['recordar', '2026-10-01']]);
  });
  it('antes de las 10:00, nada', async () => {
    expect((await runFacturasColaborador({ ahora: madrid('2026-10-02T06:00:00Z') })).omitido).toBe('fuera de hora');
  });
});
