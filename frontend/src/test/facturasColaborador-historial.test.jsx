import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RegistroDialog } from '@/modules/facturas-colaborador/components/DialogosFacturas';

/**
 * #202 · el historial de la ficha dice «qué se ha cambiado» (definición del 01/10).
 * Con la segunda parte, un cambio de cómo cobra salía «#1 600,00 € → #1 600,00 €»,
 * como si no hubiera pasado nada (lo vio Diana en la prueba a mano del 12/10).
 */

const EMPRESAS = [
  { id: 1, razon_social: 'CEDIA Investigación y Desarrollo SL' },
  { id: 2, razon_social: 'Ictess Ingeniería e Innovación SL' },
  { id: 3, razon_social: 'Lateral Thinking Solutions SL' },
];
const sinCobro = { modalidad: null, importe_fijo: null, tarifa_hora: null, iva_pct: null, irpf_pct: null };
const linea = (detalle) => ({ id: 1, evento: 'cambio', creado_at: '2026-10-12T11:47:00Z', usuario_nombre: 'Manuel Casas', ip: null, detalle });
const abrir = async (detalle) => {
  render(<RegistroDialog titulo="Historial · Laura" cargar={async () => [linea(detalle)]} empresas={EMPRESAS} alCerrar={() => {}} />);
  return (await screen.findByText('Cambio en la ficha')).parentElement.textContent;
};

describe('el historial de la ficha', () => {
  it('enseña cómo cobra antes y después, con el nombre de la empresa', async () => {
    const texto = await abrir({
      empresas: {
        antes: [{ issuer_id: 1, importe_acordado: 600, ...sinCobro }, { issuer_id: 2, importe_acordado: 250, ...sinCobro }],
        despues: [
          { issuer_id: 1, importe_acordado: 600, modalidad: 'fijo', importe_fijo: 600, tarifa_hora: null, iva_pct: 21, irpf_pct: 15 },
          { issuer_id: 2, importe_acordado: 250, modalidad: 'proyecto', importe_fijo: null, tarifa_hora: 30, iva_pct: 21, irpf_pct: 15 },
        ],
      },
    });
    expect(texto).toContain('CEDIA: 600,00 € acordados, sin cómo cobra → 600,00 € acordados, Fijo 600,00 € · IVA 21 % · IRPF 15 %');
    expect(texto).toContain('Ictess: 250,00 € acordados, sin cómo cobra → 250,00 € acordados, Por proyecto a 30,00 €/h · IVA 21 % · IRPF 15 %');
    expect(texto).not.toContain('#1');
    expect(texto).toContain('por Manuel Casas');
  });

  it('solo las empresas que cambian; y las que se añaden o se quitan, por su nombre', async () => {
    const igual = { issuer_id: 1, importe_acordado: 600, ...sinCobro };
    const texto = await abrir({
      nif: { antes: null, despues: '12345678Z' },
      empresas: { antes: [igual, { issuer_id: 2, importe_acordado: 250, ...sinCobro }], despues: [igual, { issuer_id: 3, importe_acordado: null, ...sinCobro }] },
    });
    expect(texto).toContain('NIF: — → 12345678Z');
    expect(texto).toContain('añade Lateral (sin acordado, sin cómo cobra)');
    expect(texto).toContain('quita Ictess');
    expect(texto).not.toContain('CEDIA');
  });
});

describe('el registro de un pago de varias a la vez', () => {
  const pagada = (junto_con) => ({
    id: 1, evento: 'pagada', creado_at: '2026-10-12T12:48:00Z', usuario_nombre: 'Manuel Casas', ip: null,
    detalle: { importe: 400, fecha: '2026-10-12', forma_pago: 'transferencia', junto_con },
  });
  const abrirPago = async (junto_con) => {
    render(<RegistroDialog titulo="Registro" cargar={async () => [pagada(junto_con)]} alCerrar={() => {}} />);
    return (await screen.findByText('Factura pagada')).parentElement.textContent;
  };

  it('dice «junto con otra», no «junto con otras 1»', async () => {
    const texto = await abrirPago(2);
    expect(texto).toContain('junto con otra ·');
    expect(texto).not.toContain('otras 1');
  });

  it('y con más, «junto con otras 2»', async () => {
    expect(await abrirPago(3)).toContain('junto con otras 2');
  });
});
