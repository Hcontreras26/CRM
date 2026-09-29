import { describe, it, expect } from 'vitest';
import { lista } from '@/shared/lib/lista';

/**
 * Una lista, o una vacía. Nunca otra cosa.
 *
 * El 04/09/2026 la pantalla de registro se quedó EN BLANCO con
 *
 *     TypeError: fuentes.filter is not a function
 *
 * porque `setFuentes(r.data)` daba por hecho que el servidor manda un array. Al
 * buscar esa forma aparecieron once sitios más iguales.
 *
 * Lo que se fija aquí es sobre todo lo que NO hace: no convierte, no envuelve,
 * no adivina. Envolver un objeto en `[objeto]` dejaría a la pantalla pintando
 * basura en vez de vacía, y entonces nadie se enteraría de que el servidor
 * contestó mal — que es cambiar un fallo ruidoso por uno callado.
 */

describe('lo que pasa de largo', () => {
  it('un array se devuelve tal cual, sin copiarlo', () => {
    const a = [1, 2, 3];
    expect(lista(a)).toBe(a);
  });

  it('un array vacío también', () => {
    const a: number[] = [];
    expect(lista(a)).toBe(a);
  });
});

describe('lo que se convierte en vacío', () => {
  it('el caso que rompió la pantalla: un objeto', () => {
    expect(lista({ success: true })).toEqual([]);
  });

  it('undefined, que es lo que llega cuando falta el campo', () => {
    expect(lista(undefined)).toEqual([]);
  });

  it('null', () => {
    expect(lista(null)).toEqual([]);
  });

  it('una cadena, aunque tenga .length y parezca lista', () => {
    // `'abc'.length` es 3 y `[...'abc']` funciona, así que es fácil colarla.
    // Pero no tiene `.map`, y ahí es donde se cae la pantalla.
    expect(lista('abc')).toEqual([]);
  });

  it('un número', () => {
    expect(lista(0)).toEqual([]);
  });
});

describe('lo que NO hace, que es el punto', () => {
  it('no envuelve un objeto en una lista de uno', () => {
    // Tentador y peor: la pantalla pintaría una fila con basura dentro en vez
    // de quedarse vacía, y el fallo del servidor pasaría desapercibido.
    expect(lista({ id: 1 })).toEqual([]);
    expect(lista({ id: 1 })).not.toEqual([{ id: 1 }]);
  });

  it('no saca la lista de dentro de un objeto', () => {
    // Adivinar que «seguro que querían decir r.data.items» es como se cuelan
    // los datos que no son. Si un endpoint devuelve otra forma, se arregla ahí.
    expect(lista({ items: [1, 2] })).toEqual([]);
  });
});

describe('el resultado siempre se puede recorrer', () => {
  it('con cualquier entrada, .map no revienta', () => {
    for (const v of [undefined, null, {}, 'x', 0, true, new Date(), () => {}]) {
      expect(() => lista(v).map((x) => x)).not.toThrow();
    }
  });
});
