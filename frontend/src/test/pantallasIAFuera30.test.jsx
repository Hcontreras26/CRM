import { describe, it, expect, vi, afterEach } from 'vitest';
import { isValidElement } from 'react';
import { render } from '@testing-library/react';
import { Routes, Navigate, createRoutesFromChildren, matchRoutes } from 'react-router-dom';

/*
  #30 · Las pantallas de IA del CRM, fuera (Diego, 10/11/2026): «el chatbot de
  IA del propio CRM ya no va, porque se usa Claude por el MCP».

  «Análisis IA», «Pregunta a tus datos» y «Chat IA» no salen en el menú, ni en
  el buscador (Ctrl+K), ni en el dock flotante, para ningún rol; y quien entra
  por su dirección (o por las de antes, /reports/ia y /ai-chat) va al inicio,
  sin «Página no encontrada». El código se queda: con `VITE_PANTALLAS_IA=1`
  vuelven las tres (la última prueba).
*/

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null, permissions: null }) }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ({}) }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({}), useOptionalTheme: () => 'dark' }));
vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { PANTALLAS_IA, RUTAS_IA } = await import('@/shared/lib/pantallasIA');
const { NAV_SECTIONS } = await import('@/shared/components/layout/Sidebar');
const { paginasDelBuscador } = await import('@/shared/components/layout/CommandPalette');
const { crearCan } = await import('@/shared/hooks/usePermission');
const { resolverPermisos } = await import('../../../backend/src/modules/permissions/resolver.js');

const NOMBRES_IA = ['Análisis IA', 'Pregunta a tus datos', 'Chat IA'];
const PANTALLAS = ['/informes/ia', '/informes/preguntar', '/chat-ia'];

const ROLES = ['superadmin', 'admin', 'soporte', 'gestor', 'project_manager', 'tutor', 'colaborador'];
const PROYECTO = { id: 1, modules: undefined, type: 'educacion' };

/** Usuario y `can` como los da /auth/me; `todo` = con TODOS los permisos (el peor caso). */
function ctxDe(role, { todo = false } = {}) {
  const mapa = resolverPermisos({ role, roles_extra: [], customRole: null, excepciones: {} }).mapa;
  const user = { id: 1, role, roles_extra: [], gestor_colaboraciones: false };
  return { user, can: todo ? () => true : crearCan(user, mapa) };
}

/** Todas las entradas del menú, con sus hijos, sin filtrar por nadie. */
const todasLasEntradas = (secciones) => secciones.flatMap((s) =>
  s.items.flatMap((it) => (it.children ? [it, ...it.children] : [it])));

describe('#30 · las pantallas de IA del CRM, fuera del menú (Diego, 10/11)', () => {
  it('el interruptor está apagado por defecto', () => {
    expect(PANTALLAS_IA).toBe(false);
  });

  it('el menú no tiene ninguna de las tres, ni por nombre ni por dirección', () => {
    const entradas = todasLasEntradas(NAV_SECTIONS);
    expect(entradas.length).toBeGreaterThan(30);
    expect(entradas.filter((e) => NOMBRES_IA.includes(e.label)).map((e) => e.label)).toEqual([]);
    expect(entradas.filter((e) => RUTAS_IA.includes(e.to)).map((e) => e.to)).toEqual([]);
  });

  for (const role of ROLES) {
    it(`${role}: el buscador (Ctrl+K) no las encuentra, ni con todos los permisos`, () => {
      for (const todo of [false, true]) {
        const paginas = paginasDelBuscador({ ...ctxDe(role, { todo }), activeProject: PROYECTO });
        expect(paginas.filter((p) => RUTAS_IA.includes(p.to) || NOMBRES_IA.includes(p.label))).toEqual([]);
      }
    });
  }

  it('el dock flotante no ofrece el Chat IA', async () => {
    const { default: FloatingDock, setFloatingDockHidden } = await import('@/shared/components/layout/FloatingDock');
    // Oculto, el dock enseña su botón para volver: ni ahí se nombra el chat.
    setFloatingDockHidden(true);
    const { container, unmount } = render(<FloatingDock />);
    expect(container.innerHTML).not.toMatch(/chat ia|chat ai/i);
    unmount();
    setFloatingDockHidden(false);
  });
});

describe('#30 · entrar por la dirección lleva al inicio, sin error', () => {
  // Las rutas salen del propio App.jsx, como en `menuSinRutasRotas.test.jsx`.
  function buscarRoutes(el) {
    if (!el) return null;
    if (Array.isArray(el)) {
      for (const x of el) { const r = buscarRoutes(x); if (r) return r; }
      return null;
    }
    if (!isValidElement(el)) return null;
    if (el.type === Routes) return el;
    return buscarRoutes(el.props?.children);
  }

  it.each(RUTAS_IA)('%s → /', async (ruta) => {
    const { default: App } = await import('@/App');
    const RUTAS = createRoutesFromChildren(buscarRoutes(App()).props.children);
    const m = matchRoutes(RUTAS, ruta);
    expect(m, ruta).toBeTruthy();
    const ultima = m[m.length - 1];
    // Ni la página de error (`*`) ni la pantalla: una redirección al inicio.
    expect(ultima.route.path).not.toBe('*');
    const el = ultima.route.element;
    expect(isValidElement(el) && el.type === Navigate, ruta).toBe(true);
    expect(el.props.to).toBe('/');
  }, 60000);
});

describe('#30 · se vuelven a encender en un solo sitio', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it('con VITE_PANTALLAS_IA=1 vuelven al menú y a su dirección', async () => {
    vi.stubEnv('VITE_PANTALLAS_IA', '1');
    vi.resetModules();
    const { PANTALLAS_IA: encendido } = await import('@/shared/lib/pantallasIA');
    expect(encendido).toBe(true);
    const { NAV_SECTIONS: menu } = await import('@/shared/components/layout/Sidebar');
    const aDonde = todasLasEntradas(menu).map((e) => e.to);
    // «Pregunta a tus datos», además, solo en pruebas (`SOLO_EN_PRUEBAS`): aquí lo es.
    for (const p of PANTALLAS) expect(aDonde, p).toContain(p);
  }, 60000);
});
