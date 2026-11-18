import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';

/**
 * Lo del #44 de los proyectos IA (PR #386 y #387), solo en pruebas también en el
 * servidor. Igual que el tablero de tareas y las facturas de colaborador: con
 * NODE_ENV=production y sin PROYECTOS_IA_EN_PRODUCCION=1, las rutas no se montan
 * (404) y la integración `supabase` no se acepta. Lo que ya estaba en producción
 * antes (`/metrics`, `/gasto`) sigue respondiendo.
 *
 * Sin base: el guardia de sesión y el de permisos dejan pasar y el controlador
 * contesta 200, así que un 404 solo puede ser «la ruta no está montada».
 */
vi.mock('../src/shared/config/db.js', () => ({ query: vi.fn(async () => ({ rows: [] })), getClient: vi.fn() }));
vi.mock('../src/shared/middleware/auth.js', async (importOriginal) => ({
  ...(await importOriginal()),
  verifyToken: (req, _res, next) => { req.user = { id: 1, role: 'superadmin' }; next(); },
}));
vi.mock('../src/shared/middleware/permissions.js', async (importOriginal) => ({
  ...(await importOriginal()),
  puede: () => (_req, _res, next) => next(),
}));
vi.mock('../src/modules/ia-monitor/ia.controller.js', () => {
  const ok = (req, res) => res.json({ success: true, ruta: req.path });
  return {
    getMetrics: ok, getGasto: ok, cobros: ok,
    previoSupabase: ok, importarSupabase: ok, quitarPruebasSupabase: ok,
  };
});

const { proyectosIAActivos, tareasActivas } = await import('../src/shared/config/soloEnPruebas.js');
const { proveedorSoportado } = await import('../src/modules/integrations/integrations.controller.js');

/** El router de `ia-monitor` cargado con el entorno que se le pase. */
async function apiIA(env) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { default: mod } = await import('../src/modules/ia-monitor/index.js');
  const app = express();
  app.use(mod.prefix, mod.router);
  return supertest(app);
}

const DEL_44 = [
  ['get', '/api/ia/cobros/4'],
  ['get', '/api/ia/supabase/previo/4'],
  ['post', '/api/ia/supabase/importar/4'],
  ['post', '/api/ia/supabase/quitar-pruebas/4'],
];
const DE_ANTES = [
  ['get', '/api/ia/metrics/4'],
  ['get', '/api/ia/gasto'],
];

afterEach(() => { vi.unstubAllEnvs(); });

describe('el interruptor PROYECTOS_IA_EN_PRODUCCION', () => {
  it('en producción no, salvo que se apruebe con su interruptor; en /testeo y en local, sí', () => {
    expect(proyectosIAActivos({ NODE_ENV: 'production' })).toBe(false);
    expect(proyectosIAActivos({ NODE_ENV: 'production', CRM_BASE_URL: 'https://360crm.tech/crm' })).toBe(false);
    expect(proyectosIAActivos({ NODE_ENV: 'production', CRM_BASE_URL: 'https://360crm.tech/testeo' })).toBe(true);
    expect(proyectosIAActivos({ NODE_ENV: 'production', PROYECTOS_IA_EN_PRODUCCION: '1' })).toBe(true);
    expect(proyectosIAActivos({ NODE_ENV: 'development' })).toBe(true);
    expect(proyectosIAActivos({ NODE_ENV: 'test' })).toBe(true);
    // Cada interruptor es suyo: aprobar otro no enciende este, ni al revés.
    expect(proyectosIAActivos({ NODE_ENV: 'production', TAREAS_EN_PRODUCCION: '1' })).toBe(false);
    expect(tareasActivas({ NODE_ENV: 'production', PROYECTOS_IA_EN_PRODUCCION: '1' })).toBe(false);
  });
});

describe('/api/ia en producción', () => {
  it('sin la variable, lo del #44 no está montado (404) y lo de antes sigue', async () => {
    const api = await apiIA({ NODE_ENV: 'production', CRM_BASE_URL: 'https://360crm.tech/crm' });
    for (const [m, ruta] of DEL_44) expect((await api[m](ruta)).status, ruta).toBe(404);
    for (const [m, ruta] of DE_ANTES) expect((await api[m](ruta)).status, ruta).toBe(200);
  });

  it('con PROYECTOS_IA_EN_PRODUCCION=1, responde todo', async () => {
    const api = await apiIA({ NODE_ENV: 'production', PROYECTOS_IA_EN_PRODUCCION: '1' });
    for (const [m, ruta] of [...DEL_44, ...DE_ANTES]) expect((await api[m](ruta)).status, ruta).toBe(200);
  });

  it('en /testeo (servidor de pruebas), responde todo', async () => {
    const api = await apiIA({ NODE_ENV: 'production', CRM_BASE_URL: 'https://360crm.tech/testeo' });
    for (const [m, ruta] of [...DEL_44, ...DE_ANTES]) expect((await api[m](ruta)).status, ruta).toBe(200);
  });
});

describe('la integración supabase (solo de los proyectos IA)', () => {

  it('en producción sin la variable no se acepta; los demás proveedores, sí', () => {
    const prod = { NODE_ENV: 'production' };
    expect(proveedorSoportado('supabase', prod)).toBe(false);
    for (const p of ['stripe', 'brevo', 'moodle']) expect(proveedorSoportado(p, prod), p).toBe(true);
    expect(proveedorSoportado('otro', prod)).toBe(false);
  });

  it('aprobada, en /testeo o en local, se acepta', () => {
    expect(proveedorSoportado('supabase', { NODE_ENV: 'production', PROYECTOS_IA_EN_PRODUCCION: '1' })).toBe(true);
    expect(proveedorSoportado('supabase', { NODE_ENV: 'production', CRM_BASE_URL: 'https://360crm.tech/testeo' })).toBe(true);
    expect(proveedorSoportado('supabase', { NODE_ENV: 'test' })).toBe(true);
  });

  it('el controlador contesta 400 BAD_PROVIDER a `supabase` en producción', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const ctrl = await import('../src/modules/integrations/integrations.controller.js');
    const next = vi.fn();
    await ctrl.getOne({ params: { provider: 'supabase' }, projectId: 4 }, { json: vi.fn() }, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: 'BAD_PROVIDER' }));
  });
});
