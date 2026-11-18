import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/*
  Un icono por encabezado de sección del menú (#105).

  Antes se leía la declaración en el fichero. Desde el reparto por bloques de uso
  (#534, parte 3) el menú se arma con `reagruparMenu` y los iconos de los bloques
  nuevos van en esa llamada, así que se mira el menú de verdad: `NAV_SECTIONS`,
  el que se pinta. Una sección sin icono o con el de una de sus entradas sale
  igual, venga de donde venga.
*/

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, permissions: null }) }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ({}) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({}), useOptionalTheme: () => 'dark' }));
vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { NAV_SECTIONS } = await import('@/shared/components/layout/Sidebar');

const FUENTE = readFileSync(
  resolve(__dirname, '../shared/components/layout/Sidebar.jsx'),
  'utf8',
);

function seccionesDelMenu() {
  return NAV_SECTIONS.map((s) => ({
    nombre: s.label,
    icono: s.icon || null,
    iconosDeEntradas: s.items.flatMap((i) => [i.icon, ...(i.children || []).map((c) => c.icon)]).filter(Boolean),
  }));
}

describe('los encabezados de sección del menú', () => {
  const secciones = seccionesDelMenu();

  it('se encuentran las secciones del menú', () => {
    // Si esto falla, la forma del fichero ha cambiado y el resto del test
    // estaría comprobando el vacío sin enterarse.
    expect(secciones.length).toBeGreaterThanOrEqual(8);
    expect(secciones.map((s) => s.nombre)).toContain('Hoy');
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
      .map((s) => `${s.nombre} usa ${s.icono.displayName || s.icono.name || 'su icono'}, que ya es de una de sus entradas`);
    expect(repetidos).toEqual([]);
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
