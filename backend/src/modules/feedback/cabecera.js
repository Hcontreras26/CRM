import crypto from 'node:crypto';
import puppeteer from 'puppeteer';
import { query } from '../../shared/config/db.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * La cabecera de la marca para los CORREOS, como una imagen PNG sin
 * transparencias.
 *
 * Diego, 28/09: «llegó el de Fono y se ve feo: el logo sale con fondo negro,
 * en el tema oscuro y en el claro». Gmail pasa las imágenes por su proxy y a
 * un WEBP transparente le pinta el fondo de negro; y en modo oscuro los
 * clientes invierten los colores del HTML, pero no los de una imagen.
 *
 * Así que la cabecera del correo no se arma con HTML: se DIBUJA aquí —el logo
 * ya pegado sobre el fondo de la marca, con el filete de su color debajo— y el
 * correo la enseña como una sola imagen opaca. Ningún tema ni cliente la toca.
 *
 * Se dibuja con el Chrome de puppeteer, el mismo que hace los PDF: el logo se
 * baja antes y entra como data URI, así Chrome no necesita red. Se guarda en
 * memoria por marca y versión (logo + colores): cambiar la marca en el panel
 * cambia la versión, y el correo siguiente pide la nueva.
 */

const ANCHO = 560;
const ALTO = 88;
const CHROME_ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'];
// `${id}:${version}` -> la promesa del PNG: si llegan diez peticiones a la vez
// para una marca sin dibujar, se lanza UN Chrome, no diez.
const hechas = new Map();
const MAX_EN_MEMORIA = 60;

const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : null);
const escapar = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Texto blanco u oscuro sobre ese fondo (el mismo cálculo que el correo). */
function tintaSobre(fondo) {
  const m = /^#([0-9a-f]{6})$/i.exec(fondo || '');
  if (!m) return '#1d2530';
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luz = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luz + 0.05) >= (luz + 0.05) / (0.0178 + 0.05) ? '#ffffff' : '#1d2530';
}

/** La versión de la cabecera: cambia en cuanto cambia el logo o un color. */
export function versionDe(marca) {
  return crypto.createHash('sha1')
    .update([marca.logo_url, marca.color_cabecera, marca.theme_color, marca.proyecto || marca.nombre].join('|'))
    .digest('hex').slice(0, 10);
}

async function marcaDe(projectId) {
  const { rows } = await query(
    `SELECT p.id, p.nombre, p.logo_url, p.theme_color, to_jsonb(p) ->> 'color_cabecera' AS color_cabecera
       FROM projects p WHERE p.id = $1`, [projectId]);
  return rows[0] || null;
}

/** El logo, bajado y en data URI. Sin logo o si no baja: null (sale el nombre). */
async function logoEnDataUri(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (CRM cabecera de correo)' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const tipo = (res.headers.get('content-type') || 'image/png').split(';')[0];
    if (!tipo.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${tipo};base64,${buf.toString('base64')}`;
  } catch (err) {
    logger.warn({ err: err.message, url }, 'cabecera: no se pudo bajar el logo');
    return null;
  }
}

async function dibujar(marca) {
  const fondo = hex(marca.color_cabecera) || '#ffffff';
  const acento = hex(marca.theme_color) || '#1f4e79';
  const logo = await logoEnDataUri(marca.logo_url);
  const dentro = logo
    ? `<img src="${logo}" style="max-height:52px;max-width:260px;display:block">`
    : `<span style="font:bold 20px Arial,Helvetica,sans-serif;color:${tintaSobre(fondo)}">${escapar(marca.nombre)}</span>`;
  const html = `<!doctype html><html><body style="margin:0;background:${fondo}">
    <div style="width:${ANCHO}px;height:${ALTO}px;box-sizing:border-box;background:${fondo};border-bottom:4px solid ${acento};
                display:flex;align-items:center;padding:0 24px">${dentro}</div></body></html>`;
  const opts = { headless: 'new', args: CHROME_ARGS };
  if (process.env.CHROME_PATH) opts.executablePath = process.env.CHROME_PATH;
  const browser = await puppeteer.launch(opts);
  try {
    const page = await browser.newPage();
    // Al doble de resolución: en pantallas retina el logo no sale borroso.
    await page.setViewport({ width: ANCHO, height: ALTO, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
    return await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: ANCHO, height: ALTO }, omitBackground: false });
  } finally {
    await browser.close();
  }
}

/** La cabecera de esa marca, de memoria o recién dibujada. */
export async function cabeceraDe(projectId) {
  const marca = await marcaDe(projectId);
  if (!marca) return null;
  const clave = `${marca.id}:${versionDe({ ...marca, proyecto: marca.nombre })}`;
  if (!hechas.has(clave)) {
    if (hechas.size >= MAX_EN_MEMORIA) hechas.delete(hechas.keys().next().value);
    hechas.set(clave, dibujar(marca).catch((err) => { hechas.delete(clave); throw err; }));
  }
  return hechas.get(clave);
}

/** GET /api/f/cabecera/:projectId.png — pública: la pide el cliente de correo. */
export async function servir(req, res, next) {
  try {
    const id = Number.parseInt(req.params.projectId, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).end();
    const png = await cabeceraDe(id);
    if (!png) return res.status(404).end();
    res.set('Content-Type', 'image/png');
    // La URL lleva la versión (?v=...): se puede guardar un día sin miedo.
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(png);
  } catch (err) {
    return next(err);
  }
}
