import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * #202 · «Mi factura» con dos meses por subir (Diana, prueba a mano del 12/10): al
 * abrir el de Ictess se perdía lo que ya había puesto en el de CEDIA (el archivo y
 * el número), porque el formulario cerrado se desmontaba.
 */

const { api } = vi.hoisted(() => ({ api: { mias: vi.fn() } }));
vi.mock('@/modules/facturas-colaborador/api/facturasColaborador.api', async (original) => ({
  ...(await original()),
  facturasColaboradorApi: api,
}));

import MiFacturaPage from '@/modules/facturas-colaborador/pages/MiFacturaPage';

const mes = (id, razon_social, extra = {}) => ({
  id, estado: 'abierto', periodo: '2026-09', mes: 'septiembre de 2026', colaborador: 'Laura',
  empresa: { razon_social, nif: null, direccion: null, cp: null, ciudad: null, pais: null, logo_url: null },
  importe_acordado: 600, caduca_at: null, cobro: null, recibida: null, pago: null, enlace: null, ...extra,
});
// La tarjeta de un mes, por su título («Septiembre de 2026 · CEDIA…»).
const tarjeta = (texto) => [...document.querySelectorAll('.bg-card')]
  .find((c) => c.querySelector('p.font-semibold')?.textContent.includes(texto));
const formulario = (texto) => tarjeta(texto).querySelector('form');

describe('«Mi factura» con dos meses por subir', () => {
  beforeEach(() => {
    api.mias.mockResolvedValue({ data: [mes(1, 'CEDIA Investigación y Desarrollo SL'), mes(2, 'Ictess Ingeniería e Innovación SL')] });
  });

  it('abrir otro mes no borra lo que ya estaba puesto en el primero', async () => {
    render(<MemoryRouter><MiFacturaPage /></MemoryRouter>);
    await screen.findAllByText(/Septiembre de 2026 · CEDIA/);
    // Se abre sola la primera; se escribe el número de su factura.
    const numeroCedia = within(formulario('CEDIA')).getByLabelText(/Número de tu factura/);
    fireEvent.change(numeroCedia, { target: { value: 'F-CED-09' } });

    // Se abre la de Ictess: la de CEDIA queda oculta, pero no se desmonta.
    fireEvent.click(within(tarjeta('Ictess')).getByRole('button', { name: 'Subir mi factura' }));
    expect(formulario('CEDIA').parentElement.className).toContain('hidden');
    expect(formulario('Ictess').parentElement.className).not.toContain('hidden');

    // Se vuelve a la de CEDIA: el número sigue ahí.
    fireEvent.click(within(tarjeta('CEDIA')).getByRole('button', { name: 'Subir mi factura' }));
    expect(within(formulario('CEDIA')).getByLabelText(/Número de tu factura/).value).toBe('F-CED-09');
  });

  it('cada formulario tiene sus propios campos: las etiquetas no apuntan al del otro mes', async () => {
    render(<MemoryRouter><MiFacturaPage /></MemoryRouter>);
    await screen.findAllByText(/Septiembre de 2026 · CEDIA/);
    const deCedia = within(formulario('CEDIA')).getByLabelText(/Número de tu factura/);
    const deIctess = within(formulario('Ictess')).getByLabelText(/Número de tu factura/);
    expect(deCedia).not.toBe(deIctess);
    expect(deCedia.id).not.toBe(deIctess.id);
  });
});
