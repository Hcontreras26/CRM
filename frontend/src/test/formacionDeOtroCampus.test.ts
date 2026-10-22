import { describe, it, expect } from 'vitest';
import { campusDelRechazo, formacionesConCampus } from '@/modules/tutores/lib/colaboraciones';

/**
 * #384 · Añadir a una tutora una formación de otro campus.
 *
 * Diego: «a Vanessa no le deja agregar formaciones de otro campus a una tutora,
 * porque no la deja, sin razón; si no está en ese campus debe de salir
 * "¿deseas añadirla a este campus?"».
 *
 * Dos cuentas de la pantalla: reconocer el 409 que trae el campus (para
 * preguntar en vez de enseñar un «no») y el buscador con las formaciones de
 * TODOS los campus de quien asigna, cada una diciendo de cuál es.
 */

const rechazo = (code: string, data?: unknown) =>
  Object.assign(new Error('Esa formación es de Psiko Aprende…'), { status: 409, data: { success: false, code, data } });

describe('campusDelRechazo', () => {
  it('el 409 OTRO_PROYECTO trae el campus: se pregunta si añadirlo', () => {
    expect(campusDelRechazo(rechazo('OTRO_PROYECTO', { projectId: 2, proyecto: 'Psiko Aprende' })))
      .toEqual({ projectId: 2, proyecto: 'Psiko Aprende' });
  });

  it('cualquier otro error no es «de otro campus»: se enseña tal cual', () => {
    expect(campusDelRechazo(rechazo('SOLAPE'))).toBeNull();
    expect(campusDelRechazo(rechazo('OTRO_PROYECTO'))).toBeNull(); // sin campus no hay nada que ofrecer
    expect(campusDelRechazo(new Error('red'))).toBeNull();
    expect(campusDelRechazo(null)).toBeNull();
  });
});

describe('formacionesConCampus', () => {
  const tandas = [
    { projectId: 1, campus: 'ISEIH', formaciones: [{ id: 10, nombre: 'Máster en Logopedia', precio: '1200' }, { id: 11, nombre: 'Curso de Voz', precio: null }] },
    { projectId: 2, campus: 'Psiko Aprende', formaciones: [{ id: 20, nombre: 'Máster en Logopedia', precio: 990 }] },
  ];

  it('no junta por nombre: el mismo curso en dos campus sale dos veces, cada uno con el suyo', () => {
    const r = formacionesConCampus(tandas);
    const logopedia = r.filter((f) => f.nombre === 'Máster en Logopedia');
    expect(logopedia.map((f) => [f.id, f.projectId])).toEqual([[10, 1], [20, 2]]);
    // En es-ES, cuatro cifras van sin punto de miles (como en el resto del buscador).
    expect(logopedia[0].nota).toMatch(/^ISEIH · 1\.?200,00 €$/);
    expect(logopedia[1].nota).toMatch(/^Psiko Aprende · 990,00 €$/);
  });

  it('sin precio, solo el campus; ordenadas por nombre', () => {
    const r = formacionesConCampus(tandas);
    expect(r.map((f) => f.nombre)).toEqual(['Curso de Voz', 'Máster en Logopedia', 'Máster en Logopedia']);
    expect(r[0].nota).toBe('ISEIH');
  });

  it('una formación repetida en dos tandas no sale dos veces', () => {
    const r = formacionesConCampus([...tandas, tandas[0]]);
    expect(r).toHaveLength(3);
  });
});
