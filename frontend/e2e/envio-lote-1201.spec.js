// CRM#1201 · Diplomas › Emitidos: «Enviar al alumno (n)» en lote.
//
// Lo que se defiende, a 1280 y a 375 px, en claro y en oscuro:
//  · de lo elegido, la barra dice cuántos se quedan fuera y por qué (ya enviado, sin correo en
//    la ficha, emitido fuera del CRM) y el botón cuenta solo los enviables;
//  · el diálogo lo repite antes de enviar;
//  · al confirmar, solo los enviables van al envío en lote, y lo que el servidor no pudo
//    enviar sale con su motivo; la página no se desplaza de lado.
//
// API simulada: no sale ningún correo. Con CAPTURAS_1201=<carpeta> guarda una captura de cada
// paso, ancho y tema.
import { test, expect } from '@playwright/test';
import { ir, API_GLOB } from './helpers';

const PROYECTOS = [{ id: 1, nombre: 'Psiko Aprende', slug: 'psiko', type: 'crm', active: true, modules: null }];
const USER = { id: 1, nombre: 'Persona de Prueba', email: 'p@prueba.test', role: 'superadmin', funciones: {} };

const exp = (n) => `PSIKO-2026-${String(n).padStart(6, '0')}-AAAA`;
const ALUMNAS = ['Lucía Fernández', 'Marta Ruiz', 'Elena Gómez', 'Sara Vidal', 'Nuria Pastor', 'Irene Sanz'];
const enviado = { resultado: 'enviado', en: '2026-11-21T10:00:00Z', por: 'p@prueba.test (CRM ISEIH)', porNombre: 'Persona de Prueba' };
const diploma = (n, extra = {}) => ({
  nexpediente: exp(n), centro: 'PSIKO', alumno: ALUMNAS[n - 1], titulacion: 'Máster en Psicología Clínica y de la Salud', cursoRef: 12,
  emitidoEn: '2026-11-20T10:00:00Z', emitidaPor: 'p@prueba.test (CRM ISEIH)', revocada: false, revocacion: null,
  verificarUrl: `https://certifex.test/c/${exp(n)}`, diplomaUrl: null, aviso: null, emitidoEnCrm: true, revertibleAqui: true,
  titularEmail: `alumna${n}@example.com`, sinCorreo: false, ...extra,
});
const DIPLOMAS = [
  diploma(1), diploma(2), diploma(3),
  diploma(4, { aviso: enviado }),
  diploma(5, { sinCorreo: true, titularEmail: null }),
  diploma(6, { emitidoEnCrm: false, emitidaPor: 'secretaria@campus.test' }),
];

async function simularApi(page, pedidos) {
  const j = (b) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  const pagina = (filas) => ({ success: true, data: { filas, total: filas.length, pagina: 1, tam: 50, truncado: false } });
  await page.route(API_GLOB, (r) => {
    const ruta = new URL(r.request().url()).pathname.replace(/^.*\/api/, '');
    if (ruta === '/auth/refresh') return r.fulfill(j({ success: true, data: { accessToken: 't' } }));
    if (ruta === '/auth/me') return r.fulfill(j({ success: true, data: { user: USER, permissions: {}, view: {}, projects: PROYECTOS } }));
    if (ruta === '/certifex/emisiones/estado') return r.fulfill(j({ success: true, data: { conectado: true, nombre: 'CRM de prueba' } }));
    if (ruta === '/certifex/emisiones/centros') return r.fulfill(j({ success: true, data: [{ codigo: 'PSIKO', nombre: 'Psiko Aprende' }] }));
    if (ruta === '/certifex/diplomas/resumen') {
      return r.fulfill(j({ success: true, data: { pendientes: 0, rechazadas: 0, vigentes: DIPLOMAS.length, revocados: 0, terminados: 0, porAvisar: 0, sinEmitir: 0, porEnviar: 3 } }));
    }
    if (ruta === '/certifex/diplomas/avisos/lote') {
      const { nexpedientes } = r.request().postDataJSON();
      pedidos.push(nexpedientes);
      return r.fulfill(j({
        success: true,
        data: {
          correoActivo: true,
          resultados: nexpedientes.map((n) => (n === exp(3)
            ? { nexpediente: n, ok: false, resultado: 'error', error: 'Certifex no pudo generar el PDF de este diploma.' }
            : { nexpediente: n, ok: true, resultado: 'enviado' })),
          omitidos: [],
        },
      }));
    }
    if (ruta === '/certifex/diplomas') return r.fulfill(j(pagina(DIPLOMAS)));
    if (ruta === '/certifex/diplomas/por-avisar') return r.fulfill(j({ success: true, data: { porAvisar: [], sinEmitir: [] } }));
    if (ruta === '/certifex/diplomas/solicitudes' || ruta === '/certifex/diplomas/terminados') return r.fulfill(j(pagina([])));
    if (ruta === '/certifex/diplomas/formaciones') return r.fulfill(j({ success: true, data: { proyecto: null, motivo: null, formaciones: [] } }));
    return r.fulfill(j({ success: true, data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } }));
  });
}

/** Lo que se sale del ancho de la pantalla (la página no debe desplazarse de lado). */
const sobra = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function captura(page, nombre) {
  if (!process.env.CAPTURAS_1201) return;
  await page.screenshot({ path: `${process.env.CAPTURAS_1201}/${nombre}.png` });
}

for (const tema of ['claro', 'oscuro']) {
  for (const ancho of [1280, 375]) {
    test.describe(`#1201 a ${ancho} px, ${tema}`, () => {
      test.use({ viewport: { width: ancho, height: ancho === 375 ? 812 : 900 } });

      test('Emitidos: enviar en lote deja fuera lo que no toca, y lo dice', async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem('crm_theme', t), tema === 'oscuro' ? 'dark' : 'light');
        const pedidos = [];
        await simularApi(page, pedidos);
        await ir(page, '/clientes/matriculas/diplomas');
        await page.getByRole('button', { name: /^Emitidos/ }).click();
        await expect(page.getByText('Lucía Fernández', { exact: true })).toBeVisible();
        // En el móvil, la cabecera fija de la app tapa la casilla si queda arriba del todo: al
        // centro. Y la casilla se tiene que poder pulsar: `check()` falla si algo la tapa (la
        // columna de acciones, fija y más ancha que la pantalla, la tapaba antes de #1201).
        const todas = page.getByRole('checkbox', { name: 'Elegir toda la página' });
        await todas.evaluate((el) => el.scrollIntoView({ block: 'center' }));
        await todas.check();

        const fuera = page.locator('[data-fuera="envio"]');
        await expect(fuera).toHaveText('3 se quedan fuera: 1 ya enviado · 1 sin correo en la ficha · 1 emitido fuera del CRM');
        const boton = page.getByRole('button', { name: 'Enviar al alumno (3)', exact: true });
        await expect(boton).toBeEnabled();
        expect(await sobra(page)).toBeLessThanOrEqual(0);
        await fuera.evaluate((el) => el.scrollIntoView({ block: 'center' }));
        await captura(page, `1-barra-${ancho}-${tema}`);

        await boton.click();
        const dialogo = page.getByRole('dialog');
        await expect(dialogo.getByText('Enviar 3 diplomas a sus alumnos')).toBeVisible();
        await expect(dialogo.locator('[data-fuera="envio-dialogo"]'))
          .toHaveText('Se quedan fuera, y no se les manda nada: 1 ya enviado · 1 sin correo en la ficha · 1 emitido fuera del CRM.');
        await captura(page, `2-dialogo-${ancho}-${tema}`);

        await dialogo.getByRole('button', { name: 'Enviar', exact: true }).click();
        const aviso = page.getByRole('alert').filter({ hasText: 'no se ha podido completar' });
        await expect(aviso).toContainText('Elena Gómez');
        await expect(aviso).toContainText('Certifex no pudo generar el PDF de este diploma.');
        expect(pedidos).toEqual([[exp(1), exp(2), exp(3)]]);
        expect(await sobra(page)).toBeLessThanOrEqual(0);
        await aviso.evaluate((el) => el.scrollIntoView({ block: 'center' }));
        await captura(page, `3-resultado-${ancho}-${tema}`);
      });
    });
  }
}
