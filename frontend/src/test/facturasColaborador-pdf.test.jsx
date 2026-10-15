import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * #202 · cuadra si el total del PDF es lo escrito (corrección de Diego del 13/10:
 * «el monto es que coincida el PDF y lo que se escribió de factura ahí»). Si el PDF
 * no se pudo leer, es «PDF sin leer», que no es «No cuadra».
 */

const { api } = vi.hoisted(() => ({ api: { mias: vi.fn() } }));
vi.mock('@/modules/facturas-colaborador/api/facturasColaborador.api', async (original) => ({
  ...(await original()),
  facturasColaboradorApi: api,
}));

import { avisoDelPdf } from '@/modules/facturas-colaborador/api/facturasColaborador.api';
import SubirFactura from '@/modules/facturas-colaborador/components/SubirFactura';
import EtiquetaDelPdf from '@/modules/facturas-colaborador/components/EtiquetaDelPdf';
import { RegistroDialog } from '@/modules/facturas-colaborador/components/DialogosFacturas';
import MiFacturaPage from '@/modules/facturas-colaborador/pages/MiFacturaPage';

const NO_CUADRA = 'El PDF dice 650,00 € y has escrito 636,00 €. La hemos recibido igual; si te equivocaste, avisa a administración.';
const SIN_LEER = 'No hemos podido leer el importe del PDF; lo revisará administración.';

const recibida = (extra) => ({
  subida_at: '2026-10-12T15:29:00Z', numero_recepcion: 'REC-2026-09-0001', importe: 636, numero_factura: 'F-1',
  archivo: 'f.pdf', total: 636, importe_pdf: 636, cuadra: true, es_pdf: true, ...extra,
});
const factura = (extra) => ({
  id: 1, estado: 'recibida', periodo: '2026-09', mes: 'septiembre de 2026', colaborador: 'Laura',
  empresa: { razon_social: 'CEDIA Investigación y Desarrollo SL', nif: 'B1', direccion: null, cp: null, ciudad: null, pais: null, logo_url: null },
  importe_acordado: 600, caduca_at: null, cobro: null, recibida: recibida(), pago: null, enlace: null, ...extra,
});

describe('el aviso al colaborador', () => {
  it('cuadra: nada; no cuadra: qué dice el PDF y qué escribió; sin leer: que lo revisará administración', () => {
    expect(avisoDelPdf(recibida())).toBeNull();
    expect(avisoDelPdf(recibida({ importe_pdf: 650, cuadra: false }))).toBe(NO_CUADRA);
    expect(avisoDelPdf(recibida({ importe_pdf: null, cuadra: null }))).toBe(SIN_LEER);
    expect(avisoDelPdf(recibida({ importe_pdf: null, cuadra: null, es_pdf: false }))).toMatch(/de la foto/);
    // Una subida de antes del 13/10 (se comparaba con el desglose): ya no se dice nada.
    expect(avisoDelPdf(recibida({ importe_pdf: null, cuadra: false }))).toBeNull();
  });

  it('por el enlace, tras subirla: el aviso si no cuadra', () => {
    render(<SubirFactura factura={factura({ recibida: recibida({ importe_pdf: 650, cuadra: false }) })} alSubir={vi.fn()} />);
    expect(screen.getByText(/Factura recibida/)).toBeTruthy();
    expect(screen.getByText(NO_CUADRA)).toBeTruthy();
  });

  it('por el enlace, tras subirla: si no se pudo leer, lo dice (y no dice «no cuadra»)', () => {
    render(<SubirFactura factura={factura({ recibida: recibida({ importe_pdf: null, cuadra: null }) })} alSubir={vi.fn()} />);
    expect(screen.getByText(SIN_LEER)).toBeTruthy();
    expect(screen.queryByText(/no cuadra/i)).toBeNull();
  });

  it('por el enlace, tras subirla: si cuadra, nada especial', () => {
    render(<SubirFactura factura={factura()} alSubir={vi.fn()} />);
    expect(screen.getByText(/Factura recibida/)).toBeTruthy();
    expect(screen.queryByText(/El PDF dice/)).toBeNull();
    expect(screen.queryByText(/No hemos podido leer/)).toBeNull();
  });

  it('en «Mi factura», debajo del mes ya recibido', async () => {
    api.mias.mockResolvedValue({ data: [factura({ recibida: recibida({ importe_pdf: 650, cuadra: false }) })] });
    render(<MemoryRouter><MiFacturaPage /></MemoryRouter>);
    expect(await screen.findByText(NO_CUADRA)).toBeTruthy();
  });
});

describe('administración: la etiqueta de la lista', () => {
  const fila = (extra) => ({
    estado: 'recibida', subida_at: '2026-10-12T15:29:00Z', cuadra: true, importe_pdf: '636.00', importe: '636.00',
    total: '636.00', mime: 'application/pdf', ...extra,
  });

  it('«No cuadra», con lo que dice el PDF y lo escrito', () => {
    render(<EtiquetaDelPdf f={fila({ cuadra: false, importe_pdf: '650.00' })} />);
    expect(screen.getByText('No cuadra').getAttribute('title')).toBe('PDF: 650,00 € · escrito: 636,00 €');
  });

  it('«PDF sin leer», neutra, si no se pudo leer; no es «No cuadra»', () => {
    render(<EtiquetaDelPdf f={fila({ cuadra: null, importe_pdf: null })} />);
    const etiqueta = screen.getByText('PDF sin leer');
    expect(etiqueta.className).toContain('bg-muted');
    expect(screen.queryByText('No cuadra')).toBeNull();
  });

  it('si cuadra, sin recibir o anulada: nada', () => {
    const { container, rerender } = render(<EtiquetaDelPdf f={fila()} />);
    expect(container.textContent).toBe('');
    rerender(<EtiquetaDelPdf f={fila({ subida_at: null, cuadra: null, importe_pdf: null })} />);
    expect(container.textContent).toBe('');
    rerender(<EtiquetaDelPdf f={fila({ estado: 'anulada', cuadra: false })} />);
    expect(container.textContent).toBe('');
  });
});

describe('administración: el detalle y el registro', () => {
  const linea = (detalle) => ({ id: 1, evento: 'recibida', creado_at: '2026-10-12T15:29:00Z', ip: null, usuario_nombre: null, detalle });

  it('en el detalle, los dos importes (también sin desglose)', async () => {
    const desglose = { importe: 636, base: null, iva: null, irpf: null, total: null, horas: null, importe_pdf: 650, cuadra: false, es_pdf: true, lineas: [] };
    render(<RegistroDialog titulo="Registro" cargar={async () => []} cargarDesglose={async () => desglose} alCerrar={() => {}} />);
    expect(await screen.findByText('Escrito por el colaborador')).toBeTruthy();
    expect(screen.getByText('636,00 €')).toBeTruthy();
    expect(screen.getByText('Lo que pone el PDF')).toBeTruthy();
    expect(screen.getByText('650,00 €')).toBeTruthy();
    expect(screen.getByText('No cuadra')).toBeTruthy();
  });

  it('en el detalle, si no se pudo leer: «PDF sin leer»', async () => {
    const desglose = { importe: 636, base: null, iva: null, irpf: null, total: null, horas: null, importe_pdf: null, cuadra: null, es_pdf: true, lineas: [] };
    render(<RegistroDialog titulo="Registro" cargar={async () => []} cargarDesglose={async () => desglose} alCerrar={() => {}} />);
    expect(await screen.findByText('PDF sin leer')).toBeTruthy();
    expect(screen.getByText('no se pudo leer')).toBeTruthy();
  });

  it('el registro de la subida apunta lo leído del PDF, o que no se pudo leer', async () => {
    const { unmount } = render(<RegistroDialog titulo="Registro" alCerrar={() => {}}
      cargar={async () => [linea({ archivo: 'f.pdf', importe: 636, importe_pdf: 650, cuadra: false })]} />);
    expect(await screen.findByText(/f\.pdf · 636,00 € · PDF: 650,00 €, no cuadra/)).toBeTruthy();
    unmount();
    render(<RegistroDialog titulo="Registro" alCerrar={() => {}}
      cargar={async () => [linea({ archivo: 'f.pdf', importe: 636, importe_pdf: null, cuadra: null })]} />);
    expect(await screen.findByText(/f\.pdf · 636,00 € · PDF sin leer/)).toBeTruthy();
  });
});
