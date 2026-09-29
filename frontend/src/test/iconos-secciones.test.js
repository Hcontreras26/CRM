import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/*
  Un icono por encabezado de sección del menú (#105).

  Se lee el fichero en vez de importar `NAV_SECTIONS` porque no se exporta, y
  exportarlo solo para el test sería cambiar el código por la prueba. Lo que
  interesa aquí es la declaración, que es donde se olvida el icono al añadir
  una sección nueva.
*/

const FUENTE = readFileSync(
  resolve(__dirname, '../shared/components/layout/Sidebar.jsx'),
  'utf8',
);

function seccionesDelMenu() {
  const ini = FUENTE.indexOf('const NAV_SECTIONS');
  const fin = FUENTE.indexOf('\n];', ini);
  const bloque = FUENTE.slice(ini, fin);

  const secciones = [];
  let actual = null;
  for (const linea of bloque.split('\n')) {
    const etiqueta = linea.match(/^ {4}label: '([^']+)',/);
    if (etiqueta) {
      actual = { nombre: etiqueta[1], icono: null, iconosDeEntradas: [] };
      secciones.push(actual);
      continue;
    }
    if (!actual) continue;
    // El icono de la sección va en su propia línea, con la misma sangría que
    // su `label`. Los de las entradas van dentro de un objeto, más adentro.
    const suyo = linea.match(/^ {4}icon: (\w+),/);
    if (suyo) { actual.icono = suyo[1]; continue; }
    const deEntrada = linea.match(/icon: (\w+)/);
    if (deEntrada) actual.iconosDeEntradas.push(deEntrada[1]);
  }
  return secciones;
}

describe('los encabezados de sección del menú', () => {
  const secciones = seccionesDelMenu();

  it('se encuentran las secciones del menú', () => {
    // Si esto falla, la forma del fichero ha cambiado y el resto del test
    // estaría comprobando el vacío sin enterarse.
    expect(secciones.length).toBeGreaterThanOrEqual(8);
    expect(secciones.map((s) => s.nombre)).toContain('Principal');
  });

  it('todas tienen icono, incluida la que se añada mañana', () => {
    const sinIcono = secciones.filter((s) => !s.icono).map((s) => s.nombre);
    expect(sinIcono).toEqual([]);
  });

  it('ningún encabezado repite el icono de una de sus propias entradas', () => {
    // Si el encabezado lleva el mismo dibujo que una de sus filas deja de
    // ordenar y pasa a confundir, que es lo contrario de lo que se pedía.
    const repetidos = secciones
      .filter((s) => s.icono && s.iconosDeEntradas.includes(s.icono))
      .map((s) => `${s.nombre} usa ${s.icono}, que ya es de una de sus entradas`);
    expect(repetidos).toEqual([]);
  });

  it('todos los iconos usados están importados', () => {
    const importados = FUENTE.slice(0, FUENTE.indexOf("from '@phosphor-icons/react'"));
    const faltan = secciones
      .filter((s) => s.icono && !new RegExp(`\\b${s.icono}\\b`).test(importados))
      .map((s) => `${s.nombre}: ${s.icono}`);
    expect(faltan).toEqual([]);
  });

  it('se pintan del mismo tamaño y peso que los de las entradas', () => {
    // Diego lo pidió así para que ordenen sin competir. Las entradas usan
    // `size={18} weight="regular"`, y el encabezado tiene que ir igual.
    const pintadas = FUENTE.match(/<SectionIcon size=\{(\d+)\} weight="(\w+)"/g) || [];
    expect(pintadas.length).toBe(2); // desplegado y plegado
    for (const uso of pintadas) {
      expect(uso).toContain('size={18}');
      expect(uso).toContain('weight="regular"');
    }
  });
});
