import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * #223 · Una venta con varios cursos los enseña en una lista, con su cantidad,
 * en vez del «1x A + 2x B» que se guardaba en el nombre (Diego, 04/11/2026).
 */

const venta = vi.hoisted(() => ({ actual: null }));
vi.mock('@/shared/api/client', () => ({
  default: { get: vi.fn(async () => ({ success: true, data: venta.actual })) },
}));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));
vi.mock('@/modules/sales/components/RepartoVentaCard', () => ({ default: () => null }));

const { default: SaleDetailPage } = await import('@/modules/sales/pages/SaleDetailPage');

const base = {
  id: 7, lead_id: 3, importe_total: 300, importe_pagado: 0, importe_pendiente: 300,
  fecha_conversion: '2026-02-10', fecha_compromiso_pago: null, metodo_pago: 'tarjeta',
  notas_pago: null, lead_nombre: 'Ana', lead_email: 'ana@test.com', proyecto_nombre: 'Campus',
  payments: [], installments: [],
};

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/finanzas/ventas/7']}>
      <Routes><Route path="/finanzas/ventas/:id" element={<SaleDetailPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('#223 · los cursos de la venta', () => {
  it('con varias líneas, la lista de cursos con su cantidad', async () => {
    venta.actual = {
      ...base, producto_contratado: 'Curso A + Curso B',
      items: [
        { id: 1, descripcion: 'Curso A', cantidad: 1, precio_unitario: 100 },
        { id: 2, descripcion: 'Curso B', cantidad: 2, precio_unitario: 100 },
      ],
    };
    abrir();
    const lista = await screen.findByRole('list', { name: 'Cursos de la venta' });
    const filas = within(lista).getAllByRole('listitem');
    expect(filas).toHaveLength(2);
    expect(filas[0].textContent).toContain('Curso A');
    expect(filas[0].textContent).not.toContain('×');
    expect(filas[1].textContent).toContain('Curso B');
    expect(filas[1].textContent).toContain('2 ×');
    expect(screen.queryByText(/\dx /)).toBeNull();
  });

  it('con una sola línea, no hace falta lista: el nombre ya lo dice', async () => {
    venta.actual = {
      ...base, producto_contratado: 'Curso A',
      items: [{ id: 1, descripcion: 'Curso A', cantidad: 1, precio_unitario: 300 }],
    };
    abrir();
    await screen.findByText('Datos de la venta');
    expect(screen.queryByRole('list', { name: 'Cursos de la venta' })).toBeNull();
  });
});
