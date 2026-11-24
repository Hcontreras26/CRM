import {
  describe, it, expect, vi, afterEach,
} from 'vitest';

/**
 * #850 · El frontal lee del servidor si el plugin del CRM en Moodle está encendido.
 *
 * Antes el bloque «Plugin del CRM» de Integraciones dependía de una constante de
 * compilación del frontal (SOLO_EN_PRUEBAS): para verlo en /crm había que tocar el
 * código y recompilar. Ahora `/auth/me` manda `user.funciones.plugin_moodle`, que es lo mismo
 * que decide qué rutas del plugin se montan (`pluginMoodleActivo()`):
 *   · producción sin la variable → false (el /crm de hoy, sin el bloque);
 *   · producción con PLUGIN_MOODLE_EN_PRODUCCION=1 → true;
 *   · /testeo y local → true.
 *
 * Sin base: el modelo, los permisos y el alcance son de mentira.
 *   npx vitest run tests/authMePluginMoodle850.test.js
 */

vi.mock('../src/shared/config/db.js', () => ({
  default: { query: vi.fn(async () => ({ rows: [] })) },
  query: vi.fn(async () => ({ rows: [] })),
  getClient: vi.fn(),
}));
vi.mock('../src/modules/auth/auth.model.js', async (importOriginal) => ({
  ...(await importOriginal()),
  findUserById: vi.fn(async () => ({ id: 7, nombre: 'Prueba', email: 'prueba@crm.test', role: 'superadmin', roles_extra: [] })),
  getUserProjects: vi.fn(async () => []),
}));
vi.mock('../src/modules/permissions/permissions.service.js', async (importOriginal) => ({
  ...(await importOriginal()),
  buildPermissionsMap: vi.fn(async () => ({ '*': true })),
  resolveUserView: vi.fn(async () => null),
}));
vi.mock('../src/shared/utils/roles.js', async (importOriginal) => ({
  ...(await importOriginal()),
  alcanceDeLider: vi.fn(async () => null),
}));

const { me } = await import('../src/modules/auth/auth.controller.js');

const PRODUCCION = { NODE_ENV: 'production', CRM_BASE_URL: 'https://360crm.tech/crm' };
const TESTEO = { NODE_ENV: 'production', CRM_BASE_URL: 'https://360crm.tech/testeo' };

function entorno(env) {
  vi.stubEnv('PLUGIN_MOODLE_EN_PRODUCCION', '');
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
}

/** Lo que contesta /auth/me con el entorno que se le pase. */
async function pedirMe(env) {
  entorno(env);
  let cuerpo; let fallo;
  await me({ user: { userId: 7 } }, { json: (b) => { cuerpo = b; } }, (err) => { fallo = err; });
  if (fallo) throw fallo;
  return cuerpo;
}

afterEach(() => { vi.unstubAllEnvs(); });

describe('/auth/me dice si el plugin del CRM está encendido (#850)', () => {
  it('en producción, sin PLUGIN_MOODLE_EN_PRODUCCION: false (/crm como hoy)', async () => {
    const r = await pedirMe(PRODUCCION);
    expect(r.success).toBe(true);
    expect(r.data.user.funciones.plugin_moodle).toBe(false);
    // Junto a los links de pago (#680), en el mismo sitio; ya no suelto en `user`.
    expect(r.data.user.funciones).toHaveProperty('links_pago');
    expect(r.data.user).not.toHaveProperty('plugin_moodle');
  });

  it('en producción con PLUGIN_MOODLE_EN_PRODUCCION=1: true, sin recompilar el frontal', async () => {
    expect((await pedirMe({ ...PRODUCCION, PLUGIN_MOODLE_EN_PRODUCCION: '1' })).data.user.funciones.plugin_moodle).toBe(true);
  });

  it('otro valor u otro interruptor no lo encienden', async () => {
    expect((await pedirMe({ ...PRODUCCION, PLUGIN_MOODLE_EN_PRODUCCION: 'true' })).data.user.funciones.plugin_moodle).toBe(false);
    expect((await pedirMe({ ...PRODUCCION, PROYECTOS_IA_EN_PRODUCCION: '1' })).data.user.funciones.plugin_moodle).toBe(false);
  });

  it('en /testeo y en local: true', async () => {
    expect((await pedirMe(TESTEO)).data.user.funciones.plugin_moodle).toBe(true);
    expect((await pedirMe({ NODE_ENV: 'development' })).data.user.funciones.plugin_moodle).toBe(true);
  });
});

describe('/auth/me dice si se recuerdan al alumno los links sin pagar (24/11)', () => {
  // «Crear link» y la venta lo leen para no prometer un recordatorio que no sale.
  const conLinks = { ...PRODUCCION, LINKS_PAGO_EN_PRODUCCION: '1', LINKS_PAGO_SEGUIMIENTO_EN_PRODUCCION: '' };

  it('en producción con los links, pero sin LINKS_PAGO_SEGUIMIENTO_EN_PRODUCCION: false', async () => {
    expect((await pedirMe(conLinks)).data.user.funciones.recordatorios_links).toBe(false);
  });

  it('con LINKS_PAGO_SEGUIMIENTO_EN_PRODUCCION=1: true', async () => {
    expect((await pedirMe({ ...conLinks, LINKS_PAGO_SEGUIMIENTO_EN_PRODUCCION: '1' })).data.user.funciones.recordatorios_links).toBe(true);
  });

  it('sin los links encendidos no hay recordatorios, aunque esté la variable', async () => {
    expect((await pedirMe({ ...PRODUCCION, LINKS_PAGO_EN_PRODUCCION: '', LINKS_PAGO_SEGUIMIENTO_EN_PRODUCCION: '1' })).data.user.funciones.recordatorios_links).toBe(false);
  });
});
