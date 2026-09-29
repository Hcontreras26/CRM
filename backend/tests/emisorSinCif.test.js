import { describe, it, expect } from 'vitest';
import { nifSinRellenar } from '../src/modules/invoices/invoices.model.js';

/**
 * Que no salga una factura con un CIF que no existe.
 *
 * La migracion 102 sembro las tres sociedades con el CIF escrito a mano —
 * «PENDIENTE-CIF-CEDIA» y sus hermanas— para rellenarlo despues. Nadie lo
 * relleno. Y `invoices.service.js` imprime `NIF: <lo que haya>` sin preguntar,
 * asi que toda factura emitida bajo una de esas sociedades salio con ese texto
 * encima de un documento fiscal, camino de un cliente.
 *
 * Esto es lo que lo corta en la emision. Se prueba la regla sola porque es lo
 * unico que puede equivocarse: el resto es un `if`.
 */

describe('los marcadores que sembro la 102', () => {
  it('los tres, reconocidos', () => {
    expect(nifSinRellenar('PENDIENTE-CIF-CEDIA')).toBe(true);
    expect(nifSinRellenar('PENDIENTE-CIF-ICTESS')).toBe(true);
    expect(nifSinRellenar('PENDIENTE-CIF-LATERAL')).toBe(true);
  });

  it('y una sociedad futura con la misma costumbre, tambien', () => {
    // Se mira el prefijo y no la lista de tres: el dia que alguien siembre una
    // cuarta con ese habito, esto la coge sin que nadie se acuerde de venir.
    expect(nifSinRellenar('PENDIENTE-CIF-LOQUESEA')).toBe(true);
  });

  it('da igual como este escrito', () => {
    expect(nifSinRellenar('pendiente-cif-cedia')).toBe(true);
    expect(nifSinRellenar('  PENDIENTE-CIF-CEDIA  ')).toBe(true);
  });
});

describe('un CIF de verdad pasa', () => {
  it('el de CEDIA, ya relleno', () => {
    expect(nifSinRellenar('B93806404')).toBe(false);
  });

  it('otros formatos españoles y de fuera', () => {
    for (const nif of ['B12345678', '12345678Z', 'X1234567L', 'IE6388047V', 'FR12345678901']) {
      expect(nifSinRellenar(nif), nif).toBe(false);
    }
  });

  it('y uno que solo MENCIONA la palabra no es un marcador', () => {
    // El marcador es un prefijo. Un CIF que llevara esas letras dentro —o una
    // nota al lado— no puede bloquear una emision legitima.
    expect(nifSinRellenar('B93806404 (pendiente de verificar)')).toBe(false);
  });
});

describe('sin CIF no es lo mismo que con un CIF falso', () => {
  it('vacio, nulo o sin poner: no lo corta esto', () => {
    // Una factura sin NIF sale sin la linea, que es feo pero no dice una
    // mentira. La que lleva «PENDIENTE-CIF-X» afirma un numero que no existe, y
    // esa es la que hay que parar. Lo de exigir NIF es otra decision, y no esta
    // tomada.
    expect(nifSinRellenar(null)).toBe(false);
    expect(nifSinRellenar(undefined)).toBe(false);
    expect(nifSinRellenar('')).toBe(false);
    expect(nifSinRellenar('   ')).toBe(false);
  });
});
