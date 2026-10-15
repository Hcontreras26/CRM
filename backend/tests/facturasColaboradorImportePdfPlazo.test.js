import { describe, it, expect, vi } from 'vitest';

/*
  Facturas de colaboradores (#202, 13/10) · los topes al leer el PDF: un PDF
  que no acaba de leerse nunca no puede dejar la subida esperando. Aparte de
  facturasColaboradorImportePdf.test.js porque aquí pdf-parse va simulado.
*/

const leer = vi.fn(() => new Promise(() => {})); // no termina nunca
vi.mock('pdf-parse/lib/pdf-parse.js', () => ({ default: (...a) => leer(...a) }));

const { textoDelPdf, leerImporteDelPdf } = await import('../src/modules/facturas-colaborador/importePdf.js');

describe('los topes al leer el PDF', () => {
  it('pasado el tope de tiempo, null: la subida sigue', async () => {
    const antes = Date.now();
    expect(await leerImporteDelPdf(Buffer.from('%PDF-1.4'), 636, { topeMs: 50 })).toBeNull();
    expect(Date.now() - antes).toBeLessThan(2000);
  });

  it('como mucho 10 páginas, y sobre una copia del archivo', async () => {
    leer.mockClear();
    const archivo = Buffer.from('%PDF-1.4');
    await textoDelPdf(archivo, { topeMs: 10 });
    const [copia, opciones] = leer.mock.calls[0];
    expect(opciones.max).toBe(10);
    expect(copia).not.toBe(archivo);
  });

  it('si pdf-parse lanza, null', async () => {
    leer.mockImplementationOnce(() => { throw new Error('roto'); });
    expect(await textoDelPdf(Buffer.from('%PDF-1.4'))).toBeNull();
  });
});
