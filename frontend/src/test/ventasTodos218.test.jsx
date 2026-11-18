import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/*
  #218 · Ventas con «Todos» o con una empresa, comprobado en /testeo el 05/11.

  1. Con «Todos», las cinco tarjetas de arriba (Ventas, Vendido, Cobrado,
     Pendiente, Cuotas) se quedaban en gris para siempre: `ResumenVentas` se
     salía sin pedir nada cuando no había ni campus ni empresa. El servidor ya
     recorta a lo de quien pregunta, como «Productos vendidos».
  2. Con una empresa arriba, el título decía «Ventas · Todos los proyectos»
     aunque las cifras eran solo de esa empresa.
  3. Con una empresa o «Todos» no había atajos de fecha: las cifras se
     quedaban fijas en el año en curso.
*/

const get = vi.hoisted(() => vi.fn());
const ctx = vi.hoisted(() => ({ value: null }));
vi.mock('@/shared/api/client', () => ({ default: { get, post: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'admin' } }) }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ctx.value }));
vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: () => true }) }));

const { default: ResumenVentas } = await import('@/modules/sales/components/ResumenVentas');
const { default: SalesPage } = await import('@/modules/sales/pages/SalesPage');

const RESUMEN = {
  ventas: 272, clientes: 250, vendido: 118899.67, ticket_medio: 437, cobrado: 100000,
  cobrado_venta: 90000, cobrado_cuotas: 10000, pendiente: 18899.67, con_saldo: 3,
  cuotas_pagadas: 6, cuotas_total: 8, cuotas_vencidas: 2,
};

const esperar = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const contexto = (issuer) => ({
  activeProject: { id: -1, nombre: 'Todos los proyectos' },
  activeIssuer: issuer, activeIssuerId: issuer ? issuer.id : null,
  projects: [{ id: 1, nombre: 'ISEIH', sociedad_emisora_id: 8 }, { id: 2, nombre: 'ICTESS', sociedad_emisora_id: 9 }],
  switchProject: vi.fn(), switchIssuer: vi.fn(),
});

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((url) => Promise.resolve(
    url.startsWith('/ventas/resumen') ? { success: true, data: RESUMEN } : { success: true, data: [] },
  ));
});

describe('Ventas con «Todos» (#218)', () => {
  it('las tarjetas piden sus cifras aunque no haya campus ni empresa', async () => {
    render(<ResumenVentas projectId={null} issuerId={null} from="2026-01-01" to="2026-11-05" />);
    await esperar();
    const llamada = get.mock.calls.map(([u]) => u).find((u) => u.startsWith('/ventas/resumen'));
    expect(llamada).toBeTruthy();
    // Ni campus ni empresa: el servidor recorta a lo de quien pregunta.
    expect(llamada).not.toMatch(/projectId|issuerId/);
    expect(llamada).toMatch(/from=2026-01-01/);
    expect(screen.getByText('272')).toBeInTheDocument();
  });

  it('con «Todos», el título lo dice y hay atajos de fecha', async () => {
    ctx.value = contexto(null);
    render(<MemoryRouter><SalesPage /></MemoryRouter>);
    await esperar();
    expect(screen.getByText('Ventas · Todos los proyectos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hoy' })).toBeInTheDocument();
  });

  it('con una empresa, el título dice la empresa, no «Todos los proyectos»', async () => {
    ctx.value = contexto({ id: 8, nombre: 'CEDIA Investigación y Desarrollo SL', campus: [{ id: 1 }] });
    render(<MemoryRouter><SalesPage /></MemoryRouter>);
    await esperar();
    expect(screen.getByText('Ventas · CEDIA Investigación y Desarrollo SL')).toBeInTheDocument();
    expect(screen.queryByText('Ventas · Todos los proyectos')).toBeNull();
    expect(screen.getByRole('button', { name: 'Hoy' })).toBeInTheDocument();
    // Las cifras van con su empresa.
    expect(get.mock.calls.map(([u]) => u).some((u) => u.startsWith('/ventas/resumen') && u.includes('issuerId=8'))).toBe(true);
  });
});
