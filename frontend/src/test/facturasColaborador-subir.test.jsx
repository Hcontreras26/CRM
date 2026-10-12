import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SubirFactura from '@/modules/facturas-colaborador/components/SubirFactura';

/**
 * #202, segunda parte · lo acordado y el desglose. Lo acordado es la base: en el
 * ejemplo de Diego, 600 acordados con 21 % de IVA y 15 % de IRPF son 636 de total.
 * Antes el importe venía con 600 y se comparaba con los dos: avisaba siempre,
 * aunque la factura estuviera bien.
 */

const factura = (extra) => ({
  estado: 'abierto', periodo: '2026-09', mes: 'septiembre de 2026', colaborador: 'Laura',
  empresa: { razon_social: 'CEDIA Investigación y Desarrollo SL', nif: 'B1', direccion: null, cp: null, ciudad: null, pais: null, logo_url: null },
  importe_acordado: 600, caduca_at: null, recibida: null, pago: null, ...extra,
});
const cobro = (extra) => ({ iva_pct: 21, irpf_pct: 15, importe_fijo: null, tarifa_hora: null, concepto: 'Servicios de SEO · septiembre 2026', ...extra });
const abrir = (f) => render(<SubirFactura factura={f} alSubir={vi.fn()} />);
const importe = () => screen.getByLabelText(/Importe de tu factura/);

describe('subir la factura · lo acordado y el desglose', () => {
  it('fijo 600 con IVA e IRPF: viene con el total (636,00) y sin ningún aviso', () => {
    abrir(factura({ cobro: cobro({ modalidad: 'fijo', importe_fijo: 600 }) }));
    expect(importe().value).toBe('636,00');
    expect(screen.queryByText(/no coincide con lo acordado/)).toBeNull();
    expect(screen.queryByText(/no cuadra/)).toBeNull();
  });

  it('por hora: el importe sigue a las horas; si la base no es lo acordado, se hace notar', () => {
    abrir(factura({ importe_acordado: 250, cobro: cobro({ modalidad: 'hora', tarifa_hora: 21.7 }) }));
    fireEvent.change(screen.getByLabelText('Horas del mes'), { target: { value: '5' } });
    expect(importe().value).toBe('115,01');
    expect(screen.getByText(/La base de tu desglose \(108,50 €\) no coincide con lo acordado \(250,00 €\)/)).toBeTruthy();
    expect(screen.queryByText(/no cuadra/)).toBeNull();
  });

  it('si lo cambia a mano, se queda lo suyo y se avisa de que no cuadra', () => {
    abrir(factura({ cobro: cobro({ modalidad: 'fijo', importe_fijo: 600 }) }));
    fireEvent.change(importe(), { target: { value: '600' } });
    expect(importe().value).toBe('600');
    expect(screen.getByText(/no cuadra con el desglose \(636,00 €\)/)).toBeTruthy();
  });

  it('con desglose y sin horas todavía: no dice «ya puesto», y el ejemplo no parece lo acordado', () => {
    // Prueba a mano del 12/10: salía un «600,00» gris (a Pedro le acordaron 300) y «Ya puesto el total…» sin total.
    abrir(factura({ importe_acordado: 300, cobro: cobro({ modalidad: 'hora', tarifa_hora: 22 }) }));
    expect(importe().value).toBe('');
    expect(importe().placeholder).toBe('0,00');
    expect(screen.getByText('Se rellena solo con el total de tu desglose')).toBeTruthy();
    expect(screen.queryByText(/Ya puesto/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Horas del mes'), { target: { value: '18' } });
    expect(importe().value).toBe('419,76');
    expect(screen.getByText(/Ya puesto el total de tu desglose/)).toBeTruthy();
  });

  it('sin desglose, como en la primera parte: con lo acordado ya puesto', () => {
    abrir(factura({ cobro: null }));
    expect(importe().value).toBe('600');
    fireEvent.change(importe(), { target: { value: '650' } });
    expect(screen.getByText(/El importe no coincide con lo acordado \(600,00 €\)/)).toBeTruthy();
  });
});
