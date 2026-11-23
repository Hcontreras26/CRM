import { describe, it, expect, vi } from 'vitest';

/**
 * QA de /testeo del 18/11: a una gestora le salían en el menú «TESTEO2»,
 * «SUITE DASH» y «Las 22 primitivas». Son herramientas de diseño (la maqueta
 * del rediseño, la referencia y el muestrario), no pantallas de trabajo: solo
 * las ven superadmin, admin y soporte. En producción no salen a nadie
 * (`previewOnly`); las pruebas corren en modo DEV, como /testeo.
 */

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, permissions: null }) }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ({}) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({}), useOptionalTheme: () => 'dark' }));
vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { NAV_SECTIONS, canSeeItem } = await import('@/shared/components/layout/Sidebar');

const testeo = NAV_SECTIONS.find((s) => s.label === 'Testeo');
// Un `can` generoso: la gestora con todos los permisos sigue sin verlas, porque
// no es cuestión de permisos sino de para quién son.
const can = () => true;
const ve = (roles) => testeo.items.filter((it) => canSeeItem(it, roles, {}, 'educacion', false, { role: roles[0] }, can)).map((it) => it.label);

describe('menú › Testeo', () => {
  it('tiene las tres entradas de diseño', () => {
    expect(testeo.items.map((it) => it.label)).toEqual(['TESTEO2', 'SUITE DASH', 'Las 22 primitivas']);
  });

  it.each([['gestor'], ['project_manager'], ['tutor'], ['colaborador'], ['gestor', 'tutor']])('a %s no le sale ninguna', (...roles) => {
    expect(ve(roles)).toEqual([]);
  });

  it.each([['superadmin'], ['admin'], ['soporte'], ['gestor', 'admin']])('a %s le salen las tres', (...roles) => {
    expect(ve(roles)).toEqual(['TESTEO2', 'SUITE DASH', 'Las 22 primitivas']);
  });
});
