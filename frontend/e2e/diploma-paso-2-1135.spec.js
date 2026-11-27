// CRM#1135 (gemela CRM-ISEIE#791) · Diploma al 100 %, paso 2: el estado del diploma en la
// ficha del alumno y en Diplomas › Pendientes.
//
// Lo que se defiende, a 1280 y a 375 px:
//  · la ficha del alumno enseña la tarjeta «Diploma» con lo que hay (datos pedidos,
//    contestados o emitido), sin desbordar la página;
//  · en Pendientes, a quien ya se le pidieron los datos no se le ofrece «Aprobar y emitir»:
//    dice «Esperando al alumno» y hasta cuándo. A los demás, el botón de siempre.
//
// API simulada: lo que se mide es la pantalla, no los datos. Con CAPTURAS_1135=<carpeta>
// guarda una captura de cada pantalla y ancho.
import { test, expect } from '@playwright/test';
import { ir, API_GLOB } from './helpers';

const PROYECTOS = [{ id: 1, nombre: 'ISEIH', slug: 'iseih', type: 'crm', active: true, modules: null }];
const USER = { id: 1, nombre: 'Manuel Casas', email: 'm@e.l', role: 'superadmin', funciones: {} };

const LEAD = {
  id: 4242, project_id: 1, nombre: 'Lucía Fernández Prueba', email: 'lucia.prueba@example.com',
  telefono: '+34600000000', status: 'convertido', responsable_id: 6, responsable_nombre: 'Ana Comercial',
  proyecto_nombre: 'ISEIH', created_at: '2026-10-01T10:00:00Z', fecha_solicitud: '2026-10-01T10:00:00Z',
  custom_fields: {}, utms: { canal_detectado: 'directo' },
};

const fichaDiploma = (extra) => ({
  matricula_id: 1, centro: 'ISEIH', project_id: 1, campus: 'ISEIH', estado: 'pendiente',
  curso_nombre: 'Máster en Psicología Clínica y de la Salud', pedido_at: '2026-11-24T10:00:00Z',
  caduca_at: '2026-12-01T10:00:00Z', enviado_at: '2026-11-24T10:00:00Z', envio_simulado: false, envio_error: null,
  respondido_at: null, aplicado_at: null, aplicar_error: null, nexpediente: null, emitido_at: null, diploma_enviado_at: null,
  ...extra,
});
const DIPLOMAS_FICHA = [
  fichaDiploma({}),
  fichaDiploma({
    matricula_id: 2, estado: 'confirmado', curso_nombre: 'Curso de Mindfulness', respondido_at: '2026-11-10T10:00:00Z',
    nexpediente: 'ISEIH-2026-000123-AB12', emitido_at: '2026-11-11T10:00:00Z', diploma_enviado_at: '2026-11-12T10:00:00Z',
  }),
];

const confirmacion = (estado, extra = {}) => ({
  estado, pedidaEn: '2026-11-24T10:00:00Z', caducaEn: '2026-12-01T10:00:00Z', enviadaEn: '2026-11-24T10:00:00Z',
  simulado: false, envioError: null, respondidaEn: null, sinAplicar: false, aplicarError: null, ...extra,
});
const solicitud = (id, nombre, extra = {}) => ({
  matriculaId: id, centro: 'ISEIH', titular: { nombre, email: `alumno${id}@example.com`, dni: '12345678Z' },
  curso: { ref: 12, nombre: 'Máster en Psicología Clínica y de la Salud' }, notaFinal: 8.5, umbral: 5, completado: true,
  actividades: { total: 6, calificadas: 6 }, propuesto: true, nexpediente: null,
  solicitud: { en: '2026-11-20T09:00:00Z', nombre }, decision: null, crm: { ventas: 1, pagado: true }, edicion: null, firma: null,
  programaCrm: { programa: { horas: 1500, modulos: [{ titulo: 'Módulo 1' }] }, formacion: null, motivo: null, editado: false, elegida: false },
  confirmacion: null,
  ...extra,
});
const PENDIENTES = [
  solicitud(101, 'Lucía Fernández Prueba', { confirmacion: confirmacion('pendiente') }),
  solicitud(102, 'Marcos Sin Pedir'),
  solicitud(103, 'Elena Confirmada', { confirmacion: confirmacion('confirmado', { respondidaEn: '2026-11-25T08:00:00Z' }) }),
];

async function simularApi(page) {
  const j = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  const pagina = (filas) => ({ success: true, data: { filas, total: filas.length, pagina: 1, tam: 50, truncado: false } });
  await page.route(API_GLOB, (r) => {
    const ruta = new URL(r.request().url()).pathname.replace(/^.*\/api/, '');
    if (ruta === '/auth/refresh') return r.fulfill(j({ success: true, data: { accessToken: 't' } }));
    if (ruta === '/auth/me') return r.fulfill(j({ success: true, data: { user: USER, permissions: {}, view: {}, projects: PROYECTOS } }));
    if (ruta === `/leads/${LEAD.id}`) return r.fulfill(j({ success: true, data: LEAD }));
    if (ruta === `/leads/${LEAD.id}/diploma`) return r.fulfill(j({ success: true, data: DIPLOMAS_FICHA }));
    if (ruta === `/leads/${LEAD.id}/campus`) return r.fulfill(j({ success: true, data: { disponible: false, campus: [] } }));
    if (ruta === '/certifex/emisiones/estado') return r.fulfill(j({ success: true, data: { conectado: true, nombre: 'CRM de prueba' } }));
    if (ruta === '/certifex/emisiones/centros') return r.fulfill(j({ success: true, data: [{ codigo: 'ISEIH', nombre: 'ISEIH' }] }));
    if (ruta === '/certifex/diplomas/resumen') {
      return r.fulfill(j({ success: true, data: { pendientes: 3, rechazadas: 0, vigentes: 0, revocados: 0, terminados: 0, porAvisar: 0, sinEmitir: 0, porEnviar: 0 } }));
    }
    if (ruta === '/certifex/diplomas/solicitudes') return r.fulfill(j(pagina(PENDIENTES)));
    if (ruta === '/certifex/diplomas/por-avisar') return r.fulfill(j({ success: true, data: { porAvisar: [], sinEmitir: [] } }));
    if (ruta === '/certifex/diplomas/formaciones') return r.fulfill(j({ success: true, data: { proyecto: null, motivo: null, formaciones: [] } }));
    if (/^\/certifex\/diplomas(\/terminados)?$/.test(ruta)) return r.fulfill(j(pagina([])));
    return r.fulfill(j({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }));
  });
}

/** Lo que se sale del ancho de la pantalla (la página no debe desplazarse de lado). */
const sobra = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function captura(page, nombre) {
  if (!process.env.CAPTURAS_1135) return;
  await page.screenshot({ path: `${process.env.CAPTURAS_1135}/${nombre}.png`, fullPage: true });
}

for (const ancho of [1280, 375]) {
  test.describe(`#1135 a ${ancho} px`, () => {
    test.use({ viewport: { width: ancho, height: ancho === 375 ? 812 : 900 } });

    test('la ficha del alumno enseña su diploma', async ({ page }) => {
      await simularApi(page);
      await ir(page, `/clientes/${LEAD.id}`);
      const tarjeta = page.locator('section', { has: page.getByRole('heading', { name: 'Diploma' }) });
      await expect(tarjeta).toBeVisible();
      await expect(tarjeta.getByText(/^Datos pedidos/)).toBeVisible();
      await expect(tarjeta.getByText(/^Diploma emitido/)).toBeVisible();
      await expect(tarjeta.locator('p', { hasText: 'ISEIH-2026-000123-AB12' })).toBeVisible();
      expect(await sobra(page)).toBeLessThanOrEqual(0);
      await tarjeta.scrollIntoViewIfNeeded();
      await captura(page, `ficha-${ancho}`);
    });

    test('Pendientes: «Esperando al alumno» en vez de «Aprobar y emitir»', async ({ page }) => {
      await simularApi(page);
      await ir(page, '/clientes/matriculas/diplomas');
      const fila = (n) => page.locator('tr', { has: page.getByText(n, { exact: true }) });
      await expect(fila('Lucía Fernández Prueba')).toBeVisible();
      await expect(fila('Lucía Fernández Prueba').getByRole('status')).toContainText('Esperando al alumno');
      await expect(fila('Lucía Fernández Prueba').getByRole('button', { name: /Aprobar y emitir/ })).toHaveCount(0);
      await expect(fila('Marcos Sin Pedir').getByRole('button', { name: /Aprobar y emitir/ })).toHaveCount(1);
      await expect(fila('Elena Confirmada').getByText(/^Datos confirmados/)).toBeVisible();
      // La tabla se desplaza dentro de su caja; la página no.
      expect(await sobra(page)).toBeLessThanOrEqual(0);
      await captura(page, `pendientes-${ancho}`);
    });
  });
}
