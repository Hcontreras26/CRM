import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * #218, tanda 4 · El Registro con «Todos» o una empresa (Diego, 04/11/2026).
 *
 * La pantalla no mandaba el ámbito de la cabecera: con un campus elegido salía
 * igual todo lo de quien mira. Ahora manda el campus o la empresa (el servidor
 * lo recorta además a los campus de quien mira, #620 y #641), y con varios
 * campus a la vista cada fila dice el suyo.
 */

const ctx = vi.hoisted(() => ({ valor: {} }));
const get = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ctx.valor }));
vi.mock('@/shared/api/client', () => ({
  default: { get },
  API_BASE_URL: '/api',
  getAccessToken: () => null,
}));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { default: RegistroPage } = await import('@/modules/registro/pages/RegistroPage');

const CAMPUS = [{ id: 10, nombre: 'Psiko' }, { id: 20, nombre: 'Fono' }];
const FILAS = [
  { id: 'a', fuente: 'ficha', cuando: '2026-11-04T10:00:00Z', usuario_id: 1, usuario: 'Ana', project_id: 10, accion: 'x', resumen: 'Cambió notas', entidad: null, entidad_id: null, entidad_nombre: null, enlace: null, ok: true, detalle: null },
  { id: 'b', fuente: 'ficha', cuando: '2026-11-04T11:00:00Z', usuario_id: 2, usuario: 'Luis', project_id: 20, accion: 'x', resumen: 'Cambió estado', entidad: null, entidad_id: null, entidad_nombre: null, enlace: null, ok: true, detalle: null },
];

beforeEach(() => {
  get.mockReset();
  get.mockImplementation(async (url) => {
    if (String(url).startsWith('/registro/fuentes')) return { success: true, data: [{ nombre: 'ficha', titulo: 'Fichas', sistema: false, disponible: true }] };
    if (String(url).startsWith('/registro?')) return { success: true, data: { filas: FILAS, sinTabla: [], fallaron: [] } };
    return { success: true, data: [] };
  });
});

const abrir = () => render(<MemoryRouter><RegistroPage /></MemoryRouter>);
const pedido = () => get.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith('/registro?')).pop() || '';

describe('#218 · el Registro y la cabecera', () => {
  it('con «Todos», no manda campus y cada fila dice el suyo', async () => {
    ctx.valor = { activeProject: { id: -1 }, activeIssuerId: null, projects: CAMPUS };
    abrir();
    expect(await screen.findByLabelText('Campus: Psiko')).toBeTruthy();
    expect(screen.getByLabelText('Campus: Fono')).toBeTruthy();
    expect(pedido()).not.toContain('projectId');
    expect(pedido()).not.toContain('issuerId');
  });

  it('con una empresa, manda la empresa', async () => {
    ctx.valor = { activeProject: { id: -1 }, activeIssuerId: 7, projects: CAMPUS };
    abrir();
    await waitFor(() => expect(pedido()).toContain('issuerId=7'));
    expect(get.mock.calls.some(([u]) => String(u).startsWith('/registro/fuentes?issuerId=7'))).toBe(true);
  });

  it('con un campus, manda ese campus y no repite el nombre en cada fila', async () => {
    ctx.valor = { activeProject: { id: 10 }, activeIssuerId: null, projects: CAMPUS };
    abrir();
    await waitFor(() => expect(pedido()).toContain('projectId=10'));
    await screen.findByText('Cambió notas');
    expect(screen.queryByLabelText('Campus: Psiko')).toBeNull();
  });
});
