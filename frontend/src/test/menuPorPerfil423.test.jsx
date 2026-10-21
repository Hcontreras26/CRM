import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * #423 · Qué menú ve cada perfil, y que no cambie sin querer.
 *
 * La foto `fixtures/menu-por-perfil-423.json` se sacó el 21/10/2026, antes de
 * tocar ningún permiso: es el «antes». Cada perfil lleva el mapa que le daba
 * `/auth/me` (la copia congelada del backend, `inventario/legado.js`). Si el
 * menú de alguien cambia, falla, salvo lo que esté en `CAMBIOS_APROBADOS`: lo
 * que se cambia a propósito y Diego tiene que aprobar.
 *
 * Para rehacer la foto (solo si se sabe por qué): ACTUALIZAR_MENU_423=1.
 */

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, permissions: null }) }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ({}) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({}), useOptionalTheme: () => 'dark' }));
vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { NAV_SECTIONS, entradasDeSeccion, canSeeItem, esSoloColaboraciones } = await import('@/shared/components/layout/Sidebar');
const { crearCan } = await import('@/shared/hooks/usePermission');
const { rolesDe } = await import('@/shared/lib/roles');
const legado = await import('../../../backend/src/modules/permissions/inventario/legado.js');
// El mapa de AHORA: el resolver del servidor, con las casillas ya convertidas en
// excepciones como hace la migración 222 (#423).
const { resolverPermisos } = await import('../../../backend/src/modules/permissions/resolver.js');
const { excepcionesDeCasillas } = await import('../../../backend/src/modules/permissions/casillas.js');
const mapaDeAhora = (p) => resolverPermisos({
  role: p.role, roles_extra: p.roles_extra, customRole: p.custom_role,
  excepciones: { ...excepcionesDeCasillas(p), ...p.excepciones },
}).mapa;

const FOTO = path.resolve(__dirname, 'fixtures/menu-por-perfil-423.json');

const persona = (role, extra = {}) => ({
  id: 1, role, roles_extra: [], active: true, custom_role: null, excepciones: {}, ajustesRol: [],
  factura_manager: false, editar_fechas_factura: false, gestor_colaboraciones: false,
  usa_mcp: false, usa_whatsapp: null, ...extra,
});

export const PERFILES = {
  superadmin: persona('superadmin'),
  admin: persona('admin'),
  soporte: persona('soporte'),
  gestora: persona('gestor'),
  project_manager: persona('project_manager'),
  tutor: persona('tutor'),
  colaborador: persona('colaborador'),
  'gestora+admin': persona('gestor', { roles_extra: ['admin'] }),
  'gestora+tutor': persona('gestor', { roles_extra: ['tutor'] }),
  'gestora con factura_manager': persona('gestor', { factura_manager: true }),
  'gestora con editar_fechas_factura': persona('gestor', { editar_fechas_factura: true }),
  'gestora con gestor_colaboraciones': persona('gestor', { gestor_colaboraciones: true }),
  'gestora con usa_mcp': persona('gestor', { usa_mcp: true }),
  'gestora con diplomas.view': persona('gestor', { excepciones: { 'diplomas.view': true } }),
  'gestora con tasks.close': persona('gestor', { excepciones: { 'tasks.view_own': true, 'tasks.close': true, 'tasks.manage': true } }),
};

/** Lo que el CRM le pasa al menú: el usuario como lo devuelve /auth/me, y su mapa. */
export function menuDe(p, { mapa = legado.mapaDePermisos(p) } = {}) {
  const user = {
    id: p.id, role: p.role, roles_extra: p.roles_extra,
    factura_manager: p.factura_manager, editar_fechas_factura: p.editar_fechas_factura,
    gestor_colaboraciones: p.gestor_colaboraciones, usa_mcp: p.usa_mcp,
  };
  const can = crearCan(user, mapa);
  const soloColab = esSoloColaboraciones(user);
  const ctx = { user, can, modules: undefined, projectType: 'educacion', soloColab };
  const out = [];
  for (const s of NAV_SECTIONS) {
    for (const item of entradasDeSeccion(s, ctx)) {
      if (item.children) {
        const hijos = item.children.filter((c) => canSeeItem(c, rolesDe(user), undefined, 'educacion', soloColab, user, can));
        for (const c of hijos) out.push(`${s.label} › ${item.label} › ${c.label}`);
      } else {
        out.push(`${s.label} › ${item.label}`);
      }
    }
  }
  return out;
}

/**
 * Lo que cambia a propósito respecto a la foto, por perfil: `+` aparece, `-`
 * desaparece. Cada línea es una diferencia que Diego aprueba en la #423.
 */
export const CAMBIOS_APROBADOS = {
  // 1 · «Facturación» la veía solo el superadmin: preguntaba por la casilla
  //     `factura_manager` como si fuera un permiso. Ahora, «Poner número al
  //     cobrar»: el admin y quien factura.
  admin: ['+ Finanzas › Facturación'],
  'gestora con factura_manager': ['+ Finanzas › Facturación'],
  // 2 · Los roles de más cuentan también en el menú, como en el servidor: una
  //     gestora que además es admin ve lo del admin (el MCP y Facturación).
  'gestora+admin': ['+ Conexión › MCP', '+ Finanzas › Facturación'],
  // 3 · El menú ya no enseña lo que luego da 403. Soporte lo veía todo por un
  //     atajo del menú, y el project manager las pantallas de la gestora.
  soporte: [
    '- Clientes › Diplomas', '- Conexión › Conectores', '- Conexión › Webhook de transferencias',
    '- Equipo de Desarrollo › Mi factura', '- Equipo de Desarrollo › Tablero', '- Finanzas › Facturas de colaboradores',
    '- Tutores › Comisiones', '- Tutores › Mis cursos', '- Tutores › Sin tutor', '- Tutores › Tutores',
  ],
  project_manager: ['- Clientes › Matrículas', '- Principal › WhatsApp › Chat', '- Principal › WhatsApp › Conexión'],
  // 4 · Un permiso dado a una persona le enseña la pantalla (antes el menú solo
  //     miraba su rol, aunque el servidor ya la dejaba entrar).
  'gestora con tasks.close': [
    '+ Equipo de Desarrollo › Configurar tablero', '+ Equipo de Desarrollo › Por revisar', '+ Equipo de Desarrollo › Tablero',
  ],
};

describe('menú por perfil (#423)', () => {
  const ahora = Object.fromEntries(Object.entries(PERFILES).map(([k, p]) => [k, menuDe(p, { mapa: mapaDeAhora(p) })]));

  if (process.env.ACTUALIZAR_MENU_423 === '1' || !fs.existsSync(FOTO)) {
    fs.mkdirSync(path.dirname(FOTO), { recursive: true });
    fs.writeFileSync(FOTO, JSON.stringify(ahora, null, 1) + '\n');
  }
  const foto = JSON.parse(fs.readFileSync(FOTO, 'utf8'));

  for (const perfil of Object.keys(PERFILES)) {
    it(`${perfil}: el mismo menú que antes, salvo lo aprobado`, () => {
      const antes = new Set(foto[perfil] || []);
      const despues = new Set(ahora[perfil]);
      const diferencias = [
        ...[...despues].filter((x) => !antes.has(x)).map((x) => `+ ${x}`),
        ...[...antes].filter((x) => !despues.has(x)).map((x) => `- ${x}`),
      ].sort();
      expect(diferencias).toEqual([...(CAMBIOS_APROBADOS[perfil] || [])].sort());
    });
  }

  it('la foto recoge el fallo de «Facturación»: hoy solo la ve el superadmin', () => {
    expect(foto.superadmin).toContain('Finanzas › Facturación');
    expect(foto.admin).not.toContain('Finanzas › Facturación');
    expect(foto['gestora con factura_manager']).not.toContain('Finanzas › Facturación');
  });
});
