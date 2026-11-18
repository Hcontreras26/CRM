import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * «Equipo comercial a su cargo» en la ficha de una persona (Carlos, 09/11/2026).
 *
 * Se ve y se guarda con `equipos.gestionar`; sin él, solo se lee, y si la
 * persona no tiene equipo, no sale.
 */


const put = vi.fn(async (_url: string, body: any) => ({
  success: true,
  data: { ...equipo, gestora_ids: body.gestoraIds,
    gestoras: equipo.gestoras.map((g: any) => ({ ...g, en_equipo: body.gestoraIds.includes(g.id) })) },
}));
let equipo: any;
vi.mock('@/shared/api/client', () => ({
  default: {
    get: async () => ({ success: true, data: equipo }),
    put: (url: string, body: any) => put(url, body),
  },
}));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { default: EquipoComercial } = await import('@/modules/users/components/EquipoComercial');

beforeEach(() => {
  put.mockClear();
  equipo = {
    lider_id: 5,
    puede_cambiar: false,
    gestora_ids: [11],
    gestoras: [
      { id: 11, nombre: 'Ana', email: 'ana@x.test', role: 'gestor', active: true, en_equipo: true },
      { id: 12, nombre: 'Bea', email: 'bea@x.test', role: 'gestor', active: true, en_equipo: false },
    ],
  };
});

describe('la sección del equipo comercial', () => {
  it('con «equipos.gestionar»: se ve, se marca y se guarda', async () => {
    equipo.puede_cambiar = true;
    render(<EquipoComercial userId={5} />);
    expect(await screen.findByText('Equipo comercial a su cargo')).toBeTruthy();
    const ana = screen.getByLabelText(/Ana/) as HTMLInputElement;
    const bea = screen.getByLabelText(/Bea/) as HTMLInputElement;
    expect(ana.checked).toBe(true);
    expect(bea.checked).toBe(false);
    const boton = screen.getByRole('button', { name: 'Guardar equipo' }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);           // sin cambios, nada que guardar
    fireEvent.click(bea);
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    await waitFor(() => expect(put).toHaveBeenCalledWith('/users/5/equipo-comercial', { gestoraIds: [11, 12] }));
  });

  it('sin el permiso: solo lectura, con sus gestoras y sin casillas ni botón', async () => {
    render(<EquipoComercial userId={5} />);
    expect(await screen.findByText('Equipo comercial a su cargo')).toBeTruthy();
    expect(screen.getByText('Ana')).toBeTruthy();
    expect(screen.queryByText('Bea')).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Guardar equipo' })).toBeNull();
  });

  it('sin equipo y sin el permiso: no sale', async () => {
    equipo.gestora_ids = [];
    const { container } = render(<EquipoComercial userId={5} />);
    await new Promise((r) => setTimeout(r, 20));
    expect(container.querySelector('[data-testid="equipo-comercial"]')).toBeNull();
  });
});
