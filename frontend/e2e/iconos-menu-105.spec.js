// Un icono para cada encabezado de sección del menú (#105).
//
// Con la API simulada: lo que se comprueba es la estructura del menú, que no
// depende de que haya datos ni de que el backend esté levantado.
import { test, expect } from '@playwright/test';
import { ir, API_GLOB } from './helpers';

const PROYECTOS = [{ id: 1, nombre: 'Fono Aprende', slug: 'fono', type: 'crm', active: true, modules: null }];
const USER = { id: 1, nombre: 'Manuel Casas', email: 'm@e.l', role: 'superadmin' };

async function simular(page) {
  const j = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route(API_GLOB, (r) => {
    const ruta = new URL(r.request().url()).pathname.replace(/^.*\/api/, '');
    if (ruta === '/auth/refresh') return r.fulfill(j({ success: true, data: { accessToken: 't' } }));
    if (ruta === '/auth/me') return r.fulfill(j({ success: true, data: { user: USER, permissions: {}, view: {}, projects: PROYECTOS } }));
    return r.fulfill(j({ success: true, data: [], stats: {}, pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }));
  });
}

const lateral = (page) => page.locator('aside').first();

// Las de un superadmin con un proyecto de tipo CRM. «Testeo» solo sale en las
// compilaciones de vista previa, asi que no entra aqui.
const SECCIONES = ['Principal', 'Captación', 'Publicidad', 'Catálogo', 'Tutores', 'Finanzas', 'Análisis', 'Clientes', 'Sistema'];

// El menú lateral fijo es de escritorio; en móvil va en un cajón y plegarlo
// no significa nada.
test.describe('iconos de los encabezados del menu (#105)', () => {
  test.skip(({ page }) => (page.viewportSize()?.width ?? 1440) < 1024, 'el lateral fijo es de escritorio');

  test.beforeEach(async ({ page }) => {
    await simular(page);
    await page.setViewportSize({ width: 1440, height: 1250 });
    await ir(page, '/prospectos');
  });

  test('cada encabezado lleva su icono, no solo texto en mayusculas', async ({ page }) => {
    // Por nombre y no por `aria-expanded`: esa marca la llevan tambien los
    // grupos de entradas —WhatsApp, por ejemplo—, que no son secciones.
    // Y el nombre va en minuscula en el DOM: las mayusculas son de CSS.
    for (const seccion of SECCIONES) {
      const cabecera = lateral(page).getByRole('button', { name: seccion, exact: true });
      await expect(cabecera).toBeVisible();
      // Dos svg: el icono de la seccion y la flecha de plegar.
      await expect(cabecera.locator('svg')).toHaveCount(2);
    }
  });

  test('con el lateral plegado se sigue viendo donde empieza cada seccion', async ({ page }) => {
    // Es medio motivo de la peticion: plegado solo habia una raya, que decia
    // que empezaba otra cosa pero no cual.
    await page.keyboard.press('Control+b');
    await expect(lateral(page).locator('[title="Principal"]')).toBeVisible();
    await expect(lateral(page).locator('[title="Finanzas"]')).toBeVisible();
    await expect(lateral(page).locator('[title="Sistema"]')).toBeVisible();
  });

  test('la marca de seccion no finge que se puede pulsar', async ({ page }) => {
    // Una seccion no lleva a ningun sitio. Si pareciera un boton, el primer
    // clic de cada gestora se lo llevaria ella.
    await page.keyboard.press('Control+b');
    const marca = lateral(page).locator('[title="Finanzas"]');
    await expect(marca).toBeVisible();
    await expect(marca).not.toHaveRole('button');
    await expect(marca).not.toHaveRole('link');
  });

  test('el icono no tapa el nombre de la seccion', async ({ page }) => {
    // El texto sigue estando: el icono acompana, no sustituye.
    for (const nombre of ['Principal', 'Finanzas', 'Clientes']) {
      await expect(lateral(page).getByText(nombre, { exact: true })).toBeVisible();
    }
  });
});
