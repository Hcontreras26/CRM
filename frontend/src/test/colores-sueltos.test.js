import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * El candado del #32.
 *
 * «Repasar que no quedan colores sueltos» no se puede cerrar mirándolo una vez:
 * la próxima pantalla vuelve a escribir `bg-emerald-50` y nadie se entera hasta
 * que el CRM ya no se parece a sí mismo otra vez.
 *
 * Así que el repaso queda aquí, ejecutándose en cada cambio. Lo que exige es
 * que **las piezas compartidas** —las 22 primitivas y el marco— no lleven ni un
 * color a pelo: son las que pintan las 82 pantallas a la vez, y si se ensucian
 * se ensucia todo.
 *
 * Las pantallas de cada módulo NO se exigen aquí: esa deuda es la tarea #34, se
 * paga bloque a bloque, y el test la mide para que se vea cuánto queda en vez
 * de estimarla a ojo.
 */

const RAIZ = path.resolve(__dirname, '..');

// Las familias de color de Tailwind escritas a mano. Los tokens del CRM
// (primary, muted, success, warning, info, destructive) no caen aquí porque no
// llevan número: `bg-success-soft`, no `bg-emerald-100`.
const SUELTO = /\b(bg|text|border|ring|from|to|via|divide|outline|decoration|shadow)-(red|blue|green|emerald|amber|yellow|orange|violet|purple|fuchsia|slate|gray|zinc|neutral|stone|sky|indigo|rose|pink|teal|cyan|lime)-\d{2,3}\b/g;

function ficheros(dir) {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return [];
  const salida = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    // Con barras normales siempre: en Windows `path.join` mete `\` y entonces
    // las comparaciones de este test dependen del sistema operativo.
    const rel = `${dir}/${e.name}`.replace(/^\.\//, '');
    if (e.isDirectory()) salida.push(...ficheros(rel));
    else if (/\.(tsx|jsx|ts)$/.test(e.name) && !e.name.endsWith('.d.ts')) salida.push(rel);
  }
  return salida;
}

function contar(dir, excluir = null) {
  const porFichero = [];
  let total = 0;
  for (const f of ficheros(dir)) {
    if (excluir && excluir.test(f)) continue;
    const n = (fs.readFileSync(path.join(RAIZ, f), 'utf8').match(SUELTO) || []).length;
    if (n > 0) porFichero.push({ f, n });
    total += n;
  }
  porFichero.sort((a, b) => b.n - a.n);
  return { total, porFichero };
}

describe('colores sueltos escritos a mano (#32)', () => {
  it('las 22 primitivas no llevan ninguno', () => {
    const { total, porFichero } = contar('shared/components/ui');
    // El mensaje nombra al culpable: si falla, dice qué fichero y cuántos, que
    // es lo que hace falta para arreglarlo sin ponerse a buscar.
    expect(porFichero.map((x) => `${x.f} (${x.n})`).join('\n'), 'primitivas sucias').toBe('');
    expect(total).toBe(0);
  });

  it('el marco tampoco: menú, cabecera, avisos y errores', () => {
    //  queda fuera: es de Ángel —el aviso de llamada de
    // WhatsApp— y vive aquí solo porque se monta en toda la aplicación. WhatsApp
    // está fuera del rediseño para no pisarnos (#79, punto 1), y eso incluye
    // sus piezas aunque el directorio sea este.
    const { total, porFichero } = contar('shared/components/layout', /AvisoDeLlamada/);
    expect(porFichero.map((x) => `${x.f} (${x.n})`).join('\n'), 'marco sucio').toBe('');
    expect(total).toBe(0);
  });

  it('la paleta de identidad vive en un solo sitio', () => {
    // Es la única excepción: hacen falta ocho matices que se distingan para
    // reconocer a una persona o una marca, y un token semántico no da eso. Lo
    // que sí se exige es que no haya cinco copias, que es como estaba.
    const copias = ficheros('.')
      .filter((f) => !f.startsWith('test'))
      .filter((f) => /AVATAR_COLORS\s*(:|=)/.test(fs.readFileSync(path.join(RAIZ, f), 'utf8')));

    expect(copias, `la paleta está duplicada en:\n${copias.join('\n')}`).toEqual(['shared/lib/ui.ts']);
  });

  it('deja escrito cuánta deuda queda por módulo, que es la tarea #34', () => {
    // ESTO SÍ FALLA, y es la mitad que faltaba del #32.
    //
    // Hasta ahora solo imprimía el marcador y comprobaba `total >= 0`, que es
    // verdad siempre. O sea: medía, pero no cerraba. Llevar los ocho bloques a
    // cero cuesta semanas y volver a ensuciarlos cuesta una línea, así que sin
    // tope el trabajo se deshace solo y nadie se entera hasta la siguiente
    // revisión.
    //
    // EL TECHO SOLO PUEDE BAJAR. Si un bloque sube por encima de su número, la
    // prueba falla y dice cuál y cuánto. Si baja —porque alguien ha limpiado
    // más— no falla: avisa de que se puede apretar la tuerca, y apretarla es
    // cambiar un número en esta tabla.
    //
    // Se pone a cero porque ahí están los ocho hoy. Si esta rama entrara antes
    // de que los bloques estén limpios, habría que escribir aquí el número de
    // ese momento y bajarlo después.
    const TECHO = {
      '1 · Prospectos': 0,
      '2 · Clientes y matrículas': 0,
      '3 · Ventas y conversiones': 0,
      '4 · Finanzas': 0,
      '5 · Tutores y comisiones': 0,
      '6 · Publicidad y análisis': 0,
      '7 · Ajustes y administración': 0,
      '8 · Entrar, contraseña y errores': 0,
    };

    const bloques = {
      '1 · Prospectos': ['modules/leads'],
      '2 · Clientes y matrículas': ['modules/clients', 'modules/matriculas'],
      '3 · Ventas y conversiones': ['modules/sales', 'modules/conversions'],
      '4 · Finanzas': ['modules/accounting', 'modules/invoices'],
      '5 · Tutores y comisiones': ['modules/commissions', 'modules/tutores'],
      '6 · Publicidad y análisis': ['modules/campaigns', 'modules/meta-ads', 'modules/reports'],
      '7 · Ajustes y administración': ['modules/settings', 'modules/permissions', 'modules/preferences'],
      '8 · Entrar, contraseña y errores': ['shared/pages'],
    };

    const filas = Object.entries(bloques).map(([nombre, dirs]) => {
      const n = dirs.reduce((suma, d) => suma + contar(d).total, 0);
      return `  ${nombre.padEnd(34)} ${String(n).padStart(5)}`;
    });
    const total = Object.values(bloques)
      .flat()
      .reduce((suma, d) => suma + contar(d).total, 0);

    // eslint-disable-next-line no-console
    console.log(`\ncolores a pelo por bloque del #34:\n${filas.join('\n')}\n  ${'total'.padEnd(34)} ${String(total).padStart(5)}\n`);

    // LO QUE NO VIGILA NADIE.
    //
    // Los ocho bloques no cubren todos los modulos, y lo que queda fuera no
    // aparecia en ningun sitio: el numero se leia como «la deuda» cuando era
    // «la deuda de lo que miramos». Una errata —`modules/tutors` por
    // `modules/tutores`— escondio 102 durante semanas sin que nadie lo notara,
    // porque un directorio que no existe cuenta cero y cero no llama la
    // atencion.
    //
    // Asi que se listan. No se asignan a un bloque por mi cuenta —eso es
    // redibujar el plan del #34, y es de Diego— pero se ven.
    const enBloques = new Set(Object.values(bloques).flat());
    // Las maquetas de referencia NO cuentan: son el SuiteDash de /testeo2 y el
    // muestrario, que existen justamente para enseñar de donde salen los
    // tokens. Exigirles tokens seria pedirle a la foto que se parezca al
    // retrato.
    const MAQUETAS = /^modules\/(suitedash-preview|ui-preview|dev)$/;
    const sueltos = fs.readdirSync(path.join(RAIZ, 'modules'), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `modules/${e.name}`)
      .filter((d) => !enBloques.has(d) && !MAQUETAS.test(d))
      .map((d) => ({ d, n: contar(d).total }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n);

    if (sueltos.length) {
      const fuera = sueltos.reduce((s, x) => s + x.n, 0);
      // eslint-disable-next-line no-console
      console.log(
        `sin asignar a ningun bloque — ${fuera} en ${sueltos.length} modulos:\n`
        + sueltos.map((x) => `  ${x.d.padEnd(34)} ${String(x.n).padStart(5)}`).join('\n')
        + `\n  ${'TOTAL DE VERDAD'.padEnd(34)} ${String(total + fuera).padStart(5)}\n`,
      );
    }

    // EL CIERRE. Un bloque por encima de su techo para la entrega y dice cuál.
    const conTecho = Object.entries(bloques).map(([nombre, dirs]) => ({
      nombre,
      n: dirs.reduce((suma, d) => suma + contar(d).total, 0),
      techo: TECHO[nombre] ?? 0,
    }));

    const subidos = conTecho.filter((x) => x.n > x.techo);
    expect(
      subidos.map((x) => `  ${x.nombre}: ${x.n} colores a pelo, y el techo es ${x.techo}`).join('\n'),
      [
        'han entrado colores sueltos en un bloque que ya estaba limpio.',
        'Usa los tokens de index.css —success, warning, info, destructive, cada uno',
        'con su -soft y su -soft-foreground— en vez de bg-red-100 y compañía.',
        'Si el color es de una paleta de identidad, va en shared/lib/ui.ts.',
      ].join('\n'),
    ).toBe('');

    // Y si alguien ha limpiado de más, que se note: apretar la tuerca es
    // cambiar un número en TECHO, y si no se cambia, el siguiente puede volver
    // a ensuciar hasta el techo viejo sin que nadie se queje.
    const bajados = conTecho.filter((x) => x.n < x.techo);
    if (bajados.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `se puede bajar el techo en colores-sueltos.test.js:\n${
          bajados.map((x) => `  ${x.nombre}: ${x.techo} → ${x.n}`).join('\n')}\n`,
      );
    }
  });
});
