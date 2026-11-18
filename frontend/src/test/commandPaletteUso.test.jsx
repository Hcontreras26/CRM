import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * #591 · El buscador montado de verdad: lo que solo se ve usándolo.
 *
 * - Con una letra no se pregunta al servidor (cada tecla eran siete búsquedas).
 * - Con un solo dígito, solo la venta de ese número.
 * - Si «go» responde después que «gonzalez», no tapa los resultados buenos.
 * - Mientras busca dice «Buscando…», no «No hay resultados».
 *
 *   npx vitest run src/test/commandPaletteUso.test.jsx
 */

const get = vi.fn();
vi.mock('@/shared/api/client', () => ({ default: { get: (...a) => get(...a) } }));
// Como en la app: el usuario y el proyecto son estado (el mismo objeto entre
// renders), y los permisos pasan por el `crearCan` de verdad, no por un mock.
const AUTH = { user: { id: 1, role: 'superadmin', roles_extra: [] }, permissions: {}, logout: () => {} };
const PROYECTO = { activeProject: { id: 7, nombre: 'Psiko', type: 'educacion' }, projects: [], switchProject: () => {}, activeIssuerId: null };
const AMBITO = [7];
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => AUTH }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => PROYECTO }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }), useOptionalTheme: () => 'light' }));
vi.mock('@/shared/hooks/useAmbito', () => ({ useIdsDelAmbito: () => AMBITO }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { default: CommandPalette } = await import('@/shared/components/layout/CommandPalette');
const { CERTIFEX_PANEL } = await import('@/shared/lib/certifexPanel');

const vacio = { success: true, data: [] };
const urls = () => get.mock.calls.map(([u]) => u);

async function abrirYEscribir(texto) {
  render(<MemoryRouter><CommandPalette /></MemoryRouter>);
  act(() => { window.dispatchEvent(new Event('crm:open-palette')); });
  const input = await screen.findByRole('combobox');
  fireEvent.change(input, { target: { value: texto } });
  return input;
}

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue(vacio);
});

describe('el buscador, usándolo', () => {
  it('con una letra no pregunta al servidor', async () => {
    await abrirYEscribir('a');
    await new Promise((r) => setTimeout(r, 400));
    expect(get).not.toHaveBeenCalled();
  });

  it('con un solo dígito, solo la venta de ese número', async () => {
    await abrirYEscribir('7');
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(urls()).toEqual(['/conversions/7']);
  });

  it('con dos letras, cada tipo a su ruta', async () => {
    await abrirYEscribir('go');
    await waitFor(() => expect(urls().some((u) => u.startsWith('/leads?'))).toBe(true));
    const rutas = urls().map((u) => u.split('?')[0]);
    expect(rutas).toEqual(expect.arrayContaining([
      '/leads', '/products', '/invoices', '/tasks', '/consultas', '/users/buscar',
      '/tutores/buscar', '/facturas-colaborador/facturas',
    ]));
    expect(rutas).not.toContain('/conversions/go');
    // Certifex y Moodle se preguntan en vivo: con dos letras, todavía no.
    expect(rutas).not.toContain('/certifex/diplomas');
    expect(rutas).not.toContain('/moodle/cursos');
  });

  it('desde tres letras, también diplomas y cursos de Moodle (sin contar alumnos)', async () => {
    await abrirYEscribir('log');
    await waitFor(() => expect(urls().some((u) => u.startsWith('/moodle/cursos?'))).toBe(true));
    const moodle = urls().find((u) => u.startsWith('/moodle/cursos?'));
    expect(moodle).toContain('proyecto_id=7');
    expect(moodle).toContain('con_alumnos=0');
    if (CERTIFEX_PANEL) expect(urls().some((u) => u.startsWith('/certifex/diplomas?'))).toBe(true);
  });

  it('un Moodle lento no hace esperar a las personas, y su curso llega después', async () => {
    let soltarMoodle;
    get.mockImplementation((url) => {
      if (url.startsWith('/moodle/cursos?')) {
        return new Promise((r) => { soltarMoodle = () => r({ success: true, data: { cursos: [{ id: 40, nombre: 'Logopedia infantil', estado: 'activo' }] } }); });
      }
      if (url.startsWith('/leads?')) return Promise.resolve({ success: true, data: [{ id: 3, nombre: 'Lola Gómez', status: 'nuevo' }] });
      return Promise.resolve(vacio);
    });
    await abrirYEscribir('log');
    expect(await screen.findByText('Lola Gómez')).toBeTruthy();
    expect(screen.queryByText('Logopedia infantil')).toBeNull();
    await act(async () => { soltarMoodle(); await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.getByText('Logopedia infantil')).toBeTruthy();
    expect(screen.getByText('Lola Gómez')).toBeTruthy();
  });

  it('un Moodle que contesta tarde a «log» no cuela su curso en «lola»', async () => {
    let soltarViejo;
    get.mockImplementation((url) => {
      if (url.startsWith('/moodle/cursos?') && url.includes('texto=log&')) {
        return new Promise((r) => { soltarViejo = () => r({ success: true, data: { cursos: [{ id: 41, nombre: 'Curso Viejo' }] } }); });
      }
      if (url.startsWith('/leads?') && url.includes('search=lola')) return Promise.resolve({ success: true, data: [{ id: 3, nombre: 'Lola Gómez', status: 'nuevo' }] });
      return Promise.resolve(vacio);
    });
    const input = await abrirYEscribir('log');
    await waitFor(() => expect(soltarViejo).toBeTypeOf('function'));
    fireEvent.change(input, { target: { value: 'lola' } });
    expect(await screen.findByText('Lola Gómez')).toBeTruthy();
    await act(async () => { soltarViejo(); await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.queryByText('Curso Viejo')).toBeNull();
  });

  // El bucle (una búsqueda que se repetía sola) tiene su prueba en commandPaletteBucle.test.jsx.

  it('mientras busca dice «Buscando…», no «No hay resultados»', async () => {
    get.mockImplementation(() => new Promise(() => {}));
    await abrirYEscribir('zzzz');
    expect(await screen.findByText('Buscando…')).toBeTruthy();
    expect(screen.queryByText(/No hay resultados/)).toBeNull();
  });

  it('si «go» responde tarde, no tapa los resultados de «gonzalez»', async () => {
    let soltarGo;
    get.mockImplementation((url) => {
      if (url.startsWith('/leads?') && url.includes('search=go&')) {
        return new Promise((r) => { soltarGo = () => r({ success: true, data: [{ id: 1, nombre: 'Gorka Viejo', status: 'nuevo' }] }); });
      }
      if (url.startsWith('/leads?') && url.includes('search=gonzalez')) {
        return Promise.resolve({ success: true, data: [{ id: 2, nombre: 'Diana González', status: 'nuevo' }] });
      }
      return Promise.resolve(vacio);
    });
    const input = await abrirYEscribir('go');
    await waitFor(() => expect(soltarGo).toBeTypeOf('function'));
    fireEvent.change(input, { target: { value: 'gonzalez' } });
    expect(await screen.findByText('Diana González')).toBeTruthy();
    await act(async () => { soltarGo(); await new Promise((r) => setTimeout(r, 50)); });
    expect(screen.getByText('Diana González')).toBeTruthy();
    expect(screen.queryByText('Gorka Viejo')).toBeNull();
  });
});
