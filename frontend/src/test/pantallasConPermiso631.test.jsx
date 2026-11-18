import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * #631 · Ninguna pantalla se abre a quien el servidor le niega los datos.
 *
 * La auditoría del 03/11/2026 encontró pantallas que se abrían a la gestora, al
 * project manager o a soporte y luego daban 403. Ahora la ruta, las pestañas y
 * los accesos rápidos miran el mismo permiso que el menú (`rutaPermitida`).
 * Los mapas de permisos son los del servidor (`resolverPermisos`), por rol.
 */

const auth = vi.hoisted(() => ({ user: null, permissions: null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
const proyecto = vi.hoisted(() => ({ value: {} }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => proyecto.value }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({}), useOptionalTheme: () => 'dark' }));
// Respuestas con la forma de cada pantalla, para que se pinten sin romperse.
const cliente = vi.hoisted(() => ({
  get: vi.fn(async (url) => {
    const u = String(url);
    if (u.startsWith('/status/piezas')) return { success: true, data: { global: 'bien', comprobado: new Date().toISOString(), arribaDesdeMs: 60000, piezas: [] } };
    if (u.startsWith('/status/correos')) return { success: true, data: { envios: [], resumen: { enviado: 0, fallido: 0, bloqueado: 0 } } };
    if (u.startsWith('/stripe-payments/stats') || u.startsWith('/stripe-payments/corte') || u.startsWith('/integrations/')) return { success: true, data: {} };
    return { success: true, data: [] };
  }),
  post: vi.fn(),
}));
vi.mock('@/shared/api/client', () => ({ default: cliente }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { NAV_SECTIONS, rutaPermitida } = await import('@/shared/components/layout/Sidebar');
const { crearCan } = await import('@/shared/hooks/usePermission');
const { resolverPermisos } = await import('../../../backend/src/modules/permissions/resolver.js');
const { default: SubNav } = await import('@/shared/components/ui/SubNav');
const { default: AccesosClave } = await import('@/shared/components/ui/AccesosClave');
const { default: StatusPage } = await import('@/modules/status/pages/StatusPage');
const { default: StripePaymentsPage } = await import('@/modules/accounting/pages/StripePaymentsPage');

const ROLES = ['admin', 'soporte', 'gestor', 'project_manager', 'tutor', 'colaborador'];
const quien = (role) => ({ id: 1, role, roles_extra: [], active: true });
const mapaDe = (role) => resolverPermisos({ role }).mapa;
const canDe = (role) => crearCan(quien(role), mapaDe(role));

/** Las entradas del menú con permiso, una vez por ruta. */
function entradasConPermiso() {
  const out = [];
  const recorrer = (items) => {
    for (const it of items || []) {
      if (it.to && !it.href && it.permiso) out.push(it);
      if (it.children) recorrer(it.children);
    }
  };
  for (const s of NAV_SECTIONS) recorrer(s.items);
  return out;
}
const claves = (it) => [...[].concat(it.permiso), ...[].concat(it.oPermiso || [])]
  .filter((k) => String(k).includes('.'));

describe('#631 · rutaPermitida', () => {
  it.each(ROLES)('%s: ninguna pantalla del menú se abre sin alguno de sus permisos', (role) => {
    const can = canDe(role);
    const fugas = [];
    for (const ruta of new Set(entradasConPermiso().map((it) => it.to))) {
      const suyas = entradasConPermiso().filter((it) => it.to === ruta);
      const conPermiso = suyas.some((it) => claves(it).some((k) => can(k) === true));
      if (rutaPermitida(ruta, can) && !conPermiso) fugas.push(ruta);
    }
    expect(fugas).toEqual([]);
  });

  it('el superadmin lo abre todo', () => {
    const can = crearCan(quien('superadmin'), {});
    for (const it of entradasConPermiso()) expect(rutaPermitida(it.to, can)).toBe(true);
  });

  it('una ruta que no está en el menú no se decide aquí (la ficha de un cliente, por ejemplo)', () => {
    expect(rutaPermitida('/clientes/123', () => false)).toBe(true);
  });

  it('la barra final no cambia nada', () => {
    const nada = () => false;
    expect(rutaPermitida('/finanzas/por-cobrar/', nada)).toBe(false);
  });

  it('el Banco también se abre con solo verlo (`whatsapp.banco`); el chat, no', () => {
    expect(rutaPermitida('/whatsapp/banco', (k) => k === 'whatsapp.banco')).toBe(true);
    expect(rutaPermitida('/whatsapp', (k) => k === 'whatsapp.banco')).toBe(false);
    expect(rutaPermitida('/whatsapp/chat', (k) => k === 'whatsapp.banco')).toBe(false);
  });

  it('WhatsApp: Banco y el chat por `/whatsapp` piden usarlo o supervisarlo', () => {
    for (const ruta of ['/whatsapp', '/whatsapp/banco']) {
      expect(rutaPermitida(ruta, () => false)).toBe(false);
      expect(rutaPermitida(ruta, (k) => k === 'whatsapp.supervisar')).toBe(true);
      expect(rutaPermitida(ruta, (k) => k === 'whatsapp.usar')).toBe(true);
    }
  });

  it('las de la auditoría siguen al permiso del servidor', () => {
    const PANTALLAS = {
      '/finanzas/por-cobrar': ['accounting.por_cobrar'],
      '/finanzas/nominas': ['payroll.view'],
      '/finanzas/integraciones': ['integrations.view'],
      '/productos/woocommerce': ['woocommerce.view'],
      '/productos/categorias': ['products.categorias'],
      '/prospectos/duplicados': ['leads.duplicados'],
      '/tutores': ['tutores.gestionar'],
      // «Por revisar» pasó a «Historial de tareas» (CRM#707): lo ve quien tiene tablero.
      '/tareas/historial': ['tasks.view_own'],
      // Y verlo (`whatsapp.banco`): el project manager, que ve todo (Diego, 04/11).
      '/whatsapp/banco': ['whatsapp.usar', 'whatsapp.supervisar', 'whatsapp.banco'],
      // La vuelta en local con cada rol (#631): a la gestora y al project manager
      // se les abría y solo daba 403.
      '/status': ['status.view', 'credentials.view', 'woocommerce.view'],
    };
    for (const role of ROLES) {
      const can = canDe(role);
      for (const [ruta, ks] of Object.entries(PANTALLAS)) {
        expect([role, ruta, rutaPermitida(ruta, can)]).toEqual([role, ruta, ks.some((k) => can(k) === true)]);
      }
    }
  });
});

describe('#631 · pestañas y accesos rápidos', () => {
  const TABS = [
    { label: 'Ventas', to: '/finanzas/ventas' },
    { label: 'Nóminas', to: '/finanzas/nominas' },
    { label: 'Por cobrar', to: '/finanzas/por-cobrar' },
  ];

  it('SubNav esconde la pestaña sin permiso', () => {
    auth.user = quien('gestor');
    auth.permissions = { 'ventas.view': true };
    render(<MemoryRouter><SubNav tabs={TABS} /></MemoryRouter>);
    expect(screen.getByText('Ventas')).toBeTruthy();
    expect(screen.queryByText('Nóminas')).toBeNull();
    expect(screen.queryByText('Por cobrar')).toBeNull();
  });

  it('SubNav las enseña todas mientras no han llegado los permisos', () => {
    auth.user = quien('gestor');
    auth.permissions = null;
    render(<MemoryRouter><SubNav tabs={TABS} /></MemoryRouter>);
    for (const t of TABS) expect(screen.getByText(t.label)).toBeTruthy();
  });

  it('AccesosClave esconde el acceso sin permiso', () => {
    auth.user = quien('gestor');
    auth.permissions = { 'ventas.view': true };
    const Icono = () => null;
    render(
      <MemoryRouter>
        <AccesosClave accesos={TABS.map((t) => ({ ...t, detail: '', icon: Icono }))} />
      </MemoryRouter>,
    );
    expect(screen.getByText('Ventas')).toBeTruthy();
    expect(screen.queryByText('Por cobrar')).toBeNull();
  });
});

/*
  La vuelta en local con gestora, project manager y soporte (#631) encontró dos
  pantallas que aún pedían sin permiso: Status (credenciales, piezas, correos y
  WooCommerce) y Pagos Stripe (si hay clave de Stripe o de Supabase). Cada
  bloque de Status se pide solo con su permiso.
*/
describe('#631 · Status y Pagos Stripe solo piden lo que se puede ver', () => {
  const comoRol = (role, quitar = []) => {
    auth.user = quien(role);
    auth.permissions = { ...mapaDe(role), ...Object.fromEntries(quitar.map((k) => [k, false])) };
    proyecto.value = { activeProject: { id: 2, nombre: 'ISEIH' }, projects: [{ id: 2 }] };
    cliente.get.mockClear();
  };
  const pedidas = () => cliente.get.mock.calls.map(([u]) => String(u).split('?')[0]);
  const montar = (El) => render(<MemoryRouter><El /></MemoryRouter>);

  it('Status, con el admin: todo (desde CRM#632 tiene `credentials.view`)', async () => {
    comoRol('admin');
    montar(StatusPage);
    await new Promise((ok) => setTimeout(ok, 0));
    expect(pedidas()).toEqual(expect.arrayContaining(['/status/piezas', '/status/correos', '/credentials', '/woocommerce/credentials']));
  });

  it('Status, sin `credentials.view`: el estado y WooCommerce sí; las demás credenciales, no', async () => {
    comoRol('admin', ['credentials.view']);
    montar(StatusPage);
    await new Promise((ok) => setTimeout(ok, 0));
    expect(pedidas()).toContain('/status/piezas');
    expect(pedidas()).toContain('/woocommerce/credentials');
    expect(pedidas()).not.toContain('/credentials');
  });

  it('Status, con soporte: todo', async () => {
    comoRol('soporte');
    montar(StatusPage);
    await new Promise((ok) => setTimeout(ok, 0));
    expect(pedidas()).toEqual(expect.arrayContaining(['/status/piezas', '/status/correos', '/credentials', '/woocommerce/credentials']));
  });

  it('Pagos Stripe, con la gestora: ve los cobros pero no pregunta por Integraciones', async () => {
    comoRol('gestor');
    expect(mapaDe('gestor')['stripe.view']).toBe(true);
    montar(StripePaymentsPage);
    await new Promise((ok) => setTimeout(ok, 0));
    expect(pedidas().filter((u) => u.startsWith('/integrations/'))).toEqual([]);
  });

  it('Pagos Stripe, con el admin: sí pregunta por las claves', async () => {
    comoRol('admin');
    montar(StripePaymentsPage);
    await new Promise((ok) => setTimeout(ok, 0));
    expect(pedidas()).toEqual(expect.arrayContaining(['/integrations/stripe', '/integrations/supabase']));
  });
});
