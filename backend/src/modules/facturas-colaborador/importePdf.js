import { logger } from '../../shared/utils/logger.js';

/*
  pdf-parse, la versión 1.1.1, y su lib/ directamente: el index.js de esa
  versión, al importarlo, intenta leer un PDF de prueba que no viene en el paquete.

  Se carga al leer el primer PDF y no al arrancar (como en ISEIE), igual que JSZip y ExcelJS
  en el ZIP del mes. Este módulo se importa siempre desde app.js, también en
  producción con las facturas de colaboradores apagadas: si el paquete faltara
  en el servidor (un despliegue sin `npm install`), con el import de arriba no
  arrancaría la API entera. Así arranca igual y el PDF queda «No se pudo leer»
  (null), que es lo mismo que con un PDF raro.
*/
let pdfParseCargado = null;
function cargarPdfParse() {
  if (!pdfParseCargado) {
    pdfParseCargado = import('pdf-parse/lib/pdf-parse.js').then((m) => m.default || m);
    pdfParseCargado.catch((err) => logger.warn({ err: err.message },
      'Facturas de colaboradores: falta pdf-parse en el servidor; los PDF quedan «No se pudo leer»'));
  }
  return pdfParseCargado;
}

/*
  El total que pone el PDF de la factura (#202, corrección de Diego del 13/10:
  «el monto es que coincida el PDF y lo que se escribió de factura ahí»).

  Una factura CUADRA cuando el total que pone el PDF subido es el mismo que el
  importe que el colaborador escribe en la casilla. El desglose (fijo, por
  hora, por proyecto) se sigue calculando y guardando, pero ya no decide.

  Se lee en el servidor, al subir, por el enlace y por «Mi factura». Un PDF
  raro (escaneado, cifrado, roto, enorme) nunca tumba la subida: se guarda
  igual y queda «No se pudo leer el PDF» (null), que no es «No cuadra».
*/

const TOPE_MS = 5000;
const TOPE_PAGINAS = 10;

/** Sin acentos, en minúsculas y con los espacios raros (el de no separar) como espacios. */
const normalizar = (t) => String(t || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u00a0\u2007\u202f]/g, ' ')
  .toLowerCase();

/*
  Un importe: «636,00 €», «€636.00», «636.00 EUR», «636 €», «1.234,56», «1,234.56».
  · Delante no puede haber letra, cifra, punto, coma, barra ni guion: así no
    entran el NIF (B12345678), las fechas (12/10/2026, 12.10.2026, 2026-10-12)
    ni los números de factura (F-2026-09, 2026/001).
  · Detrás, ni letra ni cifra ni % (el 21 % del IVA) ni otro separador con cifra.
*/
const IMPORTE = /(?<![\p{L}\d.,/-])(?:(€|eur\b)\s?)?(\d{1,3}(?:([.,])\d{3})(?:\3\d{3})*(?:(?!\3)[.,]\d{2})?|\d+(?:[.,]\d{2})?)(?:\s?(€|euros?\b|eur\b))?(?![\p{L}\d%/-]|[.,]\d|\s?%)/gu;

/** «1.234,56» → 1234.56; «1,234.56» → 1234.56; «1.234» → 1234 (con tres cifras detrás es de miles). */
function aNumero(t) {
  const dec = t.match(/[.,](\d{2})$/);
  if (dec) return Number(`${t.slice(0, -3).replace(/[.,]/g, '')}.${dec[1]}`);
  return Number(t.replace(/[.,]/g, ''));
}

/**
 * Los importes de un texto, en orden. Cuenta como importe lo que lleva «€» o
 * «EUR», o dos decimales; una cifra entera suelta (cantidades, años, códigos
 * postales, teléfonos) no.
 */
export function importesDelTexto(texto) {
  const lista = [];
  for (const m of normalizar(texto).matchAll(IMPORTE)) {
    const [, delante, cifra, , detras] = m;
    const conMoneda = Boolean(delante || detras);
    const conDecimales = /[.,]\d{2}$/.test(cifra);
    if (!conMoneda && !conDecimales) continue;
    const n = aNumero(cifra);
    if (Number.isFinite(n)) lista.push(n);
  }
  return lista;
}

/*
  Las líneas del total: «Total factura», «Total de la factura», «Total a pagar»,
  «A pagar», «Importe total», «Total (EUR)» y «TOTAL» a secas (con «€», «EUR» o
  dos puntos detrás, y luego la cifra o el final de la línea). «Subtotal»,
  «Base imponible», «Total IVA», «Total IRPF» o «Total retención» no lo son:
  ninguno encaja (delante de «total» no puede haber letra, y detrás de «total»
  a secas solo puede venir la cifra).
*/
const ETIQUETA = /(?<![a-z])(?:total\s+(?:de\s+(?:la\s+)?)?factura|total\s+a\s+pagar|a\s+pagar|importe\s+total|total(?=[\s:.]*(?:\(\s*(?:eur|euros?|€)\s*\)|euros?\b|eur\b|€)?[\s:.]*(?:$|[€\d])))/g;
// Si la cifra viene debajo, la línea de debajo no puede ser la de otra suma.
const OTRA_SUMA = /subtotal|base imponible|(?<![a-z])(?:iva|irpf)(?![a-z])|retencion/;

/**
 * El total del PDF a partir de su texto, o null.
 *   1. La ÚLTIMA línea con una etiqueta de total: el último importe detrás de la
 *      etiqueta, o el último de la línea de debajo si la cifra viene debajo.
 *   2. Sin línea de total: si lo que escribió el colaborador está entre los
 *      importes del documento, ese (cuadra); si no, el mayor (no cuadra).
 *   3. Sin ningún importe (o sin texto: un escaneado), null.
 */
export function totalDelPdf(texto, escrito = null) {
  const lineas = normalizar(texto).split(/\r?\n/);
  let total = null;
  lineas.forEach((linea, i) => {
    const etiquetas = [...linea.matchAll(ETIQUETA)];
    if (!etiquetas.length) return;
    const ultima = etiquetas[etiquetas.length - 1];
    let importes = importesDelTexto(linea.slice(ultima.index + ultima[0].length));
    if (!importes.length) {
      const debajo = lineas.slice(i + 1).find((l) => l.trim() !== '');
      if (debajo && !OTRA_SUMA.test(debajo)) importes = importesDelTexto(debajo);
    }
    if (importes.length) total = importes[importes.length - 1];
  });
  if (total !== null) return total;

  const todos = importesDelTexto(texto);
  if (!todos.length) return null;
  const e = escrito === null || escrito === undefined ? NaN : Number(escrito);
  if (Number.isFinite(e) && todos.some((n) => iguales(n, e))) return e;
  return Math.max(...todos);
}

/** Iguales al céntimo. */
const iguales = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

/**
 * ¿Cuadra lo escrito con el PDF? true o false; null si el PDF no se pudo leer
 * (ni texto ni importe, o no es un PDF), que es un estado propio y no «No cuadra».
 */
export const cuadraConElPdf = (escrito, importePdf) => (
  importePdf === null || importePdf === undefined ? null : iguales(escrito, importePdf));

/*
  El texto de cada página, línea a línea. La de pdf-parse pega los trozos de
  una misma línea sin espacio («Total636,00») y corta la línea si la cifra está
  medio punto más arriba o más abajo que la etiqueta: aquí se juntan con un
  espacio, y dos trozos a menos de 2 puntos de altura son la misma línea.
*/
async function textoDeLaPagina(pagina) {
  const contenido = await pagina.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
  let y = null;
  let texto = '';
  for (const item of contenido.items) {
    const suY = item.transform[5];
    if (y === null) texto += item.str;
    else texto += (Math.abs(suY - y) < 2 ? ' ' : '\n') + item.str;
    y = suY;
  }
  return texto;
}

/** El texto del PDF (hasta 10 páginas y 5 segundos), o null si no se puede. */
export async function textoDelPdf(buffer, { topeMs = TOPE_MS, topePaginas = TOPE_PAGINAS } = {}) {
  let reloj;
  try {
    const pdfParse = await cargarPdfParse();
    const plazo = new Promise((resolve) => { reloj = setTimeout(() => resolve(null), topeMs); });
    // Una copia: pdf.js puede quedarse con el buffer, y el original aún tiene
    // que ir al almacén, a la huella y al acuse.
    const leido = pdfParse(new Uint8Array(buffer), { max: topePaginas, pagerender: textoDeLaPagina })
      .then((r) => r?.text ?? null);
    leido.catch(() => {}); // si gana el plazo, que su fallo posterior no quede sin recoger
    const texto = await Promise.race([leido, plazo]);
    return texto && texto.trim() ? texto : null;
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * El total del PDF subido, o null si no se pudo leer. Nunca lanza: la subida
 * sigue aunque el PDF sea raro.
 */
export async function leerImporteDelPdf(buffer, escrito = null, opciones = {}) {
  try {
    const texto = await textoDelPdf(buffer, opciones);
    if (!texto) return null;
    const total = totalDelPdf(texto, escrito);
    return total === null ? null : Math.round(total * 100) / 100;
  } catch (err) {
    logger.warn({ err: err.message }, 'Factura de colaborador: no se pudo leer el importe del PDF');
    return null;
  }
}
