import { describe, it, expect } from 'vitest';
import { query } from '../src/shared/config/db.js';
import { TEMPLATE_VARIABLES, renderTemplate, comoHtml } from '../src/modules/email-templates/email-templates.service.js';

/**
 * Que ninguna plantilla de correo tenga un hueco que no se rellena.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DONDE SALE
 *
 * Las 18 plantillas del proceso comercial estaban escritas con UNA llave
 * —`{nombre}`, `{producto}`, `{proyecto}`— y `renderTemplate` sustituye
 * `{{doble}}`. Ninguna se rellenaba: al prospecto le llegaba «Hola {nombre}:».
 *
 * Es el mismo fallo que ya salió en WhatsApp con `{teléfono}`, y por eso hay
 * prueba: no basta con arreglar las de hoy. Cualquiera puede escribir mañana
 * `{nombre}` en el editor —es lo natural— y nadie lo veria hasta que un cliente
 * recibiera el corchete.
 *
 * CONTRA LA BASE DE VERDAD, que es donde viven las plantillas. Un doble de la
 * base probaria un texto que me he inventado yo.
 */

/** Los `{{caminos}}` que el renderizador sabe resolver. */
const CONOCIDAS = TEMPLATE_VARIABLES.map((v) => v.token.replace(/[{}\s]/g, ''));

async function plantillas() {
  const { rows } = await query('SELECT id, name, subject, body_html FROM email_templates');
  return rows;
}

describe('la base tiene que estar', () => {
  it('hay plantillas que mirar, o esto no comprueba nada', async () => {
    const t = await plantillas();
    expect(t.length, 'sin plantillas esta prueba pasa sin haber mirado nada').toBeGreaterThan(0);
  });
});

describe('ningún hueco se queda sin rellenar', () => {
  it('nadie usa UNA llave, que es la que no se sustituye', async () => {
    const malas = [];
    for (const t of await plantillas()) {
      const texto = `${t.subject} ${t.body_html}`;
      // Una llave sin su pareja: `{algo}` que no sea parte de `{{algo}}`.
      for (const m of texto.matchAll(/(?<!\{)\{([a-zá-úñ_][a-zá-úñ_ .]{0,28})\}(?!\})/gi)) {
        malas.push(`#${t.id} «${t.name}» → {${m[1]}}`);
      }
    }
    expect(malas, `estas saldrian literales en el correo:\n  ${malas.join('\n  ')}`).toEqual([]);
  });

  it('y las que usan dos llaves son caminos que el renderizador conoce', async () => {
    // Un `{{lead.telefono2}}` no revienta: se sustituye por vacio. Y ese es el
    // problema — la frase queda coja y nadie se entera.
    const desconocidas = [];
    for (const t of await plantillas()) {
      const texto = `${t.subject} ${t.body_html}`;
      for (const m of texto.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
        if (!CONOCIDAS.includes(m[1])) {
          desconocidas.push(`#${t.id} «${t.name}» → {{${m[1]}}}`);
        }
      }
    }
    expect(desconocidas, `estas se quedarian vacias:\n  ${desconocidas.join('\n  ')}`).toEqual([]);
  });
});

describe('y el renderizador hace lo que se espera', () => {
  it('rellena lo que conoce', () => {
    const html = renderTemplate('Hola {{lead.nombre}}, sobre {{lead.producto}}',
      { lead: { nombre: 'Marta', producto: 'Máster' } });
    expect(html).toBe('Hola Marta, sobre Máster');
  });

  it('una llave sola la deja tal cual, que es el fallo que se vigila arriba', () => {
    expect(renderTemplate('Hola {nombre}', { nombre: 'Marta' })).toBe('Hola {nombre}');
  });
});

describe('el nombre del cliente sale bien, en el asunto y en el cuerpo', () => {
  // Lo que pidio Angel: «no quiero que salga mal el nombre». El cuerpo es HTML
  // y hay que escapar —un `<` no puede romper el correo—, pero el ASUNTO es
  // texto pelado y ahi escapar lo estropea: llega a la bandeja tal cual.
  const RAROS = [
    ['Martí & Asociados', 'el ampersand, comun en nombres de empresa'],
    ["O'Connor", 'el apostrofo'],
    ['Muñoz "la jefa"', 'las comillas'],
    ['Pérez «Pepe»', 'las comillas españolas'],
    ['Núñez', 'la eñe y la tilde'],
  ];

  for (const [nombre, porque] of RAROS) {
    it(`asunto: «${nombre}» sale literal — ${porque}`, () => {
      const asunto = renderTemplate('Información para {{lead.nombre}}',
        { lead: { nombre } }, { escapar: false });
      expect(asunto).toBe(`Información para ${nombre}`);
      expect(asunto, 'no puede quedar ni una entidad HTML').not.toMatch(/&(amp|lt|gt|quot|#\d+);/);
    });
  }

  it('el cuerpo SI escapa, que ahi si es HTML', () => {
    // Si no, un nombre con `<script>` entra en el correo como etiqueta.
    const html = renderTemplate('<p>Hola {{lead.nombre}}</p>',
      { lead: { nombre: 'Núñez <script>' } });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('y un ampersand en el cuerpo se ve bien al leerlo', () => {
    // `&amp;` es lo correcto en HTML: el lector de correo pinta «&».
    expect(renderTemplate('<p>{{lead.nombre}}</p>', { lead: { nombre: 'Martí & Asociados' } }))
      .toBe('<p>Martí &amp; Asociados</p>');
  });
});

describe('un correo escrito a mano se lee al llegar', () => {
  // Las 18 del proceso estan escritas como se escribe un correo —parrafos y
  // puntos— sin una sola etiqueta, y se mandan con `htmlContent`. En HTML los
  // saltos de linea no existen: llegaban en un parrafo corrido, con los datos
  // de la formacion todos pegados en la misma linea.
  it('una linea en blanco separa parrafos', () => {
    expect(comoHtml('Hola:\n\nTe escribo por el máster.'))
      .toBe('<p>Hola:</p>\n<p>Te escribo por el máster.</p>');
  });

  it('un salto suelto NO parte el parrafo, solo la linea', () => {
    expect(comoHtml('· Inicio: marzo\n· Duración: 9 meses'))
      .toBe('<p>· Inicio: marzo<br>· Duración: 9 meses</p>');
  });

  it('los saltos de WINDOWS tambien separan parrafos', () => {
    // Las 18 del proceso estan guardadas con saltos de Windows. Buscando dos
    // saltos seguidos no casaba ninguna —el retorno de carro se mete en medio—
    // y salia un parrafo unico con 33 saltos dentro. Y en silencio: la prueba
    // de aqui arriba pasaba igual, porque su texto era de Unix.
    const CRLF = String.fromCharCode(13, 10);
    const SALTO = String.fromCharCode(10);
    expect(comoHtml(`Hola:${CRLF}${CRLF}Te escribo.`))
      .toBe(`<p>Hola:</p>${SALTO}<p>Te escribo.</p>`);
  });

  it('lo que ya es HTML no se toca', () => {
    // Quien escribio etiquetas sabia lo que hacia. El aviso al tutor lleva una
    // tabla, y envolverla en <p> la romperia.
    const html = '<p>Hola</p><table><tr><td>17,82 €</td></tr></table>';
    expect(comoHtml(html)).toBe(html);
  });

  it('un texto vacio no inventa un parrafo', () => {
    expect(comoHtml('')).toBe('');
    expect(comoHtml('   \n\n  ')).toBe('');
  });

  it('las 18 del proceso dejan de ser un parrafo corrido', async () => {
    const { rows } = await query(
      "SELECT body_html FROM email_templates WHERE project_id IS NOT NULL");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const html = comoHtml(r.body_html);
      expect(html, 'sin <p> llegaria todo en una linea').toContain('<p>');
    }
  });
});
