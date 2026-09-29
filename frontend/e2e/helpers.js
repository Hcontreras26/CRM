// Helpers compartidos entre tests E2E

export const TEST_USER = {
  email: 'manuel@empresa.com',
  password: 'CrmTemp2026!',
};

/** Hace login y deja la app en /crm/ */
export async function login(page, user = TEST_USER) {
  await page.goto('/crm/login');
  await page.waitForLoadState('networkidle');
  // Esperar a que el form este renderizado (Suspense lazy load)
  await page.getByPlaceholder('nombre@empresa.com').waitFor({ timeout: 10_000 });
  await page.getByPlaceholder('nombre@empresa.com').fill(user.email);
  await page.getByPlaceholder('Tu contraseña').fill(user.password);
  // Con tilde: el boton dice «Iniciar sesión». Sin ella no coincide y el test
  // se quedaba treinta segundos esperando a pulsar algo que no existe.
  await page.getByRole('button', { name: /iniciar sesi[oó]n/i }).click();
  await page.waitForURL(/\/crm\/?$/, { timeout: 10_000 });
}

/**
 * Cambia el proyecto activo via el dropdown custom del sidebar.
 * Antes era un <select> nativo; ahora es un boton + popover (Portal).
 */
export async function switchProject(page, projectId) {
  // Abrir el picker
  await page.getByRole('button', { name: /selector de proyecto/i }).click();
  // Esperar que el listbox aparezca
  const listbox = page.getByRole('listbox', { name: /lista de proyectos/i });
  await listbox.waitFor({ state: 'visible', timeout: 3000 });
  // Click en el option correspondiente
  await listbox.getByRole('option').nth(Number(projectId) - 1).click();
  await page.waitForTimeout(300);
}

/**
 * La base del sitio: `/crm/` en local, `/testeo/` en QA.
 *
 * Hace falta porque `baseURL` de la configuracion NO la lleva —es
 * `http://localhost:5173` a secas— y un `page.goto('/prospectos')` acaba fuera
 * de la aplicacion, en la pagina de error de Vite. Con la base delante, no.
 */
export const BASE_APP = process.env.PLAYWRIGHT_APP_BASE || '/crm';

/** Ir a una pantalla. Espera a que monte: las rutas van por `lazy`. */
export const ir = (page, ruta, opciones = {}) => page.goto(
  `${BASE_APP}${ruta}`,
  { waitUntil: 'networkidle', ...opciones },
);

/**
 * El patron para interceptar la API.
 *
 * `**\/api/**` a secas se traga tambien los modulos del navegador que cuelgan de
 * rutas con «api» dentro, y la pagina sale en blanco. Con la base delante, solo
 * caza las llamadas de verdad.
 */
export const API_GLOB = `**${BASE_APP}/api/**`;
