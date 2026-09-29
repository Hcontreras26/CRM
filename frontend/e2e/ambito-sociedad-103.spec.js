// Ver los proyectos agrupados por sociedad, no solo todos juntos (#103).
//
// El #120 hizo pulsable el encabezado y llevó la sociedad a Reportes. Esto
// comprueba lo que pedía Diego además: que Prospectos y Clientes acoten a los
// campus de esa sociedad, y que las pantallas que todavía no saben hacerlo lo
// digan en vez de enseñar los datos de todos con la etiqueta de una.
import { test, expect } from '@playwright/test';
import { ir, API_GLOB } from './helpers';

const CEDIA = 3;
const ICTESS = 5;

const PROYECTOS = [
  { id: 1, nombre: 'ISEIH', slug: 'iseih', type: 'crm', active: true, modules: null, sociedad_emisora_id: CEDIA, sociedad_nombre: 'CEDIA INVESTIGACIÓN Y DESARROLLO SL' },
  { id: 2, nombre: 'Psiko Aprende', slug: 'psiko', type: 'crm', active: true, modules: null, sociedad_emisora_id: CEDIA, sociedad_nombre: 'CEDIA INVESTIGACIÓN Y DESARROLLO SL' },
  { id: 3, nombre: 'Fono Aprende', slug: 'fono', type: 'crm', active: true, modules: null, sociedad_emisora_id: CEDIA, sociedad_nombre: 'CEDIA INVESTIGACIÓN Y DESARROLLO SL' },
  { id: 7, nombre: 'ICTESS Uno', slug: 'ict1', type: 'crm', active: true, modules: null, sociedad_emisora_id: ICTESS, sociedad_nombre: 'ICTESS INGENIERÍA E INNOVACIÓN SL' },
  { id: 8, nombre: 'ICTESS Dos', slug: 'ict2', type: 'crm', active: true, modules: null, sociedad_emisora_id: ICTESS, sociedad_nombre: 'ICTESS INGENIERÍA E INNOVACIÓN SL' },
];

const USER = { id: 1, nombre: 'Manuel Casas', email: 'm@e.l', role: 'superadmin' };

/** Deja escrito con qué ámbito se pidió cada lista. */
function espia() {
  return { peticiones: [] };
}

async function simular(page, { registro = null } = {}) {
  const j = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route(API_GLOB, (r) => {
    const url = new URL(r.request().url());
    const ruta = url.pathname.replace(/^.*\/api/, '');
    if (ruta === '/auth/refresh') return r.fulfill(j({ success: true, data: { accessToken: 't' } }));
    if (ruta === '/auth/me') {
      return r.fulfill(j({ success: true, data: { user: USER, permissions: {}, view: {}, projects: PROYECTOS } }));
    }
    if (ruta === '/leads' && registro) {
      registro.peticiones.push({
        projectIds: url.searchParams.get('projectIds'),
        projectId: url.searchParams.get('projectId'),
        conConversion: url.searchParams.get('conConversion'),
      });
    }
    return r.fulfill(j({ success: true, data: [], stats: {}, pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }));
  });
}

const selector = (page) => page.getByRole('button', { name: /selector de proyecto/i });
const lista = (page) => page.getByRole('listbox', { name: /lista de proyectos/i });

async function elegir(page, nombre) {
  await selector(page).click();
  await lista(page).getByRole('button', { name: nombre }).click();
}

test.describe('ámbito por sociedad en el resto del CRM (#103)', () => {
  test('Prospectos pide SOLO los campus de la sociedad', async ({ page }) => {
    const registro = espia();
    await simular(page, { registro });
    await ir(page, '/prospectos');
    await elegir(page, /CEDIA INVESTIGACI/i);

    await expect.poll(() => registro.peticiones.some((p) => p.projectIds === '1,2,3')).toBe(true);
    // Y nunca los cinco: eso seria enseñar ICTESS bajo la etiqueta de CEDIA.
    const trasElegir = registro.peticiones.slice(-2);
    for (const p of trasElegir) expect(p.projectIds).not.toBe('1,2,3,7,8');
  });

  test('la otra sociedad pide los suyos, no los de la primera', async ({ page }) => {
    const registro = espia();
    await simular(page, { registro });
    await ir(page, '/prospectos');
    await elegir(page, /ICTESS INGENIER/i);
    await expect.poll(() => registro.peticiones.some((p) => p.projectIds === '7,8')).toBe(true);
  });

  test('Clientes también, y lo dice en su subtítulo', async ({ page }) => {
    const registro = espia();
    await simular(page, { registro });
    await ir(page, '/clientes');
    await elegir(page, /CEDIA INVESTIGACI/i);

    await expect.poll(
      () => registro.peticiones.some((p) => p.projectIds === '1,2,3' && p.conConversion === 'true'),
    ).toBe(true);
    // El subtitulo decia «convertidos en todos los proyectos» mientras enseñaba
    // solo los de CEDIA.
    await expect(page.locator('header.sticky').first()).toContainText('CEDIA');
    await expect(page.locator('header.sticky').first()).not.toContainText('todos los proyectos');
  });

  test('volver a «todos» vuelve a pedirlos todos', async ({ page }) => {
    const registro = espia();
    await simular(page, { registro });
    await ir(page, '/prospectos');
    await elegir(page, /CEDIA INVESTIGACI/i);
    await expect.poll(() => registro.peticiones.some((p) => p.projectIds === '1,2,3')).toBe(true);

    await selector(page).click();
    await lista(page).getByRole('button', { name: /todos los proyectos/i }).click();
    await expect.poll(() => registro.peticiones.slice(-2).some((p) => p.projectIds === '1,2,3,7,8')).toBe(true);
  });

  test('una pantalla que no sabe de sociedades lo dice, y dice qué hacer', async ({ page }) => {
    // Enseñar los datos de todos bajo la etiqueta «CEDIA» seria peor que no
    // enseñarlos: se leen como buenos.
    await simular(page);
    await ir(page, '/prospectos');
    await elegir(page, /CEDIA INVESTIGACI/i);
    await ir(page, '/productos');
    const contenido = page.locator('#main-content');
    await expect(contenido).toContainText(/elige un campus/i);
    await expect(contenido).toContainText('CEDIA');
    // Y no el aviso de «todos los proyectos», que ahi seria mentira.
    await expect(contenido).not.toContainText(/vista Todos los proyectos/i);
  });

  test('Facturas obedece a la sociedad de la cabecera', async ({ page }) => {
    // Es la pantalla que el issue pone de ejemplo: ya sabia filtrar por
    // sociedad. Con dos formas de elegirla —la cabecera y su desplegable— lo
    // que no puede pasar es que discrepen.
    const vistas = [];
    await simular(page);
    await page.route(`**/crm/api/invoices**`, (r) => {
      vistas.push(new URL(r.request().url()).searchParams.get('issuerId'));
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }) });
    });
    await ir(page, '/prospectos');
    await elegir(page, /CEDIA INVESTIGACI/i);
    await ir(page, '/finanzas/facturas');
    // Y no el aviso: esta pantalla SI sabe hacerlo.
    await expect(page.locator('#main-content')).not.toContainText(/elige un campus/i);
    await expect.poll(() => vistas.includes(String(CEDIA))).toBe(true);
  });

  test('sin sociedad, ese mismo aviso sigue hablando de «todos»', async ({ page }) => {
    await simular(page);
    await ir(page, '/prospectos');
    await selector(page).click();
    await lista(page).getByRole('button', { name: /todos los proyectos/i }).click();
    await ir(page, '/productos');
    await expect(page.locator('#main-content')).toContainText(/Todos los proyectos/i);
    await expect(page.locator('#main-content')).not.toContainText(/elige un campus/i);
  });
});
