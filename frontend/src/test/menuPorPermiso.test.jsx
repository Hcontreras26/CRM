// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

/**
 * El menú, por permiso y no por rol (#423: «el rol solo vale para el ALCANCE»).
 *
 * Una gestora con permisos de admin dados como excepción perdía entradas como
 * «Productos» aunque tuviera `products.view`: la entrada pedía el rol de admin.
 * Ahora una entrada que pide `permiso` sale a quien lo tiene, sea cual sea su
 * rol; `roles` solo decide a quién se le enseña de serie lo que no pide permiso.
 *
 * Y lo que NO tiene que pasar: que a una gestora normal le salgan entradas
 * nuevas solo porque su rol ya trae el permiso de serie. Las que están en ese
 * caso llevan `seguirPorRol` hasta que se decida (salvo Productos, que la ven
 * todos: «los productos los ven todos, de todos»).
 */

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, permissions: null }) }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ({}) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({}), useOptionalTheme: () => 'dark' }));
vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { NAV_SECTIONS, entradasDeSeccion, canSeeItem, esSoloColaboraciones } = await import('@/shared/components/layout/Sidebar');
const { crearCan } = await import('@/shared/hooks/usePermission');
const { rolesDe } = await import('@/shared/lib/roles');
const { resolverPermisos } = await import('../../../backend/src/modules/permissions/resolver.js');

const persona = (role, extra = {}) => ({ id: 1, role, roles_extra: [], gestor_colaboraciones: false, ...extra });

/** Las entradas que ve (`Sección › Entrada`, y `› Hijo` en un grupo), con su mapa del servidor. */
function menuDe(user, { excepciones = {}, modules, projectType = 'educacion' } = {}) {
  const mapa = resolverPermisos({ role: user.role, roles_extra: user.roles_extra, excepciones }).mapa;
  const can = crearCan(user, mapa);
  const soloColab = esSoloColaboraciones(user);
  const ctx = { user, can, modules, projectType, soloColab };
  const out = [];
  for (const s of NAV_SECTIONS) {
    for (const item of entradasDeSeccion(s, ctx)) {
      if (item.children) {
        for (const c of item.children.filter((c) => canSeeItem(c, rolesDe(user), modules, projectType, soloColab, user, can))) {
          out.push({ linea: `${s.label} › ${item.label} › ${c.label}`, item: c, can });
        }
      } else {
        out.push({ linea: `${s.label} › ${item.label}`, item, can });
      }
    }
  }
  return out;
}

/** Las que ve SOLO por el permiso: su rol no está en `roles` y no tiene el `oPermiso`. */
const nuevasPorPermiso = (user, opciones) => menuDe(user, opciones)
  .filter(({ item, can }) => Array.isArray(item.roles) && !rolesDe(user).some((r) => item.roles.includes(r))
    && !(item.oPermiso && [].concat(item.oPermiso).some((p) => can(p))))
  .map(({ linea }) => linea)
  .sort();

const lineas = (user, opciones) => menuDe(user, opciones).map(({ linea }) => linea);

describe('menú por permiso, no por rol', () => {
  it('a una gestora normal solo le aparece Productos (y Productos por categoría), nada más', () => {
    expect(nuevasPorPermiso(persona('gestor'))).toEqual([
      'Académico › Productos',
      'Académico › Productos por categoría',
    ]);
  });

  it('en un proyecto IA, a una gestora normal no le aparece nada nuevo', () => {
    expect(nuevasPorPermiso(persona('gestor'), { projectType: 'ia' })).toEqual([]);
  });

  it('una gestora con products.view dado como excepción ve «Productos»', () => {
    expect(lineas(persona('gestor'), { excepciones: { 'products.view': true } })).toContain('Académico › Productos');
  });

  it('sin products.view (quitado como excepción) no lo ve', () => {
    const menu = lineas(persona('gestor'), { excepciones: { 'products.view': false } });
    expect(menu).not.toContain('Académico › Productos');
    expect(menu).not.toContain('Académico › Productos por categoría');
  });

  it('una gestora con un permiso de admin dado (reports.view) ve su entrada', () => {
    expect(lineas(persona('gestor'))).not.toContain('Análisis › Reportes');
    expect(lineas(persona('gestor'), { excepciones: { 'reports.view': true } })).toContain('Análisis › Reportes');
  });

  it('con el módulo apagado no sale, aunque tenga el permiso', () => {
    expect(lineas(persona('gestor'), { modules: { products: false } })).not.toContain('Académico › Productos');
  });

  it('lo que sigue por rol (`seguirPorRol`) no le sale a la gestora aunque su rol traiga el permiso', () => {
    const menu = lineas(persona('gestor'));
    for (const e of ['Finanzas › Conversiones', 'Finanzas › Ingresos', 'Finanzas › Conciliación', 'Finanzas › Pagos Stripe', 'Finanzas › Pendientes de facturar', 'Análisis › Feedback']) {
      expect(menu).not.toContain(e);
    }
  });

  it('el tutor, el colaborador y el tutor redactor siguen con su recorte', () => {
    const exc = { 'products.view': true, 'reports.view': true };
    for (const r of ['tutor', 'colaborador', 'tutor_redactor']) {
      const menu = lineas(persona(r), { excepciones: exc });
      expect(menu, r).not.toContain('Académico › Productos');
      expect(menu, r).not.toContain('Análisis › Reportes');
    }
  });
});
