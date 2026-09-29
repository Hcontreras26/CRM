import { describe, it, expect } from 'vitest';
import { saleDelBuzon, haySalidaPropia } from '../src/shared/services/correo-buzon.service.js';
import { comoTexto } from '../src/modules/tutores/avisarTutor.js';

/**
 * Que el correo salga por el buzon propio y no por Brevo.
 *
 * Angel: «que no llegue a promocion, cuidado».
 *
 * No era falta de autenticacion —se leyo un correo nuestro en crudo y firma
 * bien: `dkim=pass header.d=cediaidsl.com`, `dmarc=pass`—. Lo que lo mandaba a
 * Promociones son las cabeceras de lista que Brevo engancha a todo lo suyo:
 * `List-Unsubscribe`, `List-Unsubscribe-Post`, `X-CSA-Complaints`,
 * `Feedback-ID: ...Sendinblue`. Se intento pisarlas por el parametro `headers`
 * de la API y Brevo las volvio a poner igual: es ajuste de cuenta, no del
 * mensaje.
 *
 * Saliendo por el SMTP del propio buzon no aparece ninguna, y el correo sigue
 * firmado por el dominio (`s=hostingermail-a`). Eso se comprobo mandandose uno
 * al propio buzon y leyendolo por IMAP.
 */

describe('quien sale por el buzon', () => {
  it('sin credenciales no sale nadie por ahi', () => {
    // En las pruebas no hay SMTP_USER ni IMAP_USER. Lo importante es que eso NO
    // sea un error: sin buzon configurado, todo sigue saliendo por Brevo igual
    // que antes.
    expect(haySalidaPropia()).toBe(false);
    expect(saleDelBuzon('facturacion@cediaidsl.com')).toBe(false);
  });

  it('un remitente vacio o raro nunca cuela', () => {
    for (const r of [null, undefined, '', '   ', 'otro@dominio.com']) {
      expect(saleDelBuzon(r)).toBe(false);
    }
  });
});

describe('el correo en texto plano', () => {
  // Un correo de verdad lleva las dos versiones. Solo-HTML es lo que manda un
  // boletin, y ademas se ve fatal en quien lee sin formato.
  const html = '<p>Hola <strong>Ana</strong>,</p>'
    + '<ul><li>Máster en Neuropsicología</li><li>Curso de Psicodrama</li></ul>'
    + '<table><tr><td>Comisión del mes</td><td>1.000,00 €</td></tr>'
    + '<tr><td>Total a facturar</td><td>1.060,00 €</td></tr></table>'
    + '<p>Un saludo.</p>';

  it('no queda ni una etiqueta', () => {
    expect(comoTexto(html)).not.toMatch(/<[^>]+>/);
  });

  it('las formaciones quedan como lista, una por linea', () => {
    const t = comoTexto(html);
    expect(t).toContain('- Máster en Neuropsicología');
    expect(t).toContain('- Curso de Psicodrama');
  });

  it('la cuenta se lee «concepto: importe», que es como se dicta', () => {
    const t = comoTexto(html);
    expect(t).toContain('Comisión del mes: 1.000,00 €');
    expect(t).toContain('Total a facturar: 1.060,00 €');
  });

  it('no deja parrafos en blanco de sobra', () => {
    expect(comoTexto(html)).not.toMatch(/\n\s*\n\s*\n/);
  });

  it('el texto sigue al HTML: si cambia la plantilla, cambia solo', () => {
    // Se saca DEL HTML compuesto, no de la plantilla. Es lo que evita que un
    // dia el HTML diga una cosa y el texto plano otra.
    expect(comoTexto('<p>Nuevo texto</p>')).toBe('Nuevo texto');
  });

  it('aguanta lo vacio sin romperse', () => {
    expect(comoTexto('')).toBe('');
    expect(comoTexto(null)).toBe('');
  });
});
