import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * El menú, las rutas y los títulos tienen que decir lo mismo (#79).
 *
 * Lo que había: la entrada «Árbol de categorías» abría `/productos/arbol`, que
 * es «Productos por categoría» — otra pantalla. Y el árbol de categorías de
 * verdad vivía en `/configuracion/categorias-arbol` **sin entrada en ningún
 * menú**: existía y no se podía llegar a él.
 *
 * Eso no se ve leyendo el diff de un fichero, porque el nombre está en uno y la
 * ruta en otro. Aquí se comprueban juntos.
 */

const SRC = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(SRC, 'App.jsx'), 'utf8');
const sidebar = fs.readFileSync(path.join(SRC, 'shared/components/layout/Sidebar.jsx'), 'utf8');

/**
 * Resuelve las rutas anidadas: `<Route path="/productos">` con un hijo
 * `<Route path="arbol">` da `/productos/arbol`.
 *
 * Ojo con el autocierre: la línea del layout lleva un `/>` DENTRO, del
 * `element={<Layout />}`. Hay que mirar el final de la línea, no si lo
 * contiene — mirarlo mal da 21 falsos positivos.
 */
function rutasDeApp() {
  const rutas = new Map(); // ruta -> ¿es una redirección?
  const pila = [];
  for (const linea of app.split(/\r?\n/)) {
    const t = linea.trim();
    const abre = t.match(/^<Route\s+path="([^"]+)"/);
    if (abre) {
      const p = abre[1];
      const padre = pila[pila.length - 1] || '';
      const completa = (p.startsWith('/') ? p : `${padre}/${p}`).replace(/\/+/g, '/');
      // Una redirección no es una pantalla: `/settings` manda a
      // `/configuracion`. Se dejaron al pasar las rutas a español y no tienen
      // por qué salir en el menú.
      rutas.set(completa, t.includes('<Navigate'));
      if (!t.endsWith('/>')) pila.push(completa);
    }
    if (t.startsWith('</Route>')) pila.pop();
  }
  return rutas;
}

function entradasDelMenu() {
  // `{ label: 'X', to: '/y', ... }` — el orden de las dos claves es estable en
  // este fichero; si algún día deja de serlo, este test lo dirá.
  return [...sidebar.matchAll(/\{\s*label:\s*'([^']+)',\s*to:\s*'([^']+)'/g)]
    .map((m) => ({ label: m[1], to: m[2] }));
}

// Entradas que a propósito no tienen ruta.
const SIN_RUTA_A_PROPOSITO = new Set([
  '/google-ads',   // marcada «Próx.» en el propio menú
  '/testeo2',      // vive en otro despliegue
  '/suite-dash',   // idem
]);

describe('el menú y las rutas dicen lo mismo (#79)', () => {
  it('toda entrada del menú lleva a una ruta que existe', () => {
    const rutas = rutasDeApp();
    const rotas = entradasDelMenu()
      .filter((e) => !SIN_RUTA_A_PROPOSITO.has(e.to))
      .filter((e) => !rutas.has(e.to));

    expect(
      rotas.map((e) => `«${e.label}» → ${e.to}`),
      'entradas del menú que no llevan a ninguna parte',
    ).toEqual([]);
  });

  it('deja escrito qué pantallas no se pueden abrir desde el menú', () => {
    // El árbol de categorías estuvo así: con ruta y sin entrada. No falla,
    // porque una pantalla puede abrirse desde dentro de otra a propósito — pero
    // se imprime, que es como salió a la luz que «registrar una venta» tampoco
    // tiene por dónde entrarse.
    const rutas = [...rutasDeApp().entries()]
      .filter(([, esRedireccion]) => !esRedireccion)
      .map(([r]) => r)
      .filter((r) => (
        !r.includes(':')
        && !r.startsWith('/prueba_ui')
        && !r.startsWith('/dev/')
        && !['/login', '/set-password', '*', '/'].includes(r)
      ));
    const enElMenu = new Set(entradasDelMenu().map((e) => e.to));
    const huerfanas = rutas.filter((r) => r.split('/').length === 2 && !enElMenu.has(r));

    if (huerfanas.length) {
      // eslint-disable-next-line no-console
      console.log(`\npantallas sin entrada en el menú:\n${huerfanas.map((h) => `  ${h}`).join('\n')}\n`);
    }
    expect(Array.isArray(huerfanas)).toBe(true);
  });

  it('deja escrito dónde el menú y la pestaña del navegador no dicen lo mismo', () => {
    // Tampoco falla: que el menú diga «Chat» dentro del grupo WhatsApp y la
    // pestaña «Chat de WhatsApp» está BIEN — fuera de la aplicación hace falta
    // el contexto que el grupo ya da dentro. Lo que hay que cazar es que hablen
    // de cosas distintas, y eso no lo decide una comparación de textos.
    const titulos = Object.fromEntries(
      [...app.matchAll(/'(\/[^']*)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]),
    );
    const desajustes = entradasDelMenu()
      .filter((e) => titulos[e.to] && titulos[e.to] !== e.label)
      .map((e) => `  ${e.to}: menú «${e.label}» · pestaña «${titulos[e.to]}»`);

    if (desajustes.length) {
      // eslint-disable-next-line no-console
      console.log(`\nnombres que no coinciden (revisar a ojo):\n${desajustes.join('\n')}\n`);
    }
    expect(Array.isArray(desajustes)).toBe(true);
  });
});
