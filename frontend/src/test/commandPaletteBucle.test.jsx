import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * #591 · Una búsqueda es una búsqueda: no se repite sola.
 *
 * Se vio el 02/11 probando el buscador en el CRM: un «gonzalez» lanzó 75
 * peticiones y el «buscando…» no se iba. `usePermission()` da una función `can`
 * nueva en cada render; el buscador decide qué buscar con ella, así que cada
 * render era una búsqueda «nueva» que, al pintar, provocaba otro render.
 *
 * Aquí el componente se monta como en la app: usuario y proyecto son estado (el
 * mismo objeto entre renders) y los permisos pasan por el `crearCan` real.
 *
 *   npx vitest run src/test/commandPaletteBucle.test.jsx
 */

const get = vi.fn();
vi.mock('@/shared/api/client', () => ({ default: { get: (...a) => get(...a) } }));
const AUTH = { user: { id: 1, role: 'superadmin', roles_extra: [] }, permissions: {}, logout: () => {} };
const PROYECTO = { activeProject: { id: 7, nombre: 'Psiko', type: 'educacion' }, projects: [], switchProject: () => {} };
const AMBITO = [7];
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => PROYECTO }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }), useOptionalTheme: () => 'light' }));
vi.mock('@/shared/hooks/useAmbito', () => ({ useIdsDelAmbito: () => AMBITO }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { default: CommandPalette } = await import('@/shared/components/layout/CommandPalette');

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((url) => Promise.resolve(url.startsWith('/leads?')
    ? { success: true, data: [{ id: 2, nombre: 'Diana González', status: 'nuevo' }] }
    : { success: true, data: [] }));
});

describe('el buscador no se repite solo', () => {
  it('«gonzalez»: una petición de personas, y ya', async () => {
    render(<MemoryRouter><CommandPalette /></MemoryRouter>);
    act(() => { window.dispatchEvent(new Event('crm:open-palette')); });
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'gonzalez' } });
    expect(await screen.findByText('Diana González')).toBeTruthy();
    await new Promise((r) => setTimeout(r, 1200));
    expect(get.mock.calls.map(([u]) => u).filter((u) => u.startsWith('/leads?'))).toHaveLength(1);
  });
});
