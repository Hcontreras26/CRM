import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Equipo comercial: lo que la pantalla le enseñaba a una líder y el servidor le
 * niega o le recorta (QA del 09/11/2026, #704).
 *
 * GEMELA de `frontend/src/__smoke__/equipoComercialFugas.test.jsx` de
 * CRM-ISEIE, con los mismos casos:
 *   · `usePermission().llevaEquipo` (aquí sale de `user.lleva_equipo`);
 *   · Facturas: sin Editar, Abono, Venta ni Eliminar para quien lleva equipo
 *     (el servidor responde 403); quien no lo lleva, como siempre;
 *   · Finanzas › Dashboard: sin Egresos, Balance, egresos por categoría ni
 *     botón «Egreso» cuando el servidor dice `solo_administracion`, y la nota;
 *   · los seis desplegables de gestora piden `/users?alcance=comercial`.
 * Y lo que solo hace el 360: la nota de Facturas que explica por qué.
 */

const get = vi.hoisted(() => vi.fn());
const sesion = vi.hoisted(() => ({ user: null as any, permissions: { '*': true } as any }));
const ctx = vi.hoisted(() => ({ value: null as any }));
vi.mock('@/shared/api/client', () => ({ default: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => sesion }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ctx.value }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));
// Lo que no se mira aquí y hace sus propias llamadas.
vi.mock('@/modules/invoices/components/FacturacionAlDiaCard', () => ({ default: () => null }));
vi.mock('@/modules/invoices/components/AvisoHuecosFacturas', () => ({ default: () => null }));
vi.mock('@/modules/ia-dashboard/hooks/useStripeMonitor', () => ({ useStripeMonitor: () => ({ metrics: null }) }));

const { default: usePermission } = await import('@/shared/hooks/usePermission');
const { default: InvoicesPage } = await import('@/modules/invoices/pages/InvoicesPage');
const { default: AccountingDashboardPage } = await import('@/modules/accounting/pages/AccountingDashboardPage');

const esperar = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const LIDER = { id: 5, role: 'admin', lleva_equipo: true };
const ADMIN = { id: 6, role: 'admin', lleva_equipo: false };
const FACTURA = {
  id: 77, tipo: 'normal', estado: 'emitida', codigo: 'A-2026-0077', serie: 'A', numero: 77, ano: 2026,
  cliente_nombre: 'Cliente Uno', cliente_nif: 'X', cliente_direccion: 'Calle', cliente_ciudad: 'Ciudad',
  cliente_cp: '00000', cliente_pais: 'ES', total: 120, base_imponible: 100, fecha_emision: '2026-11-02',
  project_id: 1, conversion_id: 9, moneda: 'EUR', items: [],
};
const DASHBOARD = {
  ingresos: { total_cobrado: 100, total_facturado: 500, total_pendiente: 400, num_pagos: 1, num_conversiones: 1,
    total_emitido: 120, num_facturas: 1, num_proformas: 0, total_proformas: 0 },
  egresos: { total: 0, num_egresos: 0, por_categoria: [] },
  balance: null,
  cuentas_por_cobrar: [],
  cuentas_por_cobrar_resumen: { num: 0, total: 0, num_vencido: 0, total_vencido: 0 },
  trend: { ingresos: [], egresos: [] },
};

let dashboard: any = DASHBOARD;
beforeEach(() => {
  dashboard = DASHBOARD;
  sesion.user = ADMIN;
  ctx.value = {
    activeProject: { id: 1, nombre: 'Campus A', sociedad_emisora_id: 8 },
    activeIssuer: null, activeIssuerId: null,
    projects: [{ id: 1, nombre: 'Campus A', sociedad_emisora_id: 8 }],
    switchProject: vi.fn(), switchIssuer: vi.fn(),
  };
  get.mockReset();
  get.mockImplementation((url: string) => {
    if (url.startsWith('/accounting/dashboard')) return Promise.resolve({ success: true, data: dashboard });
    if (url.startsWith('/invoices/stats')) return Promise.resolve({ success: true, data: { total: 1 } });
    if (/^\/invoices(\?|$)/.test(url)) {
      return Promise.resolve({ success: true, data: [FACTURA], pagination: { total: 1, page: 1, limit: 50, totalPages: 1 } });
    }
    return Promise.resolve({ success: true, data: [] });
  });
});

describe('usePermission().llevaEquipo', () => {
  it('con lleva_equipo, sí; sin equipo o sin el dato, no', () => {
    sesion.user = LIDER;
    expect(renderHook(() => usePermission()).result.current.llevaEquipo).toBe(true);
    sesion.user = ADMIN;
    expect(renderHook(() => usePermission()).result.current.llevaEquipo).toBe(false);
    sesion.user = { id: 7, role: 'gestor' };
    expect(renderHook(() => usePermission()).result.current.llevaEquipo).toBe(false);
  });
});

describe('Facturas: los botones que el servidor le niega a quien lleva equipo', () => {
  const pintar = async () => {
    render(<MemoryRouter><InvoicesPage /></MemoryRouter>);
    await esperar();
    await esperar();
    expect(screen.getByText('Cliente Uno')).toBeTruthy();
  };

  it('admin sin equipo: Editar, Abono, Venta y Eliminar, y sin la nota', async () => {
    await pintar();
    expect(screen.getByTitle('Editar IVA, datos del cliente o concepto')).toBeTruthy();
    expect(screen.getByTitle('Crear factura rectificativa (de abono)')).toBeTruthy();
    expect(screen.getByTitle('Asociar esta factura a una venta del cliente')).toBeTruthy();
    expect(screen.getByTitle('Eliminar la factura y liberar su número (se equivocaron al cargarla)')).toBeTruthy();
    expect(screen.queryByText(/Llevas un equipo comercial/)).toBeNull();
  });

  it('con equipo comercial: ninguno de los cuatro, y la nota que lo explica (solo en el 360)', async () => {
    sesion.user = LIDER;
    await pintar();
    expect(screen.queryByTitle('Editar IVA, datos del cliente o concepto')).toBeNull();
    expect(screen.queryByTitle('Crear factura rectificativa (de abono)')).toBeNull();
    expect(screen.queryByTitle('Asociar esta factura a una venta del cliente')).toBeNull();
    expect(screen.queryByTitle('Eliminar la factura y liberar su número (se equivocaron al cargarla)')).toBeNull();
    expect(screen.getByText(/Llevas un equipo comercial/)).toBeTruthy();
  });
});

describe('Finanzas › Dashboard: egresos y balance, solo para administración sin equipo', () => {
  const pintar = async () => {
    render(<MemoryRouter><AccountingDashboardPage /></MemoryRouter>);
    await esperar();
    await esperar();
    expect(screen.getByText('Ingresos cobrados')).toBeTruthy();
  };

  it('con `solo_administracion`: ni Egresos ni Balance neto ni el botón, y la nota', async () => {
    sesion.user = LIDER;
    dashboard = { ...DASHBOARD, solo_administracion: ['egresos', 'balance'] };
    await pintar();
    expect(screen.getByText(/Egresos y balance: solo para administración sin equipo/)).toBeTruthy();
    expect(screen.queryByText('Balance neto')).toBeNull();
    expect(screen.queryByText('Egresos por categoría')).toBeNull();
    expect(screen.queryByLabelText('Nuevo egreso')).toBeNull();
  });

  it('sin la marca (admin sin equipo): como siempre', async () => {
    dashboard = { ...DASHBOARD, egresos: { total: 50, num_egresos: 1, por_categoria: [] }, balance: 50, solo_administracion: [] };
    await pintar();
    expect(screen.getByText('Balance neto')).toBeTruthy();
    expect(screen.getByText('Egresos por categoría')).toBeTruthy();
    expect(screen.getByLabelText('Nuevo egreso')).toBeTruthy();
    expect(screen.queryByText(/solo para administración sin equipo/)).toBeNull();
  });
});

describe('los desplegables de gestora piden solo el alcance (GET /users?alcance=comercial)', () => {
  // Prospectos (filtro y reasignar en bloque), la ficha (reasignar), Ventas,
  // la Cola, Clientes y la exportación a Wasapi. El servidor recorta; ofrecer
  // una de fuera solo confunde (QA del 09/11/2026).
  const PANTALLAS = [
    'modules/leads/pages/LeadsPage.tsx',
    'modules/leads/pages/LeadDetailPage.tsx',
    'modules/sales/pages/SalesPage.tsx',
    'modules/proceso/pages/ColaDelDiaPage.tsx',
    'modules/clients/pages/ClientsPage.tsx',
    'modules/leads/components/WasapiExportDialog.tsx',
  ];
  it.each(PANTALLAS)('%s', async (ruta) => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const fuente = readFileSync(resolve(process.cwd(), 'src', ruta), 'utf8');
    const llamadas = fuente.match(/client\s*\.get(?:<[^>]*>)?\(\s*[`'"]\/users[^\n]*/g) || [];
    expect(llamadas.length).toBeGreaterThan(0);
    for (const l of llamadas) expect(l).toMatch(/alcance(=|: ')comercial/);
  });
});
