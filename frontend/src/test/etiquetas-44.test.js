import { describe, it, expect } from 'vitest';
import { etiquetaProducto, esDeSuscripcion, ofreceMatriculas } from '@/shared/lib/etiquetas';

/*
  Cómo se llama aquí lo que se vende, y qué se le ofrece a cada marca (#44).

  Cada proyecto le pone nombre a su producto y la columna existe desde la
  migración 009, pero Clientes y Ventas llevaban «Curso» escrito a mano: un
  suscriptor de una plataforma de IA aparecía habiendo comprado «cursos».
*/

const psiko = { id: 1, type: 'crm', producto_label: 'Formacion', producto_label_plural: 'Formaciones' };
const ia = { id: 4, type: 'ia', producto_label: 'Plan', producto_label_plural: 'Planes' };
const todos = { id: -1, type: 'crm', producto_label: 'Formacion', producto_label_plural: 'Formaciones' };

describe('el nombre que le da su proyecto', () => {
  it('un centro de formación vende formaciones', () => {
    expect(etiquetaProducto(psiko)).toEqual({ singular: 'Formacion', plural: 'Formaciones' });
  });

  it('una plataforma de IA vende planes', () => {
    expect(etiquetaProducto(ia)).toEqual({ singular: 'Plan', plural: 'Planes' });
  });

  it('con varios proyectos a la vez no hay uno que valga', () => {
    // `-1` es «todos los proyectos». Decir «Formaciones» ahí sería el nombre de
    // uno puesto encima de las cifras de todos.
    expect(etiquetaProducto(todos)).toEqual({ singular: 'Producto', plural: 'Productos' });
  });

  it('sin proyecto, lo genérico', () => {
    expect(etiquetaProducto(null)).toEqual({ singular: 'Producto', plural: 'Productos' });
    expect(etiquetaProducto(undefined)).toEqual({ singular: 'Producto', plural: 'Productos' });
  });

  it('una etiqueta vacía o en blanco no deja el hueco', () => {
    // La columna es NOT NULL con valor por defecto, pero un proyecto viejo pudo
    // quedarse con espacios, y «: » a secas no dice nada.
    expect(etiquetaProducto({ id: 2, producto_label: '', producto_label_plural: '   ' }))
      .toEqual({ singular: 'Producto', plural: 'Productos' });
  });
});

describe('qué proyectos venden suscripciones', () => {
  it('la plataforma de IA', () => {
    // Lo dice el catálogo de tipos: «producto de suscripción, sin matrículas ni
    // catálogo de cursos».
    expect(esDeSuscripcion(ia)).toBe(true);
  });

  it('los demás no', () => {
    expect(esDeSuscripcion(psiko)).toBe(false);
    expect(esDeSuscripcion({ id: 9, type: 'educacion' })).toBe(false);
    expect(esDeSuscripcion(null)).toBe(false);
  });
});

describe('a quién se le ofrecen matrículas', () => {
  it('a una plataforma de IA no, aunque nadie haya apagado el módulo', () => {
    // Es la red: el preajuste «ia» de la pantalla de módulos lo deja apagado,
    // pero si nadie lo aplicó el proyecto seguiría ofreciendo una lista que
    // siempre estará vacía.
    expect(ofreceMatriculas({ id: 4, type: 'ia' })).toBe(false);
    expect(ofreceMatriculas({ id: 4, type: 'ia', modules: { matriculas: true } })).toBe(false);
  });

  it('a un proyecto con el módulo apagado tampoco', () => {
    // Es lo que ya mira el menú; aquí se mira lo mismo para no tener dos reglas
    // que puedan discrepar.
    expect(ofreceMatriculas({ id: 1, type: 'crm', modules: { matriculas: false } })).toBe(false);
  });

  it('al resto sí', () => {
    expect(ofreceMatriculas({ id: 1, type: 'crm' })).toBe(true);
    expect(ofreceMatriculas({ id: 1, type: 'crm', modules: { matriculas: true } })).toBe(true);
    // Sin proyecto elegido no se esconde nada: «todos» incluye los que sí.
    expect(ofreceMatriculas(null)).toBe(true);
  });
});
