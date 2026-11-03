import { describe, it, expect } from 'vitest';

/**
 * Novedades salía en «Algo se ha roto» (03/11, en `staging` y en producción):
 * la 2.2.0 —la actual, la que se abre por defecto y la que se manda sola al
 * arrancar— no traía `arreglos`, y la pantalla, el PDF, el correo y la campana
 * hacían `v.arreglos.length`. `versiones.js` ya da cada versión con sus listas.
 *
 *   npx vitest run tests/novedadesSinArreglos.test.js
 */

const { VERSIONES, ACTUAL } = await import('../src/modules/novedades/versiones.js');
const { correoDe } = await import('../src/modules/novedades/novedades.service.js');
const { pdfDeVersion } = await import('../src/modules/novedades/novedades.pdf.js');
const { CRM } = await import('../src/modules/novedades/versiones.js');

describe('cada versión trae sus listas', () => {
  it.each(VERSIONES.map((v) => [v.version, v]))('%s: grupos con items y arreglos, aunque sean vacíos', (_n, v) => {
    expect(Array.isArray(v.grupos)).toBe(true);
    for (const g of v.grupos) expect(Array.isArray(g.items)).toBe(true);
    expect(Array.isArray(v.arreglos)).toBe(true);
  });

  it('la actual (2.2.0) no tiene arreglos: lista vacía, no un fallo', () => {
    expect(ACTUAL.version).toBe('2.2.0');
    expect(ACTUAL.arreglos).toEqual([]);
  });
});

describe('el correo y el PDF de la versión actual ya no revientan', () => {
  it('el correo', () => {
    expect(() => correoDe(ACTUAL, 'Ana')).not.toThrow();
  });

  it('el PDF', async () => {
    const pdf = await pdfDeVersion(ACTUAL, { crm: CRM, baseUrl: 'https://crm.test' });
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
