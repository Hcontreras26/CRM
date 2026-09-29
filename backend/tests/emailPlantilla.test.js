import { describe, it, expect } from 'vitest';
import {
  correo, fichaProspecto, tarjetas, barras, boton, etiqueta, etiquetaEstado,
  esc, enlace, aTextoPlano, logoDeProyecto, comparar, parrafo, COLORES_CANAL,
} from '../src/shared/services/email-plantilla.service.js';

// La envoltura comun de los correos, tarea #83.
//
// Lo que se prueba aqui son las reglas del CORREO —que no son las de la web— y
// las del sistema de diseño del CRM. Todo lo demas (que cifra sale en cada
// aviso) se prueba en el fichero de su scheduler.

const muestra = () => correo({
  proyecto: { nombre: 'ISEIH', slug: 'iseih' },
  titulo: 'Un titular',
  saludo: 'Ana',
  bloques: [
    fichaProspecto({
      nombre: 'María Muñoz', telefono: '+34600000001', correo: 'm@ejemplo.com',
      programa: 'Máster', origen: 'Meta Ads', estado: 'por_contactar',
      esperando: '2 días',
      acciones: [{ texto: 'Abrir la ficha', url: enlace('prospectos/1') }],
    }),
    tarjetas([{ etiqueta: 'Prospectos', valor: 7, comparacion: comparar(7, 5) }]),
    barras([{ etiqueta: 'Meta Ads', valor: 9 }], { paleta: COLORES_CANAL }),
    boton({ texto: 'Abrir', url: enlace('prospectos') }),
  ],
  apagar: { texto: 'Recibes esto porque si.' },
});

describe('las reglas del correo, que no son las de la web', () => {
  it('se maqueta con tablas, no con flex ni grid', () => {
    // Outlook usa el motor de Word y no entiende ninguno de los dos.
    const h = muestra().htmlContent;
    expect(h).toContain('<table');
    expect(h).not.toMatch(/display:\s*(flex|grid)/);
  });

  it('lleva los estilos en linea, que son la base', () => {
    // Si un cliente se come la hoja de la cabecera, el correo se sigue viendo.
    const h = muestra().htmlContent;
    const sinHoja = h.replace(/<style>[\s\S]*?<\/style>/, '');
    expect(sinHoja).toMatch(/background-color:/);
    expect(sinHoja).toMatch(/font-family:/);
  });

  it('la hoja de la cabecera solo lleva consultas de medios', () => {
    // Todo lo que este fuera de una `@media` seria una regla de la que el
    // correo dependeria, y Gmail podria comersela.
    const hoja = muestra().htmlContent.match(/<style>([\s\S]*?)<\/style>/)[1];
    expect(hoja).toMatch(/@media only screen/);      // el movil
    expect(hoja).toMatch(/prefers-color-scheme: dark/); // el modo oscuro
    expect(hoja.replace(/@media[^{]*\{[\s\S]*?\n  \}/g, '')).not.toMatch(/\{[^}]*:[^}]*\}/);
  });

  it('no lleva JavaScript ni SVG', () => {
    const h = muestra().htmlContent;
    expect(h).not.toMatch(/<script/i);
    expect(h).not.toMatch(/<svg/i);
  });

  it('declara el juego de caracteres, que es lo que salva las tildes', () => {
    expect(muestra().htmlContent).toMatch(/<meta charset="utf-8">/);
  });

  it('se lee sin imagenes: toda imagen lleva alt', () => {
    const h = muestra().htmlContent;
    for (const img of h.match(/<img[^>]*>/g) || []) {
      expect(img).toMatch(/alt="[^"]+"/);
    }
    // Y el nombre del proyecto va escrito al lado del logo, no dentro de el.
    expect(h).toContain('ISEIH');
  });

  it('siempre sale tambien en texto plano', () => {
    const { textContent } = muestra();
    expect(textContent).not.toMatch(/[<>]/);
    expect(textContent).toContain('María Muñoz');
  });

  it('la pre-cabecera no ensucia el texto plano', () => {
    // Va oculta y rellena de caracteres invisibles para que no arrastre lo que
    // viene detras en la bandeja. Esos caracteres se colaban tal cual —
    // «&#847;&zwnj;» treinta veces— encabezando la version en texto.
    const { textContent } = correo({
      titulo: 'X', resumen: '4 esperando · el primero lleva 26 h', bloques: [parrafo('Hola')],
    });
    expect(textContent).not.toMatch(/&#?\w+;/);
    expect(textContent).not.toMatch(/zwnj/);
    // Arranca por la marca de la cabecera, que es lo primero del correo.
    expect(textContent.split('\n')[0]).toBe('CRM');
    // Y el resumen de la bandeja no se repite dentro del cuerpo.
    expect(textContent).not.toContain('el primero lleva 26 h');
  });

  it('el texto plano conserva los enlaces', () => {
    // Sin esto, la version plana de un correo cuyo contenido es un boton se
    // queda sin lo unico que importaba.
    expect(muestra().textContent).toMatch(/Abrir.*\(http/);
  });
});

describe('el sistema de diseño del CRM', () => {
  it('usa el indigo del CRM y no un color inventado', () => {
    // `--primary: 230 75% 55%` de `index.css`.
    expect(muestra().htmlContent).toContain('#3653e2');
  });

  it('el estado del prospecto lleva su color canonico', () => {
    // DESIGN_SYSTEM.md §1.2 — «no inventar nuevos status colors».
    expect(etiquetaEstado('nuevo')).toContain('#2563eb');          // blue-600
    expect(etiquetaEstado('por_contactar')).toContain('#ea580c');  // orange-600
    expect(etiquetaEstado('convertido')).toContain('#7c3aed');     // violet-600
    expect(etiquetaEstado('no_interesado')).toContain('#dc2626');  // red-600
    expect(etiquetaEstado('loquesea')).toBe('');
  });

  it('las graficas de canal usan la paleta del sistema', () => {
    // §1.4, tal cual.
    expect(COLORES_CANAL[0]).toBe('#3b82f6');
    expect(barras([{ etiqueta: 'a', valor: 1 }], { paleta: COLORES_CANAL }))
      .toContain('#3b82f6');
  });

  it('el logo sale del mismo sitio que en el frontal', () => {
    expect(logoDeProyecto('iseih')).toMatch(/\/projects\/iseih\.webp$/);
    expect(logoDeProyecto('psiko-aprende')).toMatch(/psiko-aprende-light\.png$/);
    expect(logoDeProyecto('no-existe')).toBeNull();
  });

  it('las cifras van con cifras tabulares', () => {
    // §2: «KPIs grandes: text-2xl font-semibold tabular-nums».
    expect(tarjetas([{ etiqueta: 'X', valor: 7 }])).toMatch(/tabular-nums/);
  });
});

describe('lo que viene de fuera se escapa', () => {
  it('escapa el HTML de un nombre', () => {
    expect(esc('Muñoz & Cia <SL>')).toBe('Muñoz &amp; Cia &lt;SL&gt;');
  });

  it('un nombre con etiquetas no rompe el correo', () => {
    const h = fichaProspecto({ nombre: '<script>alert(1)</script>' });
    expect(h).not.toContain('<script>');
    expect(h).toContain('&lt;script&gt;');
  });

  it('`esc` no inventa nada con lo vacio', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc(0)).toBe('0');
  });
});

describe('la comparacion', () => {
  it('no inventa porcentajes cuando antes no habia nada', () => {
    // De 0 a 5 no es «+500 %».
    expect(comparar(5, 0)).toMatchObject({ texto: 'nuevo' });
    expect(comparar(0, 0)).toMatchObject({ texto: '=' });
  });

  it('sube, baja y se queda igual', () => {
    expect(comparar(10, 8)).toMatchObject({ texto: '+25 %', signo: 'sube' });
    expect(comparar(8, 10)).toMatchObject({ texto: '-20 %', signo: 'baja' });
    expect(comparar(7, 7)).toMatchObject({ texto: 'igual', signo: 'igual' });
  });
});

describe('las piezas aguantan lo que les falte', () => {
  it('una ficha sin nada mas que el nombre no revienta', () => {
    const h = fichaProspecto({ nombre: 'Solo Nombre' });
    expect(h).toContain('Solo Nombre');
    expect(h).not.toContain('undefined');
    expect(h).not.toContain('null');
  });

  it('las rejillas y las barras vacias no dejan restos', () => {
    expect(barras([])).toBe('');
    expect(tarjetas([])).not.toContain('undefined');
  });

  it('un correo sin proyecto no dice «CRM de undefined»', () => {
    const { textContent } = correo({ titulo: 'X', bloques: [], apagar: null });
    expect(textContent).not.toContain('undefined');
    expect(textContent).toMatch(/Te lo manda el CRM/);
  });

  it('aTextoPlano no deja etiquetas ni entidades sueltas', () => {
    const t = aTextoPlano('<p>Uno &amp; dos</p><br><li>tres</li>');
    expect(t).not.toMatch(/[<>]/);
    expect(t).toContain('Uno & dos');
  });
});
