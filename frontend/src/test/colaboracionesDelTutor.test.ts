import { describe, it, expect } from 'vitest';
import { lasQueYaRigen, laQueDuerme } from '@/modules/tutores/lib/colaboraciones';

/**
 * El nudo de las formaciones desactivadas (Diego, 14/09).
 *
 * El caso es el de Tatiana, tal cual lo describio: «Máster en Terapia de Pareja
 * y Vínculos Afectivos», 10 % desde 2026-08-01, DESACTIVADA. Al intentar
 * añadirla otra vez, el dialogo contestaba «Ningún curso con ese nombre» —
 * mientras la tabla de al lado la estaba enseñando dos filas mas arriba.
 */

const colab = (id: number, product_id: number, activa: boolean, formacion = '') => ({
  id, product_id, activa, formacion,
  tutor_id: 1, pct: '10', vigente_desde: '2026-08-01', vigente_hasta: null,
  notas: null, tutor: 'Tatiana', precio: '0', project_id: 1,
} as never);

const TATIANA = [
  colab(1, 55, true, 'Experto en Logopedia'),
  colab(2, 77, false, 'Máster en Terapia de Pareja y Vínculos Afectivos'),
];

describe('que esconde el dialogo de «Añadir formación»', () => {
  it('esconde las que ya rigen', () => {
    expect(lasQueYaRigen(TATIANA)).toContain(55);
  });

  it('pero NO la desactivada, que es la que hay que poder volver a poner', () => {
    // Este es el fallo entero: escondiendola tambien, no salia por ningun lado
    // y la formacion quedaba sin salida — ni reactivar ni rehacer.
    expect(lasQueYaRigen(TATIANA)).not.toContain(77);
  });

  it('sin colaboraciones no esconde nada', () => {
    expect(lasQueYaRigen([])).toEqual([]);
  });
});

describe('elegir una que ya tuvo', () => {
  it('encuentra la dormida por su formación', () => {
    expect(laQueDuerme(TATIANA, 77)?.id).toBe(2);
  });

  it('una que rige NO cuenta como dormida', () => {
    // Si contara, elegirla desde el dialogo la «reactivaria» pisando su
    // porcentaje y su fecha sin que nadie lo pidiera.
    expect(laQueDuerme(TATIANA, 55)).toBeNull();
  });

  it('y una que nunca tuvo, tampoco', () => {
    expect(laQueDuerme(TATIANA, 999)).toBeNull();
  });
});
