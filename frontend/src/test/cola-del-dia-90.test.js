import { describe, it, expect } from 'vitest';
import { contarPorPaso, tipoDeInteraccion, trasSacar } from '@/modules/proceso/lib/cola';

/*
  Las cuentas de la cola del día (#90).

  Tres cosas que la pantalla hace y que se equivocan en silencio: cuántos hay de
  cada paso, de qué tipo es la interacción que se apunta, y a quién se pasa al
  sacar a alguien de la lista.
*/

const fila = (lead_id, clave, orden, dias_de_retraso, paso_nombre = null) => ({
  lead_id, clave, orden, dias_de_retraso, paso_nombre,
  lead_nombre: `Lead ${lead_id}`, lead_estado: 'contactado',
  responsable_id: 1, gestora: 'Ana', canales: null, paso_nota: null,
  fecha_prevista: '2026-09-10', contactos: 0,
});

describe('cuántos hay de cada paso', () => {
  it('los agrupa y los cuenta', () => {
    const grupos = contarPorPaso([
      fila(1, 'paso_2', 2, 0), fila(2, 'paso_2', 2, 3), fila(3, 'paso_1', 1, 0),
    ]);
    expect(grupos.map((g) => [g.orden, g.cuantos])).toEqual([[1, 1], [2, 2]]);
  });

  it('van por orden de proceso, no por cuántos hay', () => {
    // El proceso es una secuencia; ordenarlo por tamaño la desdibuja.
    const grupos = contarPorPaso([
      fila(1, 'paso_4', 4, 0), fila(2, 'paso_4', 4, 0), fila(3, 'paso_4', 4, 0),
      fila(4, 'paso_1', 1, 0),
    ]);
    expect(grupos.map((g) => g.orden)).toEqual([1, 4]);
  });

  it('dice cuántos de cada paso llegan tarde', () => {
    // Un «14» a secas no distingue un grupo que urge de uno que solo es grande.
    const [g] = contarPorPaso([fila(1, 'paso_2', 2, 5), fila(2, 'paso_2', 2, 0), fila(3, 'paso_2', 2, 1)]);
    expect(g.cuantos).toBe(3);
    expect(g.atrasados).toBe(2);
  });

  it('sin nombre de paso usa la clave, no deja el hueco', () => {
    const [g] = contarPorPaso([fila(1, 'paso_9', 9, 0, null)]);
    expect(g.nombre).toBe('paso_9');
  });

  it('una cola vacía no da grupos', () => {
    expect(contarPorPaso([])).toEqual([]);
  });
});

describe('de qué tipo es lo que se apunta', () => {
  it('los tres que coinciden pasan tal cual', () => {
    expect(tipoDeInteraccion('llamada')).toBe('llamada');
    expect(tipoDeInteraccion('email')).toBe('email');
    expect(tipoDeInteraccion('whatsapp')).toBe('whatsapp');
  });

  it('«wasapi» es un WhatsApp', () => {
    // Es la pasarela por la que sale el mensaje, no otra cosa distinta. El
    // servidor solo acepta cuatro tipos y mandarlo tal cual da un 400 que no
    // explica nada.
    expect(tipoDeInteraccion('wasapi')).toBe('whatsapp');
  });

  it('lo que no conoce se apunta como nota, no se inventa', () => {
    expect(tipoDeInteraccion('telegram')).toBe('nota');
    expect(tipoDeInteraccion(null)).toBe('nota');
    expect(tipoDeInteraccion(undefined)).toBe('nota');
  });
});

describe('a quién se pasa al sacar a alguien', () => {
  it('se queda en el sitio, que ahora lo ocupa el siguiente', () => {
    // Es lo que hace que «siguiente» encadene: sacas al tercero de cinco y te
    // quedas en la tercera posición, que ya es otra persona.
    expect(trasSacar(5, 2)).toBe(2);
  });

  it('sacando al último, retrocede uno', () => {
    expect(trasSacar(5, 4)).toBe(3);
  });

  it('si era el único, no queda nadie', () => {
    // Y entonces el panel se cierra en vez de enseñar un hueco.
    expect(trasSacar(1, 0)).toBeNull();
  });
});
