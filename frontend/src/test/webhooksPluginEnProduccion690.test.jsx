/*
  #690 · La tarjeta de Consultas en /crm (producción), donde el plugin del CRM en
  Moodle (#679) aún no está aprobado: el servidor no monta
  `/consultas/campus/:id/plugin` y el frontal no debe pedirlo ni prometerlo.
  Vitest corre con DEV (como /testeo), así que aquí se compila como /crm a mano
  (SOLO_EN_PRUEBAS = false).

  #850 · Ahora lo dice el servidor (`plugin_moodle` de /auth/me), que llega a la
  tarjeta en `ctx.pluginMoodle`: con PLUGIN_MOODLE_EN_PRODUCCION=1, en /crm se pide
  el estado del plugin sin recompilar.
*/
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/lib/soloEnPruebas', () => ({ SOLO_EN_PRUEBAS: false }));
vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn() }, API_BASE_URL: '/crm/api' }));

import { TIPOS } from '@/modules/webhooks/lib/resumen';

const consultas = TIPOS.find((t) => t.id === 'consultas');

const conLectura = () => vi.fn(async (url) => (url.startsWith('/integrations/moodle')
  ? { active: true, has_secret: true, config_public: { consultas: true } }
  : url === '/consultas/campus/1/plugin' ? { activo: true, ultimo_aviso_at: '2026-11-18T09:00:00Z', sincronizacion_error: null }
    : null));

describe('Consultas en producción (sin el plugin de Moodle)', () => {
  it('no pide el estado del plugin, aunque se pueda gestionar las consultas', async () => {
    // Sin decir nada (como hoy) o con el servidor apagado: igual.
    for (const pluginMoodle of [undefined, false]) {
      const pedir = conLectura();
      const filas = await consultas.cargar({
        campus: [{ id: 1, nombre: 'Psiko Aprende' }],
        ambito: new URLSearchParams(),
        pedir,
        can: () => true,
        pluginMoodle,
      });
      expect(pedir.mock.calls.map(([u]) => u)).toEqual(['/integrations/moodle?projectId=1']);
      expect(filas).toEqual([expect.objectContaining({ nombre: 'Lectura de consultas encendida', activo: true })]);
      expect(filas[0].ultimo).toBeUndefined();
      expect(filas[0].fallo).toBeUndefined();
    }
  });

  it('la nota no promete el último aviso del plugin', () => {
    expect(consultas.nota).toMatch(/^No llegan como aviso: el CRM las lee del Moodle\./);
    expect(consultas.nota).not.toMatch(/plugin/);
  });
});

describe('Consultas en producción con el plugin aprobado en el servidor (#850)', () => {
  it('con plugin_moodle del servidor, pide el estado del plugin y enseña su último aviso', async () => {
    const pedir = conLectura();
    const filas = await consultas.cargar({
      campus: [{ id: 1, nombre: 'ISSLOGG' }],
      ambito: new URLSearchParams(),
      pedir,
      can: () => true,
      pluginMoodle: true,
    });
    expect(pedir.mock.calls.map(([u]) => u)).toEqual(['/integrations/moodle?projectId=1', '/consultas/campus/1/plugin']);
    expect(filas[0].ultimo).toBe('2026-11-18T09:00:00Z');
  });

  it('sin «consultas.gestionar» no lo pide, aunque el servidor lo tenga encendido', async () => {
    const pedir = conLectura();
    await consultas.cargar({
      campus: [{ id: 1, nombre: 'ISSLOGG' }], ambito: new URLSearchParams(), pedir, can: (p) => p !== 'consultas.gestionar', pluginMoodle: true,
    });
    expect(pedir.mock.calls.map(([u]) => u)).toEqual(['/integrations/moodle?projectId=1']);
  });

  it('su nota con el plugin dice lo que avisa, sin «solo en pruebas»', () => {
    expect(consultas.notaConPlugin).toMatch(/^Sin el plugin del CRM no llegan como aviso/);
    expect(consultas.notaConPlugin).toMatch(/Con el plugin conectado, el campus avisa de cada mensaje/);
    expect(consultas.notaConPlugin).not.toMatch(/solo en pruebas/);
  });
});
