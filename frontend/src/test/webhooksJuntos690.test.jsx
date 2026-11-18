import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';

/**
 * #690 · Un solo apartado «Webhooks» (Diego, 05/11): todos juntos, señalados por
 * su función, siguiendo el selector de arriba y los permisos de cada uno. Solo
 * frontal: cada tipo se lee con el GET que ya usa su pantalla.
 */

const { cabecera, get, permisos } = vi.hoisted(() => ({
  cabecera: { value: {} },
  get: vi.fn(),
  permisos: { value: null },
}));

const PROYECTOS = [
  { id: 1, nombre: 'ISEIH', sociedad_emisora_id: 7 },
  { id: 2, nombre: 'Psiko Aprende', sociedad_emisora_id: 7 },
  { id: 5, nombre: 'Otro campus', sociedad_emisora_id: 9 },
  { id: 8, nombre: 'Pruebas', sociedad_emisora_id: 7, es_prueba: true },
];

vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => cabecera.value }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'superadmin' }, projects: PROYECTOS, permissions: null }) }));
vi.mock('@/shared/hooks/usePermission', () => ({
  default: () => ({ can: (p) => (permisos.value ? permisos.value.includes(p) : true) }),
}));
vi.mock('@/shared/api/client', () => ({ default: { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() }, API_BASE_URL: '/crm/api' }));

import { TIPOS, GRUPOS, tiposVisibles, porCampus, ordenarFilas, crearPedidor, campusDelTipo, delAmbitoDeArriba, enlaceDeFila, conUltimaBuena } from '@/modules/webhooks/lib/resumen';
import { pestanasDe } from '@/modules/webhooks/lib/pestanas';
import { TRASLADOS_DE_MENU, aplicarTraslados } from '@/shared/components/layout/trasladosDeMenu';
import { NAV_SECTIONS, PERMISOS_WEBHOOKS, rutaPermitida } from '@/shared/components/layout/Sidebar';
import { pathAllowsAll, rutaAceptaSociedad } from '@/shared/components/layout/AppLayout';
import WebhooksResumenPage from '@/modules/webhooks/pages/WebhooksResumenPage';
import RedirigirAWebhooks from '@/modules/webhooks/components/RedirigirAWebhooks';
import { formatDateTime } from '@/shared/lib/format';

const RESPUESTAS = (url) => {
  const [ruta, q = ''] = url.split('?');
  const p = new URLSearchParams(q);
  const pid = Number(p.get('projectId'));
  if (ruta === '/forms' && p.get('kind') === 'webhook') return pid === 1 ? [{ id: 11, nombre: 'Zapier ventas', active: true }] : [];
  if (ruta === '/forms') return [];
  if (ruta === '/forms/11/events') return [{ status: 'error', error_message: 'Falta el email', created_at: '2026-11-08T10:00:00Z' }];
  if (ruta === '/make-webhooks') return pid === 2 ? [{ id: 21, label: 'Leads Meta', slug: 'mk_1', active: false, mode: 'active', last_received_at: '2026-11-07T09:00:00Z', last_error: null }] : [];
  if (ruta === '/webhooks-salientes') return [{ id: 31, nombre: 'Make cobros', activo: true, ambito: 'empresa', issuer_id: 7, project_id: null, proyecto: null, empresa: 'CEDIA', ultimo_envio_at: null, fallidos_30_dias: 2 }];
  return [];
};

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((url) => Promise.resolve({ success: true, data: RESPUESTAS(url) }));
  permisos.value = null;
  cabecera.value = { activeProject: { id: -1, nombre: 'Todos los proyectos' }, activeIssuerId: null, projects: PROYECTOS, isAllProjects: true };
});

describe('un solo apartado en el menú', () => {
  const entradas = NAV_SECTIONS.flatMap((s) => s.items.flatMap((i) => [i, ...(i.children || [])]));

  it('«Webhooks» está en Configuración (antes Conexión) y las entradas sueltas ya no', () => {
    // «Conexión» pasó a «Configuración» con el reparto por bloques (#534, parte 3).
    const conexion = NAV_SECTIONS.find((s) => s.label === 'Configuración');
    expect(conexion.items.some((i) => i.to === '/conexion/webhooks')).toBe(true);
    for (const vieja of ['/captacion/webhooks', '/captacion/make', '/conexion/webhook-transferencias']) {
      expect(entradas.some((i) => i.to === vieja)).toBe(false);
    }
  });

  it('la entrada pide los permisos de las tres que sustituye, ni uno más', () => {
    expect(new Set(PERMISOS_WEBHOOKS)).toEqual(new Set(TRASLADOS_DE_MENU[0].de.map((d) => d.permiso)));
    expect(rutaPermitida('/conexion/webhooks', (p) => p === 'make.view')).toBe(true);
    expect(rutaPermitida('/conexion/webhooks', () => false)).toBe(false);
    // Con permisos de otras pantallas (Stripe, formularios, el botón…) no se
    // abre: esas tienen la suya. Una gestora no la abre escribiendo la dirección.
    const gestora = (p) => ['forms.view', 'widget.view', 'whatsapp.usar', 'integrations.view'].includes(p);
    expect(rutaPermitida('/conexion/webhooks', gestora)).toBe(false);
    // Y cada permiso que lee el resumen es de algún tipo.
    const deLosTipos = new Set(TIPOS.flatMap((t) => t.permisos));
    for (const p of PERMISOS_WEBHOOKS) expect(deLosTipos.has(p), p).toBe(true);
  });

  it('cada pestaña pide el permiso que tenía su entrada', () => {
    const solo = (clave) => (p) => p === clave;
    expect(rutaPermitida('/conexion/webhooks/make', solo('make.view'))).toBe(true);
    expect(rutaPermitida('/conexion/webhooks/make', solo('webhooks.view'))).toBe(false);
    // Prospectos era Captación › Webhooks, que desde la #842 pide además
    // «Ver formularios»: la pantalla lee `/api/forms` y con uno solo daba 403.
    const los = (...claves) => (p) => claves.includes(p);
    expect(rutaPermitida('/conexion/webhooks/prospectos', los('webhooks.view', 'forms.view'))).toBe(true);
    expect(rutaPermitida('/conexion/webhooks/prospectos', solo('webhooks.view'))).toBe(false);
    expect(rutaPermitida('/conexion/webhooks/prospectos', solo('forms.view'))).toBe(false);
    expect(rutaPermitida('/conexion/webhooks/transferencias', solo('webhooks_salientes.view'))).toBe(true);
  });

  it('el resumen se abre con «Todos» y con empresa; las pantallas de un campus, no', () => {
    for (const r of ['/conexion/webhooks', '/conexion/webhooks/', '/conexion/webhooks/transferencias', '/conexion/webhooks/transferencias/']) {
      expect(pathAllowsAll(r), r).toBe(true);
      expect(rutaAceptaSociedad(r), r).toBe(true);
    }
    expect(pathAllowsAll('/conexion/webhooks/prospectos')).toBe(false);
    expect(pathAllowsAll('/conexion/webhooks/make')).toBe(false);
  });

  it('las direcciones viejas pasan el muro para poder redirigir', () => {
    for (const vieja of ['/conexion/webhook-transferencias', '/conexion/webhook-transferencias/', '/captacion/make', '/captacion/make/7',
      '/captacion/webhooks/42', '/captacion/webhooks/', '/captacion/make/7/']) {
      expect(pathAllowsAll(vieja), vieja).toBe(true);
      expect(rutaAceptaSociedad(vieja), vieja).toBe(true);
    }
    // Lo que no es una dirección vieja, no.
    expect(pathAllowsAll('/captacion/make/abc')).toBe(false);
  });

  it('el traslado no cambia el acceso: quien abría una entrada vieja abre la nueva y su pestaña', () => {
    const [t] = TRASLADOS_DE_MENU;
    expect(t.a).toBe('Conexión › Webhooks');
    for (const d of t.de) {
      // Con lo que pedía la entrada vieja: su permiso y, si lo tenía, el de más (#842).
      const solo = (p) => p === d.permiso || [].concat(d.tambienPermiso || []).includes(p);
      expect(PERMISOS_WEBHOOKS, d.entrada).toContain(d.permiso);
      expect(rutaPermitida('/conexion/webhooks', solo), d.entrada).toBe(true);
      expect(rutaPermitida(d.a, solo), d.a).toBe(true);
    }
    // Y la foto: quien tenía alguna vieja ve la nueva en su lugar; quien no, nada.
    expect(aplicarTraslados(['Captación › Make', 'Captación › Email']).sort()).toEqual(['Captación › Email', 'Conexión › Webhooks']);
    expect(aplicarTraslados(['Captación › Email'])).toEqual(['Captación › Email']);
  });

  it('las pestañas de Prospectos y Make no salen con su módulo apagado en el campus', () => {
    expect(pestanasDe(null).map((t) => t.label)).toEqual(['Resumen', 'Prospectos', 'Make', 'Transferencias']);
    expect(pestanasDe({ make: false, webhooks: false }).map((t) => t.label)).toEqual(['Resumen', 'Transferencias']);
  });
});

describe('cada tipo, en su grupo y por su permiso', () => {
  it('todo tipo tiene un grupo que existe, y cada grupo tiene alguno', () => {
    const grupos = new Set(GRUPOS.map((g) => g.id));
    for (const t of TIPOS) expect(grupos.has(t.grupo)).toBe(true);
    for (const g of GRUPOS) expect(TIPOS.some((t) => t.grupo === g.id)).toBe(true);
  });

  it('salen del CRM las transferencias, y la asignación de leads entra y sale', () => {
    expect(TIPOS.filter((t) => t.direccion === 'sale').map((t) => t.id)).toEqual(['transferencias']);
    expect(TIPOS.filter((t) => t.direccion === 'ambos').map((t) => t.id)).toEqual(['asignacion']);
  });

  it('están todas las entradas y salidas del servidor (inventario de la auditoría del 09/11)', () => {
    // Cada punto por el que entra un aviso de fuera o sale uno a una URL configurable.
    expect(TIPOS.map((t) => t.id).sort()).toEqual([
      'admision', 'admision-webhooks', 'asignacion', 'certifex', 'clave-campus', 'consultas', 'formularios', 'make',
      'prospectos', 'stripe', 'tokens', 'transferencias', 'whatsapp', 'widget', 'woocommerce',
    ]);
  });

  it('cada uno en el grupo que pide Diego en la #690', () => {
    const grupo = (id) => TIPOS.find((t) => t.id === id).grupo;
    // «Pagos y ventas (Stripe, WooCommerce, transferencias)».
    expect(['stripe', 'woocommerce', 'transferencias'].map(grupo)).toEqual(['pagos', 'pagos', 'pagos']);
    // «Mensajería (WhatsApp, widget, consultas)».
    expect(['whatsapp', 'widget', 'consultas'].map(grupo)).toEqual(['mensajeria', 'mensajeria', 'mensajeria']);
    // Las transferencias siguen diciendo que salen del CRM.
    expect(TIPOS.find((t) => t.id === 'transferencias').direccion).toBe('sale');
  });

  it('Certifex solo existe con su panel en el entorno, y para administración o soporte', () => {
    const certifex = TIPOS.find((t) => t.id === 'certifex');
    const can = (p) => ['certifex_consultas.view', 'matriculas.view'].includes(p);
    const sop = (...r) => r.includes('soporte');
    const gestora = (...r) => r.includes('gestor');
    expect(tiposVisibles(can, undefined, [certifex], sop)).toHaveLength(certifex.enEsteEntorno() ? 1 : 0);
    expect(tiposVisibles(can, undefined, [{ ...certifex, enEsteEntorno: () => true }], sop)).toHaveLength(1);
    expect(tiposVisibles(can, undefined, [{ ...certifex, enEsteEntorno: () => false }], sop)).toHaveLength(0);
    expect(tiposVisibles(can, undefined, [{ ...certifex, enEsteEntorno: () => true }], gestora)).toHaveLength(0);
  });

  it('lo que va por ámbito se recorta a los campus de arriba', () => {
    const campus = [{ id: 1, nombre: 'A', empresaId: 7 }, { id: 2, nombre: 'B', empresaId: 7 }];
    expect(delAmbitoDeArriba({ ambito: 'todas' }, campus)).toBe(true);
    expect(delAmbitoDeArriba({ ambito: 'campus', project_id: 2 }, campus)).toBe(true);
    expect(delAmbitoDeArriba({ ambito: 'campus', project_id: 8 }, campus)).toBe(false);
    expect(delAmbitoDeArriba({ ambito: 'empresa', issuer_id: 7 }, campus)).toBe(true);
    expect(delAmbitoDeArriba({ ambito: 'empresa', issuer_id: 9 }, campus)).toBe(false);
  });

  it('quien no tiene el permiso de un tipo no lo ve', () => {
    const ids = tiposVisibles((p) => p === 'make.view').map((t) => t.id);
    expect(ids).toEqual(['make']);
  });

  it('prospectos pide además leer formularios, que es lo que pide su GET', () => {
    expect(tiposVisibles((p) => ['webhooks.view', 'forms.view'].includes(p)).map((t) => t.id)).toEqual(['prospectos', 'admision-webhooks', 'formularios', 'tokens']);
  });

  it('cada tarjeta solo a quien puede abrir adonde lleva', () => {
    const con = (...ps) => (p) => ps.includes(p);
    // La clave del campus se cambia con projects.edit; con solo verlos, no.
    expect(tiposVisibles(con('projects.view')).map((t) => t.id)).toEqual([]);
    expect(tiposVisibles(con('projects.view', 'projects.edit')).map((t) => t.id)).toEqual(['clave-campus']);
    // WhatsApp › Conexión pide usar WhatsApp; supervisar sin usar no la abre.
    expect(tiposVisibles(con('whatsapp.supervisar')).map((t) => t.id)).toEqual([]);
    expect(tiposVisibles(con('whatsapp.usar')).map((t) => t.id)).toEqual(['whatsapp']);
  });

  it('admisión, como su pestaña de Matrículas: administración, ver emisiones y ver matrículas', () => {
    const can = (p) => ['webhooks.view', 'diplomas.view_emisiones', 'matriculas.view'].includes(p);
    const admin = (...r) => r.includes('admin');
    const pm = (...r) => r.includes('project_manager');
    // `tokens` sale con `webhooks.view` a secas: no es de Matrículas.
    const sinTokens = (ts) => ts.map((t) => t.id).filter((id) => id !== 'tokens');
    expect(sinTokens(tiposVisibles(can, undefined, undefined, admin))).toEqual(['admision']);
    expect(sinTokens(tiposVisibles(can, undefined, undefined, pm))).toEqual([]);
    expect(sinTokens(tiposVisibles((p) => p === 'webhooks.view', undefined, undefined, admin))).toEqual([]);
    expect(sinTokens(tiposVisibles((p) => p !== 'matriculas.view' && can(p), undefined, undefined, admin))).toEqual([]);
  });

  it('un campus con el módulo apagado no se pide para ese tipo', () => {
    const make = TIPOS.find((t) => t.id === 'make');
    const campus = [{ id: 1, nombre: 'A', modules: { make: false } }, { id: 2, nombre: 'B', modules: {} }, { id: 3, nombre: 'C' }];
    expect(campusDelTipo(make, campus).map((c) => c.id)).toEqual([2, 3]);
    expect(campusDelTipo(TIPOS.find((t) => t.id === 'transferencias'), campus)).toHaveLength(3);
  });

  it('WhatsApp no sale con el módulo apagado', () => {
    const ids = tiposVisibles(() => true, (m) => m !== 'whatsapp').map((t) => t.id);
    expect(ids).not.toContain('whatsapp');
  });
});

describe('campus a campus, sin tumbar la tarjeta', () => {
  it('no pasa del límite a la vez y un campus que falla sale como fila', async () => {
    let enCurso = 0; let maximo = 0;
    const campus = Array.from({ length: 9 }, (_, i) => ({ id: i + 1, nombre: `C${i + 1}` }));
    const filas = await porCampus(campus, async (c) => {
      enCurso += 1; maximo = Math.max(maximo, enCurso);
      await new Promise((r) => setTimeout(r, 1));
      enCurso -= 1;
      if (c.id === 4) throw new Error('500');
      return [{ clave: `x-${c.id}`, nombre: 'x', campus: c.nombre, activo: true, enlace: '/' }];
    }, 3);
    expect(maximo).toBeLessThanOrEqual(3);
    expect(filas).toHaveLength(9);
    expect(filas[3]).toMatchObject({ campus: 'C4', nombre: 'No se pudo leer' });
    // No se sabe si falla: no cuenta como fallo.
    expect(filas[3].fallo).toBeUndefined();
    expect(filas[3].sinLeer).toBeTruthy();
  });

  it('el pedidor no pasa del tope entre todas las tarjetas y, cancelado, no pide más', async () => {
    let enCurso = 0; let maximo = 0;
    get.mockImplementation(async () => {
      enCurso += 1; maximo = Math.max(maximo, enCurso);
      await new Promise((r) => setTimeout(r, 1));
      enCurso -= 1;
      return { data: [] };
    });
    const pedir = crearPedidor(2);
    await Promise.all(Array.from({ length: 7 }, (_, i) => pedir(`/x/${i}`)));
    expect(maximo).toBeLessThanOrEqual(2);
    expect(get).toHaveBeenCalledTimes(7);

    get.mockClear();
    const corte = new AbortController();
    const cortado = crearPedidor(2, corte.signal);
    corte.abort();
    await expect(cortado('/y')).rejects.toThrow();
    expect(get).not.toHaveBeenCalled();
  });

  it('de los formularios de la web no se pide el historial de cada uno', async () => {
    get.mockImplementation((url) => Promise.resolve({ data: url.startsWith('/forms?') ? [{ id: 50, nombre: 'Web', active: true }] : [] }));
    const formularios = TIPOS.find((t) => t.id === 'formularios');
    const filas = await formularios.cargar({ campus: [{ id: 1, nombre: 'A' }], ambito: new URLSearchParams() });
    expect(filas[0].ultimo).toBeUndefined();
    expect(get.mock.calls.some((c) => c[0].includes('/events'))).toBe(false);
  });

  it('si no se puede leer el historial, se dice, no «sin avisos todavía»', async () => {
    get.mockImplementation((url) => (url.includes('/events')
      ? Promise.reject(new Error('500'))
      : Promise.resolve({ data: url.startsWith('/forms?') ? [{ id: 11, nombre: 'Zapier', active: true }] : [] })));
    const prospectos = TIPOS.find((t) => t.id === 'prospectos');
    const [fila] = await prospectos.cargar({ campus: [{ id: 1, nombre: 'A' }], ambito: new URLSearchParams() });
    expect(fila.ultimo).toBeUndefined();
    expect(fila.sinLeer).toMatch(/No se pudo leer/);
  });

  it('primero lo que falla, al final lo apagado', () => {
    const f = (clave, extra) => ({ clave, nombre: clave, activo: true, enlace: '/', ...extra });
    const orden = ordenarFilas([f('apagado', { activo: false }), f('bien'), f('roto', { fallo: 'x' })]).map((x) => x.clave);
    expect(orden).toEqual(['roto', 'bien', 'apagado']);
  });
});

describe('el resumen sigue al selector de arriba', () => {
  const abrir = () => render(<MemoryRouter><WebhooksResumenPage /></MemoryRouter>);
  const pedidosA = (ruta) => get.mock.calls.map((c) => c[0]).filter((u) => u.startsWith(`${ruta}?`));

  it('con «Todos», campus a campus sin los de pruebas, y las de empresa sin ámbito', async () => {
    abrir();
    await screen.findByText('Zapier ventas');
    const ids = pedidosA('/make-webhooks').map((u) => new URLSearchParams(u.split('?')[1]).get('projectId'));
    expect(ids.sort()).toEqual(['1', '2', '5']);
    expect(pedidosA('/webhooks-salientes')).toEqual(['/webhooks-salientes?']);
  });

  it('con una empresa, solo sus campus (los de pruebas incluidos) y issuerId', async () => {
    cabecera.value = { activeProject: { id: -1 }, activeIssuerId: 7, activeIssuer: { nombre: 'CEDIA' }, projects: PROYECTOS };
    abrir();
    await screen.findByText(/Todos los de CEDIA/);
    await waitFor(() => expect(pedidosA('/make-webhooks')).toHaveLength(3));
    const ids = pedidosA('/make-webhooks').map((u) => new URLSearchParams(u.split('?')[1]).get('projectId'));
    expect(ids.sort()).toEqual(['1', '2', '8']);
    expect(pedidosA('/webhooks-salientes')).toEqual(['/webhooks-salientes?issuerId=7']);
  });

  it('con un campus, ese', async () => {
    cabecera.value = { activeProject: { id: 2, nombre: 'Psiko Aprende' }, activeIssuerId: null, projects: PROYECTOS };
    abrir();
    await screen.findByText(/Leads Meta/);
    expect(pedidosA('/make-webhooks')).toEqual(['/make-webhooks?projectId=2']);
    expect(pedidosA('/webhooks-salientes')).toEqual(['/webhooks-salientes?projectId=2']);
  });

  it('cada tarjeta dice su dirección, su estado, el último aviso y si falló', async () => {
    abrir();
    const prospectos = await screen.findByTestId('tipo-prospectos');
    await within(prospectos).findByText('Zapier ventas');
    expect(within(prospectos).getByText('Entra al CRM')).toBeTruthy();
    expect(within(prospectos).getByText('Activo')).toBeTruthy();
    expect(within(prospectos).getByText(/Último aviso/)).toBeTruthy();
    expect(within(prospectos).getByText(/Falló: Falta el email/)).toBeTruthy();

    const make = screen.getByTestId('tipo-make');
    await within(make).findByText(/Leads Meta/);
    expect(within(make).getByText('Apagado')).toBeTruthy();

    const salida = screen.getByTestId('tipo-transferencias');
    await within(salida).findByText('Make cobros');
    expect(within(salida).getByText('Sale del CRM')).toBeTruthy();
    expect(within(salida).getByText(/2 envíos fallidos en 30 días/)).toBeTruthy();
    expect(within(salida).getByText('Sin avisos todavía')).toBeTruthy();
  });

  it('lo que el servidor no registra no se inventa', async () => {
    abrir();
    const stripe = await screen.findByTestId('tipo-stripe');
    expect(within(stripe).getByText(/No guarda por campus cuándo llegó el último aviso/)).toBeTruthy();
    const woo = screen.getByTestId('tipo-woocommerce');
    expect(within(woo).getByText(/No guarda cuándo llegó el último pedido/)).toBeTruthy();
  });

  it('Stripe: la firma cifrada o en claro vale, y no se enseña el interruptor', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url === '/integrations/stripe?projectId=1' ? { active: true, has_secret: true, config_public: { webhook_secret_preview: 'whsec_…ab12' } }
        : url === '/integrations/stripe?projectId=5' ? { active: false, has_secret: false, config_public: { webhook_secret: 'whsec_en_claro' } }
          : url.startsWith('/integrations/stripe') ? null : RESPUESTAS(url),
    }));
    abrir();
    const stripe = await screen.findByTestId('tipo-stripe');
    expect(await within(stripe).findAllByText('Con la firma del webhook')).toHaveLength(2);
    expect(within(stripe).queryByText(/Falló:/)).toBeNull();
    expect(within(stripe).queryByText('Apagado')).toBeNull();
  });

  it('Stripe sin firma pero con la consulta en marcha: aviso, y dice que las devoluciones no llegan', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url === '/integrations/stripe?projectId=1' ? { active: true, has_secret: true, config_public: {} }
        : url.startsWith('/integrations/stripe') ? null : RESPUESTAS(url),
    }));
    abrir();
    const stripe = await screen.findByTestId('tipo-stripe');
    expect(await within(stripe).findByText(/los cobros llegan por la consulta cada 5 minutos, pero las devoluciones no se apuntan/)).toBeTruthy();
    expect(within(stripe).queryByText(/Falló:/)).toBeNull();
  });

  it('Stripe encendida pero sin firma ni clave: no llega nada, y eso es un fallo', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url === '/integrations/stripe?projectId=2' ? { active: true, has_secret: false, config_public: {} }
        : url.startsWith('/integrations/stripe') ? null : RESPUESTAS(url),
    }));
    abrir();
    const stripe = await screen.findByTestId('tipo-stripe');
    expect(await within(stripe).findByText(/Falló: Encendida pero sin la firma ni la clave/)).toBeTruthy();
    // No promete la consulta cuando no corre.
    expect(within(stripe).queryByText(/los cobros llegan por la consulta/)).toBeNull();
  });

  it('Stripe APAGADA y sin firma: aviso, no fallo (puede ser un campus que no usa Stripe)', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url === '/integrations/stripe?projectId=1' ? { active: false, has_secret: true, config_public: {} }
        : url.startsWith('/integrations/stripe') ? null : RESPUESTAS(url),
    }));
    abrir();
    const stripe = await screen.findByTestId('tipo-stripe');
    expect(await within(stripe).findByText('Integración apagada: no llega nada de Stripe a este campus')).toBeTruthy();
    expect(within(stripe).queryByText(/Falló:/)).toBeNull();
  });

  it('Stripe: el campus sin Stripe no sale, y al pulsar uno con «Todos» se elige su campus', async () => {
    const switchProject = vi.fn();
    cabecera.value = { ...cabecera.value, switchProject };
    get.mockImplementation((url) => Promise.resolve({
      data: url === '/integrations/stripe?projectId=1' ? { config_public: { webhook_secret_preview: 'x' } }
        : url.startsWith('/integrations/stripe') ? null : RESPUESTAS(url),
    }));
    abrir();
    const stripe = await screen.findByTestId('tipo-stripe');
    fireEvent.click(await within(stripe).findByText('Con la firma del webhook'));
    expect(switchProject).toHaveBeenCalledWith(1);
    expect(within(stripe).queryByText(/Psiko Aprende/)).toBeNull();
  });

  it('Make: si la última entrega fue bien o de prueba, un error viejo no se enseña', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/make-webhooks?projectId=2')
        ? [{ id: 21, label: 'Leads Meta', slug: 'mk_1', active: true, mode: 'test', last_received_at: '2026-11-09T09:00:00Z', last_error: 'Error de hace un mes' }]
        : url === '/make-webhooks/21/deliveries?limit=1' ? [{ result: 'test_only' }]
          : RESPUESTAS(url),
    }));
    abrir();
    const make = await screen.findByTestId('tipo-make');
    await within(make).findByText(/Leads Meta/);
    await waitFor(() => expect(get.mock.calls.some((c) => c[0].includes('/deliveries'))).toBe(true));
    expect(within(make).queryByText(/Error de hace un mes/)).toBeNull();
  });

  it('webhooks con destino Matrícula: en «Admisión y matrículas», no en Captación, y sin un «sin avisos» falso', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/forms?projectId=1&kind=webhook') ? [
        { id: 11, nombre: 'Zapier ventas', active: true, destination: 'lead' },
        { id: 12, nombre: 'Admisiones web', active: true, destination: 'matricula' },
      ] : RESPUESTAS(url),
    }));
    abrir();
    const matricula = await screen.findByTestId('tipo-admision-webhooks');
    expect(matricula.closest('section').querySelector('h2').textContent).toBe('Admisión y matrículas');
    expect(await within(matricula).findByText('Admisiones web')).toBeTruthy();
    expect(within(matricula).getByText(/los avisos que salen bien no se apuntan aquí/)).toBeTruthy();
    expect(within(matricula).queryByText('Sin avisos todavía')).toBeNull();
    // Y en Captación solo el de prospectos.
    const prospectos = screen.getByTestId('tipo-prospectos');
    expect(await within(prospectos).findByText('Zapier ventas')).toBeTruthy();
    expect(within(prospectos).queryByText('Admisiones web')).toBeNull();
    // Una sola petición de formularios por campus para las dos tarjetas.
    expect(get.mock.calls.filter((c) => c[0] === '/forms?projectId=1&kind=webhook')).toHaveLength(1);
  });

  it('sin webhooks con destino Matrícula, su tarjeta no sale', async () => {
    abrir();
    await screen.findByText('Zapier ventas');
    expect(screen.queryByTestId('tipo-admision-webhooks')).toBeNull();
  });

  it('prospectos con destino Matrícula: su último error SÍ se enseña, como aviso con su fecha', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/forms?projectId=1&kind=webhook') ? [{ id: 12, nombre: 'Admisiones web', active: true, destination: 'matricula' }]
        : url === '/forms/12/events?limit=1' ? [{ status: 'error', error_message: 'Falta el DNI', created_at: '2026-11-08T10:00:00Z' }]
          : RESPUESTAS(url),
    }));
    abrir();
    const matricula = await screen.findByTestId('tipo-admision-webhooks');
    expect(await within(matricula).findByText(/Último error registrado el .*: Falta el DNI/)).toBeTruthy();
    // Aviso, no fallo: puede haber otros posteriores que fueron bien y no se apuntan.
    expect(within(matricula).queryByText(/Falló: Falta el DNI/)).toBeNull();
  });

  it('transferencias: rojo solo si falló el ÚLTIMO envío; los fallidos de 30 días, como aviso', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/webhooks-salientes?') ? [
        { id: 50, nombre: 'Va bien ya', activo: true, ambito: 'todas', project_id: null, issuer_id: null, proyecto: null, empresa: null, ultimo_envio_at: '2026-11-09T10:00:00Z', fallidos_30_dias: 4 },
        { id: 51, nombre: 'Falla ahora', activo: true, ambito: 'todas', project_id: null, issuer_id: null, proyecto: null, empresa: null, ultimo_envio_at: '2026-11-09T10:00:00Z', fallidos_30_dias: 1 },
      ] : url.startsWith('/webhooks-salientes/envios?webhookId=50') ? [{ estado: 'fallido', prueba: true }, { estado: 'enviado' }]
        : url.startsWith('/webhooks-salientes/envios?webhookId=51') ? [{ estado: 'fallido', http_status: 500 }]
          : RESPUESTAS(url),
    }));
    abrir();
    const salida = await screen.findByTestId('tipo-transferencias');
    await within(salida).findByText('Va bien ya');
    await within(salida).findByText(/El último envío falló: respondió 500/);
    // La de la prueba no cuenta: «Va bien ya» no sale en rojo, pero sí su aviso.
    expect(within(salida).getAllByText(/Falló:/)).toHaveLength(1);
    expect(within(salida).getByText(/4 envíos fallidos en 30 días/)).toBeTruthy();
  });

  it('tokens antiguos: la tarjeta solo sale si hay alguno', async () => {
    abrir();
    await screen.findByTestId('tipo-make');
    await waitFor(() => expect(get.mock.calls.some((c) => c[0].startsWith('/webhook-tokens?projectId=1') && !c[0].includes('kind'))).toBe(true));
    expect(screen.queryByTestId('tipo-tokens')).toBeNull();
  });

  it('tokens antiguos: si hay, se enseñan con su tipo y sin enlace de configuración', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url === '/webhook-tokens?projectId=1' ? [
        { id: 70, kind: 'leads', notas: 'Landing vieja', active: true, last_used_at: null },
        { id: 71, kind: 'matriculas', notas: 'Admisión', active: true, last_used_at: null },
      ] : RESPUESTAS(url),
    }));
    abrir();
    const tokens = await screen.findByTestId('tipo-tokens');
    expect(await within(tokens).findByText('Landing vieja (prospectos)')).toBeTruthy();
    expect(within(tokens).queryByText(/Admisión/)).toBeNull();
    expect(within(tokens).queryByRole('link', { name: /Configurar/ })).toBeNull();
  });

  it('con «Todos», el enlace de una fila lleva su campus: abierto en otra pestaña, no se queda en el muro', async () => {
    abrir();
    const fila = await screen.findByText('Zapier ventas');
    expect(fila.closest('a').getAttribute('href')).toBe('/conexion/webhooks/prospectos/11?projectId=1');
    expect(enlaceDeFila({ enlace: '/clientes/matriculas?pestana=webhooks', campusId: 2 }, false)).toBe('/clientes/matriculas?pestana=webhooks&projectId=2');
    // Con un campus ya elegido, la dirección de siempre.
    expect(enlaceDeFila({ enlace: '/conexion/webhooks/make/3', campusId: 2 }, true)).toBe('/conexion/webhooks/make/3');
  });

  it('con un clic normal se entra por la dirección LIMPIA: el ?projectId= es solo para otra pestaña', async () => {
    const switchProject = vi.fn();
    cabecera.value = { ...cabecera.value, switchProject };
    const Donde = () => { const l = useLocation(); return <p data-testid="donde">{l.pathname}{l.search}</p>; };
    render(
      <MemoryRouter initialEntries={['/conexion/webhooks']}>
        <Routes>
          <Route path="/conexion/webhooks" element={<WebhooksResumenPage />} />
          <Route path="*" element={<Donde />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByText('Zapier ventas'), { button: 0 });
    expect(switchProject).toHaveBeenCalledWith(1);
    // Sin el parámetro: un F5 después de cambiar el selector respeta lo elegido.
    expect((await screen.findByTestId('donde')).textContent).toBe('/conexion/webhooks/prospectos/11');
  });

  it('admisión y los tokens antiguos comparten una sola petición por campus', async () => {
    abrir();
    await screen.findByTestId('tipo-admision');
    await waitFor(() => expect(get.mock.calls.some((c) => c[0] === '/webhook-tokens?projectId=1')).toBe(true));
    expect(get.mock.calls.filter((c) => c[0] === '/webhook-tokens?projectId=1')).toHaveLength(1);
  });

  it('el último envío de transferencias y asignación se pide con el ámbito de arriba', async () => {
    cabecera.value = { activeProject: { id: -1 }, activeIssuerId: 7, activeIssuer: { nombre: 'CEDIA' }, projects: PROYECTOS };
    get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/webhooks-salientes?') ? [{ id: 60, nombre: 'De todas', activo: true, ambito: 'todas', project_id: null, issuer_id: null, proyecto: null, empresa: null, ultimo_envio_at: null, fallidos_30_dias: 0 }]
        : url === '/asignacion' ? [{ id: 9, nombre: 'Reparto', activo: true, ambito: 'todas', project_id: null, issuer_id: null, proyecto: null, empresa: null, ultima_decision_at: null, fallidos_30_dias: 0 }]
          : RESPUESTAS(url),
    }));
    abrir();
    await screen.findByText('De todas');
    await waitFor(() => expect(get.mock.calls.map((c) => c[0])).toContain('/webhooks-salientes/envios?webhookId=60&limit=200&issuerId=7'));
    await waitFor(() => expect(get.mock.calls.map((c) => c[0])).toContain('/asignacion/decisiones?destino_id=9&limit=200&issuer_id=7'));
  });

  it('con una empresa, el último aviso y los fallidos son de esa empresa, no de todo el CRM', async () => {
    cabecera.value = { activeProject: { id: -1 }, activeIssuerId: 7, activeIssuer: { nombre: 'CEDIA' }, projects: PROYECTOS };
    const hace = (dias) => new Date(Date.now() - dias * 864e5).toISOString();
    const elBueno = hace(2);
    get.mockImplementation((url) => Promise.resolve({
      // Del servidor (todo el CRM): último aviso hoy y 9 fallidos, por otra empresa.
      data: url.startsWith('/webhooks-salientes?') ? [{ id: 60, nombre: 'De todas', activo: true, ambito: 'todas', project_id: null, issuer_id: null, proyecto: null, empresa: null, ultimo_envio_at: hace(0), fallidos_30_dias: 9 }]
        // De esta empresa: el último hace 2 días y bien, uno fallido hace 5, uno de prueba que no cuenta, y otro de hace 40.
        : url.startsWith('/webhooks-salientes/envios?webhookId=60') ? [
          { estado: 'fallido', prueba: true, created_at: hace(1) },
          { estado: 'enviado', created_at: elBueno, enviado_at: elBueno },
          { estado: 'fallido', created_at: hace(5) },
          { estado: 'fallido', created_at: hace(40) },
        ] : RESPUESTAS(url),
    }));
    abrir();
    const salida = await screen.findByTestId('tipo-transferencias');
    await within(salida).findByText('De todas');
    expect(await within(salida).findByText(/^1 envío fallido en 30 días aquí$/)).toBeTruthy();
    expect(within(salida).queryByText(/9 envíos fallidos/)).toBeNull();
    expect(within(salida).queryByText(/Falló:/)).toBeNull();
    expect(within(salida).getByText(/Último aviso:/).textContent).toBe(`Último aviso: ${formatDateTime(elBueno)}`);
  });

  it('transferencias con una empresa: si el último envío falló, se dice cuál fue la última entrega BUENA, sin llamarla «último aviso»', async () => {
    cabecera.value = { activeProject: { id: -1 }, activeIssuerId: 7, activeIssuer: { nombre: 'CEDIA' }, projects: PROYECTOS };
    const hace = (dias) => new Date(Date.now() - dias * 864e5).toISOString();
    const entregado = hace(10);
    get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/webhooks-salientes?') ? [{ id: 61, nombre: 'Falla últimamente', activo: true, ambito: 'todas', project_id: null, issuer_id: null, proyecto: null, empresa: null, ultimo_envio_at: entregado, fallidos_30_dias: 3 }]
        : url.startsWith('/webhooks-salientes/envios?webhookId=61') ? [
          { estado: 'fallido', created_at: hace(0) },
          { estado: 'fallido', created_at: hace(1) },
          { estado: 'fallido', created_at: hace(2) },
          { estado: 'enviado', created_at: entregado, enviado_at: entregado },
        ] : RESPUESTAS(url),
    }));
    abrir();
    const salida = await screen.findByTestId('tipo-transferencias');
    await within(salida).findByText('Falla últimamente');
    // No «hoy» (el último intento): hace 10 días, la última entrega que llegó.
    // Y no como «Último aviso», que junto a «Falló» se contradecía.
    expect(await within(salida).findByText(`Última entrega buena: ${formatDateTime(entregado)}`)).toBeTruthy();
    expect(within(salida).queryByText(/Último aviso:/)).toBeNull();
    expect(within(salida).getByText(/El último envío falló/)).toBeTruthy();
  });

  it('transferencias que solo han fallado: «Ninguna entrega buena todavía», no «Sin avisos todavía»', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/webhooks-salientes?') ? [{ id: 62, nombre: 'URL mal puesta', activo: true, ambito: 'todas', project_id: null, issuer_id: null, proyecto: null, empresa: null, ultimo_envio_at: null, fallidos_30_dias: 4 }]
        : url.startsWith('/webhooks-salientes/envios?webhookId=62') ? [{ estado: 'fallido', http_status: 404, created_at: new Date().toISOString() }]
          : RESPUESTAS(url),
    }));
    abrir();
    const salida = await screen.findByTestId('tipo-transferencias');
    expect(await within(salida).findByText('Ninguna entrega buena todavía')).toBeTruthy();
    expect(within(salida).queryByText('Sin avisos todavía')).toBeNull();
    expect(within(salida).getByText(/El último envío falló: respondió 404/)).toBeTruthy();
  });

  it('transferencias sin fallo: la fecha sigue siendo «Último aviso»', () => {
    const r = conUltimaBuena({ ultimo: '2026-11-01T10:00:00Z', fallo: null });
    expect(r.ultimo).toBe('2026-11-01T10:00:00Z');
    expect(r.detalle).toBeUndefined();
    // Sin fecha que se pueda saber (más de 200), no se inventa nada.
    expect(conUltimaBuena({ ultimo: undefined, fallo: 'x' })).toEqual({ ultimo: undefined, fallo: 'x' });
  });

  it('Make apagado con un error de antes: no cuenta como fallo y se dice como dato', async () => {
    permisos.value = ['make.view'];
    cabecera.value = { activeProject: { id: 2, nombre: 'Campus Dos', modules: {} }, activeIssuerId: null, projects: PROYECTOS };
    get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/make-webhooks?') ? [{ id: 22, label: 'Meta viejo', slug: 'mk_2', active: false, mode: 'active', last_received_at: '2026-09-01T10:00:00Z', last_error: 'Falta el email' }]
        : RESPUESTAS(url),
    }));
    abrir();
    const make = await screen.findByTestId('tipo-make');
    expect(await within(make).findByText('Último error, de antes de apagarlo: Falta el email')).toBeTruthy();
    expect(within(make).queryByText(/^Falló/)).toBeNull();
    expect(screen.queryByText(/con fallos/)).toBeNull();
    // Apagado: no se pide su última entrega.
    expect(get.mock.calls.some(([u]) => u.includes('/deliveries'))).toBe(false);
  });

  it('el tope de 200 se mira con lo que llega, antes de quitar las pruebas', async () => {
    cabecera.value = { activeProject: { id: -1 }, activeIssuerId: 7, activeIssuer: { nombre: 'CEDIA' }, projects: PROYECTOS };
    const ahora = new Date().toISOString();
    // 200 envíos de estos 30 días: uno de prueba y 5 fallidos.
    const envios = Array.from({ length: 200 }, (_, i) => ({
      estado: i > 0 && i <= 5 ? 'fallido' : 'enviado', prueba: i === 0, created_at: ahora, enviado_at: ahora,
    }));
    get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/webhooks-salientes?') ? [{ id: 62, nombre: 'Mucho tráfico', activo: true, ambito: 'todas', project_id: null, issuer_id: null, proyecto: null, empresa: null, ultimo_envio_at: ahora, fallidos_30_dias: 5 }]
        : url.startsWith('/webhooks-salientes/envios?webhookId=62') ? envios : RESPUESTAS(url),
    }));
    abrir();
    const salida = await screen.findByTestId('tipo-transferencias');
    expect(await within(salida).findByText('5 o más envíos fallidos en 30 días aquí')).toBeTruthy();
  });

  it('en el tope y sin ninguna entrega entre los 200: no dice «sin avisos todavía», que puede ser falso', async () => {
    cabecera.value = { activeProject: { id: -1 }, activeIssuerId: 7, activeIssuer: { nombre: 'CEDIA' }, projects: PROYECTOS };
    const ahora = new Date().toISOString();
    get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/webhooks-salientes?') ? [{ id: 63, nombre: 'Solo fallos', activo: true, ambito: 'todas', project_id: null, issuer_id: null, proyecto: null, empresa: null, ultimo_envio_at: null, fallidos_30_dias: 0 }]
        : url.startsWith('/webhooks-salientes/envios?webhookId=63') ? Array.from({ length: 200 }, () => ({ estado: 'pendiente', created_at: ahora }))
          : RESPUESTAS(url),
    }));
    abrir();
    const salida = await screen.findByTestId('tipo-transferencias');
    expect(await within(salida).findByText('200 o más envíos en 30 días aquí: los fallidos se ven en su pantalla')).toBeTruthy();
    expect(within(salida).queryByText('Sin avisos todavía')).toBeNull();
  });

  it('el lector de pantalla oye el estado de cada tarjeta en una frase, no todas sus filas', async () => {
    abrir();
    const make = await screen.findByTestId('tipo-make');
    await within(make).findByText(/Leads Meta/);
    const vivos = make.querySelectorAll('[aria-live]');
    expect(vivos).toHaveLength(1);
    await waitFor(() => expect(vivos[0].textContent).toBe('Escenarios de Make: 1 webhook'));
    expect(vivos[0].querySelector('li')).toBeNull();
  });

  it('el pie solo enseña las pantallas relacionadas que se pueden abrir (soporte, sin Asignación)', async () => {
    // Los de soporte: Make y lo demás, pero no webhooks_salientes.view (Asignación) ni leads.duplicados.
    permisos.value = ['make.view', 'forms.view', 'connectors.view', 'integrations.view'];
    abrir();
    await screen.findByTestId('tipo-make');
    const pie = screen.getByText(/^Relacionado:/).closest('p');
    expect(pie.textContent).toContain('Conectores');
    expect(pie.textContent).not.toContain('Asignación de leads');
    expect(pie.textContent).not.toContain('Revisión de duplicados');
  });

  it('con la tarjeta de Asignación a la vista, el pie dice que sus avisos están arriba', async () => {
    abrir();
    await screen.findByTestId('tipo-asignacion');
    expect(screen.getByText(/^Relacionado:/).closest('p').textContent).toContain('sus avisos están arriba');
  });

  it('sin campus en el ámbito, no se culpa a los módulos (también con tarjetas que no van por módulo)', async () => {
    permisos.value = ['make.view', 'webhooks_salientes.view', 'integrations.view'];
    cabecera.value = { activeProject: { id: -1 }, activeIssuerId: 99, activeIssuer: { nombre: 'Vacía' }, projects: PROYECTOS };
    abrir();
    expect(await screen.findByText('Sin campus que mirar')).toBeTruthy();
  });

  it('Ctrl + clic en una fila abre otra pestaña y no cambia el selector de esta', async () => {
    const switchProject = vi.fn();
    cabecera.value = { ...cabecera.value, switchProject };
    abrir();
    const fila = await screen.findByText('Zapier ventas');
    // Después de la página (que escucha en su raíz), se apunta si ella paró el
    // clic —no debe: el navegador es quien abre la pestaña— y se para aquí,
    // porque jsdom no sabe navegar («Not implemented: navigation»).
    const bloqueadoPorLaPagina = [];
    const alClic = (e) => { bloqueadoPorLaPagina.push(e.defaultPrevented); e.preventDefault(); };
    document.addEventListener('click', alClic);
    try {
      fireEvent.click(fila, { ctrlKey: true });
      fireEvent.click(fila, { metaKey: true });
    } finally {
      document.removeEventListener('click', alClic);
    }
    expect(bloqueadoPorLaPagina).toEqual([false, false]);
    expect(switchProject).not.toHaveBeenCalled();
  });

  it('un 403 de un campus se dice como es, no «el servidor no contestó»', async () => {
    const filas = await porCampus([{ id: 1, nombre: 'A' }], async () => { throw Object.assign(new Error('x'), { status: 403 }); });
    expect(filas[0].sinLeer).toBe('No tienes permiso para ver este campus');
  });

  it('con muchas filas se ven 8 y el resto al pulsar; lo que falla nunca se esconde', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/forms?projectId=1&kind=form')
        ? Array.from({ length: 12 }, (_, i) => ({ id: 100 + i, nombre: `Form ${String(i).padStart(2, '0')}`, active: true }))
        : RESPUESTAS(url),
    }));
    abrir();
    const formularios = await screen.findByTestId('tipo-formularios');
    await within(formularios).findByText('Form 00');
    expect(within(formularios).queryByText('Form 11')).toBeNull();
    fireEvent.click(within(formularios).getByRole('button', { name: /Ver los 12/ }));
    expect(within(formularios).getByText('Form 11')).toBeTruthy();
  });

  it('sin tipos por los módulos apagados, no se culpa a los permisos', async () => {
    permisos.value = ['make.view'];
    cabecera.value = { activeProject: { id: 2, nombre: 'Psiko Aprende', modules: { make: false } }, activeIssuerId: null, projects: PROYECTOS };
    abrir();
    expect(await screen.findByText('Sin webhooks en estos campus')).toBeTruthy();
  });

  it('Make: un escenario cuya última entrega se rechazó (sin mapeo, #627) sale como fallo', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/make-webhooks?projectId=2')
        ? [{ id: 21, label: 'Leads Meta', slug: 'mk_1', active: true, mode: 'active', last_received_at: '2026-11-09T09:00:00Z', last_error: null }]
        : url === '/make-webhooks/21/deliveries?limit=1' ? [{ result: 'rejected', error_message: 'Falta el mapeo: sin correo ni nombre' }]
          : RESPUESTAS(url),
    }));
    abrir();
    const make = await screen.findByTestId('tipo-make');
    expect(await within(make).findByText(/Falló: Falta el mapeo/)).toBeTruthy();
  });

  it('Make: uno apagado no pide su última entrega', async () => {
    abrir();
    const make = await screen.findByTestId('tipo-make');
    await within(make).findByText(/Leads Meta/);
    expect(get.mock.calls.some((c) => c[0].includes('/deliveries'))).toBe(false);
  });

  it('asignación con equipo comercial: la lista viene recortada, así que no se da nada por completo', async () => {
    const ahora = new Date().toISOString();
    const asignacion = TIPOS.find((t) => t.id === 'asignacion');
    get.mockImplementation((url) => Promise.resolve({
      data: url === '/asignacion' ? [{ id: 9, nombre: 'Reparto', activo: true, ambito: 'todas', project_id: null, issuer_id: null, proyecto: null, empresa: null, ultima_decision_at: ahora, fallidos_30_dias: 12 }]
        // Solo 3 de su equipo (el servidor quitó las demás después del tope).
        : url.startsWith('/asignacion/decisiones?destino_id=9') ? [
          { estado: 'enviado', created_at: ahora },
          { estado: 'fallido', created_at: ahora },
          { estado: 'fallido', created_at: ahora },
        ] : RESPUESTAS(url),
    }));
    const ctx = { campus: [{ id: 1, nombre: 'A' }], ambito: new URLSearchParams(), llevaEquipo: true };
    const [fila] = await asignacion.cargar(ctx);
    // Pide su lista entera aunque sea «Todos», y no usa los 12 de todo el CRM.
    expect(get.mock.calls.map((c) => c[0])).toContain('/asignacion/decisiones?destino_id=9&limit=200');
    expect(fila.aviso).toBe('2 o más envíos fallidos en 30 días de tu equipo');
    expect(fila.ultimo).toBe(ahora);
    expect(fila.detalle).toBe('Solo se ven las decisiones de tu equipo comercial');
    // Sin ninguna decisión de su equipo, no se dice «sin avisos todavía».
    get.mockImplementation((url) => Promise.resolve({
      data: url === '/asignacion' ? [{ id: 9, nombre: 'Reparto', activo: true, ambito: 'todas', project_id: null, issuer_id: null, proyecto: null, empresa: null, ultima_decision_at: ahora, fallidos_30_dias: 0 }] : [],
    }));
    const [vacia] = await asignacion.cargar(ctx);
    expect(vacia.ultimo).toBeUndefined();
    // Y se explica por qué no hay fecha.
    expect(vacia.detalle).toBe('Tu equipo no tiene decisiones entre las 200 últimas: las demás se ven en su pantalla');
  });

  it('asignación de leads: entra y sale, con sus fallos, y sin los campus de pruebas con «Todos»', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url === '/asignacion' ? [
        { id: 1, nombre: 'Reparto ISEIH', activo: true, ambito: 'campus', project_id: 1, issuer_id: null, proyecto: 'ISEIH', empresa: null, ultima_decision_at: '2026-11-09T08:00:00Z', fallidos_30_dias: 3 },
        { id: 2, nombre: 'Reparto pruebas', activo: true, ambito: 'campus', project_id: 8, issuer_id: null, proyecto: 'Pruebas', empresa: null, ultima_decision_at: null, fallidos_30_dias: 0 },
      ] : RESPUESTAS(url),
    }));
    abrir();
    const asig = await screen.findByTestId('tipo-asignacion');
    expect(await within(asig).findByText('Reparto ISEIH')).toBeTruthy();
    expect(within(asig).getByText('Entra y sale')).toBeTruthy();
    expect(within(asig).getByText(/3 envíos fallidos en 30 días/)).toBeTruthy();
    expect(within(asig).queryByText('Reparto pruebas')).toBeNull();
  });

  it('transferencias con «Todos»: sin las de un campus de pruebas', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/webhooks-salientes') ? [
        { id: 40, nombre: 'Del campus', activo: true, ambito: 'campus', project_id: 2, issuer_id: null, proyecto: 'Psiko Aprende', empresa: null, ultimo_envio_at: null, fallidos_30_dias: 0 },
        { id: 41, nombre: 'De pruebas', activo: true, ambito: 'campus', project_id: 8, issuer_id: null, proyecto: 'Pruebas', empresa: null, ultimo_envio_at: null, fallidos_30_dias: 0 },
      ] : RESPUESTAS(url),
    }));
    abrir();
    const salida = await screen.findByTestId('tipo-transferencias');
    expect(await within(salida).findByText('Del campus')).toBeTruthy();
    expect(within(salida).queryByText('De pruebas')).toBeNull();
  });

  it('transferencias con un campus: también las de otro campus de su empresa, como manda el servidor (Diego, 21/10)', async () => {
    cabecera.value = { activeProject: { id: 2, nombre: 'Psiko Aprende', sociedad_emisora_id: 7 }, activeIssuerId: null, projects: PROYECTOS };
    get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/webhooks-salientes') ? [
        { id: 42, nombre: 'Del hermano', activo: true, ambito: 'campus', project_id: 1, issuer_id: null, proyecto: 'ISEIH', empresa: null, ultimo_envio_at: null, fallidos_30_dias: 0 },
      ] : RESPUESTAS(url),
    }));
    abrir();
    const salida = await screen.findByTestId('tipo-transferencias');
    expect(await within(salida).findByText('Del hermano')).toBeTruthy();
  });

  it('con «Todos», al pulsar un webhook se elige su campus arriba', async () => {
    const switchProject = vi.fn();
    cabecera.value = { ...cabecera.value, switchProject };
    abrir();
    fireEvent.click(await screen.findByText('Zapier ventas'));
    expect(switchProject).toHaveBeenCalledWith(1);
  });

  it('con un campus elegido, no se cambia nada al pulsar', async () => {
    const switchProject = vi.fn();
    cabecera.value = { activeProject: { id: 2, nombre: 'Psiko Aprende' }, activeIssuerId: null, projects: PROYECTOS, switchProject };
    abrir();
    fireEvent.click(await screen.findByText(/Leads Meta/));
    expect(switchProject).not.toHaveBeenCalled();
  });

  it('WooCommerce: la firma del aviso; sin ella ni sincronización de pedidos, aviso de que no está montada para pedidos (no fallo)', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/woocommerce/estado') ? [
        { id: 1, nombre: 'ISEIH', conectado: true, activo: true },
        { id: 2, nombre: 'Psiko Aprende', conectado: true, activo: true },
        { id: 5, nombre: 'Otro campus', conectado: true, activo: false },
      ]
        // Con firma.
        : url === '/woocommerce/credentials?projectId=1' ? { webhook_secret: '****' }
          // Sin firma y con lo de serie (sin sincronizar pedidos): no llega ninguno.
          : url === '/woocommerce/credentials?projectId=2' ? { webhook_secret: null, auto_sync_enabled: false, sync_orders: false, consumer_key: 'ck_x' }
            : url === '/woocommerce/credentials?projectId=5' ? { webhook_secret: '****' }
              : RESPUESTAS(url),
    }));
    abrir();
    const wc = await screen.findByTestId('tipo-woocommerce');
    expect(await within(wc).findAllByText('Con la firma del aviso de pedidos')).toHaveLength(2);
    // Una tienda conectada solo para importar productos (lo de serie) no está
    // «fallando»: aviso, y no suma en «con fallos».
    const sinPedidos = within(wc).getAllByRole('listitem').filter((li) => /No está montada para recibir pedidos/.test(li.textContent));
    expect(sinPedidos).toHaveLength(1);
    expect(sinPedidos[0].textContent).toContain('Psiko Aprende');
    expect(within(wc).queryByText(/Falló:/)).toBeNull();
    // No dice que lleguen con la sincronización cuando no la hay.
    expect(within(wc).queryByText(/llegan con la sincronización/)).toBeNull();
    // Apagada: aviso, no fallo (puede ser a propósito).
    expect(within(wc).getByText('Conexión apagada: no llegan pedidos de esta tienda')).toBeTruthy();
  });

  it('WooCommerce sin firma pero sincronizando pedidos: aviso, con cada cuánto', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url.startsWith('/woocommerce/estado') ? [{ id: 2, nombre: 'Psiko Aprende', conectado: true, activo: true }]
        : url === '/woocommerce/credentials?projectId=2' ? { webhook_secret: null, auto_sync_enabled: true, sync_orders: true, consumer_key: 'ck_x', sync_interval_minutes: 60 }
          : RESPUESTAS(url),
    }));
    abrir();
    const wc = await screen.findByTestId('tipo-woocommerce');
    expect(await within(wc).findByText(/los pedidos llegan con la sincronización \(cada 60 min/)).toBeTruthy();
    expect(within(wc).queryByText(/Falló:/)).toBeNull();
  });

  it('WhatsApp: el estado de tu número', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url === '/whatsapp/conexion' ? { configurado: true, conectado: false, estado: 'close', numero: '34600111222' } : RESPUESTAS(url),
    }));
    abrir();
    const w = await screen.findByTestId('tipo-whatsapp');
    expect(await within(w).findByText('Tu número (+34600111222)')).toBeTruthy();
    expect(within(w).getByText('Apagado')).toBeTruthy();
    expect(within(w).getByText(/Tu número no está enlazado/)).toBeTruthy();
  });

  it('WhatsApp sin estado (nunca enlazado, o su servidor sin contestar): texto neutro, sin contar como «sin poder leer»', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url === '/whatsapp/conexion' ? { configurado: true, conectado: false, estado: null, numero: null } : RESPUESTAS(url),
    }));
    abrir();
    const w = await screen.findByTestId('tipo-whatsapp');
    expect(await within(w).findByText('No se sabe si está enlazado: si aún no lo has enlazado, hazlo en su pantalla')).toBeTruthy();
    // Ni culpa al servidor ni afirma que no está enlazado: no se sabe cuál de las dos.
    expect(within(w).queryByText(/el servidor de WhatsApp no contesta/)).toBeNull();
    expect(within(w).queryByText(/Tu número no está enlazado/)).toBeNull();
    expect(screen.queryByText(/sin poder leer/)).toBeNull();
  });

  it('WhatsApp sin montar: en pruebas, aviso con el motivo del servidor', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url === '/whatsapp/conexion' ? { configurado: false, motivo: 'WhatsApp todavia no esta disponible en este entorno de pruebas.' } : RESPUESTAS(url),
    }));
    abrir();
    const w = await screen.findByTestId('tipo-whatsapp');
    expect(await within(w).findByText('WhatsApp no está disponible')).toBeTruthy();
    // Texto propio de pruebas: el del servidor depende de su NODE_ENV (/testeo corre en production).
    expect(within(w).getByText('En este entorno de pruebas no hay WhatsApp montado; en producción funciona.')).toBeTruthy();
    // Las pruebas corren como entorno de pruebas (SOLO_EN_PRUEBAS): aviso, no fallo.
    expect(within(w).queryByText(/Falló:/)).toBeNull();
  });

  it('un campus que no contesta a /webhook-tokens lo dice la tarjeta de tokens, también para quien no ve la de admisión', async () => {
    // Un project manager: ve los tokens (webhooks.view) pero no la tarjeta de admisión (rol de administración).
    permisos.value = ['webhooks.view', 'make.view', 'webhooks_salientes.view'];
    get.mockImplementation((url) => (url === '/webhook-tokens?projectId=5'
      ? Promise.reject(new Error('500'))
      : Promise.resolve({ success: true, data: RESPUESTAS(url) })));
    abrir();
    const tokens = await screen.findByTestId('tipo-tokens');
    expect(await within(tokens).findByText('No se pudo leer')).toBeTruthy();
    expect(screen.queryByTestId('tipo-admision')).toBeNull();
    expect(await screen.findByText('1 sin poder leer')).toBeTruthy();
  });

  it('y con la tarjeta de admisión a la vista, el mismo error se cuenta una sola vez', async () => {
    get.mockImplementation((url) => (url === '/webhook-tokens?projectId=5'
      ? Promise.reject(new Error('500'))
      : Promise.resolve({ success: true, data: RESPUESTAS(url) })));
    abrir();
    await screen.findByTestId('tipo-admision');
    expect(await screen.findByText('1 sin poder leer')).toBeTruthy();
  });

  it('un campus que no contesta a /forms cuenta UNA vez en «sin poder leer», aunque dos tarjetas lo lean', async () => {
    get.mockImplementation((url) => (url === '/forms?projectId=5&kind=webhook'
      ? Promise.reject(new Error('500'))
      : Promise.resolve({ success: true, data: RESPUESTAS(url) })));
    abrir();
    await screen.findByText('Zapier ventas');
    expect(await screen.findByText('1 sin poder leer')).toBeTruthy();
    // La tarjeta de Matrícula no aparece solo por el error.
    expect(screen.queryByTestId('tipo-admision-webhooks')).toBeNull();
  });

  it('Consultas de alumnos en Mensajería: por campus, encendida o apagada y por qué', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url === '/integrations/moodle?projectId=1' ? { active: true, has_secret: true, config_public: { consultas: true } }
        : url === '/integrations/moodle?projectId=2' ? { active: true, has_secret: true, config_public: { consultas: false } }
          // Campus 5 sin conexión de Moodle: no sale.
          : url.startsWith('/integrations/moodle') ? null : RESPUESTAS(url),
    }));
    abrir();
    const c = await screen.findByTestId('tipo-consultas');
    expect(c.closest('section').querySelector('h2').textContent).toBe('Mensajería');
    expect(await within(c).findByText('Lectura de consultas encendida')).toBeTruthy();
    expect(within(c).getByText('Lectura de consultas apagada')).toBeTruthy();
    expect(within(c).getByText('Sin «Leer las consultas» en su conexión de Moodle')).toBeTruthy();
    expect(within(c).queryByText(/Otro campus/)).toBeNull();
    // Dice la verdad: sin el plugin no llegan como aviso, y un fallo de lectura
    // no se ve en ninguna pantalla. (Las pruebas corren como /testeo: con el plugin.)
    expect(within(c).getByText(/Sin el plugin del CRM no llegan como aviso: el CRM las lee del Moodle, y si esa lectura falla no se ve en ninguna pantalla/)).toBeTruthy();
    // «Configurar» lleva a donde se enciende la lectura: la conexión de Moodle.
    expect(within(c).getByRole('link', { name: /Configurar/ }).getAttribute('href')).toBe('/finanzas/integraciones');
  });

  // Para los contadores de la cabecera: sin el formulario con error de los
  // datos base, lo que cuente sale solo de Consultas.
  const sinFormularios = (url) => (url.startsWith('/forms') ? [] : RESPUESTAS(url));
  const moodleLee = { active: true, has_secret: true, config_public: { consultas: true } };

  it('con el plugin del CRM conectado (solo en pruebas), la fila dice su último aviso y si falló el repaso', async () => {
    const aviso = '2026-11-10T08:30:00Z';
    get.mockImplementation((url) => {
      if (url === '/consultas/campus/1/plugin') return Promise.resolve({ data: { activo: true, ultimo_aviso_at: aviso, sincronizacion_error: null } });
      // El servidor guarda el error entero, con su frase: se enseña tal cual.
      if (url === '/consultas/campus/2/plugin') return Promise.resolve({ data: { activo: true, ultimo_aviso_at: null, sincronizacion_error: 'No se ha podido repasar el campus: El Moodle no contesta' } });
      // Campus 5: 404 (la ruta no está montada o el campus no es suyo): se queda como sin plugin, sin contarlo.
      if (url === '/consultas/campus/5/plugin') return Promise.reject(Object.assign(new Error('404'), { status: 404 }));
      return Promise.resolve({ data: url.startsWith('/integrations/moodle') ? moodleLee : sinFormularios(url) });
    });
    abrir();
    const c = await screen.findByTestId('tipo-consultas');
    const filas = await within(c).findAllByText('Plugin del CRM conectado');
    expect(filas).toHaveLength(2);
    expect(within(c).getByText(`Último aviso: ${formatDateTime(aviso)}`)).toBeTruthy();
    expect(within(c).getByText('Sin avisos todavía')).toBeTruthy();
    expect(within(c).getByText('Falló: No se ha podido repasar el campus: El Moodle no contesta')).toBeTruthy();
    expect(within(c).getByText('Lectura de consultas encendida')).toBeTruthy();
    // El fallo del repaso suma en la cabecera; el 404 del campus 5 no cuenta como «sin poder leer».
    expect(await screen.findByText('1 con fallos')).toBeTruthy();
    expect(screen.queryByText(/sin poder leer/)).toBeNull();
  });

  it('un 403 al leer el plugin tampoco cuenta: la fila se queda como sin plugin', async () => {
    get.mockImplementation((url) => {
      if (url.includes('/plugin')) return Promise.reject(Object.assign(new Error('403'), { status: 403 }));
      return Promise.resolve({ data: url.startsWith('/integrations/moodle') ? moodleLee : sinFormularios(url) });
    });
    abrir();
    const c = await screen.findByTestId('tipo-consultas');
    expect(await within(c).findAllByText('Lectura de consultas encendida')).toHaveLength(3);
    // Se pidió (y dio 403): no es que no se llegara a pedir.
    expect(get.mock.calls.some(([u]) => u.includes('/plugin'))).toBe(true);
    expect(within(c).queryByText('No se pudo leer el estado del plugin del CRM')).toBeNull();
    expect(screen.queryByText(/sin poder leer/)).toBeNull();
    expect(screen.queryByText(/con fallos/)).toBeNull();
  });

  it('plugin conectado pero sin «Leer las consultas»: no sale activo y dice que los avisos no entran', async () => {
    get.mockImplementation((url) => {
      if (url === '/consultas/campus/1/plugin') return Promise.resolve({ data: { activo: true, ultimo_aviso_at: '2026-11-10T08:30:00Z', sincronizacion_error: null } });
      if (url.includes('/plugin')) return Promise.resolve({ data: { activo: false } });
      return Promise.resolve({
        data: url === '/integrations/moodle?projectId=1' ? { active: true, has_secret: true, config_public: { consultas: false } }
          : url.startsWith('/integrations/moodle') ? null : sinFormularios(url),
      });
    });
    abrir();
    const c = await screen.findByTestId('tipo-consultas');
    const fila = (await within(c).findByText('Plugin del CRM conectado')).closest('li');
    expect(within(fila).queryByText('Activo')).toBeNull();
    expect(within(fila).getByText('Los avisos llegan, pero no entran al CRM: Sin «Leer las consultas» en su conexión de Moodle')).toBeTruthy();
  });

  it('el plugin anterior a la 1.8.0 es un aviso, no un fallo', async () => {
    const viejo = 'El plugin del campus es anterior a la 1.8.0: se actualizará solo esta noche (o actualízalo desde «Conectar con el CRM»).';
    get.mockImplementation((url) => {
      if (url === '/consultas/campus/1/plugin') return Promise.resolve({ data: { activo: true, ultimo_aviso_at: null, sincronizacion_error: viejo } });
      if (url.includes('/plugin')) return Promise.resolve({ data: { activo: false } });
      return Promise.resolve({
        data: url === '/integrations/moodle?projectId=1' ? moodleLee
          : url.startsWith('/integrations/moodle') ? null : sinFormularios(url),
      });
    });
    abrir();
    const c = await screen.findByTestId('tipo-consultas');
    expect(await within(c).findByText(viejo)).toBeTruthy();
    expect(within(c).queryByText(/^Falló/)).toBeNull();
    expect(screen.queryByText(/con fallos/)).toBeNull();
  });

  it('sin «Leer las consultas» y con el plugin viejo, salen los dos avisos', async () => {
    const viejo = 'El plugin del campus es anterior a la 1.8.0: se actualizará solo esta noche (o actualízalo desde «Conectar con el CRM»).';
    get.mockImplementation((url) => {
      if (url === '/consultas/campus/1/plugin') return Promise.resolve({ data: { activo: true, ultimo_aviso_at: null, sincronizacion_error: viejo } });
      if (url.includes('/plugin')) return Promise.resolve({ data: { activo: false } });
      return Promise.resolve({
        data: url === '/integrations/moodle?projectId=1' ? { active: true, has_secret: true, config_public: { consultas: false } }
          : url.startsWith('/integrations/moodle') ? null : sinFormularios(url),
      });
    });
    abrir();
    const c = await screen.findByTestId('tipo-consultas');
    // Sin avisos todavía: no dice «llegan», sino lo que pasaría.
    expect(await within(c).findByText(/^Si el campus avisa, no entrará al CRM/)).toBeTruthy();
    expect(within(c).getByText(`Último repaso guardado, de cuando leía: ${viejo}`)).toBeTruthy();
  });

  it('sin lectura, un error viejo del repaso no cuenta como fallo: el repaso ya no corre', async () => {
    get.mockImplementation((url) => {
      if (url === '/consultas/campus/1/plugin') return Promise.resolve({ data: { activo: true, ultimo_aviso_at: '2026-11-10T08:30:00Z', sincronizacion_error: 'No se ha podido repasar el campus: timeout' } });
      if (url.includes('/plugin')) return Promise.resolve({ data: { activo: false } });
      return Promise.resolve({
        data: url === '/integrations/moodle?projectId=1' ? { active: false, has_secret: true, config_public: { consultas: true } }
          : url.startsWith('/integrations/moodle') ? null : sinFormularios(url),
      });
    });
    abrir();
    const c = await screen.findByTestId('tipo-consultas');
    expect(await within(c).findByText('Los avisos llegan, pero no entran al CRM: La conexión de Moodle está apagada')).toBeTruthy();
    expect(within(c).getByText('Último repaso guardado, de cuando leía: No se ha podido repasar el campus: timeout')).toBeTruthy();
    expect(within(c).queryByText(/^Falló/)).toBeNull();
    expect(screen.queryByText(/con fallos/)).toBeNull();
  });

  it('plugin conectado con la conexión de Moodle sin token: no sale activo y dice por qué', async () => {
    get.mockImplementation((url) => {
      if (url === '/consultas/campus/1/plugin') return Promise.resolve({ data: { activo: true, ultimo_aviso_at: '2026-11-10T08:30:00Z', sincronizacion_error: null } });
      if (url.includes('/plugin')) return Promise.resolve({ data: { activo: false } });
      return Promise.resolve({
        data: url === '/integrations/moodle?projectId=1' ? { active: true, has_secret: false, config_public: { consultas: true } }
          : url.startsWith('/integrations/moodle') ? null : sinFormularios(url),
      });
    });
    abrir();
    const c = await screen.findByTestId('tipo-consultas');
    const fila = (await within(c).findByText('Plugin del CRM conectado')).closest('li');
    expect(within(fila).queryByText('Activo')).toBeNull();
    expect(within(fila).getByText('Los avisos llegan, pero no entran al CRM: La conexión de Moodle no tiene token')).toBeTruthy();
  });

  it('si le dan «consultas.gestionar» con la pantalla abierta, se pide el estado del plugin', async () => {
    permisos.value = ['consultas.view', 'integrations.view'];
    get.mockImplementation((url) => Promise.resolve({ data: url.startsWith('/integrations/moodle') ? moodleLee : sinFormularios(url) }));
    const { rerender } = abrir();
    await within(await screen.findByTestId('tipo-consultas')).findAllByText('Lectura de consultas encendida');
    expect(get.mock.calls.some(([u]) => u.includes('/plugin'))).toBe(false);
    permisos.value = ['consultas.view', 'integrations.view', 'consultas.gestionar'];
    rerender(<MemoryRouter><WebhooksResumenPage /></MemoryRouter>);
    await waitFor(() => expect(get.mock.calls.some(([u]) => u.includes('/plugin'))).toBe(true));
  });

  it('el estado del plugin solo se pide con «consultas.gestionar»', async () => {
    permisos.value = ['consultas.view', 'integrations.view'];
    get.mockImplementation((url) => Promise.resolve({ data: url.startsWith('/integrations/moodle') ? moodleLee : RESPUESTAS(url) }));
    abrir();
    const c = await screen.findByTestId('tipo-consultas');
    await within(c).findAllByText('Lectura de consultas encendida');
    expect(get.mock.calls.some(([u]) => u.includes('/plugin'))).toBe(false);
  });

  it('un 500 al leer el plugin se dice en la fila y en la cabecera, sin esconder la lectura', async () => {
    get.mockImplementation((url) => {
      if (url === '/consultas/campus/1/plugin') return Promise.reject(Object.assign(new Error('500'), { status: 500 }));
      if (url.includes('/plugin')) return Promise.resolve({ data: { activo: false } });
      return Promise.resolve({
        data: url === '/integrations/moodle?projectId=1' ? moodleLee
          : url.startsWith('/integrations/moodle') ? null : sinFormularios(url),
      });
    });
    abrir();
    const c = await screen.findByTestId('tipo-consultas');
    expect(await within(c).findByText('No se pudo leer el estado del plugin del CRM')).toBeTruthy();
    expect(within(c).getByText('Lectura de consultas encendida')).toBeTruthy();
    expect(await screen.findByText('1 sin poder leer')).toBeTruthy();
  });

  it('Consultas pide también ver Integraciones, que es de donde se lee su estado', () => {
    const consultas = TIPOS.find((t) => t.id === 'consultas');
    expect(tiposVisibles((p) => p === 'consultas.view', undefined, [consultas])).toHaveLength(0);
    expect(tiposVisibles((p) => ['consultas.view', 'integrations.view'].includes(p), undefined, [consultas])).toHaveLength(1);
  });

  it('un aviso largo va en su propia línea y no aplasta el nombre de la fila', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url === '/integrations/stripe?projectId=1' ? { active: true, has_secret: true, config_public: {} }
        : url.startsWith('/integrations/stripe') ? null : RESPUESTAS(url),
    }));
    abrir();
    const stripe = await screen.findByTestId('tipo-stripe');
    const aviso = await within(stripe).findByText(/las devoluciones no se apuntan/);
    expect(aviso.parentElement.className).toContain('basis-full');
  });

  it('con «Todos», «Configurar» de una pantalla de un campus dice que se elija uno', async () => {
    abrir();
    const make = await screen.findByTestId('tipo-make');
    expect(within(make).queryByRole('link', { name: /Configurar/ })).toBeNull();
    expect(within(make).getByText(/pulsa uno o elige un campus arriba/)).toBeTruthy();
    // Sin ninguno que pulsar, no se dice «pulsa uno».
    const admision = screen.getByTestId('tipo-admision');
    await within(admision).findByText('Ninguno en este ámbito.');
    expect(within(admision).getByText('Para configurarlo, elige un campus arriba.')).toBeTruthy();
    // Las que se abren con «Todos», sí.
    const salida = screen.getByTestId('tipo-transferencias');
    expect(within(salida).getByRole('link', { name: /Configurar/ }).getAttribute('href')).toBe('/conexion/webhooks/transferencias');
  });

  it('con un campus elegido, «Configurar» lleva a su pantalla', async () => {
    cabecera.value = { activeProject: { id: 2, nombre: 'Psiko Aprende' }, activeIssuerId: null, projects: PROYECTOS };
    abrir();
    const make = await screen.findByTestId('tipo-make');
    expect(within(make).getByRole('link', { name: /Configurar/ }).getAttribute('href')).toBe('/conexion/webhooks/make');
  });

  it('un campus que no contesta no cuenta como fallo, sino aparte', async () => {
    get.mockImplementation((url) => (url.startsWith('/make-webhooks?projectId=5')
      ? Promise.reject(new Error('500'))
      : Promise.resolve({ success: true, data: RESPUESTAS(url) })));
    abrir();
    await screen.findByText('Zapier ventas');
    expect(await screen.findByText('1 sin poder leer')).toBeTruthy();
    // Fallos de verdad: solo Zapier (su último aviso dio error). Los 2 envíos
    // fallidos de transferencias son un aviso: su último envío no consta fallido.
    expect(screen.getByText('1 con fallos')).toBeTruthy();
    // Fuera del subtítulo, que la cabecera recorta: en las acciones, que no.
    const subtitulo = screen.getByText(/^Todos los de /);
    expect(subtitulo.textContent).not.toMatch(/con fallos/);
  });

  it('webhooks de admisión sin nota: cada uno con su número y su fecha, no cinco filas iguales', async () => {
    get.mockImplementation((url) => Promise.resolve({
      data: url === '/webhook-tokens?projectId=1' ? [
        { id: 3, kind: 'matriculas', notas: null, active: true, last_used_at: null, created_at: '2026-10-22T10:00:00Z' },
        { id: 4, kind: 'matriculas', notas: null, active: true, last_used_at: null, created_at: '2026-10-23T10:00:00Z' },
        { id: 5, kind: 'matriculas', notas: 'Formulario web', active: true, last_used_at: null },
      ] : RESPUESTAS(url),
    }));
    abrir();
    const admision = await screen.findByTestId('tipo-admision');
    expect(await within(admision).findByText(/Webhook de admisión n\.º 3 · creado el 22\/10\/2026/)).toBeTruthy();
    expect(within(admision).getByText(/Webhook de admisión n\.º 4/)).toBeTruthy();
    expect(within(admision).getByText('Formulario web')).toBeTruthy();
  });

  it('un campus con Make apagado no se pide', async () => {
    cabecera.value = { activeProject: { id: 2, nombre: 'Psiko Aprende', modules: { make: false } }, activeIssuerId: null, projects: PROYECTOS };
    abrir();
    await screen.findByTestId('tipo-transferencias');
    expect(screen.queryByTestId('tipo-make')).toBeNull();
    expect(pedidosA('/make-webhooks')).toEqual([]);
  });

  it('sin el permiso de un tipo, ni se pide ni se enseña', async () => {
    permisos.value = ['make.view'];
    abrir();
    await screen.findByTestId('tipo-make');
    expect(screen.queryByTestId('tipo-prospectos')).toBeNull();
    expect(get.mock.calls.some((c) => c[0].startsWith('/forms'))).toBe(false);
    expect(get.mock.calls.some((c) => c[0].startsWith('/webhooks-salientes'))).toBe(false);
  });
});

describe('las direcciones de antes llevan al apartado', () => {
  const Donde = () => { const l = useLocation(); return <p data-testid="donde">{l.pathname}{l.search}</p>; };
  const ir = (desde) => render(
    <MemoryRouter initialEntries={[desde]}>
      <Routes>
        <Route path="/captacion/webhooks" element={<RedirigirAWebhooks a="/conexion/webhooks/prospectos" />} />
        <Route path="/captacion/webhooks/:id" element={<RedirigirAWebhooks a="/conexion/webhooks/prospectos" />} />
        <Route path="/captacion/make/:id" element={<RedirigirAWebhooks a="/conexion/webhooks/make" />} />
        <Route path="*" element={<Donde />} />
      </Routes>
    </MemoryRouter>,
  );

  it.each([
    ['/captacion/webhooks?new=1', '/conexion/webhooks/prospectos?new=1'],
    ['/captacion/webhooks/42', '/conexion/webhooks/prospectos/42'],
    ['/captacion/make/7', '/conexion/webhooks/make/7'],
  ])('%s → %s', (desde, hasta) => {
    ir(desde);
    expect(screen.getByTestId('donde').textContent).toBe(hasta);
  });
});
