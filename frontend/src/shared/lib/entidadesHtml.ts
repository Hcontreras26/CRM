/**
 * Las entidades HTML de un texto, convertidas en letras, para PINTARLO.
 *
 * #234: en el filtro de cursos de Ingresos salía «Coaching &amp; Liderazgo».
 * El servidor ya guarda los nombres limpios al importarlos de WordPress
 * (`backend/src/shared/utils/entidadesHtml.js`, la misma tabla), pero los que
 * entraron antes siguen con la entidad, y las ventas copiaron ese nombre.
 * Esto los enseña bien mientras tanto.
 *
 * Sin `dangerouslySetInnerHTML` y sin pasar por el DOM: es una tabla y una
 * sustitución, así que no puede ejecutar nada ni colar etiquetas. Devuelve
 * texto, y React lo pinta como texto.
 *
 * Solo para enseñar: el valor que se manda al servidor (el filtro) se deja tal
 * cual, que es con lo que el servidor compara.
 */

const NOMBRADAS: Record<string, string> = {
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

function deUnaEntidad(entera: string, cuerpo: string): string {
  if (cuerpo[0] === '#') {
    const hex = cuerpo[1] === 'x' || cuerpo[1] === 'X';
    const codigo = parseInt(cuerpo.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isFinite(codigo) || codigo <= 0 || codigo > 0x10ffff) return entera;
    if (codigo >= 0xd800 && codigo <= 0xdfff) return entera;
    if (codigo === 0xa0) return ' ';
    return String.fromCodePoint(codigo);
  }
  if (Object.prototype.hasOwnProperty.call(NOMBRADAS, cuerpo)) return NOMBRADAS[cuerpo];
  const minus = cuerpo.toLowerCase();
  if (['amp', 'lt', 'gt', 'quot', 'nbsp'].includes(minus)) return NOMBRADAS[minus];
  return entera;
}

/** El texto con sus entidades convertidas, una sola pasada. Lo que no es texto vuelve igual. */
export function decodificarEntidades<T>(texto: T): T {
  if (typeof texto !== 'string' || !texto.includes('&')) return texto;
  return texto.replace(ENTIDAD, deUnaEntidad) as unknown as T;
}
