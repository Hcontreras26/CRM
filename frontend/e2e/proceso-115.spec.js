// El proceso comercial: la pantalla de los cinco pasos (#115).
//
// Con la API simulada. El servidor de verdad existe y está desplegado, pero no
// está en este repositorio, así que en local no hay contra qué hablar. Lo que
// se comprueba aquí es que la pantalla cumple el contrato del issue: qué manda
// al reordenar, qué esconde según el rol y qué enseña cuando el servidor dice
// que no.
import { test, expect } from '@playwright/test';
import { ir, API_GLOB } from './helpers';

const PROYECTOS = [{ id: 1, nombre: 'Fono Aprende', slug: 'fono', type: 'crm', active: true, modules: null }];

const PASOS = [
  { id: 1, project_id: 1, clave: 'paso_1', nombre: 'Primer contacto e información', orden: 1, cuando: 'Lunes o martes', dia_desde: 0, dia_hasta: 1, canales: ['whatsapp', 'email'], es_seguimiento: false, nota: 'Los pasos de admisión y el trámite: solo cuando confirme interés.', activo: true },
  { id: 2, project_id: 1, clave: 'paso_2', nombre: 'Prueba social · Opiniones', orden: 2, cuando: 'Miércoles o jueves', dia_desde: 2, dia_hasta: 3, canales: ['llamada', 'whatsapp'], es_seguimiento: false, nota: null, activo: true },
  { id: 3, project_id: 1, clave: 'paso_3', nombre: 'Última plaza y facilidades de pago', orden: 3, cuando: 'Viernes', dia_desde: 4, dia_hasta: 4, canales: ['llamada', 'whatsapp', 'email'], es_seguimiento: false, nota: null, activo: true },
  { id: 4, project_id: 1, clave: 'paso_4', nombre: 'Convocatoria de becas CETLAT', orden: 4, cuando: 'Lun/mar semana siguiente', dia_desde: 7, dia_hasta: 8, canales: ['llamada', 'whatsapp', 'email'], es_seguimiento: false, nota: null, activo: true },
  { id: 5, project_id: 1, clave: 'seguimiento_mensual', nombre: 'Seguimiento de toda la base', orden: 5, cuando: 'Final de mes', dia_desde: null, dia_hasta: null, canales: ['wasapi'], es_seguimiento: true, nota: null, activo: true },
];

const INACTIVO = { ...PASOS[0], id: 9, clave: 'paso_viejo', nombre: 'Paso retirado', orden: 6, activo: false };

/** Deja escrito lo que la pantalla le manda al servidor, para poder mirarlo. */
function espia() {
  return { llamadas: [] };
}

async function simular(page, { rol = 'superadmin', registro = null, fallo = null } = {}) {
  const USER = { id: 1, nombre: 'Manuel Casas', email: 'm@e.l', role: rol };
  const j = (b, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route(API_GLOB, (r) => {
    const url = new URL(r.request().url());
    const ruta = url.pathname.replace(/^.*\/api/, '');
    const metodo = r.request().method();
    if (ruta === '/auth/refresh') return r.fulfill(j({ success: true, data: { accessToken: 't' } }));
    if (ruta === '/auth/me') {
      return r.fulfill(j({ success: true, data: { user: USER, permissions: {}, view: {}, projects: PROYECTOS } }));
    }
    if (ruta.startsWith('/proceso/pasos')) {
      if (registro) {
        let cuerpo = null;
        try { cuerpo = r.request().postDataJSON(); } catch { cuerpo = null; }
        registro.llamadas.push({ metodo, ruta, busqueda: url.search, cuerpo });
      }
      if (fallo && metodo !== 'GET') return r.fulfill(j({ success: false, error: 'no' }, fallo));
      if (metodo === 'GET') {
        const conInactivos = url.searchParams.get('includeInactive') === 'true';
        return r.fulfill(j({ success: true, data: conInactivos ? [...PASOS, INACTIVO] : PASOS }));
      }
      return r.fulfill(j({ success: true, data: PASOS[0] }));
    }
    return r.fulfill(j({ success: true, data: [], stats: {}, pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }));
  });
}

const contenido = (page) => page.locator('#main-content');

// Los pasos, no los canales: dentro de cada paso hay otra lista ordenada.
const filasDePaso = (page) =>
  contenido(page).getByRole('list', { name: /pasos del proceso/i }).locator('> li');

test.describe('el proceso comercial (#115)', () => {
  test('salen los cinco pasos, en su orden', async ({ page }) => {
    await simular(page);
    await ir(page, '/configuracion/proceso');
    const filas = filasDePaso(page);
    await expect(filas).toHaveCount(5);
    await expect(filas.first()).toContainText('Primer contacto e información');
    await expect(filas.last()).toContainText('Seguimiento de toda la base');
  });

  test('cada paso dice sus dias, su etiqueta y sus canales en orden', async ({ page }) => {
    await simular(page);
    await ir(page, '/configuracion/proceso');
    const primera = filasDePaso(page).first();
    await expect(primera).toContainText('Días 0-1');
    await expect(primera).toContainText('Lunes o martes');
    await expect(primera).toContainText('WhatsApp');
    await expect(primera).toContainText('Email');
    // El de un solo dia no se escribe como rango de si mismo.
    await expect(filasDePaso(page).nth(2)).toContainText('Día 4');
  });

  test('la pantalla explica que los dias no son de la semana', async ({ page }) => {
    // Es la trampa del documento y quien abre la pantalla no ha leido la tarea.
    await simular(page);
    await ir(page, '/configuracion/proceso');
    await expect(contenido(page).getByText(/días desde que entra el prospecto/i)).toBeVisible();
  });

  test('la clave se ve pero no se puede escribir', async ({ page }) => {
    await simular(page);
    await ir(page, '/configuracion/proceso');
    await expect(contenido(page).getByText('paso_1', { exact: true })).toBeVisible();
    await contenido(page).getByRole('button', { name: /editar Primer contacto/i }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo).toContainText('paso_1');
    await expect(dialogo).toContainText('no se cambia');
    // Ni un solo campo con la clave dentro.
    await expect(dialogo.locator('input[value="paso_1"]')).toHaveCount(0);
  });

  test('al soltar se manda la lista ENTERA de ids, en su nuevo orden', async ({ page }) => {
    const registro = espia();
    await simular(page, { registro });
    await ir(page, '/configuracion/proceso');
    const filas = filasDePaso(page);
    await expect(filas).toHaveCount(5);

    // Arrastre nativo: Playwright no lo dispara solo, asi que se mandan los
    // eventos a mano. Es el mismo camino que recorre el raton.
    await filas.nth(2).dispatchEvent('dragstart');
    await filas.nth(0).dispatchEvent('dragover');
    await filas.nth(0).dispatchEvent('drop');

    await expect.poll(() => registro.llamadas.filter((l) => l.metodo === 'PATCH').length).toBeGreaterThan(0);
    const patch = registro.llamadas.find((l) => l.metodo === 'PATCH');
    expect(patch.ruta).toBe('/proceso/pasos/orden');
    // Los cinco, no solo el que se movio.
    expect(patch.cuerpo.ids).toHaveLength(5);
    expect(patch.cuerpo.ids[0]).toBe(3);
    expect([...patch.cuerpo.ids].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  test('desactivar no borra: llama al DELETE que desactiva', async ({ page }) => {
    const registro = espia();
    await simular(page, { registro });
    await ir(page, '/configuracion/proceso');
    await contenido(page).getByRole('button', { name: /desactivar Primer contacto/i }).click();
    await expect.poll(() => registro.llamadas.some((l) => l.metodo === 'DELETE')).toBe(true);
  });

  test('con el interruptor vuelven a verse los inactivos', async ({ page }) => {
    const registro = espia();
    await simular(page, { registro });
    await ir(page, '/configuracion/proceso');
    await expect(filasDePaso(page)).toHaveCount(5);
    await contenido(page).getByLabel(/ver también los inactivos/i).check();
    await expect(filasDePaso(page)).toHaveCount(6);
    await expect(contenido(page).getByText('Paso retirado')).toBeVisible();
    // Y se le pide al servidor con el parametro, no filtrando aqui.
    expect(registro.llamadas.some((l) => l.busqueda.includes('includeInactive=true'))).toBe(true);
  });

  test('una gestora lo lee pero no ve ningun boton de tocar', async ({ page }) => {
    // La API responde 403, asi que se esconden en vez de dejar que fallen.
    await simular(page, { rol: 'gestor' });
    await ir(page, '/configuracion/proceso');
    await expect(filasDePaso(page)).toHaveCount(5);
    await expect(page.getByRole('button', { name: /^nuevo/i })).toHaveCount(0);
    await expect(contenido(page).getByRole('button', { name: /^editar /i })).toHaveCount(0);
    await expect(contenido(page).getByRole('button', { name: /^desactivar /i })).toHaveCount(0);
  });

  test('una clave con mayusculas no llega a salir de la pantalla', async ({ page }) => {
    const registro = espia();
    await simular(page, { registro });
    await ir(page, '/configuracion/proceso');
    await page.getByRole('button', { name: /^nuevo/i }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Nombre').fill('Paso de prueba');
    await dialogo.getByLabel('Clave').fill('Paso Nuevo');
    await dialogo.getByRole('button', { name: /crear paso/i }).click();
    await expect(dialogo.getByText(/solo minúsculas/i)).toBeVisible();
    expect(registro.llamadas.some((l) => l.metodo === 'POST')).toBe(false);
  });

  test('si el dia final es anterior al inicial, se dice antes de mandarlo', async ({ page }) => {
    const registro = espia();
    await simular(page, { registro });
    await ir(page, '/configuracion/proceso');
    await contenido(page).getByRole('button', { name: /editar Primer contacto/i }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Día hasta').fill('0');
    await dialogo.getByLabel('Día desde').fill('5');
    await dialogo.getByRole('button', { name: /guardar cambios/i }).click();
    await expect(dialogo.getByText(/no puede ser anterior al inicial/i)).toBeVisible();
    expect(registro.llamadas.some((l) => l.metodo === 'PATCH')).toBe(false);
  });

  test('si el servidor rechaza la clave repetida, se explica en cristiano', async ({ page }) => {
    await simular(page, { fallo: 409 });
    await ir(page, '/configuracion/proceso');
    await page.getByRole('button', { name: /^nuevo/i }).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Nombre').fill('Paso de prueba');
    await dialogo.getByLabel('Clave').fill('paso_1');
    await dialogo.getByRole('button', { name: /crear paso/i }).click();
    // Ni «409» ni «Conflict»: lo que hay que hacer.
    await expect(dialogo.getByText(/ya hay un paso con esa clave/i)).toBeVisible();
  });

  test('se llega desde el menu, sin escribir la direccion a mano', async ({ page }) => {
    test.skip((page.viewportSize()?.width ?? 1440) < 1024, 'el lateral fijo es de escritorio');
    // El issue lo pide: «que no sea una pantalla escondida».
    await simular(page);
    await ir(page, '/');
    const lateral = page.locator('aside').first();
    // «Sistema» viene plegada salvo que estes dentro de ella, asi que primero
    // se abre —que es lo que hace cualquiera— y luego se pulsa.
    await lateral.getByRole('button', { name: 'Sistema', exact: true }).click();
    await lateral.getByRole('link', { name: /proceso comercial/i }).click();
    await expect(page).toHaveURL(/\/configuracion\/proceso/);
  });
});
