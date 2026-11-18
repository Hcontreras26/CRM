/*
  #690 · Conexión › Webhooks en el menú y en el buscador (Ctrl K).

  · La entrada sale si alguna de las que sustituye se podía abrir: cada una con su
    permiso Y su módulo (`partes`), como salían Captación › Webhooks
    (`module: 'webhooks'`) y Captación › Make (`module: 'make'`).
  · El buscador la encuentra por el nombre de antes, también escrito entero.
  · Los recientes guardados con las direcciones de antes llevan a las nuevas, y
    solo si hoy se pueden abrir.
*/
import { describe, it, expect } from 'vitest';
import { NAV_SECTIONS, canSeeItem } from '@/shared/components/layout/Sidebar';
import { fuzzyScore, rutaDeHoy, recienteDeHoy, recienteSigueValiendo, movidasDe } from '@/shared/components/layout/CommandPalette';
import { TRASLADOS_DE_MENU } from '@/shared/components/layout/trasladosDeMenu';
import { pestanasDe } from '@/modules/webhooks/lib/pestanas';

const entrada = NAV_SECTIONS.flatMap((s) => s.items.flatMap((i) => [i, ...(i.children || [])]))
  .find((i) => i.to === '/conexion/webhooks');
const conPermisos = (...p) => (x) => p.includes(x);
const ve = (modules, ...permisos) => canSeeItem(entrada, ['admin'], modules, null, false, null, conPermisos(...permisos));

describe('la entrada del menú, con el permiso y el módulo de cada parte', () => {
  it('solo con «make.view»: sale con Make encendido y no con Make apagado', () => {
    expect(ve({ make: true }, 'make.view')).toBe(true);
    expect(ve({ make: false }, 'make.view')).toBe(false);
  });

  it('solo con «webhooks.view»: sigue al módulo de webhooks', () => {
    expect(ve({ webhooks: true }, 'webhooks.view')).toBe(true);
    expect(ve({ webhooks: false }, 'webhooks.view')).toBe(false);
  });

  it('con Make y Webhooks apagados, quien ve transferencias la sigue viendo (no tenía módulo)', () => {
    expect(ve({ make: false, webhooks: false }, 'make.view', 'webhooks.view', 'webhooks_salientes.view')).toBe(true);
    expect(ve({ make: false, webhooks: false }, 'make.view', 'webhooks.view')).toBe(false);
  });

  it('sin módulos que mirar (con «Todos»), como siempre', () => {
    expect(ve(undefined, 'make.view')).toBe(true);
  });

  it('sin ninguno de los tres permisos, no sale', () => {
    expect(ve({}, 'integrations.view')).toBe(false);
  });

  it('en un proyecto IA, Make y Webhooks no cuentan (estaban en Captación, que no sale allí); transferencias sí', () => {
    const veIA = (...p) => canSeeItem(entrada, ['admin'], {}, 'ia', false, null, conPermisos(...p));
    expect(veIA('make.view')).toBe(false);
    expect(veIA('webhooks.view')).toBe(false);
    expect(veIA('make.view', 'webhooks_salientes.view')).toBe(true);
    // Fuera de un proyecto IA, como siempre.
    expect(canSeeItem(entrada, ['admin'], {}, 'educacion', false, null, conPermisos('make.view'))).toBe(true);
  });

  it.each([['superadmin'], ['soporte'], ['project_manager']])('%s: las mismas reglas (permiso y módulo de cada parte)', (rol) => {
    const como = (modules, ...p) => canSeeItem(entrada, [rol], modules, null, false, null, conPermisos(...p));
    expect(como({ make: true }, 'make.view')).toBe(true);
    expect(como({ make: false }, 'make.view')).toBe(false);
    expect(como({ make: false }, 'make.view', 'webhooks_salientes.view')).toBe(true);
  });

  it('un tutor no la ve: no es de su rol', () => {
    expect(canSeeItem(entrada, ['tutor'], {}, null, false, null, conPermisos('make.view', 'webhooks.view', 'webhooks_salientes.view'))).toBe(false);
  });
});

describe('el buscador la encuentra por el nombre de antes, escrito entero', () => {
  // «make» o «transferencias» sueltas ya se encontraban; lo nuevo son las frases.
  it.each(['Webhook de transferencias', 'webhooks de captacion', 'Webhooks de prospectos', 'Escenarios de Make'])('«%s»', (q) => {
    expect(fuzzyScore(entrada.label, entrada.keywords, q)).toBeGreaterThan(0);
  });
});

describe('los recientes de las direcciones de antes', () => {
  it('se traducen a la nueva, con su id y lo que lleven detrás', () => {
    expect(rutaDeHoy('/captacion/make')).toBe('/conexion/webhooks/make');
    expect(rutaDeHoy('/captacion/make/12')).toBe('/conexion/webhooks/make/12');
    expect(rutaDeHoy('/captacion/webhooks/7')).toBe('/conexion/webhooks/prospectos/7');
    expect(rutaDeHoy('/captacion/webhooks?new=1')).toBe('/conexion/webhooks/prospectos?new=1');
    expect(rutaDeHoy('/conexion/webhook-transferencias')).toBe('/conexion/webhooks/transferencias');
    // Lo que no se movió, igual; y una dirección que solo empieza parecido, también.
    expect(rutaDeHoy('/captacion/whatsapp')).toBe('/captacion/whatsapp');
    expect(rutaDeHoy('/captacion/makers')).toBe('/captacion/makers');
  });

  const pages = [{ to: '/conexion/webhooks' }];
  const busca = {};

  it('valen si hoy se puede abrir su pestaña: permiso y módulo', () => {
    const can = conPermisos('make.view');
    expect(recienteSigueValiendo('/conexion/webhooks/make', { pages, busca, can, modules: {} })).toBe(true);
    expect(recienteSigueValiendo('/conexion/webhooks/make/12', { pages, busca, can, modules: {} })).toBe(true);
    // Sin su permiso, o con el módulo apagado, no.
    expect(recienteSigueValiendo('/conexion/webhooks/prospectos', { pages, busca, can, modules: {} })).toBe(false);
    expect(recienteSigueValiendo('/conexion/webhooks/make', { pages, busca, can, modules: { make: false } })).toBe(false);
    // Sin la entrada de Webhooks en el menú, tampoco.
    expect(recienteSigueValiendo('/conexion/webhooks/make', { pages: [], busca, can, modules: {} })).toBe(false);
  });

  it('con «Todos» (sin módulos) valen; con lo de detrás (`?new=1`) también', () => {
    const can = conPermisos('webhooks.view');
    expect(recienteSigueValiendo('/conexion/webhooks/prospectos', { pages, busca, can, modules: undefined })).toBe(true);
    expect(recienteSigueValiendo('/conexion/webhooks/prospectos?new=1', { pages, busca, can, modules: undefined })).toBe(true);
  });

  it('una ficha de transferencias no existe (App.jsx): no vale', () => {
    const can = conPermisos('webhooks_salientes.view');
    expect(recienteSigueValiendo('/conexion/webhooks/transferencias', { pages, busca, can, modules: {} })).toBe(true);
    expect(recienteSigueValiendo('/conexion/webhooks/transferencias/3', { pages, busca, can, modules: {} })).toBe(false);
  });

  it('en un proyecto IA, las pestañas de Make y Prospectos no; la de transferencias sí', () => {
    const can = conPermisos('make.view', 'webhooks.view', 'webhooks_salientes.view');
    const enIA = { pages, busca, can, modules: {}, projectType: 'ia' };
    expect(recienteSigueValiendo('/conexion/webhooks/make', enIA)).toBe(false);
    expect(recienteSigueValiendo('/conexion/webhooks/prospectos', enIA)).toBe(false);
    expect(recienteSigueValiendo('/conexion/webhooks/transferencias', enIA)).toBe(true);
  });

  it('el reciente traducido lleva su nombre y su sección de hoy, no «Captación»', () => {
    expect(recienteDeHoy({ label: 'Make', sublabel: 'Captación', to: '/captacion/make' }))
      .toEqual({ label: 'Webhooks › Make', sublabel: 'Conexión', to: '/conexion/webhooks/make', movido: { entrada: 'Webhooks', pestana: 'Make', seccion: 'Conexión' } });
    expect(recienteDeHoy({ label: 'Webhooks', sublabel: 'Captación', to: '/captacion/webhooks' }).label).toBe('Webhooks › Prospectos');
    // El que no se movió, tal cual.
    const otro = { label: 'Prospectos', sublabel: 'Captación', to: '/prospectos' };
    expect(recienteDeHoy(otro)).toBe(otro);
  });

  it('cada dirección movida lleva a una pestaña que existe', () => {
    const pestanas = pestanasDe(undefined).map((t) => t.to);
    for (const d of TRASLADOS_DE_MENU.flatMap((t) => t.de)) {
      expect(rutaDeHoy(d.ruta)).toBe(d.a);
      expect(pestanas).toContain(d.a);
    }
  });

  it('un reciente guardado ya con la dirección nueva (o con `movido: true` de antes) recupera su nombre', () => {
    const viejo = { label: 'Webhooks › Make', sublabel: 'Conexión', to: '/conexion/webhooks/make', movido: true };
    expect(recienteDeHoy(viejo).movido).toEqual({ entrada: 'Webhooks', pestana: 'Make', seccion: 'Conexión' });
    // Uno normal con esa misma dirección (que no se movió) se queda como está.
    const normal = { label: 'Make', sublabel: 'X', to: '/conexion/webhooks/make' };
    expect(recienteDeHoy(normal)).toBe(normal);
  });

  it('un traslado sin « › » no da «undefined»', () => {
    const [m] = movidasDe([{ de: [{ ruta: '/a', a: '/conexion/webhooks/make' }], a: 'Webhooks' }]);
    expect(m).toEqual({ antes: '/a', ahora: '/conexion/webhooks/make', seccion: 'Webhooks', entrada: 'Webhooks', pestana: 'Make' });
  });

  it('con un «#» detrás, también', () => {
    expect(rutaDeHoy('/captacion/make#ayuda')).toBe('/conexion/webhooks/make#ayuda');
    const can = conPermisos('make.view');
    expect(recienteSigueValiendo('/conexion/webhooks/make#ayuda', { pages, busca, can, modules: {} })).toBe(true);
  });
});

describe('las pestañas de Conexión › Webhooks', () => {
  it('en un proyecto IA no salen Prospectos ni Make', () => {
    expect(pestanasDe({}, 'ia').map((t) => t.label)).toEqual(['Resumen', 'Transferencias']);
    expect(pestanasDe({}, 'educacion').map((t) => t.label)).toEqual(['Resumen', 'Prospectos', 'Make', 'Transferencias']);
    expect(pestanasDe(undefined).map((t) => t.label)).toEqual(['Resumen', 'Prospectos', 'Make', 'Transferencias']);
  });
});
