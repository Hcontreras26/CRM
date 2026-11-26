// Equipo › Actividad en el móvil (QA de /testeo, 25/11/2026): a 375 px la tabla
// parecía cortada —no se veía «Proyectos»— y el «Nadie con horas en Monitask en
// estas fechas.» se quedaba a medias.
//
// Lo que se defiende, en las tres pestañas, con datos y sin ellos:
//   · la página no se desplaza de lado (ni a 375 ni a 1280);
//   · a 375 la tabla se desliza dentro de su caja y su última columna se alcanza;
//   · el aviso de «nadie» cabe entero en la pantalla;
//   · a 1280 la tabla cabe sin deslizarse y no se avisa de nada.
//
// API simulada: lo que se mide es la maqueta, no los datos.
import { test, expect } from '@playwright/test';
import { ir, API_GLOB } from './helpers';

const PROYECTOS = [{ id: 3, nombre: 'Fono Aprende', slug: 'fono-aprende', type: 'crm', active: true, modules: null }];
const USER = { id: 1, nombre: 'Manuel Casas', email: 'm@e.l', role: 'superadmin', funciones: { monitask: true } };
const ESTADO = { activo: true, conectada: true, ultima_sync_at: '2026-11-25T08:00:00Z', margen_pct: 10, sincronizando: false };

const persona = (i, nombre) => ({
  monitask_id: i, nombre, correo: `p${i}@example.com`, colaborador_id: i, colaborador_nombre: nombre, user_id: null, usuario_nombre: null,
  horas: 120.5 + i, horas_activas: 98.25, actividad_pct: 81.6, dias: 19,
  proyectos: [{ nombre: 'Psiko Aprende — campus', horas: 60 }, { nombre: 'ISEIH web corporativa', horas: 30.5 }, { nombre: 'Academia IA', horas: 10 }],
});
const ACTIVIDAD = [persona(1, 'Ana María Rodríguez Pérez'), persona(2, 'Fabián Contreras'), persona(3, 'Diana Zieg')];
const COTEJO = {
  periodo: '2026-10', margen_pct: 10,
  filas: ACTIVIDAD.map((a) => ({
    colaborador_id: a.colaborador_id, nombre: a.nombre, email: a.correo, con_monitask: true, horas_facturadas: 140, horas_otras_empresas: 0,
    horas_monitask: a.horas, horas_activas: 98, actividad_pct: 81.6, dias: 19, sin_cotejo: false, diferencia_horas: 19.5, diferencia_pct: 16.2,
    fuera_de_margen: false, sin_factura: false,
    facturas: [{ id: a.colaborador_id, empresa: 'Psiko Aprende S.L.', horas: 140, modalidad: 'horas', numero_factura: 'F-1', numero_recepcion: null, pagada: false }],
  })),
  resumen: { colaboradores: 3, con_cotejo: 3, factura_de_mas: [], factura_de_menos: [] },
};
const PERSONAS = {
  personas: ACTIVIDAD.map((a) => ({
    monitask_id: a.monitask_id, nombre: a.nombre, correo: a.correo, emparejado: 'correo', colaborador_id: a.colaborador_id,
    colaborador_nombre: a.nombre, user_id: null, usuario_nombre: null, emparejado_por_nombre: null, ultimo_dia: '2026-11-24',
  })),
  colaboradores: ACTIVIDAD.map((a) => ({ id: a.colaborador_id, nombre: a.nombre, email: a.correo, activo: true, user_id: null })),
  usuarios: [],
};
const VACIOS = {
  actividad: [],
  cotejo: { ...COTEJO, filas: [], resumen: { colaboradores: 0, con_cotejo: 0, factura_de_mas: [], factura_de_menos: [] } },
  personas: { personas: [], colaboradores: [], usuarios: [] },
};

async function simularApi(page, conDatos) {
  const j = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route(API_GLOB, (r) => {
    const ruta = new URL(r.request().url()).pathname.replace(/^.*\/api/, '');
    if (ruta === '/auth/refresh') return r.fulfill(j({ success: true, data: { accessToken: 't' } }));
    if (ruta === '/auth/me') return r.fulfill(j({ success: true, data: { user: USER, permissions: {}, view: {}, projects: PROYECTOS } }));
    if (ruta === '/monitask/estado') return r.fulfill(j({ success: true, data: ESTADO }));
    if (ruta === '/monitask/actividad') return r.fulfill(j({ success: true, data: conDatos ? ACTIVIDAD : VACIOS.actividad }));
    if (ruta === '/monitask/cotejo') return r.fulfill(j({ success: true, data: conDatos ? COTEJO : VACIOS.cotejo }));
    if (ruta === '/monitask/personas') return r.fulfill(j({ success: true, data: conDatos ? PERSONAS : VACIOS.personas }));
    return r.fulfill(j({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }));
  });
}

const VISTAS = [
  ['actividad', 'Actividad por persona', 'Proyectos', 'Nadie con horas en Monitask en estas fechas.'],
  ['cotejo', 'Cotejo con facturas', 'Facturas', 'Ningún colaborador con factura o con Monitask ese mes.'],
  ['personas', 'Personas de Monitask', 'Cómo', 'Todavía no se ha traído a nadie de Monitask.'],
];

test.describe('Equipo › Actividad: la tabla cabe en el móvil', () => {
  test.describe.configure({ timeout: 90_000 });

  for (const [vista, etiqueta, ultima, vacio] of VISTAS) {
    test(`${vista} a 375 px con datos: la página no se desplaza y la tabla se desliza hasta «${ultima}»`, async ({ page }) => {
      await simularApi(page, true);
      await page.setViewportSize({ width: 375, height: 800 });
      await ir(page, `/equipo/actividad?vista=${vista}`);
      const caja = page.getByRole('region', { name: etiqueta });
      await expect(caja.locator('tbody tr').first()).toBeVisible();

      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sobra, 'desplazamiento horizontal de la página').toBeLessThanOrEqual(0);

      const m = await caja.evaluate((el) => ({ scroll: el.scrollWidth, ancho: el.clientWidth, derecha: el.getBoundingClientRect().right }));
      expect(m.scroll, 'la tabla es más ancha que su caja y se desliza').toBeGreaterThan(m.ancho);
      expect(m.derecha).toBeLessThanOrEqual(375);
      await expect(page.getByText('Desliza la tabla a los lados')).toBeVisible();

      // Deslizada hasta el final, la última columna se ve entera.
      await caja.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
      const th = await caja.locator('thead th').last().boundingBox();
      expect(await caja.locator('thead th').last().innerText()).toBe(ultima);
      expect(th.x).toBeGreaterThanOrEqual(0);
      expect(th.x + th.width).toBeLessThanOrEqual(375 + 1);
    });

    test(`${vista} a 375 px sin datos: el aviso se lee entero`, async ({ page }) => {
      await simularApi(page, false);
      await page.setViewportSize({ width: 375, height: 800 });
      await ir(page, `/equipo/actividad?vista=${vista}`);
      const aviso = page.getByText(vacio);
      await expect(aviso).toBeVisible();
      const b = await aviso.boundingBox();
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(375);
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sobra).toBeLessThanOrEqual(0);
    });

    test(`${vista} a 1280 px: la tabla cabe sin deslizarse`, async ({ page }) => {
      await simularApi(page, true);
      await page.setViewportSize({ width: 1280, height: 900 });
      await ir(page, `/equipo/actividad?vista=${vista}`);
      const caja = page.getByRole('region', { name: etiqueta });
      await expect(caja.locator('tbody tr').first()).toBeVisible();
      const m = await caja.evaluate((el) => ({ scroll: el.scrollWidth, ancho: el.clientWidth }));
      expect(m.scroll).toBeLessThanOrEqual(m.ancho);
      await expect(page.getByText('Desliza la tabla a los lados')).toHaveCount(0);
      const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sobra).toBeLessThanOrEqual(0);
    });
  }
});
