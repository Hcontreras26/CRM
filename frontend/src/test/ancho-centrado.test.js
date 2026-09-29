import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Si se limita el ancho, se centra (#79 · punto 4).
 *
 * Una pantalla con `max-w-2xl` y sin `mx-auto` se queda pegada a la izquierda
 * con un hueco en blanco a la derecha. Pasaba en seis, y la de «Mi perfil» era
 * la más visible.
 *
 * La regla vale para el contenedor RAÍZ de una pantalla, no para todo lo que
 * lleve `max-w-`:
 *
 *  · Un panel de diálogo (`w-full max-w-md`) ya lo centra su padre, que es un
 *    `flex items-center justify-center`. Ponerle `mx-auto` sobra.
 *  · Un párrafo con el ancho topado —la medida de lectura— tiene que seguir
 *    alineado con su título, no centrado.
 *  · Un `max-w-` para truncar texto no es un contenedor.
 *
 * Por eso esto mira solo la primera línea después de `return (`.
 */

const SRC = path.resolve(__dirname, '..');

// Ángel lleva WhatsApp y el widget: quedan fuera del rediseño para no pisarnos
// (es el punto 1 de este mismo issue).
const DE_OTRO = [/modules[\\/]whatsapp[\\/]/, /modules[\\/]widget[\\/]/];

function pantallas(dir, salida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) pantallas(p, salida);
    else if (/Page\.(tsx|jsx)$/.test(e.name)) salida.push(p);
  }
  return salida;
}

describe('si se limita el ancho, se centra (#79)', () => {
  it('ninguna pantalla queda pegada a la izquierda con hueco al lado', () => {
    const sinCentrar = [];

    for (const f of pantallas(SRC)) {
      if (DE_OTRO.some((rx) => rx.test(f))) continue;
      const texto = fs.readFileSync(f, 'utf8');

      // La raíz: el primer elemento tras un `return (` a nivel de componente.
      for (const m of texto.matchAll(/^ {2}return \(\s*\n\s*<div className="([^"]+)"/gm)) {
        const clases = m[1];
        const limita = /\bmax-w-(\[[^\]]+\]|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)\b/.test(clases);
        const centra = /\bmx-auto\b/.test(clases);
        // `w-full max-w-*` es el modo de un panel de diálogo, y su padre ya lo
        // centra. No es una pantalla.
        const esPanel = /\bw-full\b/.test(clases) || /\bfixed\b/.test(clases);
        if (limita && !centra && !esPanel) {
          sinCentrar.push(`${path.relative(SRC, f).replace(/\\/g, '/')} → ${clases}`);
        }
      }
    }

    expect(sinCentrar, 'pantallas con el ancho topado y sin centrar').toEqual([]);
  });
});
