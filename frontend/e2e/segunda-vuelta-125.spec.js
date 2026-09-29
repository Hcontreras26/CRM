// Lo que Diego marcó al revisar /testeo el 07/09 (#125).
//
// Con la API simulada. Cada prueba es uno de sus puntos, con sus palabras en el
// comentario, para que se vea qué se está comprobando y por qué.
import { test, expect } from '@playwright/test';
import { ir, API_GLOB } from './helpers';

const CEDIA = 3;
const PROYECTOS = [
  { id: 1, nombre: 'ISEIH', slug: 'iseih', type: 'crm', active: true, modules: null, sociedad_emisora_id: CEDIA, sociedad_nombre: 'CEDIA INVESTIGACIÓN Y DESARROLLO SL' },
  { id: 2, nombre: 'Psiko Aprende', slug: 'psiko', type: 'crm', active: true, modules: null, sociedad_emisora_id: CEDIA, sociedad_nombre: 'CEDIA INVESTIGACIÓN Y DESARROLLO SL' },
  { id: 3, nombre: 'Fono Aprende', slug: 'fono', type: 'crm', active: true, modules: null, sociedad_emisora_id: CEDIA, sociedad_nombre: 'CEDIA INVESTIGACIÓN Y DESARROLLO SL' },
];
const USER = { id: 1, nombre: 'Manuel Casas', email: 'm@e.l', role: 'superadmin' };

// 40k + 55k + 25k = 120k. El total de la sociedad se pasa como parámetro para
// poder provocar el descuadre.
const PORPROY = {
  1: { leads: 60, ventas: 12, brutas: 50000, cobrado: 40000 },
  2: { leads: 45, ventas: 18, brutas: 70000, cobrado: 55000 },
  3: { leads: 30, ventas: 7, brutas: 30000, cobrado: 25000 },
};

function overview(pid, cobradoSociedad = 120000) {
  const d = pid ? PORPROY[pid] : { leads: 135, ventas: 37, brutas: 150000, cobrado: cobradoSociedad };
  return {
    leads: { total: d.leads, nuevo: 10, por_contactar: 10, contactado: 10, en_seguimiento: 10, convertido: d.ventas, no_interesado: 5 },
    tasa_conversion: 12.5,
    conversions: { total: d.ventas, ventas_brutas: d.brutas, cobrado: d.cobrado, por_cobrar: d.brutas - d.cobrado },
    ingresos_mensual: [],
  };
}

async function simular(page, { cobradoSociedad = 120000 } = {}) {
  const j = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route(API_GLOB, (r) => {
    const url = new URL(r.request().url());
    const ruta = url.pathname.replace(/^.*\/api/, '');
    if (ruta === '/auth/refresh') return r.fulfill(j({ success: true, data: { accessToken: 't' } }));
    if (ruta === '/auth/me') return r.fulfill(j({ success: true, data: { user: USER, permissions: {}, view: {}, projects: PROYECTOS } }));
    if (ruta === '/informes/overview') {
      const pid = url.searchParams.get('projectId');
      return r.fulfill(j({ success: true, data: overview(pid ? Number(pid) : null, cobradoSociedad) }));
    }
    return r.fulfill(j({ success: true, data: [], stats: {}, pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }));
  });
}

const contenido = (page) => page.locator('#main-content');

test.describe('1 · los botones de arriba', () => {
  test('ya no hay dos botones de recargar', async ({ page }) => {
    // «Refrescar» arriba y «Actualizar» abajo hacían lo mismo. Queda uno.
    await simular(page);
    await ir(page, '/prospectos');
    await expect(contenido(page).getByRole('button', { name: /^refrescar$/i })).toHaveCount(0);
    await expect(contenido(page).getByRole('button', { name: /actualizar/i })).toHaveCount(1);
  });

  test('«Reportes» tampoco está dos veces', async ({ page }) => {
    // Estaba en la barra de botones Y en Accesos clave, llevando al mismo sitio.
    await simular(page);
    await ir(page, '/prospectos');
    await expect(contenido(page).getByRole('button', { name: /^reportes$/i })).toHaveCount(0);
  });

  test('el aviso de cuántos han entrado no se ha perdido por el camino', async ({ page }) => {
    // Era lo único que «Refrescar» hacía de más; se mudó a «Actualizar».
    await simular(page);
    await ir(page, '/prospectos');
    const actualizar = contenido(page).getByRole('button', { name: /actualizar/i });
    await expect(actualizar).toBeVisible();
    // El aria-label lo cuenta cuando hay alguno, y no miente cuando no.
    await expect(actualizar).toHaveAttribute('aria-label', /^Actualizar$/);
  });
});

test.describe('2 · los filtros', () => {
  test('los que están a la vista no se repiten dentro del desplegable', async ({ page }) => {
    // «Están dos veces». Buscador, estado, canal y orden estaban en los dos
    // sitios: había que mirar en dos para saber qué hay puesto.
    await simular(page);
    await ir(page, '/prospectos');
    await contenido(page).getByRole('button', { name: /^filtros/i }).click();
    const dentro = page.getByText('Filtros principales').locator('..');
    await expect(dentro.getByText('Estado', { exact: true })).toHaveCount(0);
    await expect(dentro.getByText('Canal', { exact: true })).toHaveCount(0);
    await expect(dentro.getByText('Orden', { exact: true })).toHaveCount(0);
  });

  test('y lo que no cabe en la fila sigue estando detrás del botón', async ({ page }) => {
    // Quitar los repetidos no puede llevarse por delante los demás.
    await simular(page);
    await ir(page, '/prospectos');
    await contenido(page).getByRole('button', { name: /^filtros/i }).click();
    for (const queda of ['Programa', 'Fechas', 'Dirección']) {
      await expect(page.getByText(queda, { exact: true }).first()).toBeVisible();
    }
  });
});

test.describe('3 · el bloque de arriba se pliega', () => {
  test('se pliega y deja ver la tabla', async ({ page }) => {
    // «Está súper bien, pero que se pueda desplegar»: ocupaba la primera
    // pantalla entera y empujaba la tabla abajo del todo.
    await simular(page);
    await ir(page, '/prospectos');
    const cabecera = contenido(page).getByRole('button', { name: /resumen del dia/i });
    await expect(cabecera).toHaveAttribute('aria-expanded', 'true');
    await expect(contenido(page).getByRole('heading', { name: 'Accesos clave' })).toBeVisible();

    await cabecera.click();
    await expect(cabecera).toHaveAttribute('aria-expanded', 'false');
    await expect(contenido(page).getByRole('heading', { name: 'Accesos clave' })).toHaveCount(0);
  });

  test('recuerda cómo lo dejaste', async ({ page }) => {
    // «Que se pueda plegar y que recuerde cómo lo dejaste.»
    await simular(page);
    await ir(page, '/prospectos');
    await contenido(page).getByRole('button', { name: /resumen del dia/i }).click();
    await page.reload();
    await expect(contenido(page).getByRole('button', { name: /resumen del dia/i }))
      .toHaveAttribute('aria-expanded', 'false');
  });

  test('plegado dice si hay algo que mirar, para no abrirlo a ciegas', async ({ page }) => {
    await simular(page);
    await ir(page, '/prospectos');
    await contenido(page).getByRole('button', { name: /resumen del dia/i }).click();
    await expect(contenido(page).getByText(/piden atención|Nada urgente/i)).toBeVisible();
  });
});

test.describe('5 y 6 · reportes: primero la sociedad, y de dónde sale cada euro', () => {
  test('arranca en la sociedad aunque vengas de un proyecto suelto', async ({ page }) => {
    // «Por defecto en los reportes debe salir la sociedad, luego elegir
    // proyecto.» Es como se factura y como mira Carlos.
    await simular(page);
    await ir(page, '/informes');
    await expect(page.getByRole('button', { name: /selector de proyecto/i })).toContainText('CEDIA');
    await expect(page.getByRole('button', { name: /selector de proyecto/i })).toContainText('3 campus');
  });

  test('desglosa por campus: cuántas ventas y cuántos euros pone cada uno', async ({ page }) => {
    // «Hoy los 120.409 € salen en bloque y no se sabe de dónde vienen.»
    await simular(page);
    await ir(page, '/informes');
    const tabla = contenido(page).getByRole('table');
    await expect(tabla).toBeVisible();
    for (const campus of ['ISEIH', 'Psiko Aprende', 'Fono Aprende']) {
      await expect(tabla).toContainText(campus);
    }
    // Ordenado por lo cobrado: el que más pone, arriba.
    const primera = tabla.locator('tbody tr').first();
    await expect(primera).toContainText('Psiko Aprende');
  });

  test('la suma de los campus cuadra con el total de la sociedad', async ({ page }) => {
    // Es la comprobación que pedía el #120, hecha por la pantalla en cada
    // carga en vez de por alguien a mano.
    await simular(page);
    await ir(page, '/informes');
    await expect(contenido(page).getByRole('table')).toContainText('120.000');
    await expect(contenido(page).getByText(/se lleva .* con el total de la sociedad/i)).toHaveCount(0);
  });

  test('si NO cuadra, lo dice en vez de callarse', async ({ page }) => {
    // Que no cuadre importa más que las cifras: significa que una de las dos
    // está contando otra cosa.
    await simular(page, { cobradoSociedad: 130000 });
    await ir(page, '/informes');
    await expect(contenido(page).getByText(/se lleva .* con el total de la sociedad/i)).toBeVisible();
    await expect(contenido(page).getByText(/10\.000/)).toBeVisible();
  });
});
