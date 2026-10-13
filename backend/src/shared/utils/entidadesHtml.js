/**
 * Las entidades HTML de un texto que viene de WordPress, convertidas en letras.
 *
 * #234: en el filtro de cursos de Ingresos salía «Máster en Coaching &amp;
 * Liderazgo». WooCommerce y la API de WordPress devuelven los nombres YA
 * codificados para HTML —`name` y `title.rendered` llevan `&amp;`, `&#8211;`,
 * `&#8217;`—, y el CRM los guardaba tal cual. Al pintarlos como texto, React
 * enseña la entidad, no la letra.
 *
 * Se decodifica UNA vez y al entrar, que es donde se arregla: en la base queda
 * el nombre limpio y todo lo que lo copia después (la venta, la factura, el
 * correo) ya lo copia bien.
 *
 * Una sola pasada: `&amp;lt;` da `&lt;`, no `<`. Es lo correcto —quien escribió
 * `&lt;` en su web quería ver eso— y evita que un texto se convierta en otro
 * a fuerza de decodificarlo.
 *
 * El espacio duro (`&nbsp;`) pasa a espacio normal: en un nombre no sirve para
 * nada y rompe las búsquedas por nombre exacto.
 *
 * La misma tabla vive en el frontal (`shared/lib/entidadesHtml.ts`) para lo que
 * ya está guardado con la entidad dentro.
 */

const NOMBRADAS = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', middot: '·', bull: '•',
  laquo: '«', raquo: '»', lsquo: '‘', rsquo: '’', sbquo: '‚',
  ldquo: '“', rdquo: '”', bdquo: '„',
  iexcl: '¡', iquest: '¿', ordf: 'ª', ordm: 'º', deg: '°',
  euro: '€', copy: '©', reg: '®', trade: '™',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  agrave: 'à', egrave: 'è', igrave: 'ì', ograve: 'ò', ugrave: 'ù',
  Agrave: 'À', Egrave: 'È', Igrave: 'Ì', Ograve: 'Ò', Ugrave: 'Ù',
  acirc: 'â', ecirc: 'ê', icirc: 'î', ocirc: 'ô', ucirc: 'û',
  auml: 'ä', euml: 'ë', iuml: 'ï', ouml: 'ö', uuml: 'ü',
  Auml: 'Ä', Euml: 'Ë', Iuml: 'Ï', Ouml: 'Ö', Uuml: 'Ü',
  atilde: 'ã', otilde: 'õ', ntilde: 'ñ', Ntilde: 'Ñ',
  ccedil: 'ç', Ccedil: 'Ç',
};

const ENTIDAD = /&(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});/gi;

function deUnaEntidad(entera, cuerpo) {
  if (cuerpo[0] === '#') {
    const hex = cuerpo[1] === 'x' || cuerpo[1] === 'X';
    const codigo = parseInt(cuerpo.slice(hex ? 2 : 1), hex ? 16 : 10);
    // Fuera de Unicode, el cero o media pareja de sustitutos: se deja como
    // venía antes que inventar un carácter.
    if (!Number.isFinite(codigo) || codigo <= 0 || codigo > 0x10ffff) return entera;
    if (codigo >= 0xd800 && codigo <= 0xdfff) return entera;
    // El espacio duro numérico (&#160;), como el nombrado.
    if (codigo === 0xa0) return ' ';
    return String.fromCodePoint(codigo);
  }
  if (Object.prototype.hasOwnProperty.call(NOMBRADAS, cuerpo)) return NOMBRADAS[cuerpo];
  // `&AMP;` y compañía también son válidas; las acentuadas no se tocan así,
  // porque `&Aacute;` y `&aacute;` son letras distintas.
  const minus = cuerpo.toLowerCase();
  if (['amp', 'lt', 'gt', 'quot', 'nbsp'].includes(minus)) return NOMBRADAS[minus];
  return entera;
}

/** El texto con sus entidades convertidas. Lo que no es texto vuelve igual. */
export function decodificarEntidades(texto) {
  if (typeof texto !== 'string' || !texto.includes('&')) return texto;
  return texto.replace(ENTIDAD, deUnaEntidad);
}
