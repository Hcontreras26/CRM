import { describe, it, expect } from 'vitest';
import { casaLaRama } from '@/modules/product-categories/lib/arbol';

/**
 * El filtro del arbol de categorias del listado de productos (#2, cuarto AC).
 *
 * Hasta ahora el listado filtraba con un `includes` sobre el nombre, mientras el
 * formulario de producto —el mismo catalogo, la pantalla de al lado— ya buscaba
 * sin acentos, por trozos sueltos y por la rama. Buscar «adiccion» en el filtro
 * no encontraba «Adicciones», y las DOS «Adicciones» del arbol no habia forma
 * de separarlas.
 *
 * El arbol de aqui es el del catalogo de verdad, recortado.
 */

const arbol = {
  nombre: 'Cursos',
  children: [
    {
      nombre: 'Para Profesionales',
      children: [
        { nombre: 'Adicciones y Conductas Compulsivas', children: [] },
        { nombre: 'Alimentación, Imagen Corporal y TCA', children: [] },
      ],
    },
    {
      nombre: 'Para Familias',
      children: [{ nombre: 'Adicciones', children: [] }],
    },
  ],
};

const profesionales = arbol.children[0];
const familias = arbol.children[1];

describe('sin escribir nada', () => {
  it('casa todo: un filtro vacio no esconde ninguna categoria', () => {
    expect(casaLaRama(arbol, '')).toBe(true);
    expect(casaLaRama(familias, '   ')).toBe(true);
  });
});

describe('los acentos', () => {
  it('«alimentacion» encuentra «Alimentación», que antes no', () => {
    expect(casaLaRama(profesionales, 'alimentacion')).toBe(true);
  });

  it('y al reves: escribir con tilde encuentra lo guardado sin ella', () => {
    expect(casaLaRama({ nombre: 'Logopedia clinica', children: [] }, 'clínica')).toBe(true);
  });
});

describe('la rama, que es lo que distingue las dos «Adicciones»', () => {
  it('«prof adicc» casa la de Profesionales', () => {
    expect(casaLaRama(profesionales, 'prof adicc', 'Cursos')).toBe(true);
  });

  it('y NO casa la de Familias', () => {
    expect(casaLaRama(familias, 'prof adicc', 'Cursos')).toBe(false);
  });

  it('«familias adicc» da la otra, y solo la otra', () => {
    expect(casaLaRama(familias, 'familias adicc', 'Cursos')).toBe(true);
    expect(casaLaRama(profesionales, 'familias adicc', 'Cursos')).toBe(false);
  });

  it('el orden de lo escrito da igual', () => {
    expect(casaLaRama(profesionales, 'adicc prof', 'Cursos')).toBe(true);
  });
});

describe('los padres se quedan a la vista', () => {
  it('la raiz sobrevive si casa una nieta, para poder bajar hasta ella', () => {
    // Si el padre se escondiera, la categoria que casa quedaria sin camino y el
    // filtro enseñaria una lista vacia teniendo resultado.
    expect(casaLaRama(arbol, 'alimentacion')).toBe(true);
  });

  it('pero una rama sin nada dentro se va', () => {
    expect(casaLaRama(familias, 'alimentacion', 'Cursos')).toBe(false);
  });
});

describe('lo que no esta', () => {
  it('no aparece', () => {
    expect(casaLaRama(arbol, 'inmobiliaria')).toBe(false);
  });
});
