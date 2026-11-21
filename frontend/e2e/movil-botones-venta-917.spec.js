// CRM#917 (testeo, 18/11): en el móvil, la fila de botones de la venta («Abonar»,
// «Emitir proforma», «Editar», «Fraccionar», la papelera) se salía por la
// derecha en la ficha del prospecto: a 375 px la página medía 584 px y había
// que desplazarla de lado. Y Finanzas › Facturas medía 481 px por la cabecera
// («Nueva factura», «Configuración»).
//
// Lo que se defiende: a 320 y 375 px ningún botón pasa del ancho de la
// pantalla y la página no tiene desplazamiento horizontal. En el PC (1280) la
// fila sigue en una línea, a la derecha del nombre del programa.
//
// API simulada: lo que se mide es la maqueta, no los datos.
import { test, expect } from '@playwright/test';
import { ir, API_GLOB } from './helpers';

const PROYECTOS = [{ id: 3, nombre: 'Fono Aprende', slug: 'fono-aprende', type: 'crm', active: true, modules: null }];
const USER = { id: 1, nombre: 'Manuel Casas', email: 'm@e.l', role: 'superadmin', funciones: { links_pago: true } };

const LEAD = {
  id: 3617, project_id: 3, nombre: 'Alumna de prueba con nombre largo', email: 'alumna.prueba@example.com',
  telefono: '+34600000000', status: 'convertido', responsable_id: 6, responsable_nombre: 'Ana Comercial',
  proyecto_nombre: 'Fono Aprende', created_at: '2026-11-18T18:11:55.828Z', fecha_solicitud: '2026-11-18T18:11:55.828Z',
  custom_fields: {}, utms: { canal_detectado: 'directo' },
};

/** Una venta a medio cobrar: salen todos sus botones (Abonar, Emitir, Editar, Fraccionar, papelera). */
const venta = (id, programa) => ({
  id, lead_id: LEAD.id, project_id: 3, producto_contratado: programa, producto_contratado_id: 10,
  importe_total: '400.00', importe_pagado: '0', importe_pendiente: '400.00', metodo_pago: 'transferencia',
  fecha_conversion: '2026-11-18', fecha_compromiso_pago: null, descuento_tipo: 'none', descuento_importe: '0.00',
  iva_pct: '21.00', iva_incluido: true, iva_exento: false, subtotal_bruto: '400.00', iva_importe: '69.42',
  items: [], payments: [], payments_count: '0', refunds: [], refunds_total: '0', installments: [],
  lead_nombre: LEAD.nombre, proyecto_nombre: 'Fono Aprende',
});
const VENTAS = [venta(560, 'Máster en Psicopedagogía Clínica'), venta(558, 'Curso de Fonoaudiología')];

async function simularApi(page) {
  const j = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  const lista = { success: true, data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } };
  await page.route(API_GLOB, (r) => {
    const ruta = new URL(r.request().url()).pathname.replace(/^.*\/api/, '');
    if (ruta === '/auth/refresh') return r.fulfill(j({ success: true, data: { accessToken: 't' } }));
    if (ruta === '/auth/me') return r.fulfill(j({ success: true, data: { user: USER, permissions: {}, view: {}, projects: PROYECTOS } }));
    if (ruta === `/leads/${LEAD.id}`) return r.fulfill(j({ success: true, data: LEAD }));
    if (ruta === `/conversions/by-lead/${LEAD.id}`) return r.fulfill(j({ success: true, data: VENTAS }));
    const v = ruta.match(/^\/conversions\/(\d+)$/);
    if (v) return r.fulfill(j({ success: true, data: VENTAS.find((x) => x.id === Number(v[1])) || VENTAS[0] }));
    if (/^\/invoices\/by-conversion\//.test(ruta)) return r.fulfill(j({ success: true, data: null }));
    if (/^\/feedback\/lead\//.test(ruta)) return r.fulfill(j({ success: true, data: null }));
    return r.fulfill(j(lista));
  });
}

/** Lo que sobra de ancho, y los botones visibles que se salen de la pantalla. */
async function medir(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const ancho = de.clientWidth;
    // Lo que va dentro de una tira con desplazamiento propio (las pestañas de
    // Finanzas, una tabla) no ensancha la página: se desplaza ella sola.
    const enTiraPropia = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true;
      }
      return false;
    };
    const fuera = [...document.querySelectorAll('button, a[href]')]
      .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > ancho + 1; })
      .filter((b) => !enTiraPropia(b))
      .map((b) => (b.innerText || b.getAttribute('aria-label') || b.title || b.tagName).trim().replace(/\s+/g, ' '));
    return { sobra: de.scrollWidth - ancho, fuera };
  });
}

const PANTALLAS = [
  ['la ficha del prospecto', `/prospectos/${LEAD.id}`, () => 'Máster en Psicopedagogía Clínica'],
  ['la ficha de la venta', '/finanzas/ventas/560', null],
  ['Finanzas › Facturas', '/finanzas/facturas', null],
];

test.describe('CRM#917: nada se sale de la pantalla en el móvil', () => {
  // La primera carga en el servidor de desarrollo compila la ficha entera.
  test.describe.configure({ timeout: 90_000 });
  test.beforeEach(async ({ page }) => { await simularApi(page); });

  for (const ancho of [320, 375]) {
    for (const [nombre, ruta, espera] of PANTALLAS) {
      test(`${nombre} a ${ancho} px: sin desplazamiento horizontal y ningún botón fuera`, async ({ page }) => {
        await page.setViewportSize({ width: ancho, height: 800 });
        await ir(page, ruta);
        if (espera) await expect(page.getByText(espera()).first()).toBeVisible();
        const m = await medir(page);
        expect(m.fuera, `botones fuera del ancho a ${ancho} px`).toEqual([]);
        expect(m.sobra, `desplazamiento horizontal a ${ancho} px`).toBeLessThanOrEqual(0);
      });
    }
  }

  test('ficha del prospecto: los botones de la venta están todos y se pueden pulsar a 375 px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await ir(page, `/prospectos/${LEAD.id}`);
    for (const nombre of [/^Abonar$/, /Emitir proforma/, /^Editar$/, /^Fraccionar$/]) {
      const boton = page.getByRole('button', { name: nombre }).first();
      await expect(boton).toBeVisible();
      const caja = await boton.boundingBox();
      expect(caja.x).toBeGreaterThanOrEqual(0);
      expect(caja.x + caja.width).toBeLessThanOrEqual(375);
    }
  });

  test('en el PC (1280 px) la fila de la venta sigue en una línea, a la derecha del programa', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await ir(page, `/prospectos/${LEAD.id}`);
    const titulo = page.getByRole('heading', { name: 'Máster en Psicopedagogía Clínica' });
    const abonar = page.getByRole('button', { name: /^Abonar$/ }).first();
    const fraccionar = page.getByRole('button', { name: /^Fraccionar$/ }).first();
    const [t, a, f] = await Promise.all([titulo.boundingBox(), abonar.boundingBox(), fraccionar.boundingBox()]);
    expect(a.x).toBeGreaterThan(t.x + t.width);
    expect(Math.abs(a.y - f.y)).toBeLessThan(4);
    expect((await medir(page)).sobra).toBeLessThanOrEqual(0);
  });
});
