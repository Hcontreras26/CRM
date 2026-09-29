import { describe, it, expect } from 'vitest';
import { enUtf8 } from '../src/modules/whatsapp/media.service.js';

/**
 * El nombre de un adjunto, leido como lo que es (#112).
 *
 * Visto en produccion, en el chat de Ana:
 *
 *     DiseÃ±o sin tÃ­tulo.pdf (1).png
 *
 * Es «Diseño sin título» con los bytes de UTF-8 interpretados como Latin-1.
 * Evolution lo manda asi en `fileName`, y el CRM lo guardaba tal cual — o sea
 * que el nombre malo queda en la base y arreglarlo luego en la pantalla no
 * sirve de nada.
 *
 * Lo delicado no es la conversion, es NO hacerla cuando no toca: aplicarla dos
 * veces, o sobre un nombre que ya venia bien, lo estropea. Por eso solo se toca
 * lo que lleva la firma del problema.
 *
 * (La doble extension —`.pdf (1).png`— es de quien lo mando. Ahi no hay nada
 * que arreglar.)
 */

describe('lo que hay que arreglar', () => {
  it('el caso de produccion', () => {
    expect(enUtf8('DiseÃ±o sin tÃ­tulo.pdf')).toBe('Diseño sin título.pdf');
  });

  it('con la doble extension, que se respeta tal cual', () => {
    expect(enUtf8('DiseÃ±o sin tÃ­tulo.pdf (1).png')).toBe('Diseño sin título.pdf (1).png');
  });

  it('otras tildes y la eñe', () => {
    expect(enUtf8('AcciÃ³n TutorÃ­a EspaÃ±a.docx')).toBe('Acción Tutoría España.docx');
  });
});

describe('lo que NO se toca, que es lo que rompe', () => {
  it('un nombre que ya viene bien se queda igual', () => {
    // Reconvertir esto lo estropearia: es el fallo clasico de aplicar la
    // correccion dos veces.
    expect(enUtf8('Diseño sin título.pdf')).toBe('Diseño sin título.pdf');
  });

  it('aplicarlo dos veces no cambia nada', () => {
    const una = enUtf8('DiseÃ±o sin tÃ­tulo.pdf');
    expect(enUtf8(una)).toBe(una);
  });

  it('ASCII puro se queda igual', () => {
    expect(enUtf8('informe-2026.pdf')).toBe('informe-2026.pdf');
  });

  it('un nombre con acentos normales tampoco se toca', () => {
    expect(enUtf8('Matrícula Ángel.pdf')).toBe('Matrícula Ángel.pdf');
  });
});

describe('los bordes', () => {
  it('vacio devuelve null, para que el que llama use su alternativa', () => {
    expect(enUtf8('')).toBeNull();
    expect(enUtf8(null)).toBeNull();
    expect(enUtf8(undefined)).toBeNull();
  });
});
