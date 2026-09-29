// El marco de la aplicacion (#33): barra de cabecera, apartado y menu lateral.
//
// Va con la API simulada a proposito. Lo que se comprueba aqui es la estructura
// —que hay una barra, que el titulo sale UNA vez y que dice donde estas—, y eso
// no depende de que haya datos ni de que el backend este levantado.
import { test, expect } from '@playwright/test';
import { ir, API_GLOB } from './helpers';

const PROYECTOS = [
  { id: 1, nombre: 'Fono Aprende', slug: 'fono', type: 'crm', active: true, modules: null },
  { id: 2, nombre: 'ISEIH', slug: 'iseih', type: 'crm', active: true, modules: null },
];
const USER = { id: 1, nombre: 'Manuel Casas', email: 'm@e.l', role: 'superadmin' };

async function simularApi(page) {
  const j = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  // Con el prefijo del sitio: `**/api/**` a secas se traga tambien los modulos
  // del navegador que cuelgan de rutas con «api» dentro y la pagina sale blanca.
  await page.route(API_GLOB, (r) => {
    const ruta = new URL(r.request().url()).pathname.replace(/^.*\/api/, '');
    if (ruta === '/auth/refresh') return r.fulfill(j({ success: true, data: { accessToken: 't' } }));
    if (ruta === '/auth/me') {
      return r.fulfill(j({ success: true, data: { user: USER, permissions: {}, view: {}, projects: PROYECTOS } }));
    }
    return r.fulfill(j({ success: true, data: [], stats: {}, pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }));
  });
}

const cabecera = (page) => page.locator('header.sticky').first();

const esMovil = (page) => (page.viewportSize()?.width ?? 1440) < 640;

test.describe('marco de la aplicacion', () => {
  test.beforeEach(async ({ page }) => {
    await simularApi(page);
  });

  test('todas las pantallas tienen barra de cabecera con su nombre', async ({ page }) => {
    // Antes no habia ninguna barra: al bajar por una tabla larga se perdia la
    // referencia de en que pantalla estabas.
    const esperado = [
      ['/', 'Dashboard'],
      ['/prospectos', 'Prospectos'],
      ['/clientes', 'Clientes'],
      ['/ventas', 'Ventas'],
      ['/productos', 'Productos'],
      ['/configuracion', 'Configuración'],
    ];
    for (const [ruta, titulo] of esperado) {
      await ir(page, ruta);
      await expect(cabecera(page)).toBeVisible();
      await expect(cabecera(page).getByRole('heading', { level: 1 })).toHaveText(titulo);
    }
  });

  test('el titulo sale una sola vez, no dos', async ({ page }) => {
    // Es lo que se rompio al poner la barra: la pantalla ya pintaba el suyo
    // dentro del contenido y quedaban los dos, uno debajo del otro.
    for (const ruta of ['/', '/prospectos', '/ventas', '/clientes']) {
      await ir(page, ruta);
      await expect(cabecera(page)).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    }
  });

  test('la accion principal de la pantalla vive en la barra', async ({ page }) => {
    await ir(page, '/prospectos');
    // En movil el boton dice solo «Nuevo»: el nombre largo no cabe al lado del
    // titulo y de la campana.
    await expect(cabecera(page).getByRole('button', { name: /^nuevo/i })).toBeVisible();
  });

  test('la barra dice en que marca estas', async ({ page }) => {
    // El CRM lleva varias marcas y hasta ahora solo se sabia mirando al fondo
    // del menu lateral.
    await ir(page, '/prospectos');
    // También en móvil. Antes aquí había una píldora que solo informaba y se
    // escondía en pantallas estrechas; ahora es el selector (#79, punto 2), y
    // ese sí tiene que estar siempre: es la única forma de cambiar de marca.
    await expect(cabecera(page).getByRole('button', { name: /selector de proyecto/i }))
      .toBeVisible();
  });

  test('la barra se queda arriba al desplazar', async ({ page }) => {
    await ir(page, '/prospectos');
    await expect(cabecera(page)).toBeVisible();
    await page.mouse.wheel(0, 2000);
    await expect(cabecera(page)).toBeInViewport();
  });

  test('en movil el menu se abre desde la barra', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 850 });
    await ir(page, '/prospectos');
    await page.getByRole('button', { name: /abrir menu/i }).click();
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  });

  test('las pestanas del apartado no repiten lo que ya hay en la pantalla', async ({ page }) => {
    // Prospectos tenia «Lista / Kanban» y «Audiencias» en la barra de
    // herramientas ademas de en las pestanas: dos sitios para las mismas tres
    // pantallas, uno encima del otro.
    await ir(page, '/prospectos');
    // Acotado al contenido, y por nombre exacto. El menú lateral queda fuera de
    // `#main-content`, y sus entradas llevan una segunda línea desde el #78:
    // «Prospectos · Lista, pipeline y más» contiene la palabra «pipeline», así
    // que un `getByRole('link', { name: 'Pipeline' })` a secas casa con dos.
    const pestanas = page.locator('#main-content');
    await expect(pestanas.getByRole('link', { name: 'Listado', exact: true })).toBeVisible();
    await expect(pestanas.getByRole('link', { name: 'Pipeline', exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: /kanban/i })).toHaveCount(0);
  });
});
