import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/*
  #188 · revisión en /testeo (06/11) con una tutora de prueba.

  1. La cabecera pedía `GET /api/mensajes/conversations/unread-count` en cada
     página, y a la tutora de prueba el servidor se lo negaba (`mensajes.usar`):
     un 403 cada vez. De serie el tutor tiene Mensajes (#591), así que a ella se
     lo habían quitado; ahora solo lo pide quien puede usar Mensajes.
  3. `/consultas/tutores` escrita a mano decía «No hay tutores aquí» (el
     servidor da 403): ahora es una pantalla cerrada, «No tienes acceso».

  Los mapas de permisos son los del servidor (`resolverPermisos`), por rol.
*/

const get = vi.hoisted(() => vi.fn());
const auth = vi.hoisted(() => ({ user: null, permissions: null, logout: () => {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/contexts/ProjectContext', () => ({
  useProjectContext: () => ({
    activeProject: { id: 1, nombre: 'Psiko Aprende' }, activeIssuerId: null, activeIssuer: null,
    projects: [{ id: 1, nombre: 'Psiko Aprende', sociedad_emisora_id: 8 }], setActiveProject: vi.fn(),
  }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
  useOptionalTheme: () => 'dark',
}));
vi.mock('@/shared/api/client', () => ({ default: { get, post: vi.fn() } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { default: Sidebar, rutaPermitida } = await import('@/shared/components/layout/Sidebar');
const { crearCan } = await import('@/shared/hooks/usePermission');
const { resolverPermisos } = await import('../../../backend/src/modules/permissions/resolver.js');

const quien = (role) => ({ id: 41, nombre: 'Prueba', email: 'p@empresa.com', role, roles_extra: [], active: true });
const mapaDe = (role) => resolverPermisos({ role }).mapa;

async function pedidosDelMenu(role, cambios = {}) {
  auth.user = quien(role);
  auth.permissions = { ...mapaDe(role), ...cambios };
  render(<MemoryRouter><Sidebar /></MemoryRouter>);
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return get.mock.calls.map(([u]) => String(u));
}

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ success: true, data: { count: 0 } });
});

describe('#188 · el contador de mensajes no leídos', () => {
  it('una tutora sin Mensajes no lo pide (le daba un 403 en cada página)', async () => {
    const pedidos = await pedidosDelMenu('tutor', { 'mensajes.usar': false });
    expect(pedidos.filter((u) => u.includes('unread-count'))).toEqual([]);
  });

  it('la tutora de serie tiene Mensajes (#591) y lo sigue pidiendo, como el admin', async () => {
    expect(mapaDe('tutor')['mensajes.usar']).toBe(true);
    expect(await pedidosDelMenu('tutor')).toContain('/mensajes/conversations/unread-count');
    get.mockClear();
    expect(await pedidosDelMenu('admin')).toContain('/mensajes/conversations/unread-count');
  });
});

describe('#188 · /consultas/tutores escrita a mano', () => {
  it('cerrada para la tutora, abierta para quien ve el panel de Consultas', () => {
    expect(rutaPermitida('/consultas/tutores', crearCan(quien('tutor'), mapaDe('tutor')))).toBe(false);
    expect(rutaPermitida('/consultas/tutores', crearCan(quien('admin'), mapaDe('admin')))).toBe(true);
  });

  it('lo demás de Consultas que es suyo sigue abierto para la tutora', () => {
    const can = crearCan(quien('tutor'), mapaDe('tutor'));
    for (const ruta of ['/consultas', '/consultas/carga', '/consultas/metricas']) {
      expect(rutaPermitida(ruta, can), ruta).toBe(true);
    }
  });
});
