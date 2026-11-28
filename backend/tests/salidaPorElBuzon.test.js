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

// La version en texto plano del aviso al tutor la saca ahora P.correo
// (avisarAlTutor.test.js); el comoTexto propio se fue con la plantilla editable.
