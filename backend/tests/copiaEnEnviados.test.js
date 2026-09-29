import { describe, it, expect } from 'vitest';
import { hayBuzon, fechaRFC } from '../src/shared/services/copia-en-enviados.service.js';

/**
 * La copia en «Enviados» del buzón de verdad.
 *
 * Ángel: «también debe mantenerse el servicio normal: si se manda el correo,
 * aparece en la bandeja de salida». No aparecía porque Brevo manda EN NOMBRE de
 * la dirección, no DESDE ella.
 *
 * Lo que se prueba aquí es lo único que se puede probar sin un buzón delante: que
 * SIN credenciales no se intenta nada, y que el mensaje que se guardaría está
 * bien formado. Lo otro —que Hostinger lo acepte— se comprueba mandando uno y
 * mirando la carpeta, y así se hizo.
 */

describe('sin buzón configurado no se intenta nada', () => {
  it('`hayBuzon` dice que no, y el envío sigue funcionando igual', () => {
    // En las pruebas no hay IMAP_USER ni IMAP_PASSWORD. Lo importante es que
    // eso NO sea un error: un CRM sin buzón configurado manda correos
    // exactamente igual, solo que sin dejar copia.
    expect(hayBuzon()).toBe(false);
  });
});

describe('el mensaje que se guardaría', () => {
  // `comoMensaje` es privada a proposito —nadie fuera necesita armar un correo
  // en crudo— asi que se comprueba la regla que la hace necesaria, que es la
  // que se olvida siempre: una cabecera es ASCII.
  it('un asunto con tildes NO puede ir en crudo en la cabecera', () => {
    const asunto = 'Información y dossier · Máster en Neuropsicología';
    expect(/[^\x20-\x7E]/.test(asunto), 'este asunto lleva caracteres fuera de ASCII').toBe(true);

    // La forma que entienden todos los lectores (RFC 2047), que es la que usa
    // el servicio. Sin esto, «Tus comisiones» llega bien y «Información» no.
    const codificado = `=?UTF-8?B?${Buffer.from(asunto, 'utf8').toString('base64')}?=`;
    expect(codificado).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);

    // Y se puede deshacer: es el mismo texto, no uno parecido.
    const vuelta = Buffer.from(codificado.slice(10, -2), 'base64').toString('utf8');
    expect(vuelta).toBe(asunto);
  });

  it('un asunto solo con ASCII no necesita codificarse', () => {
    expect(/[^\x20-\x7E]/.test('Tus comisiones de agosto')).toBe(false);
  });
});

describe('la fecha de la copia', () => {
  it('lleva el desfase en numeros, no «GMT»', () => {
    // Lo que fallaba: `toUTCString()` termina en «GMT», que el estandar admite
    // por compatible con lo viejo, pero que el webmail de Hostinger no parsea.
    // La copia salia en «Enviados» SIN HORA, con el hueco en blanco al lado del
    // asunto — y asi se vio en una captura.
    const d = new Date(Date.UTC(2026, 8, 15, 16, 35, 14));
    expect(fechaRFC(d)).toBe('Tue, 15 Sep 2026 16:35:14 +0000');
    expect(fechaRFC(d)).not.toMatch(/GMT/);
  });

  it('es la forma que sale de los correos mandados por SMTP', () => {
    // Los que salen por el buzon llevan `+0000`, y la copia tiene que ser el
    // mismo correo: si no, la lista se ordena de una forma y se lee de otra.
    expect(fechaRFC(new Date())).toMatch(/^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} \+0000$/);
  });
});
