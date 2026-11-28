// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

/*
  CRM#1034 · Eliminar una factura emitida por error: con su motivo, y solo si
  no se ha enviado, no tiene cobro y es la última de su serie. Si no, el
  diálogo explica que hay que anularla y lleva a «Anular».
*/

const post = vi.fn();
vi.mock('@/shared/api/client', () => ({ default: { post: (...a: unknown[]) => post(...a) } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { default: EliminarPorErrorDialog, porQueNoSeElimina } = await import('./EliminarPorErrorDialog');

const FACTURA = {
  id: 9, codigo: 'CEDIA-2026/0005', ano: 2026, numero: 5, fecha_emision: '2026-11-24', fecha_pago: null,
  cliente_nombre: 'Ana', cliente_nif: 'X', cliente_email: null, total: 121, iva_pct: 21,
  estado: 'emitida' as const, sent_at: null, tipo: 'normal' as const, anulada_at: null,
};

beforeEach(() => { post.mockReset(); });
afterEach(() => { cleanup(); });

describe('#1034 · lo que la pantalla ya sabe', () => {
  it('sin enviar ni cobrar: nada que objetar (lo de la serie lo dice el servidor)', () => {
    expect(porQueNoSeElimina(FACTURA)).toBeNull();
  });
  it('enviada, cobrada, anulada o abono: no', () => {
    expect(porQueNoSeElimina({ ...FACTURA, sent_at: '2026-11-24' })).toMatch(/envió/);
    expect(porQueNoSeElimina({ ...FACTURA, estado: 'pagada' })).toMatch(/cobro/);
    expect(porQueNoSeElimina({ ...FACTURA, fecha_pago: '2026-11-24' })).toMatch(/cobro/);
    expect(porQueNoSeElimina({ ...FACTURA, anulada_at: '2026-11-24' })).toMatch(/anulada/);
    expect(porQueNoSeElimina({ ...FACTURA, tipo: 'rectificativa' })).toMatch(/abono/);
  });
});

describe('#1034 · el diálogo', () => {
  it('sin motivo no deja eliminar; con motivo llama a la ruta y avisa', async () => {
    post.mockResolvedValue({ success: true, data: { id: 9, codigo: FACTURA.codigo } });
    const onEliminada = vi.fn();
    render(<EliminarPorErrorDialog invoice={FACTURA} onClose={vi.fn()} onEliminada={onEliminada} />);
    const boton = screen.getByRole('button', { name: /Eliminar/ }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Duplicada' } });
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    await waitFor(() => expect(onEliminada).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith('/invoices/9/eliminar-por-error', { motivo: 'Duplicada' });
  });

  it('si el servidor dice que no es la última: lo explica y ofrece anularla', async () => {
    post.mockRejectedValue({ status: 409, data: { code: 'NO_SE_PUEDE_ELIMINAR', error: 'No es la última de su serie. Anúlala.' } });
    const onAnular = vi.fn();
    render(<EliminarPorErrorDialog invoice={FACTURA} onClose={vi.fn()} onEliminada={vi.fn()} onAnular={onAnular} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Duplicada' } });
    fireEvent.click(screen.getByRole('button', { name: /Eliminar/ }));
    expect(await screen.findByText(/No es la última de su serie/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Anularla/ }));
    expect(onAnular).toHaveBeenCalled();
  });

  it('enviada: ni siquiera pide el motivo, explica y lleva a anular', () => {
    render(<EliminarPorErrorDialog invoice={{ ...FACTURA, sent_at: '2026-11-24', estado: 'enviada' }}
      onClose={vi.fn()} onEliminada={vi.fn()} onAnular={vi.fn()} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('alert').textContent).toMatch(/envió/);
    expect(screen.getByRole('button', { name: /Anularla/ })).toBeTruthy();
  });
});
