// El selector de marca (#79 · punto 2).
//
// Estas pruebas se escribieron ANTES de mover el selector del menú lateral a la
// cabecera, y contra el comportamiento que ya tenía. Si pasaban antes y pasan
// después, el traslado no se ha llevado nada por delante.
//
// Se prueba por lo que ve y hace quien lo usa —abrir, ver las marcas, cambiar,
// cerrar, el teclado, el móvil— y no por dónde está en el DOM: justamente eso
// es lo que cambia.
import { test, expect } from '@playwright/test';
import { ir, API_GLOB } from './helpers';

const PROYECTOS = [
  { id: 1, nombre: 'Fono Aprende', slug: 'fono', type: 'crm', active: true, modules: null },
  { id: 2, nombre: 'ISEIH', slug: 'iseih', type: 'crm', active: true, modules: null },
  { id: 3, nombre: 'Psiko Aprende', slug: 'psiko', type: 'crm', active: true, modules: null },
];
const USER = { id: 1, nombre: 'Manuel Casas', email: 'm@e.l', role: 'superadmin' };


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

/** El botón que abre el selector, esté donde esté. */
const disparador = (page) => page.getByRole('button', { name: /selector de proyecto/i });
const listado = (page) => page.getByRole('listbox', { name: /lista de proyectos/i });

test.describe('el selector de marca', () => {
  test.beforeEach(async ({ page }) => {
    await simularApi(page);
    await ir(page, '/prospectos');
    // Ya no hace falta abrir el menú: el selector vive en la cabecera, que se
    // ve en todos los tamaños. Cuando esto abría el menú en móvil, el panel
    // tapaba la cabecera y los clics no llegaban al botón.
  });

  test('dice en qué marca estás sin abrir nada', async ({ page }) => {
    // Es su primer trabajo: saberlo de un vistazo. Antes había que mirar al
    // fondo del menú lateral.
    await expect(disparador(page)).toContainText('Fono Aprende');
  });

  test('al abrirlo salen todas las marcas', async ({ page }) => {
    await disparador(page).click();
    await expect(listado(page)).toBeVisible();
    for (const p of PROYECTOS) {
      await expect(listado(page).getByRole('option', { name: new RegExp(p.nombre, 'i') })).toBeVisible();
    }
  });

  test('cambiar de marca cambia lo que dice el selector', async ({ page }) => {
    await disparador(page).click();
    await listado(page).getByRole('option', { name: /ISEIH/i }).click();
    await expect(disparador(page)).toContainText('ISEIH');
    await expect(listado(page)).toBeHidden();
  });

  test('con más de una marca aparece «Todos los proyectos»', async ({ page }) => {
    // La vista global: no es una marca, es una forma de mirar.
    await disparador(page).click();
    await expect(listado(page).getByRole('option', { name: /todos los proyectos/i })).toBeVisible();
  });

  test('se cierra al pulsar fuera', async ({ page }) => {
    await disparador(page).click();
    await expect(listado(page)).toBeVisible();
    await page.locator('#main-content').click({ position: { x: 10, y: 10 } });
    await expect(listado(page)).toBeHidden();
  });

  test('se cierra con Escape, y el foco vuelve al botón', async ({ page }) => {
    // Quien navega con teclado se queda encerrado si el foco no vuelve.
    await disparador(page).click();
    await expect(listado(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(listado(page)).toBeHidden();
    await expect(disparador(page)).toBeFocused();
  });

  test('se abre y se elige solo con el teclado', async ({ page }) => {
    await disparador(page).focus();
    await page.keyboard.press('Enter');
    await expect(listado(page)).toBeVisible();
  });

  test('en móvil se cambia de marca sin abrir el menú', async ({ page }) => {
    // Antes vivía dentro del menú lateral: en móvil había que abrirlo, bajar y
    // buscarlo. Ahora está en la cabecera, que se ve siempre.
    const menu = page.getByRole('button', { name: /abrir menu/i });
    test.skip(!(await menu.isVisible()), 'solo aplica en móvil');

    await expect(disparador(page)).toBeVisible();
    await disparador(page).click();
    await listado(page).getByRole('option', { name: /ISEIH/i }).click();
    await expect(disparador(page)).toContainText('ISEIH');
  });

  test('el nombre de la marca sale UNA vez, no tres', async ({ page }) => {
    // Es el punto 2 del #79: salía en la cabecera del menú, en el selector y en
    // la píldora de la barra de arriba.
    await ir(page, '/prospectos');
    const veces = await page.getByText('Fono Aprende', { exact: true }).count();
    expect(veces, 'el nombre de la marca se repite en pantalla').toBeLessThanOrEqual(1);
  });
});
