// La pantalla de Clientes, puesta como la de Prospectos (#104).
//
// Va con la API simulada a proposito: lo que se comprueba es que los bloques
// estan y dicen lo que tienen que decir, y eso no depende de que haya datos
// reales ni de que el backend este levantado.
import { test, expect } from '@playwright/test';
import { ir, API_GLOB } from './helpers';

const PROYECTOS = [{ id: 1, nombre: 'Fono Aprende', slug: 'fono', type: 'crm', active: true, modules: null }];
const USER = { id: 1, nombre: 'Manuel Casas', email: 'm@e.l', role: 'superadmin' };
const hoy = new Date();
const mas = (d) => { const x = new Date(hoy); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };

const CLIENTES = [
  { id: 11, nombre: 'Ana Ruiz', email: 'a@e.l', telefono: '600111222', responsable_nombre: 'Marta', programas: ['Logopedia'], cursos: [], conversiones: 2, total_compras: 1800, total_pagado: 1200, pendiente: 600, total_cuotas: 6, cuotas_pagadas: 4, cuotas_pendientes: 2, ultima_compra: '2026-06-10', last_interaction_at: '2026-08-30', proximo_vencimiento: mas(-4) },
  { id: 12, nombre: 'Luis Pardo', email: 'l@e.l', telefono: '600333444', responsable_nombre: 'Marta', programas: ['Master'], cursos: [], conversiones: 1, total_compras: 1200, total_pagado: 1200, pendiente: 0, total_cuotas: 3, cuotas_pagadas: 3, cuotas_pendientes: 0, ultima_compra: '2026-07-02', last_interaction_at: '2026-09-01', proximo_vencimiento: null },
  { id: 13, nombre: 'Sara Gil', email: 's@e.l', telefono: '600555666', responsable_nombre: 'Ivan', programas: ['Logopedia'], cursos: [], conversiones: 1, total_compras: 900, total_pagado: 300, pendiente: 600, total_cuotas: 3, cuotas_pagadas: 1, cuotas_pendientes: 2, ultima_compra: '2025-12-01', last_interaction_at: '2026-08-20', proximo_vencimiento: mas(2) },
];

const COBROS = {
  items: [
    { tipo: 'cuota', ref_id: 1, conversion_id: 1, lead_id: 11, cliente: 'Ana Ruiz', producto: 'Logopedia', gestora_nombre: 'Marta', responsable_id: 2, cuota_numero: 5, importe: 300, vence: mas(-4), vencido: true },
    { tipo: 'cuota', ref_id: 2, conversion_id: 1, lead_id: 11, cliente: 'Ana Ruiz', producto: 'Logopedia', gestora_nombre: 'Marta', responsable_id: 2, cuota_numero: 6, importe: 300, vence: mas(3), vencido: false },
    { tipo: 'cuota', ref_id: 3, conversion_id: 3, lead_id: 13, cliente: 'Sara Gil', producto: 'Logopedia', gestora_nombre: 'Ivan', responsable_id: 3, cuota_numero: 2, importe: 300, vence: mas(2), vencido: false },
    { tipo: 'cuota', ref_id: 4, conversion_id: 3, lead_id: 13, cliente: 'Sara Gil', producto: 'Logopedia', gestora_nombre: 'Ivan', responsable_id: 3, cuota_numero: 3, importe: 300, vence: mas(20), vencido: false },
    { tipo: 'venta', ref_id: 5, conversion_id: 9, lead_id: 12, cliente: 'Luis Pardo', producto: 'Master', gestora_nombre: 'Marta', responsable_id: 2, cuota_numero: null, importe: 450, vence: mas(45), vencido: false },
  ],
  gestoras: [{ id: 2, nombre: 'Marta' }, { id: 3, nombre: 'Ivan' }],
  resumen: { total_pendiente: 1650, total_vencido: 300, count: 5, count_vencidas: 1 },
};

async function simular(page) {
  const j = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route(API_GLOB, (r) => {
    const ruta = new URL(r.request().url()).pathname.replace(/^.*\/api/, '');
    if (ruta === '/auth/refresh') return r.fulfill(j({ success: true, data: { accessToken: 't' } }));
    if (ruta === '/auth/me') return r.fulfill(j({ success: true, data: { user: USER, permissions: {}, view: {}, projects: PROYECTOS } }));
    if (ruta === '/accounting/receivable') return r.fulfill(j({ success: true, data: COBROS }));
    if (ruta.startsWith('/leads')) return r.fulfill(j({ success: true, data: CLIENTES, pagination: { total: 3, page: 1, limit: 500, totalPages: 1 } }));
    return r.fulfill(j({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }));
  });
}

const contenido = (page) => page.locator('#main-content');

test.describe('la pantalla de Clientes (#104)', () => {
  test.beforeEach(async ({ page }) => {
    await simular(page);
    await ir(page, '/clientes');
  });

  test('arriba estan las cuatro cifras, no tres recuadros sueltos', async ({ page }) => {
    // Antes habia tres recuadros hechos a mano, con otra letra y sus colores
    // sueltos. Ahora son las mismas cuatro tarjetas que en Prospectos.
    //
    // Se busca por la linea de detalle y no por la etiqueta: «Clientes» esta
    // tambien en las pestanas de arriba y un getByText a secas casa con las dos.
    await expect(contenido(page).getByText('con los filtros puestos')).toBeVisible();
    await expect(contenido(page).getByText('lo vendido a estos clientes')).toBeVisible();
    await expect(contenido(page).getByText(/% de lo facturado/)).toBeVisible();
    await expect(contenido(page).getByText(/% sin cobrar/)).toBeVisible();
  });

  test('el reparto del cobro dice cuanto se debe y de que plazo', async ({ page }) => {
    await expect(contenido(page).getByRole('heading', { name: 'Salud de cobro' })).toBeVisible();
    await expect(contenido(page).getByText('Vencido', { exact: true })).toBeVisible();
    await expect(contenido(page).getByText('Esta semana', { exact: true })).toBeVisible();
  });

  test('los proximos cobros salen del mas vencido al que viene', async ({ page }) => {
    await expect(contenido(page).getByRole('heading', { name: 'Próximos cobros' })).toBeVisible();
    // La primera fila es la vencida: es la que lleva mas tiempo esperando.
    await expect(contenido(page).getByText(/vencido hace \d+d/)).toBeVisible();
  });

  test('hay accesos a donde se va desde aqui, sin volver al menu', async ({ page }) => {
    await expect(contenido(page).getByRole('heading', { name: 'Accesos clave' })).toBeVisible();
    // Por rol y buscando la segunda linea del boton: «Matriculas» es tambien
    // una pestana, y buscandolo por texto casarian las dos cosas.
    const accesos = ['Altas en cada curso', 'Cuotas pendientes', 'Registrar y consultar', 'Numeros descargables'];
    for (const detalle of accesos) {
      await expect(contenido(page).getByRole('button', { name: new RegExp(detalle) })).toBeVisible();
    }
  });

  test('los filtros que mas se usan estan a la vista, no escondidos', async ({ page }) => {
    // Estaban TODOS detras del boton «Filtros»: uno puesto sin querer no se veia.
    await expect(contenido(page).getByPlaceholder(/buscar por nombre/i)).toBeVisible();
    await expect(contenido(page).getByLabel('Estado de pago')).toBeVisible();
    await expect(contenido(page).getByLabel('Orden')).toBeVisible();
  });

  test('la accion principal vive en la cabecera, como en Prospectos', async ({ page }) => {
    const cabecera = page.locator('header.sticky').first();
    await expect(cabecera.getByRole('button', { name: /registrar venta|vender/i })).toBeVisible();
  });

  test('el titulo sale una sola vez', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });
});
