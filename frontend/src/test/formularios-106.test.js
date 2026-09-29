import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

/*
  Los formularios, con el mismo formato (#106).

  Dos candados y un recuento.

  Los candados cierran lo que ya está unificado: una sola `inputClass` y un
  solo `Field` en todo el proyecto. Si mañana alguien vuelve a escribirse el
  suyo —que es como se llegó a 16 copias con 6 valores distintos— salta aquí.

  El recuento deja escrito lo que falta. Las etiquetas de los formularios que
  nombra el issue están puestas; en el resto del CRM quedan escritas a mano y
  con estilos distintos. No se migran todas de golpe: son ~80 ficheros y eso
  no hay quien lo revise.
*/

const SRC = resolve(__dirname, '..');

function ficheros(dir, acc = []) {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre === 'test' || nombre === 'node_modules') continue;
      ficheros(ruta, acc);
    } else if (/\.(tsx|jsx|ts)$/.test(nombre)) {
      acc.push(ruta);
    }
  }
  return acc;
}

const TODOS = ficheros(SRC).map((ruta) => ({
  ruta: ruta.replace(SRC, 'src').replace(/\\/g, '/'),
  texto: readFileSync(ruta, 'utf8'),
}));

describe('formato de los formularios (#106)', () => {
  it('la clase del campo se define en un solo sitio', () => {
    // `export { inputClass } from …` es un reenvío, no otra definición.
    const definen = TODOS
      .filter(({ texto }) => /^\s*(?:export\s+)?(?:const|let)\s+inputClass\s*=/m.test(texto))
      .map(({ ruta }) => ruta);
    expect(definen).toEqual(['src/shared/lib/ui.ts']);
  });

  it('el envoltorio del campo se define en un solo sitio', () => {
    const definen = TODOS
      .filter(({ texto }) => /^\s*(?:export\s+default\s+)?function\s+Field\s*\(/m.test(texto))
      .map(({ ruta }) => ruta);
    expect(definen).toEqual(['src/shared/components/ui/Field.tsx']);
  });

  it('los formularios que pedía Diego no tienen etiquetas sueltas', () => {
    // Los nueve del issue: prospecto, venta, factura, usuario, producto,
    // tutor, campos personalizados, plantillas de correo y secuencias.
    const NOMBRADOS = [
      'src/modules/leads/components/LeadFormDialog.tsx',
      'src/modules/conversions/components/ConversionDialog.tsx',
      'src/modules/sales/components/RegisterSaleDialog.tsx',
      'src/modules/invoices/pages/InvoiceCreatePage.tsx',
      'src/modules/invoices/components/FiscalDataDialog.tsx',
      'src/modules/users/components/UserFormDialog.tsx',
      'src/modules/products/components/ProductFormDialog.tsx',
      'src/modules/tutores/pages/TutoresPage.tsx',
      'src/modules/email-templates/pages/EmailTemplatesPage.tsx',
    ];
    // Lo que tiene que coincidir es el tamaño y el espaciado. Un énfasis
    // puntual —la etiqueta del aviso de proyecto va en `text-info` porque
    // vive dentro de un recuadro de color— no rompe la uniformidad; un
    // tamaño distinto sí.
    const ESQUELETO = ['mb-1.5', 'block', 'px-1', 'text-secundario'];
    const sueltas = [];
    for (const ruta of NOMBRADOS) {
      const f = TODOS.find((x) => x.ruta === ruta);
      if (!f) { sueltas.push(`${ruta}: no existe`); continue; }
      for (const m of f.texto.matchAll(/<label className="([^"{}]+)"/g)) {
        const clases = m[1].split(/\s+/);
        // Las que envuelven una casilla llevan `flex` y no son etiquetas de campo.
        if (clases.includes('flex') || clases.includes('inline-flex')) continue;
        const falta = ESQUELETO.filter((c) => !clases.includes(c));
        if (falta.length) sueltas.push(`${ruta}: le falta ${falta.join(' ')} — ${m[1]}`);
      }
    }
    expect(sueltas).toEqual([]);
  });

  it('deja escrito cuántas etiquetas sueltas quedan en el resto del CRM', () => {
    const CANON = 'mb-1.5 block px-1 text-secundario text-muted-foreground';
    const estilos = new Map();
    let total = 0;
    for (const { ruta, texto } of TODOS) {
      for (const m of texto.matchAll(/<label className="([^"{}]+)"/g)) {
        const clases = m[1];
        if (/\bflex\b/.test(clases) || clases === CANON) continue;
        const clave = clases.split(/\s+/).sort().join(' ');
        estilos.set(clave, (estilos.get(clave) || 0) + 1);
        total += 1;
      }
    }
    const ordenados = [...estilos.entries()].sort((a, b) => b[1] - a[1]);
    console.log('\netiquetas de formulario sin unificar (tarea que sigue abierta):');
    for (const [clases, n] of ordenados.slice(0, 8)) {
      console.log(`  ${String(n).padStart(4)}  ${clases.slice(0, 90)}`);
    }
    console.log(`  ${String(total).padStart(4)}  TOTAL, en ${estilos.size} estilos distintos\n`);
    // Sin número fijo: es un recuento, no un límite. Lo que no puede es crecer
    // sin que nadie lo vea.
    expect(total).toBeGreaterThanOrEqual(0);
  });
});
