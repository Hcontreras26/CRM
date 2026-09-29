import { describe, it, expect } from 'vitest';
import {
  caminoHasta, hijosDe, nivelesDe, rutaEnTexto, profundidad,
} from '@/modules/product-categories/lib/arbol';

/**
 * Andar el árbol de categorías (#2).
 *
 * El desplegable viejo asumía dos niveles y el árbol real tiene cinco. Lo que
 * se fija aquí son los casos que hacen que la cascada mienta:
 *
 *   - una categoría que no está en la lista (desactivada, de otro proyecto)
 *     tiene que distinguirse de «no tiene categoría», o al guardar se pierde,
 *   - un padre que apunta a su propio descendiente no puede colgar la pantalla
 *     ni devolver una ruta inventada,
 *   - la profundidad no la decide un número escrito a mano, la decide el árbol.
 */

// Cursos › Para Profesionales › Adicciones › Conductas
// Cursos › Para Profesionales › Trauma
// Cursos › Para Particulares
// Másteres
const ARBOL = [
  { id: 1, parent_id: null, nombre: 'Cursos' },
  { id: 2, parent_id: 1, nombre: 'Para Profesionales' },
  { id: 3, parent_id: 2, nombre: 'Adicciones' },
  { id: 4, parent_id: 3, nombre: 'Conductas' },
  { id: 5, parent_id: 2, nombre: 'Trauma' },
  { id: 6, parent_id: 1, nombre: 'Para Particulares' },
  { id: 7, parent_id: null, nombre: 'Másteres' },
];

describe('el camino desde la raíz', () => {
  it('devuelve la rama entera, de arriba abajo', () => {
    expect(caminoHasta(ARBOL, 4).map((c) => c.nombre))
      .toEqual(['Cursos', 'Para Profesionales', 'Adicciones', 'Conductas']);
  });

  it('una de primer nivel es un camino de uno', () => {
    expect(caminoHasta(ARBOL, 7).map((c) => c.nombre)).toEqual(['Másteres']);
  });

  it('sin categoría, camino vacío', () => {
    expect(caminoHasta(ARBOL, null)).toEqual([]);
  });

  it('una categoría que NO está en la lista da vacío, no un camino a medias', () => {
    // Este es el caso feo: un producto apunta a una categoría desactivada que
    // `listByProject` no devuelve. Si esto contestara «[esa categoría]» la
    // cascada la pintaría como si fuera de primer nivel; si contestara algo
    // parecido a un camino, peor. Vacío es lo unico honesto, y quien llama
    // decide si avisa o si va a buscarla.
    expect(caminoHasta(ARBOL, 999)).toEqual([]);
  });

  it('un padre que ya no está corta el camino donde se rompe', () => {
    const roto = [{ id: 50, parent_id: 49, nombre: 'Huérfana' }];
    expect(caminoHasta(roto, 50).map((c) => c.nombre)).toEqual(['Huérfana']);
  });

  it('un ciclo se corta en la primera repetición, no cuelga', () => {
    // A → B → A. Con un `while` sin memoria esto es un bucle infinito y la
    // pantalla se queda congelada sin decir por qué.
    const ciclo = [
      { id: 10, parent_id: 11, nombre: 'A' },
      { id: 11, parent_id: 10, nombre: 'B' },
    ];
    const camino = caminoHasta(ciclo, 10);
    expect(camino.length).toBeLessThanOrEqual(2);
    expect(camino.map((c) => c.nombre)).toEqual(['B', 'A']);
  });

  it('una que es su propio padre tampoco cuelga', () => {
    const solo = [{ id: 20, parent_id: 20, nombre: 'Se apunta a sí misma' }];
    expect(caminoHasta(solo, 20)).toHaveLength(1);
  });

  it('sin campo parent_id se trata como de primer nivel', () => {
    // Hay endpoints que no devuelven la columna cuando es nula. `undefined` y
    // `null` tienen que significar lo mismo o la categoría desaparece del
    // primer selector y no hay forma de elegirla.
    const sinCampo = [{ id: 30, nombre: 'Suelta' }];
    expect(caminoHasta(sinCampo, 30).map((c) => c.nombre)).toEqual(['Suelta']);
    expect(hijosDe(sinCampo, null).map((c) => c.nombre)).toEqual(['Suelta']);
  });
});

describe('los hijos de cada nivel', () => {
  it('null da las de primer nivel', () => {
    expect(hijosDe(ARBOL, null).map((c) => c.nombre)).toEqual(['Cursos', 'Másteres']);
  });

  it('los hijos directos, no los nietos', () => {
    expect(hijosDe(ARBOL, 1).map((c) => c.nombre))
      .toEqual(['Para Particulares', 'Para Profesionales']);
  });

  it('una hoja no tiene hijos', () => {
    expect(hijosDe(ARBOL, 4)).toEqual([]);
  });

  it('ordena en español, con acentos donde van', () => {
    const conAcentos = [
      { id: 1, parent_id: null, nombre: 'Zoología' },
      { id: 2, parent_id: null, nombre: 'Ávila' },
      { id: 3, parent_id: null, nombre: 'Ana' },
    ];
    expect(hijosDe(conAcentos, null).map((c) => c.nombre)).toEqual(['Ana', 'Ávila', 'Zoología']);
  });
});

describe('cuántos selectores se pintan', () => {
  it('sin nada elegido, uno solo', () => {
    expect(nivelesDe(ARBOL, null)).toEqual([null]);
  });

  it('elegida una con hijos, sale el siguiente vacío para poder bajar', () => {
    // Cursos elegido → [Cursos, (elige)]
    expect(nivelesDe(ARBOL, 1)).toEqual([1, null]);
  });

  it('elegida una hoja, no sobra ningún selector', () => {
    // Conductas no tiene hijos: cuatro niveles, ni uno de adorno.
    expect(nivelesDe(ARBOL, 4)).toEqual([1, 2, 3, 4]);
  });

  it('a media rama enseña lo elegido y el siguiente', () => {
    expect(nivelesDe(ARBOL, 3)).toEqual([1, 2, 3, null]);
  });

  it('una categoría que no está no finge una cascada', () => {
    expect(nivelesDe(ARBOL, 999)).toEqual([null]);
  });
});

describe('la ruta en texto', () => {
  it('junta la rama con el separador', () => {
    expect(rutaEnTexto(ARBOL, 4)).toBe('Cursos › Para Profesionales › Adicciones › Conductas');
  });

  it('sin categoría, cadena vacía', () => {
    expect(rutaEnTexto(ARBOL, null)).toBe('');
  });

  it('una que no está tampoco inventa nada', () => {
    expect(rutaEnTexto(ARBOL, 999)).toBe('');
  });
});

describe('lo hondo que llega el árbol', () => {
  it('lo dice el árbol, no un número escrito a mano', () => {
    expect(profundidad(ARBOL)).toBe(4);
  });

  it('un árbol vacío es cero', () => {
    expect(profundidad([])).toBe(0);
  });

  it('aguanta más de los diez niveles que asumía el código viejo', () => {
    // El `safety++ < 10` de `pathOf` cortaba aquí y devolvía una ruta corta sin
    // decir que estaba cortada.
    const hondo = Array.from({ length: 15 }, (_, i) => ({
      id: i + 1, parent_id: i === 0 ? null : i, nombre: `N${i + 1}`,
    }));
    expect(profundidad(hondo)).toBe(15);
    expect(caminoHasta(hondo, 15)).toHaveLength(15);
  });
});
