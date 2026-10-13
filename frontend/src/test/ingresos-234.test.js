import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { decodificarEntidades } from '@/shared/lib/entidadesHtml';

/*
  Dos detalles de Ingresos (#234).

  1. El filtro de cursos enseñaba «Coaching &amp; Liderazgo». El servidor ya
     guarda el nombre limpio al importarlo; los que entraron antes se enseñan
     con la letra al pintarlos, sin `dangerouslySetInnerHTML`.
  2. Salían dos filas de atajos de fecha («Hoy · Ayer · …»): el componente
     compartido estaba puesto dos veces. En MultiCRM, Ventas es esta misma
     pantalla, así que se arregla también el #223.
*/

describe('los nombres de curso se pintan con la letra', () => {
  it('«&amp;» se enseña como «&»', () => {
    expect(decodificarEntidades('Máster en Coaching &amp; Liderazgo')).toBe('Máster en Coaching & Liderazgo');
  });

  it('las numéricas de WordPress también', () => {
    expect(decodificarEntidades('Curso &#8211; Online')).toBe('Curso – Online');
    expect(decodificarEntidades('l&#8217;Institut')).toBe('l’Institut');
  });

  it('no convierte en etiqueta lo que no lo era: devuelve texto', () => {
    // «&lt;script&gt;» se queda en texto con sus signos; React lo pinta como
    // texto, así que no se ejecuta nada.
    expect(decodificarEntidades('&lt;script&gt;')).toBe('<script>');
    expect(decodificarEntidades('a &amp;lt; b')).toBe('a &lt; b');
  });

  it('lo que no es texto vuelve igual', () => {
    expect(decodificarEntidades(null)).toBeNull();
    expect(decodificarEntidades(undefined)).toBeUndefined();
  });
});

describe('Ingresos tiene UNA fila de atajos de fecha', () => {
  const fuente = readFileSync(resolve(__dirname, '../modules/accounting/pages/IncomePage.tsx'), 'utf8');

  it('un solo RangoRapido, y ninguna copia propia de los atajos', () => {
    expect(fuente.match(/<RangoRapido\b/g) || []).toHaveLength(1);
    expect(fuente).not.toMatch(/function atajosDeFecha/);
  });

  it('el filtro de cursos y la lista pintan el nombre decodificado', () => {
    expect(fuente).toMatch(/<option key=\{c\} value=\{c\}>\{decodificarEntidades\(c\)\}<\/option>/);
    expect(fuente).not.toMatch(/\{r\.producto \|\| '—'\}/);
  });
});
