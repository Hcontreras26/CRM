import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * El contraste de los tokens, medido (#32: «comprobar el modo oscuro con los
 * tokens nuevos»).
 *
 * Mirarlo a ojo no basta: `text-warning` daba 2,0:1 en claro y `text-destructive`
 * 3,7:1 sobre una tarjeta en oscuro, y en pantalla «se veía». Aquí se calcula
 * con la fórmula de WCAG a partir de index.css y de los colores que usa
 * Tailwind para cada clase de texto, en claro y en oscuro. El mínimo es 4,5:1,
 * el de texto normal.
 */

const RAIZ = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(RAIZ, 'index.css'), 'utf8');

function bloque(selector) {
  const i = css.search(selector);
  const ini = css.indexOf('{', i);
  return css.slice(ini, css.indexOf('}', ini));
}
function variables(texto) {
  const v = {};
  for (const m of texto.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) v[m[1]] = m[2].trim();
  return v;
}
const claro = variables(bloque(/:root\s*\{/));
const oscuro = { ...claro, ...variables(bloque(/\.dark\s*\{/)) };

// Sigue los var(--x) hasta llegar a «H S% L%».
function hsl(vars, nombre) {
  let v = vars[nombre];
  for (let i = 0; i < 5 && /^var\(--/.test(v); i++) v = vars[v.match(/var\(--([a-z0-9-]+)\)/)[1]];
  const [h, s, l] = v.match(/[\d.]+/g).map(Number);
  return [h, s / 100, l / 100];
}
function luminancia([h, s, l]) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  const [r, g, b] = [f(0), f(8), f(4)].map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contraste = (vars, a, b) => {
  const x = luminancia(hsl(vars, a)), y = luminancia(hsl(vars, b));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// La variable que pinta cada clase de texto (tailwind.config.js: textColor).
const LETRA = {
  'text-warning': 'warning-soft-foreground',
  'text-destructive': 'destructive-text',
  'text-success': 'success',
  'text-info': 'info',
  'text-primary': 'primary',
  'text-muted-foreground': 'muted-foreground',
};
const PAREJAS = [
  ['primary-foreground', 'primary'], ['success-foreground', 'success'], ['info-foreground', 'info'],
  ['warning-foreground', 'warning'], ['destructive-foreground', 'destructive'],
  ['success-soft-foreground', 'success-soft'], ['info-soft-foreground', 'info-soft'],
  ['warning-soft-foreground', 'warning-soft'], ['destructive-soft-foreground', 'destructive-soft'],
];

describe('contraste de los tokens (#32)', () => {
  for (const [tema, vars] of [['claro', claro], ['oscuro', oscuro]]) {
    it(`cada color de letra se lee sobre el fondo y sobre una tarjeta, en ${tema}`, () => {
      const malos = [];
      for (const [clase, v] of Object.entries(LETRA)) {
        for (const fondo of ['background', 'card']) {
          const c = contraste(vars, v, fondo);
          if (c < 4.5) malos.push(`${clase} sobre ${fondo}: ${c.toFixed(2)}:1`);
        }
      }
      expect(malos.join('\n'), 'por debajo de 4,5:1').toBe('');
    });

    it(`cada fondo de token con su letra se lee, en ${tema}`, () => {
      const malos = PAREJAS.map(([l, f]) => [l, f, contraste(vars, l, f)]).filter(([, , c]) => c < 4.5)
        .map(([l, f, c]) => `${l} sobre ${f}: ${c.toFixed(2)}:1`);
      expect(malos.join('\n'), 'por debajo de 4,5:1').toBe('');
    });
  }

  it('las clases de letra apuntan a esas variables en tailwind.config.js', () => {
    const conf = fs.readFileSync(path.resolve(RAIZ, '..', 'tailwind.config.js'), 'utf8');
    expect(conf).toMatch(/warning:\s*\{\s*DEFAULT:\s*'hsl\(var\(--warning-soft-foreground\)\)'/);
    expect(conf).toMatch(/destructive:\s*\{\s*DEFAULT:\s*'hsl\(var\(--destructive-text\)\)'/);
  });
});
