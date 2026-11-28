import { describe, it, expect } from 'vitest';
import { cuentaAFacturar, mesEnLetra, IVA_PCT, RETENCION_PCT } from '../src/modules/tutores/avisarTutor.js';

/**
 * La cuenta que el tutor tiene que facturar (Diego, 14/09).
 *
 * El correo de «Avisar tutor» la lleva dentro, y eso no es adorno: el documento
 * dice que pedirle «factura +IVA -Retencion» sin darle el numero es justo lo que
 * provoca las facturas mal hechas que hay que devolver. Si el numero del correo
 * esta mal, el tutor factura mal — y esa es la cifra que se queda el.
 */

describe('el ejemplo que dio Diego, al centimo', () => {
  // «17,82 € + 21 % de 17,82 € (3,74 €) − retención del 15 % (2,67 €) = 18,89 €»
  // Es el total del mes de Lola Hernandez: 6,40 + 11,42.
  const c = cuentaAFacturar(17.82);

  it('la base es la comisión del mes', () => {
    expect(c.base).toBe(17.82);
  });

  it('el IVA del 21 % son 3,74', () => {
    expect(c.iva).toBe(3.74);
  });

  it('la retención del 15 % son 2,67', () => {
    expect(c.retencion).toBe(2.67);
  });

  it('y el total a facturar, 18,89', () => {
    expect(c.total).toBe(18.89);
  });
});

describe('el redondeo va por linea, no al final', () => {
  it('redondear al final daria un centimo de mas, y el tutor facturaria otra cosa', () => {
    // Sin redondear cada linea: 17,82 + 3,7422 − 2,673 = 18,8892 → 18,89.
    // Coincide por poco en este caso; lo que NO puede pasar es que el total deje
    // de ser exactamente base + iva − retencion con los numeros que se enseñan.
    const c = cuentaAFacturar(17.82);
    expect(c.total).toBe(Number((c.base + c.iva - c.retencion).toFixed(2)));
  });

  it('y con un importe que si se parte, tambien cuadra', () => {
    // 45,03 es lo que le sale a Lola en la pantalla de agosto de 2026.
    const c = cuentaAFacturar(45.03);
    expect(c.iva).toBe(9.46);        // 9,4563
    expect(c.retencion).toBe(6.75);  // 6,7545
    expect(c.total).toBe(Number((c.base + c.iva - c.retencion).toFixed(2)));
  });

  it('lo que se enseña y lo que se suma son los mismos numeros', () => {
    // Esta es la regla de fondo: si el correo enseña tres lineas y un total, el
    // total tiene que salir de esas tres lineas y no de otras con mas decimales.
    for (const importe of [0.01, 1, 6.4, 11.42, 17.82, 45.03, 200.5, 691.28]) {
      const c = cuentaAFacturar(importe);
      expect(c.total, `con ${importe}`).toBe(Number((c.base + c.iva - c.retencion).toFixed(2)));
    }
  });
});

describe('los porcentajes viven en un solo sitio', () => {
  it('21 y 15, y se leen de ahi', () => {
    expect(IVA_PCT).toBe(21);
    expect(RETENCION_PCT).toBe(15);
  });

  it('cero no da NaN ni negativos raros', () => {
    expect(cuentaAFacturar(0)).toEqual({ base: 0, iva: 0, retencion: 0, total: 0 });
  });
});

describe('el mes, como se lee en el correo', () => {
  it('«2026-08» es «agosto de 2026», igual que en la pantalla', () => {
    expect(mesEnLetra('2026-08')).toBe('agosto de 2026');
  });

  it('enero y diciembre, que son los bordes del array', () => {
    expect(mesEnLetra('2026-01')).toBe('enero de 2026');
    expect(mesEnLetra('2026-12')).toBe('diciembre de 2026');
  });

  it('una basura no revienta el correo: se devuelve tal cual', () => {
    expect(mesEnLetra('')).toBe('');
    expect(mesEnLetra('2026-13')).toBe('2026-13');
  });
});

// El correo entero (la plantilla común, la marca y la cuenta dentro) se prueba
// en avisarAlTutor.test.js desde que sale con P.correo (CRM#165, 25/11).
