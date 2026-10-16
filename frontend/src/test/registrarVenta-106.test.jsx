import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

/*
  «Registrar venta» con las piezas comunes (#106). Diego, en la #134 (21/09):
  «"Registrar venta" no tenía ni Field ni FilaCampos, y en un móvil de 390px
  sus cuatro filas de dos columnas se estrujaban en vez de apilarse: "Por
  defecto: igual al total" salía cortado».
*/

const avisos = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: avisos.toast }));
vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: () => true }) }));
vi.mock('@/shared/hooks/useAmbito', () => ({
  useProyectosDelAmbito: () => [{ id: 1, nombre: 'Psiko' }, { id: 2, nombre: 'ISEIH' }],
}));
vi.mock('@/modules/invoices/api/invoices.api', () => ({
  invoicesApi: { getConfig: vi.fn().mockResolvedValue({ success: true, data: {} }) },
}));
vi.mock('@/shared/api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ success: true, data: [] }),
    post: vi.fn().mockResolvedValue({ success: true, data: {} }),
  },
}));
vi.mock('@/shared/components/ui/portal', () => ({ default: ({ children }) => children }));

import RegisterSaleDialog from '@/modules/sales/components/RegisterSaleDialog';

const abrir = async (props = {}) => {
  const r = render(<RegisterSaleDialog open onClose={vi.fn()} project={{ id: 1, nombre: 'Psiko' }} {...props} />);
  await act(async () => { await Promise.resolve(); });
  return r;
};

describe('Registrar venta (#106, #134)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('no queda ningún desplegable del navegador: campus, producto y método son los del CRM', async () => {
    const { container } = await abrir({ project: null });
    expect(container.querySelector('select')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Campus de la venta' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Producto' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Método de pago' })).toBeInTheDocument();
  });

  it('«Por defecto: igual al total» ya no va dentro del campo, cortado: va debajo', async () => {
    const { container } = await abrir();
    expect(container.querySelector('input[placeholder^="Por defecto"]')).toBeNull();
    expect(screen.getByText(/Si lo dejas vacío, se toma el total/)).toBeInTheDocument();
  });

  it('los campos usan el Field compartido: el obligatorio se anuncia como tal', async () => {
    await abrir({ modoInicial: 'new' });
    expect(screen.getAllByText('(obligatorio)').length).toBeGreaterThanOrEqual(4);
  });

  it('cada aviso dice qué falta y dónde ponerlo', async () => {
    await abrir({ modoInicial: 'new' });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar venta' }));
    expect(avisos.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Falta el nombre del cliente',
      description: expect.stringMatching(/Nombre del cliente/),
    }));
  });
});
