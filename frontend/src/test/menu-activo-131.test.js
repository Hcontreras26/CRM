import { describe, it, expect } from 'vitest';
import { hayRutaMasConcreta } from '@/shared/components/layout/Sidebar';

/*
  Cuál de las entradas del menú se enciende (#131).

  Salió mirando la pantalla, no leyendo el código: al abrir Conectores, el menú
  marcaba «Formularios». `NavLink` sin `end` enciende una entrada en cualquier
  ruta que cuelgue de la suya, y Formularios vive en `/captacion`.

  `hayRutaMasConcreta` es lo que se le pasa como `end`. Devuelve true cuando hay
  otra entrada del menú que cubre mejor la ruta actual — y entonces esta exige
  coincidencia exacta y se apaga.
*/

// Las de verdad no: aquí interesa la regla, no el menú de hoy. Si mañana se
// mueve una entrada, esta prueba tiene que seguir diciendo lo mismo.
const MENU = [
  '/captacion',
  '/captacion/make',
  '/captacion/webhooks',
  '/captacion/conectores',
  '/productos',
  '/productos/woocommerce',
  '/productos/pendientes',
  '/prospectos',
];

const mas = (camino, ruta) => hayRutaMasConcreta(camino, ruta, MENU);

describe('el menú marca la entrada que toca', () => {
  it('en Conectores no se enciende Formularios', () => {
    // El fallo del #131, tal cual.
    expect(mas('/captacion/conectores', '/captacion')).toBe(true);
  });

  it('y Conectores sí se enciende', () => {
    expect(mas('/captacion/conectores', '/captacion/conectores')).toBe(false);
  });

  it('pasaba igual en todo el Catálogo', () => {
    expect(mas('/productos/woocommerce', '/productos')).toBe(true);
    expect(mas('/productos/pendientes', '/productos')).toBe(true);
  });
});

describe('pero una ficha sigue encendiendo su sección', () => {
  it('la ficha de un producto no está en el menú, así que manda Productos', () => {
    // Esto es lo que impide arreglarlo exigiendo coincidencia exacta a secas:
    // se apagaría el menú entero en todas las fichas.
    expect(mas('/productos/123', '/productos')).toBe(false);
  });

  it('y lo que cuelga de una entrada de segundo nivel, también', () => {
    expect(mas('/productos/woocommerce/historial', '/productos/woocommerce')).toBe(false);
  });
});

describe('lo que no encaja no cuenta', () => {
  it('una ruta de otra sección no enciende nada de esta', () => {
    expect(mas('/prospectos', '/captacion')).toBe(false);
  });

  it('un nombre que EMPIEZA igual no es lo mismo que colgar de ella', () => {
    // `/productos-pendientes` empieza por `/productos` pero no está dentro. Con
    // un `startsWith` a secas —sin la barra— saldría que sí.
    expect(mas('/productos-pendientes', '/productos')).toBe(false);
  });

  it('una entrada sin ruta no rompe nada', () => {
    expect(mas('/productos', undefined)).toBe(false);
  });
});
