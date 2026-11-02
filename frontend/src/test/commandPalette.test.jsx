import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';

/**
 * #591 · El buscador (Ctrl K): qué encuentra cada perfil.
 *
 * La regla: nunca enseña más de lo que esa persona puede abrir. Las páginas
 * son las de su menú, y cada tipo de resultado sale solo con el permiso que
 * protege su pantalla. Todo con el mapa EFECTIVO (el resolver del servidor,
 * con excepciones), nunca con el nombre del rol.
 *
 *   npx vitest run src/test/commandPalette.test.jsx
 */

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, permissions: null }) }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ({}) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({}), useOptionalTheme: () => 'dark' }));
vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const {
  fuzzyScore, sinAcentos, paginasDelBuscador, queBusca, destinoDePersona, destinoDeProducto, recienteSigueValiendo,
} = await import('@/shared/components/layout/CommandPalette');
const { NAV_SECTIONS, entradasDeSeccion, canSeeItem, esSoloColaboraciones } = await import('@/shared/components/layout/Sidebar');
const { isBetaAllowed } = await import('@/shared/config/betaConfig');
const { CERTIFEX_PANEL } = await import('@/shared/lib/certifexPanel');
const { crearCan } = await import('@/shared/hooks/usePermission');
const { rolesDe } = await import('@/shared/lib/roles');
const { resolverPermisos } = await import('../../../backend/src/modules/permissions/resolver.js');

const persona = (role, extra = {}) => ({ id: 1, role, roles_extra: [], gestor_colaboraciones: false, excepciones: {}, ...extra });
const PROYECTO = { id: 1, modules: undefined, type: 'educacion' };

/** El usuario y su `can`, como los da /auth/me: el mapa del resolver, con excepciones. */
function ctxDe(p) {
  const mapa = resolverPermisos({ role: p.role, roles_extra: p.roles_extra, customRole: null, excepciones: p.excepciones }).mapa;
  const user = { id: p.id, role: p.role, roles_extra: p.roles_extra, gestor_colaboraciones: p.gestor_colaboraciones };
  return { user, can: crearCan(user, mapa) };
}
const rutasDe = (p, proyecto = PROYECTO) => paginasDelBuscador({ ...ctxDe(p), activeProject: proyecto }).map((x) => x.to);
const buscaDe = (p) => queBusca(ctxDe(p));

/** Lo que pinta el menú lateral, recorrido aparte, para compararlo con el buscador. */
function rutasDelMenu(p, proyecto = PROYECTO) {
  const { user, can } = ctxDe(p);
  const soloColab = esSoloColaboraciones(user);
  const ctx = { user, can, modules: proyecto.modules, projectType: proyecto.type, soloColab };
  const out = new Set();
  for (const s of NAV_SECTIONS) {
    if (Array.isArray(s.salvoTipo) && s.salvoTipo.includes(proyecto.type)) continue;
    for (const it of entradasDeSeccion(s, ctx)) {
      const hojas = it.children
        ? it.children.filter((c) => canSeeItem(c, rolesDe(user), proyecto.modules, proyecto.type, soloColab, user, can))
        : [it];
      for (const h of hojas) if (h.to && !h.href && !h.comingSoon && isBetaAllowed(h.to)) out.add(h.to);
    }
  }
  return [...out].sort();
}

const PERFILES = {
  superadmin: persona('superadmin'),
  admin: persona('admin'),
  soporte: persona('soporte'),
  gestora: persona('gestor'),
  project_manager: persona('project_manager'),
  tutor: persona('tutor'),
  colaborador: persona('colaborador'),
};

const FINANZAS_RESTRINGIDAS = ['/finanzas', '/finanzas/nominas', '/finanzas/egresos', '/finanzas/por-pagar', '/finanzas/facturas-colaboradores'];

describe('páginas: exactamente las del menú de cada perfil', () => {
  for (const [nombre, p] of Object.entries(PERFILES)) {
    it(`${nombre}: el buscador y el menú enseñan las mismas pantallas`, () => {
      expect([...rutasDe(p)].sort()).toEqual(rutasDelMenu(p));
    });
  }

  it('en un proyecto IA tampoco salen las secciones que no aplican', () => {
    const ia = { id: 2, modules: undefined, type: 'ia' };
    expect([...rutasDe(PERFILES.superadmin, ia)].sort()).toEqual(rutasDelMenu(PERFILES.superadmin, ia));
    expect(rutasDe(PERFILES.superadmin, ia)).not.toContain('/finanzas/nominas');
  });

  it('nada «Próximamente»: Campañas y Google Ads no se encuentran', () => {
    const rutas = rutasDe(PERFILES.superadmin);
    expect(rutas).not.toContain('/campanas');
    expect(rutas).not.toContain('/google-ads');
  });
});

describe('qué encuentra cada perfil (tabla de la #591)', () => {
  it('superadmin: personas, clientes, productos y las páginas nuevas', () => {
    expect(buscaDe(PERFILES.superadmin)).toMatchObject({ personas: true, clientes: true, productos: true });
    const rutas = rutasDe(PERFILES.superadmin);
    for (const r of ['/finanzas/facturas-colaboradores', '/tareas', '/conexion/asignacion-leads', '/finanzas/ventas', '/whatsapp/chat']) {
      expect(rutas).toContain(r);
    }
    if (CERTIFEX_PANEL) expect(rutas).toContain('/clientes/matriculas/diplomas');
  });

  it('admin: personas, clientes y productos de sus campus; Facturas de colaboradores', () => {
    expect(buscaDe(PERFILES.admin)).toMatchObject({ personas: true, clientes: true, productos: true });
    expect(rutasDe(PERFILES.admin)).toContain('/finanzas/pendiente-facturar');
  });

  it('soporte: personas y productos; sin facturas de colaboradores', () => {
    expect(buscaDe(PERFILES.soporte)).toMatchObject({ personas: true, productos: true });
    expect(rutasDe(PERFILES.soporte)).not.toContain('/finanzas/facturas-colaboradores');
  });

  it('gestora: sus personas y productos; ni Contabilidad, ni Nóminas, ni Cuentas por pagar', () => {
    expect(buscaDe(PERFILES.gestora)).toMatchObject({ personas: true, clientes: true, productos: true, crearProducto: false });
    const rutas = rutasDe(PERFILES.gestora);
    for (const r of FINANZAS_RESTRINGIDAS) expect(rutas).not.toContain(r);
  });

  it('project manager: como una gestora, con clientes', () => {
    expect(buscaDe(PERFILES.project_manager)).toMatchObject({ personas: true, clientes: true });
    for (const r of FINANZAS_RESTRINGIDAS) expect(rutasDe(PERFILES.project_manager)).not.toContain(r);
  });

  it('tutor: ni personas ni productos (pendiente de Diego); solo lo suyo', () => {
    expect(buscaDe(PERFILES.tutor)).toEqual({ personas: false, clientes: false, productos: false, crearProspecto: false, crearProducto: false });
    const rutas = rutasDe(PERFILES.tutor);
    expect(rutas.some((r) => r.startsWith('/prospectos') || r.startsWith('/finanzas') || r.startsWith('/configuracion'))).toBe(false);
  });

  it('colaborador: ni personas ni productos; su tablero, su factura y sus preferencias', () => {
    expect(buscaDe(PERFILES.colaborador)).toMatchObject({ personas: false, productos: false });
    const rutas = rutasDe(PERFILES.colaborador);
    expect(rutas).toContain('/tareas');
    expect(rutas).toContain('/preferencias');
    expect(rutas.some((r) => r.startsWith('/prospectos') || r.startsWith('/finanzas') || r.startsWith('/configuracion'))).toBe(false);
  });
});

describe('excepciones por persona: manda el permiso, no el rol', () => {
  it('a una gestora sin leads.view no se le buscan personas', () => {
    const sinLeads = persona('gestor', { excepciones: { 'leads.view': false } });
    expect(buscaDe(sinLeads).personas).toBe(false);
    expect(buscaDe(sinLeads).clientes).toBe(false);
  });

  it('a un admin sin facturas.view le desaparece «Pendientes de facturar»', () => {
    const sinFacturas = persona('admin', { excepciones: { 'facturas.view': false } });
    expect(rutasDe(sinFacturas)).not.toContain('/finanzas/pendiente-facturar');
  });

  it.skipIf(!CERTIFEX_PANEL)('una gestora con diplomas.view encuentra Diplomas', () => {
    expect(rutasDe(PERFILES.gestora)).not.toContain('/clientes/matriculas/diplomas');
    expect(rutasDe(persona('gestor', { excepciones: { 'diplomas.view': true } }))).toContain('/clientes/matriculas/diplomas');
  });

  it('un reciente de una pantalla que ya no puede abrir no se enseña', () => {
    const pages = paginasDelBuscador({ ...ctxDe(PERFILES.colaborador), activeProject: PROYECTO });
    const busca = buscaDe(PERFILES.colaborador);
    expect(recienteSigueValiendo('/finanzas/nominas', { pages, busca })).toBe(false);
    expect(recienteSigueValiendo('/prospectos/12', { pages, busca })).toBe(false);
    expect(recienteSigueValiendo('/tareas', { pages, busca })).toBe(true);
  });
});

describe('sin acentos', () => {
  it('«matriculas», «nominas» y «asignacion» encuentran sus páginas', () => {
    expect(sinAcentos('Asignación')).toBe('asignacion');
    const paginas = paginasDelBuscador({ ...ctxDe(PERFILES.superadmin), activeProject: PROYECTO });
    const encuentra = (q) => paginas.filter((x) => fuzzyScore(x.label, x.keywords, q) > 0).map((x) => x.to);
    expect(encuentra('matriculas')).toContain('/clientes/matriculas');
    expect(encuentra('nominas')).toContain('/finanzas/nominas');
    expect(encuentra('asignacion')).toContain('/conexion/asignacion-leads');
  });
});

describe('cada resultado lleva a una ruta que existe en App.jsx', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '../App.jsx'), 'utf8');
  const existe = (patron) => app.includes(`path="${patron}"`);

  function rutasDeclaradasEnApp(code) {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
    });
    const routes = new Set();
    function visit(node, parentPath = '') {
      if (!node) return;
      if (node.type === 'JSXElement') {
        const opening = node.openingElement;
        const name = opening.name?.name;
        let currentBase = parentPath;
        if (name === 'Route') {
          let pathVal = null;
          let isIndex = false;
          for (const attr of opening.attributes) {
            if (attr.type === 'JSXAttribute') {
              if (attr.name?.name === 'path' && attr.value?.type === 'StringLiteral') {
                pathVal = attr.value.value;
              } else if (attr.name?.name === 'index') {
                isIndex = true;
              }
            }
          }
          if (pathVal !== null) {
            if (pathVal.startsWith('/')) {
              currentBase = pathVal;
            } else {
              currentBase = parentPath ? `${parentPath.replace(/\/+$/, '')}/${pathVal}` : `/${pathVal}`;
            }
            routes.add(currentBase);
          } else if (isIndex) {
            routes.add(parentPath || '/');
          }
        }
        if (node.children) {
          for (const child of node.children) visit(child, currentBase);
        }
      } else if (Array.isArray(node)) {
        for (const item of node) visit(item, parentPath);
      } else if (typeof node === 'object') {
        for (const key of Object.keys(node)) {
          if (key !== 'parent' && typeof node[key] === 'object') visit(node[key], parentPath);
        }
      }
    }
    visit(ast);
    return routes;
  }

  it('prospecto, cliente y producto', () => {
    expect(destinoDePersona({ id: 4, status: 'nuevo' })).toBe('/prospectos/4');
    expect(destinoDePersona({ id: 4, status: 'convertido' })).toBe('/clientes/4');
    expect(destinoDeProducto({ id: 9 })).toBe('/productos/9');
    for (const p of ['/prospectos/:id', '/clientes/:id', '/productos/:id', '/prospectos', '/productos']) {
      expect(existe(p)).toBe(true);
    }
  });

  it('todas las páginas del buscador van a rutas declaradas en App.jsx', () => {
    const rutasApp = rutasDeclaradasEnApp(app);
    const todasLasRutasDelBuscador = new Set();

    const PROYECTOS_PRUEBA = [
      { id: 1, type: 'educacion', modules: ['marketing', 'ventas', 'tutores', 'facturacion'] },
      { id: 2, type: 'ia', modules: [] },
      { id: 3, type: 'general' },
    ];

    for (const p of Object.values(PERFILES)) {
      for (const pry of PROYECTOS_PRUEBA) {
        const paginas = paginasDelBuscador({ ...ctxDe(p), activeProject: pry });
        for (const pag of paginas) {
          todasLasRutasDelBuscador.add(pag.to);
        }
      }
    }

    expect(todasLasRutasDelBuscador.size).toBeGreaterThan(0);
    for (const ruta of todasLasRutasDelBuscador) {
      expect(rutasApp.has(ruta)).toBe(true);
    }
  });
});
