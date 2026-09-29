// Verificación de la pantalla de Usuarios (issue #31 · F1), punto por punto.
//
// No hace falta backend ni base: la API va interceptada. Eso permite comprobar
// lo que de verdad importa y que leyendo el código no se ve — que cada acción
// manda el payload correcto al endpoint correcto — y además provocar a mano los
// casos que en un servidor real cuesta reproducir (lista vacía, 403).

import { test, expect } from '@playwright/test';
// La base sale de `helpers`, no de una direccion escrita aqui. Este fichero se
// quedo con `http://localhost:5173/testeo` fija mientras las otras tres specs
// pasaban a `helpers`: en local la aplicacion cuelga de `/crm`, asi que este se
// iba a la pagina de error de Vite y fallaba entero sin decir por que.
import { ir, API_GLOB } from './helpers';

const PROYECTOS = [
  { id: 1, nombre: 'Psiko Aprende', slug: 'psiko-aprende', type: 'crm', active: true },
  { id: 2, nombre: 'ISEIH', slug: 'iseih', type: 'crm', active: true },
];

const YO = {
  id: 1, nombre: 'Manuel Casas', email: 'manuel@empresa.com', role: 'superadmin',
};

const USUARIOS = [
  {
    id: 10, nombre: 'Ana Gestora', email: 'ana@empresa.com', role: 'gestor', active: true,
    last_login_at: '2026-08-18T09:00:00Z', created_at: '2026-01-01T00:00:00Z',
    whatsapp_phone: '+34600111222', whatsapp_display_name: null, avatar_url: null,
    projects: [{ projectId: 1, recibeLeads: true }],
  },
  {
    id: 11, nombre: 'Bruno Admin', email: 'bruno@empresa.com', role: 'admin', active: true,
    last_login_at: null, created_at: '2026-02-01T00:00:00Z',
    whatsapp_phone: null, whatsapp_display_name: null, avatar_url: null,
    projects: [{ projectId: 1, recibeLeads: false }, { projectId: 2, recibeLeads: true }],
  },
  {
    id: 12, nombre: 'Carla Baja', email: 'carla@empresa.com', role: 'gestor', active: false,
    last_login_at: '2026-05-02T11:00:00Z', created_at: '2026-03-01T00:00:00Z',
    whatsapp_phone: null, whatsapp_display_name: null, avatar_url: null,
    projects: [{ projectId: 2, recibeLeads: true }],
  },
];

const DISPONIBILIDAD = [
  {
    id: 10, nombre: 'Ana Gestora', email: 'ana@empresa.com', role: 'gestor', active: true,
    is_available: true, unavailable_reason: null, unavailable_since: null,
    bloque_activo: null, bloques_futuros: 0,
  },
  {
    id: 11, nombre: 'Bruno Admin', email: 'bruno@empresa.com', role: 'admin', active: true,
    is_available: false, unavailable_reason: 'Vacaciones', unavailable_since: '2026-08-01T00:00:00Z',
    bloque_activo: { id: 5, fecha_inicio: '2026-08-15', fecha_fin: '2026-08-30', motivo: 'Vacaciones' },
    bloques_futuros: 1,
  },
];

const json = (body, status = 200) => ({
  status, contentType: 'application/json', body: JSON.stringify(body),
});

/**
 * Intercepta toda la API. `espia` recoge cada petición que no sea de lectura,
 * para poder afirmar sobre el método, la ruta y el cuerpo enviados.
 */
async function mockApi(page, { usuarios = USUARIOS, usersStatus = 200, espia = [] } = {}) {
  // El patron tiene que colgar de la base. Con `**/api/**` tambien se cazaba
  // `/testeo/src/shared/api/client.js` —un fuente con «api» en la ruta—, se le
  // devolvía JSON, el navegador lo rechazaba por MIME y la aplicación no
  // arrancaba: pantalla en blanco y los trece tests fuera.
  await page.route(API_GLOB, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const ruta = url.pathname.replace(/^.*\/api/, '');
    const metodo = req.method();

    if (metodo !== 'GET') {
      let cuerpo = null;
      try { cuerpo = req.postDataJSON(); } catch { cuerpo = req.postData(); }
      espia.push({ metodo, ruta, cuerpo });
    }

    // ── auth ──
    if (ruta === '/auth/refresh') return route.fulfill(json({ success: true, data: { accessToken: 'tok' } }));
    if (ruta === '/auth/me') {
      return route.fulfill(json({
        success: true,
        data: { user: YO, permissions: {}, view: {}, projects: PROYECTOS },
      }));
    }

    // ── disponibilidad (antes que /users/:id para no chocar) ──
    if (ruta === '/users/availability') return route.fulfill(json({ success: true, data: DISPONIBILIDAD }));
    if (/^\/users\/\d+\/availability-blocks$/.test(ruta)) {
      if (metodo === 'POST') return route.fulfill(json({ success: true, data: { id: 99, ...req.postDataJSON() } }, 201));
      return route.fulfill(json({
        success: true,
        data: [{ id: 5, user_id: 11, fecha_inicio: '2026-08-15', fecha_fin: '2026-08-30', motivo: 'Vacaciones', created_at: '', activo: true }],
      }));
    }
    if (/^\/users\/availability-blocks\/\d+$/.test(ruta)) return route.fulfill(json({ success: true }));
    if (/^\/users\/\d+\/availability$/.test(ruta)) return route.fulfill(json({ success: true, data: {} }));

    // ── usuarios ──
    if (/^\/users\/\d+\/password$/.test(ruta)) return route.fulfill(json({ success: true }));
    if (/^\/users\/\d+\/reactivate$/.test(ruta)) return route.fulfill(json({ success: true, data: {} }));
    if (/^\/users\/\d+$/.test(ruta)) {
      if (metodo === 'DELETE') return route.fulfill(json({ success: true, data: { leads_reasignados: 3 } }));
      return route.fulfill(json({ success: true, data: usuarios[0] }));
    }
    if (ruta === '/users') {
      if (metodo === 'POST') {
        return route.fulfill(json({ success: true, data: { ...usuarios[0], setPasswordToken: 'abc123' } }, 201));
      }
      if (usersStatus !== 200) {
        return route.fulfill(json({ success: false, error: 'No tienes permiso' }, usersStatus));
      }
      return route.fulfill(json({
        success: true,
        data: usuarios,
        pagination: { total: usuarios.length, page: 1, limit: 100, totalPages: 1 },
      }));
    }

    return route.fulfill(json({ success: true, data: [] }));
  });
}

/**
 * Entra en Configuración y abre la pestaña de Usuarios.
 *
 * `esperarPanel` se apaga para los estados de error: cuando el servidor
 * contesta 403 o 500 el panel sale antes de pintar el encabezado, así que
 * esperarlo ahí es esperar algo que no va a existir.
 */
async function abrirUsuarios(page, { esperarPanel = true } = {}) {
  await ir(page, '/configuracion');
  await page.getByRole('button', { name: 'Usuarios', exact: true }).click();
  if (esperarPanel) {
    await expect(page.getByRole('heading', { name: 'Gestión de usuarios' })).toBeVisible();
  }
}

/**
 * Una fila de la tabla.
 *
 * Hay que buscar por fila y no por texto suelto: la pantalla pinta a la vez la
 * tabla ancha y las tarjetas de móvil —se ocultan por CSS, pero las dos están
 * en el DOM—, así que `getByText('Ana Gestora')` encuentra dos y falla.
 */
const fila = (page, nombre) => page.getByRole('row', { name: new RegExp(nombre) });

/** El botón de la cabecera, no el de enviar del diálogo: se llaman igual. */
const botonCrear = (page) => page.getByRole('button', { name: 'Crear usuario' }).first();

test.describe('Issue #31 · Administración de usuarios', () => {
  // En pantalla estrecha la lista se pinta como tarjetas, no como tabla, así que
  // las búsquedas por fila no aplican. Este spec verifica la tabla.
  test.skip(({ isMobile }) => isMobile, 'La tabla solo se pinta en pantalla ancha');

  test('la lista muestra rol, proyectos, estado y ausencias', async ({ page }) => {
    await mockApi(page);
    await abrirUsuarios(page);

    await expect(fila(page, 'Ana Gestora')).toBeVisible();
    await expect(fila(page, 'Bruno Admin')).toBeVisible();

    // Estado de acceso: quien nunca entró se distingue de quien está activo.
    await expect(fila(page, 'Bruno Admin').getByText('Nunca ha entrado')).toBeVisible();
    await expect(fila(page, 'Carla Baja').getByText('Desactivado')).toBeVisible();

    // Ausencias: Bruno tiene bloque activo hasta el 30/08.
    await expect(fila(page, 'Bruno Admin').getByText('Ausente hasta 30/08/2026')).toBeVisible();

    // Proyectos por nombre, no por id.
    await expect(page.getByRole('cell', { name: 'Psiko Aprende', exact: true }).first()).toBeVisible();
  });

  test('crear usuario manda nombre, email, rol y proyectos', async ({ page }) => {
    const espia = [];
    await mockApi(page, { espia });
    await abrirUsuarios(page);

    await botonCrear(page).click();
    const dialogo = page.getByRole('dialog');
    await dialogo.getByLabel('Nombre *').fill('Nueva Persona');
    await dialogo.getByLabel('Email *').fill('nueva@empresa.com');
    await dialogo.getByRole('checkbox', { name: 'ISEIH' }).check();
    await dialogo.getByRole('button', { name: 'Crear usuario' }).click();

    await expect.poll(() => espia.find((e) => e.metodo === 'POST' && e.ruta === '/users')).toBeTruthy();
    const alta = espia.find((e) => e.metodo === 'POST' && e.ruta === '/users');
    expect(alta.cuerpo.nombre).toBe('Nueva Persona');
    expect(alta.cuerpo.email).toBe('nueva@empresa.com');
    expect(alta.cuerpo.role).toBe('gestor');
    expect(alta.cuerpo.projects).toEqual([{ projectId: 2, recibeLeads: true }]);

    // Sin correo de Brevo el alta es inútil si no se puede pasar el enlace.
    await expect(page.getByText(/Invitación pendiente/)).toBeVisible();
  });

  test('el desplegable de rol ofrece tutor', async ({ page }) => {
    await mockApi(page);
    await abrirUsuarios(page);
    await botonCrear(page).click();
    // La primitiva Select expone su disparador como `combobox`, no como botón.
    await page.getByRole('dialog').getByRole('combobox', { name: 'Rol' }).click();
    await expect(page.getByRole('option', { name: 'Tutor / Profesor' })).toBeVisible();
  });

  test('editar manda nombre, rol y proyectos con su flag de reparto', async ({ page }) => {
    const espia = [];
    await mockApi(page, { espia });
    await abrirUsuarios(page);

    await page.getByRole('row', { name: /Bruno Admin/ }).getByRole('button', { name: 'Acciones de usuario' }).click();
    await page.getByRole('menuitem', { name: 'Editar usuario' }).click();

    await page.getByLabel('Nombre *').fill('Bruno Renombrado');
    // Bruno es admin: el interruptor de «recibe leads» sí aplica.
    await page.getByRole('checkbox', { name: 'Recibe leads' }).first().check();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect.poll(() => espia.find((e) => e.metodo === 'PATCH' && e.ruta === '/users/11')).toBeTruthy();
    const edicion = espia.find((e) => e.metodo === 'PATCH' && e.ruta === '/users/11');
    expect(edicion.cuerpo.nombre).toBe('Bruno Renombrado');
    expect(edicion.cuerpo.role).toBe('admin');
    expect(edicion.cuerpo.projects.some((p) => p.recibeLeads === true)).toBe(true);
  });

  test('quitar todos los proyectos usa projectIds: [] (projects: [] el backend lo ignora)', async ({ page }) => {
    const espia = [];
    await mockApi(page, { espia });
    await abrirUsuarios(page);

    await page.getByRole('row', { name: /Ana Gestora/ }).getByRole('button', { name: 'Acciones de usuario' }).click();
    await page.getByRole('menuitem', { name: 'Editar usuario' }).click();
    await page.getByRole('checkbox', { name: 'Psiko Aprende' }).uncheck();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect.poll(() => espia.find((e) => e.metodo === 'PATCH' && e.ruta === '/users/10')).toBeTruthy();
    const edicion = espia.find((e) => e.metodo === 'PATCH' && e.ruta === '/users/10');
    expect(edicion.cuerpo.projectIds).toEqual([]);
    expect(edicion.cuerpo.projects).toBeUndefined();
  });

  test('desactivar pide confirmación y avisa del reparto de prospectos', async ({ page }) => {
    const espia = [];
    await mockApi(page, { espia });
    await abrirUsuarios(page);

    await page.getByRole('row', { name: /Ana Gestora/ }).getByRole('button', { name: 'Acciones de usuario' }).click();
    await page.getByRole('menuitem', { name: 'Desactivar' }).click();

    // No se borra de un clic: hay que confirmar, y se explica qué pasa.
    await expect(page.getByRole('dialog')).toContainText('¿Desactivar a Ana Gestora?');
    await expect(page.getByRole('dialog')).toContainText(/prospectos se reparten/);
    expect(espia.find((e) => e.metodo === 'DELETE')).toBeUndefined();

    await page.getByRole('button', { name: 'Desactivar', exact: true }).click();
    await expect.poll(() => espia.find((e) => e.metodo === 'DELETE' && e.ruta === '/users/10')).toBeTruthy();
  });

  test('reiniciar la contraseña manda PATCH a /password', async ({ page }) => {
    const espia = [];
    await mockApi(page, { espia });
    await abrirUsuarios(page);

    await page.getByRole('row', { name: /Ana Gestora/ }).getByRole('button', { name: 'Acciones de usuario' }).click();
    await page.getByRole('menuitem', { name: 'Editar usuario' }).click();
    await page.getByLabel('Reiniciar contraseña').fill('NuevaClave2026');
    await page.getByRole('button', { name: 'Cambiar' }).click();

    await expect.poll(() => espia.find((e) => e.ruta === '/users/10/password')).toBeTruthy();
    const reset = espia.find((e) => e.ruta === '/users/10/password');
    expect(reset.metodo).toBe('PATCH');
    expect(reset.cuerpo.password).toBe('NuevaClave2026');
  });

  test('ausencias: se abren desde la fila y programan un bloque', async ({ page }) => {
    const espia = [];
    await mockApi(page, { espia });
    await abrirUsuarios(page);

    await page.getByRole('row', { name: /Bruno Admin/ }).getByRole('button', { name: 'Acciones de usuario' }).click();
    await page.getByRole('menuitem', { name: 'Ausencias' }).click();

    await expect(page.getByRole('dialog', { name: /Ausencias de Bruno Admin/ })).toBeVisible();
    // La ausencia existente se ve con fecha legible, no con un ISO crudo.
    await expect(page.getByText('15/08/2026 → 30/08/2026')).toBeVisible();
    await expect(page.getByText('ACTIVO HOY')).toBeVisible();

    await page.getByLabel('Desde').fill('2026-09-01');
    await page.getByLabel('Hasta').fill('2026-09-05');
    await page.getByLabel('Motivo').fill('Formación');
    await page.getByRole('button', { name: 'Añadir' }).click();

    await expect.poll(() => espia.find((e) => e.ruta === '/users/11/availability-blocks')).toBeTruthy();
    const bloque = espia.find((e) => e.ruta === '/users/11/availability-blocks');
    expect(bloque.metodo).toBe('POST');
    expect(bloque.cuerpo).toMatchObject({ fecha_inicio: '2026-09-01', fecha_fin: '2026-09-05', motivo: 'Formación' });
  });

  test('ausencias: no se usa window.prompt ni confirm', async ({ page }) => {
    await mockApi(page);
    let nativos = 0;
    await page.addInitScript(() => {
      window.prompt = () => { window.__nativo = (window.__nativo || 0) + 1; return null; };
      window.confirm = () => { window.__nativo = (window.__nativo || 0) + 1; return false; };
    });
    await abrirUsuarios(page);

    await page.getByRole('row', { name: /Bruno Admin/ }).getByRole('button', { name: 'Acciones de usuario' }).click();
    await page.getByRole('menuitem', { name: 'Ausencias' }).click();
    // Marcar disponible/no disponible y borrar un bloque: los dos sitios que
    // antes abrían un cuadro del navegador.
    await page.getByRole('button', { name: /No disponible/ }).click();
    await page.getByRole('button', { name: 'Eliminar ausencia' }).click();
    await expect(page.getByRole('dialog', { name: /Ausencias/ })).toBeVisible();

    nativos = await page.evaluate(() => window.__nativo || 0);
    expect(nativos).toBe(0);
  });

  test('buscador y filtros acotan la lista', async ({ page }) => {
    await mockApi(page);
    await abrirUsuarios(page);

    await page.getByLabel('Buscar usuarios').fill('bruno');
    await expect(fila(page, 'Bruno Admin')).toBeVisible();
    await expect(fila(page, 'Ana Gestora')).toHaveCount(0);

    await page.getByLabel('Buscar usuarios').fill('nadiesellamaasi');
    await expect(page.getByText('Ningún usuario coincide')).toBeVisible();
    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(fila(page, 'Ana Gestora')).toBeVisible();
  });

  test('estado vacío: no hay nadie', async ({ page }) => {
    await mockApi(page, { usuarios: [] });
    await abrirUsuarios(page);
    await expect(page.getByText('No hay usuarios registrados')).toBeVisible();
  });

  test('estado de error: el servidor dice que no (403)', async ({ page }) => {
    await mockApi(page, { usersStatus: 403 });
    await abrirUsuarios(page, { esperarPanel: false });

    // Sin permiso no es un fallo: no se ofrece «Reintentar», que no arregla nada.
    await expect(page.getByText('Esta pantalla es para administradores')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toHaveCount(0);
  });

  test('estado de error: el servidor se cae (500) sí ofrece reintentar', async ({ page }) => {
    await mockApi(page, { usersStatus: 500 });
    await abrirUsuarios(page, { esperarPanel: false });
    await expect(page.getByText('No se pudieron cargar los usuarios')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });
});
