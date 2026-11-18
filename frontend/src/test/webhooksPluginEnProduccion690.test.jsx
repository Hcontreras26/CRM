/*
  #690 · La tarjeta de Consultas en /crm (producción), donde el plugin del CRM en
  Moodle (#679) aún no está aprobado: PLUGIN_MOODLE es false, el servidor no monta
  `/consultas/campus/:id/plugin` y el frontal no debe pedirlo ni prometerlo.
  Vitest corre con DEV (como /testeo), así que aquí se apaga la bandera a mano.
*/
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/shared/lib/pluginMoodle', () => ({ PLUGIN_MOODLE: false }));
vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn() }, API_BASE_URL: '/crm/api' }));

import { TIPOS } from '@/modules/webhooks/lib/resumen';

const consultas = TIPOS.find((t) => t.id === 'consultas');

describe('Consultas en producción (sin el plugin de Moodle)', () => {
  it('no pide el estado del plugin, aunque se pueda gestionar las consultas', async () => {
    const pedir = vi.fn(async (url) => (url.startsWith('/integrations/moodle')
      ? { active: true, has_secret: true, config_public: { consultas: true } } : null));
    const filas = await consultas.cargar({
      campus: [{ id: 1, nombre: 'Psiko Aprende' }],
      ambito: new URLSearchParams(),
      pedir,
      can: () => true,
    });
    expect(pedir.mock.calls.map(([u]) => u)).toEqual(['/integrations/moodle?projectId=1']);
    expect(filas).toEqual([expect.objectContaining({ nombre: 'Lectura de consultas encendida', activo: true })]);
    expect(filas[0].ultimo).toBeUndefined();
    expect(filas[0].fallo).toBeUndefined();
  });

  it('la nota no promete el último aviso del plugin', () => {
    expect(consultas.nota).toMatch(/^No llegan como aviso: el CRM las lee del Moodle\./);
    expect(consultas.nota).not.toMatch(/plugin/);
  });
});
