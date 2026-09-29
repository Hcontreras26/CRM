// El muestrario de primitivas (#32): «una pantalla de muestra con todas
// juntas, para verlas de una vez».
//
// La pantalla existía desde hacía tiempo, pero detrás de `import.meta.env.DEV`:
// existía en el equipo de quien la escribió y en /testeo no se montaba. Por eso
// «no existía». Esto comprueba que sigue estando donde se mira.
import { test, expect } from '@playwright/test';
import { ir, API_GLOB } from './helpers';

const PROYECTOS = [
  { id: 1, nombre: 'Fono Aprende', slug: 'fono', type: 'crm', active: true, modules: null },
  { id: 2, nombre: 'ISEIH', slug: 'iseih', type: 'crm', active: true, modules: null },
];
const USER = { id: 1, nombre: 'Manuel Casas', email: 'm@e.l', role: 'superadmin' };

// Las 22 de shared/components/ui/. Cada una tiene que poder encontrarse por su
// nombre: para eso es el muestrario.
const PRIMITIVAS = [
  'PageHeader', 'KpiCard', 'StatusBadge', 'ChannelBadge', 'EmptyState', 'SkeletonTable',
  'Button', 'Badge', 'Accordion', 'Progress', 'Toast', 'Select', 'ConfirmDialog',
  'Card', 'StatusDot', 'SubNav', 'MetricLabel', 'NeedsProjectBanner', 'SearchableSelect',
  'MultiProjectPicker', 'PromptDialog', 'BetaDisclaimer',
];

const SUELTO = /\b(bg|text|border|ring)-(red|blue|green|emerald|amber|yellow|orange|violet|purple|slate|gray|zinc|sky|indigo|rose|pink|teal|cyan)-\d{2,3}\b/;
// La paleta de identidad es la excepción documentada (shared/lib/ui.ts): hacen
// falta ocho matices distinguibles para reconocer una marca, y un token
// semántico no da eso.
const ES_IDENTIDAD = /(bg|text)-(sky|emerald|amber|rose|violet|teal|orange|indigo)-(100|700)\b/;


async function simularApi(page) {
  const j = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route(API_GLOB, (r) => {
    const ruta = new URL(r.request().url()).pathname.replace(/^.*\/api/, '');
    if (ruta === '/auth/refresh') return r.fulfill(j({ success: true, data: { accessToken: 't' } }));
    if (ruta === '/auth/me') {
      return r.fulfill(j({ success: true, data: { user: USER, permissions: {}, view: {}, projects: PROYECTOS } }));
    }
    return r.fulfill(j({ success: true, data: [], stats: {}, pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }));
  });
}

test.describe('muestrario de primitivas', () => {
  test.beforeEach(async ({ page }) => {
    await simularApi(page);
  });

  test('las 22 primitivas están, cada una por su nombre', async ({ page }) => {
    await ir(page, '/dev/components');
    await expect(page.locator('header.sticky').getByRole('heading', { level: 1 }))
      .toHaveText('Las 22 primitivas, juntas');

    const texto = await page.locator('#main-content').innerText();
    // Nada de substrings: «Select» no vale por existir «SearchableSelect».
    const faltan = PRIMITIVAS.filter((n) => !new RegExp(`\\b${n}\\b`).test(texto));
    expect(faltan, `faltan del muestrario: ${faltan.join(', ')}`).toEqual([]);
  });

  test('se llega desde el menú, sin escribir la dirección a mano', async ({ page }) => {
    // Lo que hacía que «no existiera» no era que faltara: era que no había
    // forma de llegar.
    await ir(page, '/');
    // En móvil el menú vive detrás del botón de la cabecera.
    const hamburguesa = page.getByRole('button', { name: /abrir menu/i });
    if (await hamburguesa.isVisible()) await hamburguesa.click();

    await page.getByRole('link', { name: 'Las 22 primitivas' }).click();
    await expect(page.locator('header.sticky').getByRole('heading', { level: 1 }))
      .toHaveText('Las 22 primitivas, juntas');
  });

  test('el espaciado con nombre se aplica de verdad', async ({ page }) => {
    await ir(page, '/dev/components');
    // La pantalla va por `lazy`: sin esperar a que esté, se mide un DOM vacío.
    await expect(page.locator('#main-content section').first()).toBeVisible();

    // La tarjeta de la sección, hija directa: dentro hay más tarjetas de
    // ejemplo y cuál sale primero depende del ancho de la ventana.
    const relleno = await page.evaluate(() => {
      const c = document.querySelector('#main-content section > .bg-card');
      return c ? getComputedStyle(c).padding : null;
    });
    expect(relleno, 'p-tarjeta debe valer 16px').toBe('16px');
  });

  test('no pinta ni un color suelto, salvo la paleta de identidad', async ({ page }) => {
    await ir(page, '/dev/components');
    const clases = await page.evaluate(() => (
      [...document.querySelectorAll('#main-content [class]')].map((e) => String(e.className)).filter(Boolean)
    ));
    const sucias = clases.filter((c) => SUELTO.test(c) && !ES_IDENTIDAD.test(c));
    expect(sucias, `colores a pelo en el muestrario:\n${sucias.join('\n')}`).toEqual([]);
  });

  test('funciona con «Todos los proyectos» puesto', async ({ page }) => {
    // Las primitivas no dependen de ninguna marca. Sin declararlo, quien tenga
    // la vista global —que es lo normal— se encuentra «elige un proyecto».
    await ir(page, '/dev/components');
    // No se puede comprobar por la ausencia del aviso: el muestrario ENSEÑA
    // `NeedsProjectBanner`, así que su texto está en la pantalla a propósito.
    // Lo que distingue «se ve el muestrario» de «me han cortado el paso» es que
    // estén las 22 secciones y no una tarjeta suelta.
    await expect(page.locator('#main-content section').first()).toBeVisible();
    expect(await page.locator('#main-content section').count()).toBeGreaterThanOrEqual(20);
  });
});
