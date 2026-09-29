import { describe, it, expect } from 'vitest';
import { loRetocado } from '../src/modules/tutores/avisarTutor.js';

/**
 * Retocar el aviso antes de mandarlo.
 *
 * Angel: «hazlo un poco mas ancho para que no se tenga que scrollear, y permite
 * editarlo».
 *
 * La plantilla no puede preverlo todo —un mes con una devolucion, algo que
 * explicarle, una errata— y salirse al webmail para eso deja el envio sin
 * anotar en ninguna parte.
 *
 * LO QUE NO SE TOCA ES A QUIEN VA. El destinatario sale del tutor, en el
 * servidor, y por eso esto NO sirve para mandar un correo cualquiera a
 * cualquiera: lo unico que se acepta de fuera es el texto. Eso no se prueba
 * aqui porque no hay nada que probar — `avisar` no mira el cuerpo para decidir
 * el destino.
 */

describe('sin retoque', () => {
  it('no se pisa nada: el correo sale de la plantilla', () => {
    expect(loRetocado({})).toBe(null);
    expect(loRetocado({ asunto: '', html: '' })).toBe(null);
    expect(loRetocado({ asunto: '   ', html: '  ' })).toBe(null);
  });

  it('lo que no sea texto se ignora en vez de romper', () => {
    expect(loRetocado({ asunto: 42, html: { malo: true } })).toBe(null);
    expect(loRetocado({ asunto: null, html: undefined })).toBe(null);
  });
});

describe('con retoque', () => {
  it('manda lo retocado, sin los espacios de los bordes', () => {
    const r = loRetocado({ asunto: '  Tus comisiones  ', html: '  <p>Hola <strong>Ana</strong>,</p>  ' });
    expect(r.asunto).toBe('Tus comisiones');
    expect(r.html).toBe('<p>Hola <strong>Ana</strong>,</p>');
  });

  it('el texto plano se rehace DEL HTML retocado', () => {
    // Si se quedara el de la plantilla, el correo diria una cosa en HTML y otra
    // en texto plano — y quien lee sin formato veria justo lo que se cambio.
    const r = loRetocado({
      asunto: 'Tus comisiones',
      html: '<p>Hola Ana,</p><p><strong>Nota:</strong> este mes va con la devolución descontada.</p>',
    });
    expect(r.texto).toContain('Nota: este mes va con la devolución descontada.');
    expect(r.texto).not.toMatch(/<[^>]+>/);
  });
});

describe('lo que no se acepta', () => {
  it('medio retoque: asunto nuevo con cuerpo viejo, o al reves', () => {
    // Un correo que no dice lo que su asunto anuncia sale peor que no tocar
    // nada, asi que se para aqui en vez de mandarlo a medias.
    expect(() => loRetocado({ asunto: 'Solo el asunto' })).toThrow(/asunto y el cuerpo/i);
    expect(() => loRetocado({ html: '<p>Solo el cuerpo</p>' })).toThrow(/asunto y el cuerpo/i);
  });

  it('un cuerpo desmedido', () => {
    expect(() => loRetocado({ asunto: 'Hola', html: `<p>${'x'.repeat(200_001)}</p>` }))
      .toThrow(/demasiado largo/i);
  });

  it('pero uno grande y razonable si pasa', () => {
    const r = loRetocado({ asunto: 'Hola', html: `<p>${'x'.repeat(50_000)}</p>` });
    expect(r.html).toHaveLength(50_007);
  });
});
