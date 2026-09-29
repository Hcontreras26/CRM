import { describe, it, expect } from 'vitest';

/**
 * Buscar escribiendo, en una lista larga (#2).
 *
 * El desplegable de categorias de un producto enseñaba las rutas enteras
 * concatenadas —«Cursos › Para Profesionales › Adicciones y Conductas
 * Compulsivas»— cincuenta y pico lineas, sin forma de buscar. Encontrar una era
 * bajar a ojo. El mismo problema que ya tenian los 787 cursos de ISEIE.
 *
 * Aqui se prueba el filtro, que es lo unico del componente que no es pintar.
 *
 * Antes esta prueba se copiaba la funcion del componente, porque vivia dentro
 * de el y no habia forma de importarla. Ya la hay: el filtro se saco a
 * `shared/lib/buscarPorTrozos` para que el arbol del listado de productos
 * busque igual que este buscador, y ahora esto prueba la funcion de verdad en
 * vez de un gemelo que podia separarse de ella sin avisar.
 */

import { casaPorTrozos } from '@/shared/lib/buscarPorTrozos';

interface Opcion { id: number; nombre: string; nota?: string | number | null }

const filtrar = (opciones: Opcion[], texto: string) =>
  opciones.filter((c) => casaPorTrozos(texto, c.nombre, c.nota)).slice(0, 60);

const CATEGORIAS: Opcion[] = [
  { id: 1, nombre: 'Adicciones y Conductas Compulsivas', nota: 'Cursos › Para Profesionales' },
  { id: 2, nombre: 'Alimentación, Imagen Corporal y TCA', nota: 'Cursos › Para Profesionales' },
  { id: 3, nombre: 'Adicciones', nota: 'Cursos › Para Familias' },
  { id: 4, nombre: 'Cursos', nota: null },
];

const CURSOS: Opcion[] = [
  { id: 10, nombre: 'Máster Profesional en Neuropsicología y Logopedia Clínica', nota: 1200 },
  { id: 11, nombre: 'Experto en Logopedia Infantil', nota: 450 },
];

describe('escribir un trozo', () => {
  it('«adicc» encuentra las dos que lo llevan', () => {
    expect(filtrar(CATEGORIAS, 'adicc').map((c) => c.id)).toEqual([1, 3]);
  });

  it('sin acentos: «alimentacion» encuentra «Alimentación»', () => {
    expect(filtrar(CATEGORIAS, 'alimentacion').map((c) => c.id)).toEqual([2]);
  });

  it('y al reves, con acento encuentra lo escrito sin el', () => {
    expect(filtrar([{ id: 1, nombre: 'Logopedia clinica' }], 'clínica')).toHaveLength(1);
  });
});

describe('trozos sueltos, en cualquier orden', () => {
  it('«neuro logo» encuentra «Neuropsicología y Logopedia»', () => {
    expect(filtrar(CURSOS, 'neuro logo').map((c) => c.id)).toEqual([10]);
  });

  it('el orden da igual', () => {
    expect(filtrar(CURSOS, 'logo neuro').map((c) => c.id)).toEqual([10]);
  });
});

describe('la RUTA tambien se busca, que es lo nuevo', () => {
  it('«prof adicc» distingue la de Profesionales de la de Familias', () => {
    // Hay dos «Adicciones» en ramas distintas. Sin buscar en la ruta, escribir
    // «adicc» da las dos y no hay forma de saber cual es cual.
    expect(filtrar(CATEGORIAS, 'prof adicc').map((c) => c.id)).toEqual([1]);
  });

  it('«familias adicciones» da la otra', () => {
    expect(filtrar(CATEGORIAS, 'familias adicciones').map((c) => c.id)).toEqual([3]);
  });

  it('un importe en la nota no cuenta como texto buscable', () => {
    // Buscar «450» no puede devolver un curso por su precio: nadie busca asi, y
    // colaria resultados sin relacion con lo escrito.
    expect(filtrar(CURSOS, '450')).toEqual([]);
  });
});

describe('lo que no filtra', () => {
  it('sin texto salen todas', () => {
    expect(filtrar(CATEGORIAS, '')).toHaveLength(4);
  });

  it('solo espacios tampoco filtra', () => {
    expect(filtrar(CATEGORIAS, '   ')).toHaveLength(4);
  });

  it('lo que no esta, no aparece', () => {
    expect(filtrar(CATEGORIAS, 'inmobiliaria')).toEqual([]);
  });
});
