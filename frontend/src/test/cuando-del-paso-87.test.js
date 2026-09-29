import { describe, it, expect } from 'vitest';
import { textoDeDiasEscritos, tieneVentanaDeDias } from '@/modules/proceso/lib/cuando';

/*
  La frase sale de los números, no se escribe aparte (#87).

  Diego, cerrando el issue: «la etiqueta debería salir de los números... Un
  texto que repite lo que dice otro campo acaba contradiciéndolo — es justo lo
  que pasó aquí». Lo que pasó fue que un paso decía «Lunes o martes» encima de
  unos días que decían otra cosa.

  Aquí se comprueba lo que el diálogo usa para decidirlo mientras se teclea.
*/

describe('la frase, según lo que hay escrito en el formulario', () => {
  it('lo dice con los dos días puestos', () => {
    expect(textoDeDiasEscritos('2', '3')).toBe('A los 2 o 3 días');
    expect(textoDeDiasEscritos('7', '8')).toBe('A los 7 u 8 días');
  });

  it('con uno solo, también', () => {
    // Escribiendo el «desde» y antes de llegar al «hasta» ya se lee algo.
    expect(textoDeDiasEscritos('4', '')).toBe('A los 4 días');
    expect(textoDeDiasEscritos('', '4')).toBe('A los 4 días');
  });

  it('un campo vacío NO es un cero', () => {
    // Con `Number('')` saldría 0 y el paso diría «El mismo día» por no haber
    // escrito nada todavía. Es el fallo que más fácil se cuela aquí.
    expect(textoDeDiasEscritos('', '')).toBeNull();
  });

  it('el día cero sí es un día', () => {
    expect(textoDeDiasEscritos('0', '0')).toBe('El mismo día');
    expect(textoDeDiasEscritos('0', '1')).toBe('El mismo día o al siguiente');
  });

  it('mientras el rango es imposible no dice nada', () => {
    // Ya lo cuenta el error del propio campo; enseñar además una frase al
    // revés —«a los 5 o 2 días»— es ruido encima de un fallo.
    expect(textoDeDiasEscritos('5', '2')).toBeNull();
  });

  it('lo que no es un número no se inventa', () => {
    expect(textoDeDiasEscritos('hola', '')).toBeNull();
  });
});

describe('cuándo manda la pantalla y cuándo mandas tú', () => {
  it('con cualquiera de los dos días, manda la pantalla', () => {
    expect(tieneVentanaDeDias('2', '3')).toBe(true);
    expect(tieneVentanaDeDias('4', '')).toBe(true);
    expect(tieneVentanaDeDias('', '4')).toBe(true);
  });

  it('sin días, se escribe a mano', () => {
    // Es el paso 5: «Final de mes», de calendario y no de lo que lleva
    // esperando la persona. Ese es el único que se teclea.
    expect(tieneVentanaDeDias('', '')).toBe(false);
    expect(tieneVentanaDeDias('  ', '  ')).toBe(false);
  });
});
