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
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ({}) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({}), useOptionalTheme: () => 'dark' }));
vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { NAV_SECTIONS, rutaPermitida } = await import('@/shared/components/layout/Sidebar');
const { crearCan } = await import('@/shared/hooks/usePermission');
const { resolverPermisos } = await import('../../../backend/src/modules/permissions/resolver.js');
const { default: SubNav } = await import('@/shared/components/ui/SubNav');
const { default: AccesosClave } = await import('@/shared/components/ui/AccesosClave');

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
      '/tareas/revisar': ['tasks.close'],
      '/whatsapp/banco': ['whatsapp.usar', 'whatsapp.supervisar'],
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
