import { describe, it, expect, vi } from 'vitest';

/**
 * Lo del #44 para los proyectos IA (PR #386 y #387), solo en pruebas.
 *
 * Aquí se simula /crm: SOLO_EN_PRUEBAS apagado. Un proyecto IA tiene que ver el
 * menú de siempre —sin el apartado «Proyecto IA» y sin que se le escondan las
 * secciones— y el «Resumen» (/stripe) sigue «Próximamente».
 *
 *   npx vitest run src/test/proyectosIASoloEnPruebas.test.jsx
 */
vi.mock('@/shared/lib/soloEnPruebas', () => ({ SOLO_EN_PRUEBAS: false }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, permissions: null }) }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ({}) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({}), useOptionalTheme: () => 'dark' }));
vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { PROYECTOS_IA, esProyectoIA, tipoDelMenu } = await import('@/shared/lib/proyectosIA');
const { paginasDelBuscador } = await import('@/shared/components/layout/CommandPalette');
const { NAV_SECTIONS, entradasDeSeccion } = await import('@/shared/components/layout/Sidebar');
const { BETA_ROUTES } = await import('@/shared/config/betaConfig');
const { crearCan } = await import('@/shared/hooks/usePermission');
const { resolverPermisos } = await import('../../../backend/src/modules/permissions/resolver.js');

const superadmin = { id: 1, role: 'superadmin', roles_extra: [] };
const can = crearCan(superadmin, resolverPermisos({ role: 'superadmin', roles_extra: [], customRole: null, excepciones: {} }).mapa);
const IA = { id: 2, modules: undefined, type: 'ia' };
const EDUCACION = { id: 1, modules: undefined, type: 'educacion' };

/** Las secciones y entradas que pinta el menú lateral, recorridas como en Sidebar.jsx. */
function seccionesDelMenu(proyecto, encendido) {
  const tipo = tipoDelMenu(proyecto.type, encendido);
  return NAV_SECTIONS
    .filter((s) => !(Array.isArray(s.salvoTipo) && s.salvoTipo.includes(tipo)))
    .flatMap((s) => {
      const entradas = entradasDeSeccion(s, { user: superadmin, can, modules: proyecto.modules, projectType: tipo, soloColab: false });
      return entradas.length ? [s.label, ...entradas.map((e) => `${s.label} › ${e.label}`)] : [];
    });
}

describe('en /crm (apagado), un proyecto IA se ve como hasta ahora', () => {
  it('la bandera está apagada y nada es «proyecto IA»', () => {
    expect(PROYECTOS_IA).toBe(false);
    expect(esProyectoIA(IA)).toBe(false);
    expect(tipoDelMenu('ia')).toBeUndefined();
    expect(tipoDelMenu('educacion')).toBe('educacion');
  });

  it('el menú no tiene «Proyecto IA» y conserva Prospectos y Finanzas', () => {
    const secciones = seccionesDelMenu(IA, false);
    expect(secciones).not.toContain('Proyecto IA');
    expect(secciones).toEqual(expect.arrayContaining(['Principal › Prospectos', 'Finanzas']));
    // Mismo menú que un campus normal.
    expect(secciones).toEqual(seccionesDelMenu(EDUCACION, false));
  });

  it('el buscador (Ctrl K) tampoco encuentra lo de «Proyecto IA»', () => {
    const paginas = paginasDelBuscador({ user: superadmin, can, activeProject: IA });
    expect(paginas.some((p) => p.sublabel === 'Proyecto IA')).toBe(false);
    expect(paginas.map((p) => p.to).sort())
      .toEqual(paginasDelBuscador({ user: superadmin, can, activeProject: EDUCACION }).map((p) => p.to).sort());
  });

  it('el «Resumen» de IA (/stripe) no entra en la beta de producción', () => {
    expect(BETA_ROUTES).not.toContain('/stripe');
  });
});

describe('encendido (/testeo, local), lo del #44 sí', () => {
  it('el menú de un proyecto IA es el suyo: «Proyecto IA» y sin Prospectos', () => {
    const secciones = seccionesDelMenu(IA, true);
    expect(secciones).toContain('Proyecto IA');
    expect(secciones).not.toContain('Principal › Prospectos');
    expect(secciones).not.toContain('Finanzas');
    expect(esProyectoIA(IA, true)).toBe(true);
    expect(esProyectoIA(EDUCACION, true)).toBe(false);
  });
});
