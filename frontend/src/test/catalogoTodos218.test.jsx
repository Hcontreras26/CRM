import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * #218, tanda 4 · El catálogo con «Todos» o una empresa (Diego, 04/11/2026):
 * todos los campus juntos, cada producto con su campus; el Árbol de categorías
 * y WooCommerce, el de cada campus solo para ver. Crear, sincronizar o
 * configurar sigue siendo de UN campus.
 */

const ctx = vi.hoisted(() => ({ valor: {} }));
const get = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ctx.valor }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, role: 'superadmin', roles_extra: [] }, permissions: {} }),
}));
vi.mock('@/shared/api/client', () => ({ default: { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { default: ProductsPage } = await import('@/modules/products/pages/ProductsPage');
const { default: ProductsTreePage } = await import('@/modules/products/pages/ProductsTreePage');
const { default: CategoriesTreePage } = await import('@/modules/product-categories/pages/CategoriesTreePage');
const { default: WooCommercePage } = await import('@/modules/woocommerce/pages/WooCommercePage');

const PRODUCTOS = [
  { id: 1, project_id: 10, proyecto_nombre: 'Psiko', nombre: 'Curso de Psiko', active: true, categoria_id: null },
  { id: 2, project_id: 20, proyecto_nombre: 'Fono', nombre: 'Curso de Fono', active: true, categoria_id: null },
];
const ARBOLES = [
  { id: 10, nombre: 'Psiko', arbol: [{ id: 100, parent_id: null, nombre: 'Psicología', children: [], productos_count: 1 }] },
  { id: 20, nombre: 'Fono', arbol: [] },
];
const WOO = [
  { id: 10, nombre: 'Psiko', conectado: true, activo: true, ultima_estado: 'success', ultima_fin: '2026-11-01T10:00:00Z', total_fetched: 12, total_created: 2, total_updated: 10 },
  { id: 20, nombre: 'Fono', conectado: false, activo: false, ultima_estado: null },
];

const switchProject = vi.fn();
const todos = () => { ctx.valor = { activeProject: { id: -1, nombre: 'Todos' }, isAllProjects: true, activeIssuerId: null, switchProject }; };
const abrir = (el) => render(<MemoryRouter>{el}</MemoryRouter>);

beforeEach(() => {
  get.mockReset(); switchProject.mockReset();
  get.mockImplementation(async (url) => {
    if (url === '/products/ambito') return { success: true, data: PRODUCTOS };
    if (url === '/product-categories/ambito') return { success: true, data: ARBOLES };
    if (url === '/woocommerce/estado') return { success: true, data: WOO };
    if (String(url).startsWith('/products?projectId=10')) return { success: true, data: [PRODUCTOS[0]] };
    return { success: true, data: [] };
  });
});

describe('#218 · Productos con «Todos»', () => {
  it('el catálogo de todos los campus, cada producto con su campus', async () => {
    todos();
    abrir(<ProductsPage />);
    expect(await screen.findByText('Curso de Psiko')).toBeTruthy();
    expect(screen.getByText('Curso de Fono')).toBeTruthy();
    expect(screen.getByLabelText('Campus: Psiko')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/products/ambito', { params: { includeInactive: 'true' } });
  });

  it('se filtra por campus, y crear o sincronizar no se ofrecen', async () => {
    todos();
    abrir(<ProductsPage />);
    await screen.findByText('Curso de Psiko');
    const lista = screen.getByRole('list', { name: 'Filtrar por campus' });
    fireEvent.click(within(lista).getByText('Fono'));
    expect(screen.queryByText('Curso de Psiko')).toBeNull();
    expect(screen.getByText('Curso de Fono')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nuevo producto' })).toBeNull();
    expect(screen.queryByText('Sincronizar WC')).toBeNull();
    // Y no pregunta por la sincronización de un campus que no hay.
    expect(get.mock.calls.some(([u]) => String(u).includes('/woocommerce/runs/current'))).toBe(false);
  });

  it('con una empresa arriba, pide los campus de esa empresa', async () => {
    ctx.valor = { activeProject: { id: -1 }, isAllProjects: true, activeIssuerId: 7, switchProject };
    abrir(<ProductsPage />);
    await screen.findByText('Curso de Psiko');
    expect(get).toHaveBeenCalledWith('/products/ambito', { params: { issuerId: 7, includeInactive: 'true' } });
  });
});

describe('#218 · Productos por categoría con «Todos»', () => {
  it('el árbol de cada campus; al elegir una categoría, los productos de ese campus', async () => {
    todos();
    abrir(<ProductsTreePage />);
    expect(await screen.findByRole('button', { name: 'Productos de Psiko' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Productos de Fono' })).toBeTruthy();
    await screen.findByText('Curso de Fono');
    expect(screen.getByRole('columnheader', { name: 'Campus' })).toBeTruthy();
    fireEvent.click(screen.getByText('Psicología'));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/products?projectId=10&categoryId=100'));
  });
});

describe('#218 · Árbol de categorías con «Todos»', () => {
  it('el de cada campus, solo para ver, y «Entrar» elige el campus', async () => {
    todos();
    abrir(<CategoriesTreePage />);
    const psiko = await screen.findByRole('region', { name: 'Categorías de Psiko' });
    expect(within(psiko).getByText('Psicología')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Categorías de Fono' }).textContent).toContain('Sin categorías');
    expect(screen.queryByText('Sincronizar WC')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Entrar en Fono/ }));
    expect(switchProject).toHaveBeenCalledWith(20);
  });
});

describe('#218 · WooCommerce con «Todos»', () => {
  it('la tienda de cada campus, sin el formulario de credenciales', async () => {
    todos();
    abrir(<WooCommercePage />);
    const tabla = await screen.findByRole('table', { name: 'WooCommerce de cada campus' });
    const filas = within(tabla).getAllByRole('row');
    expect(filas[1].textContent).toContain('Conectada');
    expect(filas[1].textContent).toContain('12 productos');
    expect(filas[2].textContent).toContain('Sin conectar');
    expect(screen.queryByPlaceholderText('https://tu-tienda.com')).toBeNull();
    expect(get.mock.calls.some(([u]) => String(u).includes('/woocommerce/credentials'))).toBe(false);
  });
});
