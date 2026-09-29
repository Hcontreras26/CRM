import { describe, it, expect } from 'vitest';
import { rellenar, huecosSinRellenar, VARIABLES } from '@/modules/whatsapp/lib/plantilla';

// Rellenar los huecos de una plantilla (#129).
//
// Lo que se prueba aquí no es la plantilla: es lo que acaba LEYENDO el cliente.
// Un hueco que no se rellena no da error en ningún sitio — sale tal cual en el
// mensaje y lo ve la persona al otro lado.

const marta = {
  nombre: 'Marta Ruiz Gómez',
  email: 'marta@ejemplo.com',
  telefono: '+34600111222',
  producto: 'Máster en Neuropsicología',
  plazas: 3,
  cierre: '2026-03-12',
  inicio: 'marzo 2026',
};

describe('los huecos de siempre', () => {
  it('el nombre es el de pila, no el completo', () => {
    // «Hola Marta Ruiz Gómez» no lo escribe nadie.
    expect(rellenar('Hola {nombre}', marta)).toBe('Hola Marta');
    expect(rellenar('{nombreCompleto}', marta)).toBe('Marta Ruiz Gómez');
  });

  it('sin producto no se deja el hueco a la vista', () => {
    expect(rellenar('por {producto}', { nombre: 'Ana' })).toBe('por nuestros programas');
  });

  it('lo que no se conoce se queda como estaba', () => {
    // Un hueco inventado no se borra: borrarlo dejaría una frase coja y nadie
    // sabría por qué. Se ve, y el aviso de «te falta un dato» lo caza.
    expect(rellenar('{loquesea}', marta)).toBe('{loquesea}');
  });
});

describe('el hueco con tilde — el que se enviaba roto', () => {
  // La pantalla de plantillas ofrecía `{teléfono}` en su lista de variables, y
  // `rellenar` usaba `\w`, que no casa con `é`. Resultado: quien copiaba ese
  // nombre de la lista mandaba «mi teléfono es {teléfono}» a un cliente.
  it('«{teléfono}» se rellena, no se envía tal cual', () => {
    expect(rellenar('mi {teléfono}', marta)).toBe('mi +34600111222');
  });

  it('y «{telefono}» sin tilde sigue valiendo', () => {
    // Hay plantillas guardadas con las dos formas: arreglar una no puede romper
    // la otra.
    expect(rellenar('mi {telefono}', marta)).toBe('mi +34600111222');
  });

  it('el aviso de «te falta un dato» también lo ve', () => {
    // Antes ni siquiera lo contaba como hueco, así que el aviso decía que estaba
    // todo bien.
    expect(huecosSinRellenar('mi {teléfono}', { nombre: 'Ana' })).toContain('telefono');
  });

  it('la lista que se enseña y la que se rellena son la MISMA', () => {
    // De tener dos salió el fallo de arriba.
    for (const v of VARIABLES) {
      expect(rellenar(`{${v.clave}}`, marta), v.clave).not.toBe(`{${v.clave}}`);
    }
  });
});

describe('los datos de su formación', () => {
  it('las plazas y las fechas entran', () => {
    expect(rellenar('quedan {plazas} plazas', marta)).toBe('quedan 3 plazas');
    expect(rellenar('cierra el {cierre}', marta)).toBe('cierra el 12 de marzo');
    expect(rellenar('empieza en {inicio}', marta)).toBe('empieza en marzo 2026');
  });

  it('una convocatoria sobrevendida NO dice «-2 plazas»', () => {
    // En el catálogo el número sale negativo a propósito, para que el
    // administrador lo vea. De cara al cliente se corta en cero.
    expect(rellenar('quedan {plazas}', { ...marta, plazas: -2 })).toBe('quedan 0');
  });

  it('una formación sin cuenta de plazas deja el hueco vacío y avisa', () => {
    // Vacío y no «null»: mandar «quedan null plazas» es peor que un hueco.
    const sinPlazas = { ...marta, plazas: null, cierre: null };
    expect(rellenar('quedan {plazas}', sinPlazas)).toBe('quedan ');
    expect(huecosSinRellenar('quedan {plazas} hasta el {cierre}', sinPlazas))
      .toEqual(expect.arrayContaining(['plazas', 'cierre']));
  });

  it('la fecha no se va un día al pintarla', () => {
    // `new Date('2026-03-12')` se lee en UTC y en España sale el 11. Es el mismo
    // fallo que el CRM ya tuvo con las columnas DATE.
    expect(rellenar('{cierre}', { ...marta, cierre: '2026-01-01' })).toBe('1 de enero');
  });
});
