// CRM#1124: en la ficha de la formación (Productos › Formaciones), cada módulo tiene
// «Se desbloquea a los … días», con la fase 2 de Moodle encendida.
//
// Lo que se defiende: a 1280 y a 375 px el campo sale en cada módulo, con el valor
// guardado, sin desplazamiento horizontal; lo escrito se guarda; «Crear en Moodle» dice
// a los cuántos días se abre cada sección. Sin la fase 2, el campo no sale.
//
// API simulada: lo que se mide es la pantalla, no los datos.
//   CAPTURAS=<carpeta> npx playwright test e2e/formacion-desbloqueo-1124.spec.js
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { ir, API_GLOB } from './helpers';

const PROYECTOS = [{ id: 3, nombre: 'Fono Aprende', slug: 'fono-aprende', type: 'crm', active: true, modules: null }];
const USER = { id: 1, nombre: 'Manuel Casas', email: 'm@e.l', role: 'superadmin', funciones: {} };

const formacion = (disponible) => ({
  id: 55, project_id: 3, nombre: 'Máster en Psicopedagogía Clínica', tipo_formacion: 'master', tipo_por_nombre: null,
  horas_totales: 1500, horas_texto: '1500 horas', precio: 2400, moneda: 'EUR', modalidad: 'Online',
  fecha_inicio: '2027-02-01', fecha_fin: '2027-12-31', fecha_inicio_texto: null, activa: true, de_la_web: false, url_info: null,
  horas_de_los_modulos: 1500, tutoras: [], cursos_moodle: [],
  modulos: [
    { id: 1, orden: 0, titulo: 'Fundamentos de la psicopedagogía', descripcion: 'Tema 1. Historia\nTema 2. Modelos', horas: 500, dias_desbloqueo: null },
    { id: 2, orden: 1, titulo: 'Evaluación e intervención', descripcion: null, horas: 500, dias_desbloqueo: 30 },
    { id: 3, orden: 2, titulo: 'Trabajo final', descripcion: null, horas: 500, dias_desbloqueo: 90 },
  ],
  moodle: { disponible, conectado: true },
});

async function simularApi(page, disponible, guardados) {
  const j = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  const f = formacion(disponible);
  await page.route(API_GLOB, async (r) => {
    const ruta = new URL(r.request().url()).pathname.replace(/^.*\/api/, '');
    if (ruta === '/auth/refresh') return r.fulfill(j({ success: true, data: { accessToken: 't' } }));
    if (ruta === '/auth/me') return r.fulfill(j({ success: true, data: { user: USER, permissions: {}, view: {}, projects: PROYECTOS } }));
    if (ruta === '/products/55/formacion' && r.request().method() === 'PUT') {
      guardados.push(r.request().postDataJSON());
      return r.fulfill(j({ success: true, data: f }));
    }
    if (ruta === '/products/55/formacion') return r.fulfill(j({ success: true, data: f }));
    if (ruta === '/products/55/formacion/moodle') {
      return r.fulfill(j({
        success: true,
        data: {
          accion: 'crear', nombre: f.nombre, tipo: 'master', inicio: f.fecha_inicio, fin: f.fecha_fin,
          secciones: f.modulos.map((m) => m.titulo), desbloqueo: f.modulos.map((m) => m.dias_desbloqueo), cursos_unidos: [],
          categoria: { id: 7, nombre: 'Másteres', origen: 'propuesta' }, categorias: [{ id: 7, nombre: 'Másteres', ruta: null, cursos: 4 }],
          fuente_categorias: 'cursos', nombre_corto: { valor: 'MAS-PSICOPEDAGOGIA-CLINICA-2027', propuesto: 'MAS-PSICOPEDAGOGIA-CLINICA-2027', origen: 'regla', ajustado: false },
          visible: false, aviso: null,
        },
      }));
    }
    return r.fulfill(j({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }));
  });
}

const capturar = (page, nombre) => (process.env.CAPTURAS
  ? page.screenshot({ path: path.join(process.env.CAPTURAS, nombre), fullPage: true })
  : Promise.resolve());

test.describe('CRM#1124: «Se desbloquea a los … días» en la ficha de la formación', () => {
  test.describe.configure({ timeout: 90_000 });

  for (const ancho of [1280, 375]) {
    test(`a ${ancho} px: el campo en cada módulo, se guarda y sale en «Crear en Moodle»`, async ({ page }) => {
      const guardados = [];
      await simularApi(page, true, guardados);
      await page.setViewportSize({ width: ancho, height: 900 });
      await ir(page, '/productos/formaciones/55?campus=3');
      const dias = (n) => page.getByLabel(`Se desbloquea a los … días, módulo ${n}`);
      await expect(dias(1)).toBeVisible();
      await expect(dias(1)).toHaveValue('');
      await expect(dias(2)).toHaveValue('30');
      await expect(dias(3)).toHaveValue('90');
      await expect(page.getByText('se desbloquea a los 30 días', { exact: false })).toBeVisible();
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sobra, 'desplazamiento horizontal').toBeLessThanOrEqual(0);
      await dias(1).scrollIntoViewIfNeeded();
      await capturar(page, `crm-ficha-${ancho}.png`);

      await dias(1).fill('7');
      await page.getByRole('button', { name: /^Guardar$/ }).click();
      await expect.poll(() => guardados.length).toBe(1);
      expect(guardados[0].modulos.map((m) => m.dias_desbloqueo)).toEqual([7, 30, 90]);
    });
  }

  test('sin la fase 2 (producción): el campo no sale', async ({ page }) => {
    await simularApi(page, false, []);
    await page.setViewportSize({ width: 1280, height: 900 });
    await ir(page, '/productos/formaciones/55?campus=3');
    await expect(page.getByLabel('Título del módulo 1')).toBeVisible();
    await expect(page.getByText(/Se desbloquea a los/)).toHaveCount(0);
    await capturar(page, 'crm-ficha-sin-fase2-1280.png');
  });
});

// Revisión de Diego: el módulo 2 tenía 30 días y ya se llevó a Moodle (curso unido); ahora
// está vacío. La ficha no dice «desde el principio» sino que se quitará al llevarlo, y la
// vista previa lo enseña.
async function simularVaciado(page) {
  const j = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  const base = formacion(true);
  const f = {
    ...base,
    modulos: base.modulos.map((m) => (m.id === 2 ? { ...m, dias_desbloqueo: null } : m)),
    cursos_moodle: [{ curso_moodle_id: 12, curso_nombre: base.nombre, url: null, dias_secciones: [null, 30, 90] }],
  };
  await page.route(API_GLOB, async (r) => {
    const ruta = new URL(r.request().url()).pathname.replace(/^.*\/api/, '');
    if (ruta === '/auth/refresh') return r.fulfill(j({ success: true, data: { accessToken: 't' } }));
    if (ruta === '/auth/me') return r.fulfill(j({ success: true, data: { user: USER, permissions: {}, view: {}, projects: PROYECTOS } }));
    if (ruta === '/products/55/formacion') return r.fulfill(j({ success: true, data: f }));
    if (ruta === '/products/55/formacion/moodle') {
      return r.fulfill(j({
        success: true,
        data: {
          accion: 'actualizar', nombre: f.nombre, tipo: 'master', inicio: f.fecha_inicio, fin: f.fecha_fin,
          secciones: f.modulos.map((m) => m.titulo), desbloqueo: [null, null, 90], quitar_desbloqueo: [null, 30, null],
          cursos_unidos: [{ id: 12, nombre: f.nombre, url: null }], categoria: null, nombre_corto: null, visible: null,
        },
      }));
    }
    return r.fulfill(j({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }));
  });
}

// Lo que se ve en pantalla en ese momento (la página entera repite el menú fijo).
const capturarVista = (page, nombre) => (process.env.CAPTURAS
  ? page.screenshot({ path: path.join(process.env.CAPTURAS, nombre) })
  : Promise.resolve());

test.describe('CRM#1124: vaciar los días de un módulo que ya se llevó a Moodle', () => {
  test.describe.configure({ timeout: 90_000 });

  for (const ancho of [1280, 375]) {
    test(`a ${ancho} px: «se quitará la restricción», no «desde el principio»`, async ({ page }) => {
      await simularVaciado(page);
      await page.setViewportSize({ width: ancho, height: 900 });
      await ir(page, '/productos/formaciones/55?campus=3');
      const dias = (n) => page.getByLabel(`Se desbloquea a los … días, módulo ${n}`);
      await expect(dias(2)).toHaveValue('');
      await expect(page.getByText('Ahora tiene 30 días en Moodle: se quitará la restricción al llevarlo a Moodle.')).toBeVisible();
      // Solo el módulo 1, que nunca tuvo días, es «desde el principio».
      await expect(page.getByText(/vacío: desde el principio/)).toHaveCount(1);
      await expect(page.getByText('se quita la restricción de 30 días', { exact: false })).toBeVisible();
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sobra, 'desplazamiento horizontal').toBeLessThanOrEqual(0);
      await dias(2).scrollIntoViewIfNeeded();
      await capturarVista(page, `crm-vaciar-ficha-${ancho}.png`);
      await page.getByText('se quita la restricción de 30 días', { exact: false }).scrollIntoViewIfNeeded();
      await capturarVista(page, `crm-vaciar-vista-previa-${ancho}.png`);
    });
  }
});
