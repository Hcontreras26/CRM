import { describe, it, expect, vi } from 'vitest';

/**
 * CRM#534, parte 3 · El menú por bloques de uso cambia el SITIO, nunca el acceso.
 *
 * La foto del #423 (`menuPorPerfil423`) mira un campus de educación con todos
 * los módulos encendidos. Aquí se mira lo que la foto no ve: un proyecto IA y
 * campus con módulos apagados. Al mover una entrada a otro bloque tiene que
 * llevarse lo que su sección o su grupo le imponían (`salvoTipo: ['ia']`,
 * `module`); si no, aparecería donde antes no salía (o al revés).
 *
 * Para cada perfil, tipo de proyecto y juego de módulos: lo que se veía con las
 * secciones de antes, llevado a su sitio nuevo (`reubicar`), es exactamente lo
 * que se ve ahora. Lo único que sale, a propósito, son las tres «Próximamente».
 */

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, permissions: null }) }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ({}) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({}), useOptionalTheme: () => 'dark' }));
vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { NAV_SECTIONS, SECCIONES_DE_ANTES, entradasDeSeccion, canSeeItem, esSoloColaboraciones } = await import('@/shared/components/layout/Sidebar');
const { reubicar, reagruparMenu, REUBICACIONES } = await import('@/shared/components/layout/bloquesDelMenu');
const { crearCan } = await import('@/shared/hooks/usePermission');
const { rolesDe } = await import('@/shared/lib/roles');
const { resolverPermisos } = await import('../../../backend/src/modules/permissions/resolver.js');

const persona = (role, extra = {}) => ({ id: 1, role, roles_extra: [], excepciones: {}, factura_manager: false, gestor_colaboraciones: false, usa_mcp: false, ...extra });
const PERFILES = {
  superadmin: persona('superadmin'),
  admin: persona('admin'),
  soporte: persona('soporte'),
  gestora: persona('gestor'),
  project_manager: persona('project_manager'),
  tutor: persona('tutor'),
  colaborador: persona('colaborador'),
  'gestora+admin': persona('gestor', { roles_extra: ['admin'] }),
  'gestora+tutor': persona('gestor', { roles_extra: ['tutor'] }),
  'gestora con colaboraciones': persona('gestor', { gestor_colaboraciones: true }),
  'gestora con usa_mcp': persona('gestor', { usa_mcp: true }),
};

// Los módulos que deciden alguna entrada que se mueve.
const MODULOS = [
  undefined,
  { leads: false },
  { products: false, tutores: false },
  { clients: false, matriculas: false },
  { conversions: false, forms: false, email_sequences: false, connectors: false },
];
const TIPOS = ['educacion', 'ia'];
// Lo que sale del menú a propósito (`menu-sin-proximamente-534`).
const QUITADAS = new Set(['Captación › Campañas', 'Captación › Tráfico orgánico', 'Publicidad › Google Ads']);

function visibles(secciones, p, projectType, modules) {
  const user = { id: p.id, role: p.role, roles_extra: p.roles_extra, factura_manager: p.factura_manager, gestor_colaboraciones: p.gestor_colaboraciones, usa_mcp: p.usa_mcp };
  const can = crearCan(user, resolverPermisos({ role: p.role, roles_extra: p.roles_extra, excepciones: p.excepciones }).mapa);
  const soloColab = esSoloColaboraciones(user);
  const out = [];
  for (const s of secciones) {
    // Lo mismo que hace el menú al pintar: una sección entera puede no aplicar.
    if (Array.isArray(s.salvoTipo) && s.salvoTipo.includes(projectType)) continue;
    for (const item of entradasDeSeccion(s, { user, can, modules, projectType, soloColab })) {
      if (!item.children) { out.push(`${s.label} › ${item.label}`); continue; }
      for (const c of item.children.filter((x) => canSeeItem(x, rolesDe(user), modules, projectType, soloColab, user, can))) {
        out.push(`${s.label} › ${item.label} › ${c.label}`);
      }
    }
  }
  return out;
}

describe('el menú por bloques (#534, parte 3): solo cambia el sitio', () => {
  for (const [nombre, p] of Object.entries(PERFILES)) {
    for (const tipo of TIPOS) {
      it(`${nombre} · proyecto ${tipo}: lo mismo que antes, en su bloque nuevo`, () => {
        for (const modules of MODULOS) {
          const antes = new Set(visibles(SECCIONES_DE_ANTES, p, tipo, modules)
            .filter((e) => !QUITADAS.has(e))
            .map((e) => reubicar(e)));
          const ahora = new Set(visibles(NAV_SECTIONS, p, tipo, modules));
          const diferencia = [
            ...[...ahora].filter((x) => !antes.has(x)).map((x) => `+ ${x}`),
            ...[...antes].filter((x) => !ahora.has(x)).map((x) => `- ${x}`),
          ].sort();
          expect(diferencia, JSON.stringify(modules ?? 'todos los módulos')).toEqual([]);
        }
      });
    }
  }
});

describe('los bloques', () => {
  it('son los de la maqueta, en su orden, con el equipo de desarrollo al final', () => {
    const nombres = NAV_SECTIONS.map((s) => s.label).filter((n) => !['Testeo', 'Proyecto IA'].includes(n));
    expect(nombres).toEqual(['Hoy', 'Comercial', 'Captación y publicidad', 'Académico', 'Finanzas', 'Análisis', 'Configuración', 'Sistema', 'Equipo de Desarrollo']);
  });

  it('cada reubicación encaja con alguna entrada de antes (no hay ninguna muerta)', () => {
    const direcciones = SECCIONES_DE_ANTES.flatMap((s) => s.items.flatMap((i) => [
      `${s.label} › ${i.label}`, ...(i.children || []).map((c) => `${s.label} › ${i.label} › ${c.label}`),
    ]));
    for (const [antes] of REUBICACIONES) {
      expect(direcciones.some((d) => d === antes || d.startsWith(`${antes} › `)), antes).toBe(true);
    }
  });

  it('ninguna entrada se repite en el menú nuevo', () => {
    const todas = NAV_SECTIONS.flatMap((s) => s.items.flatMap((i) => [`${s.label} › ${i.label}`, ...(i.children || []).map((c) => `${s.label} › ${i.label} › ${c.label}`)]));
    expect(todas.length).toBe(new Set(todas).size);
  });

  it('las «Próximamente» ya no están', () => {
    const rutas = NAV_SECTIONS.flatMap((s) => s.items.flatMap((i) => [i.to, ...(i.children || []).map((c) => c.to)]));
    for (const r of ['/campanas', '/campanas/seo', '/google-ads']) expect(rutas).not.toContain(r);
  });

  it('una entrada que sale de su grupo se lleva lo que el grupo le imponía', () => {
    const hoy = NAV_SECTIONS.find((s) => s.label === 'Hoy');
    const cola = hoy.items.find((i) => i.to === '/prospectos/cola');
    expect(cola.module).toBe('leads');
    expect(cola.salvoTipo).toEqual(['ia']);
  });

  it('las comisiones, juntas en Finanzas: las de los tutores justo detrás de las del equipo', () => {
    const finanzas = NAV_SECTIONS.find((s) => s.label === 'Finanzas').items.map((i) => i.label);
    expect(finanzas.indexOf('Comisiones de tutores')).toBe(finanzas.indexOf('Comisiones') + 1);
    expect(finanzas[0]).toBe('Dashboard');
  });

  it('avisa si una entrada apunta a un grupo que no existe', () => {
    expect(() => reagruparMenu(
      [{ label: 'A', items: [{ label: 'x', to: '/x' }] }], {}, [['A › x', 'B › Grupo › x']],
    )).toThrow(/no existe el grupo/);
  });
});
