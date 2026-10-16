import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * #202 · la ficha del colaborador (prueba a mano del 12/10): lo acordado de Laura se
 * vació «solo». El nombre de la empresa es la etiqueta de su casilla: un doble clic en
 * él la desmarcaba y la volvía a marcar, y volvía en blanco (lo acordado y cómo cobra).
 */

vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn().mockResolvedValue({ data: [] }) } }));

import { ColaboradorDialog } from '@/modules/facturas-colaborador/components/DialogosFacturas';

const EMPRESAS = [
  { id: 1, razon_social: 'CEDIA Investigación y Desarrollo SL' },
  { id: 2, razon_social: 'Ictess Ingeniería e Innovación SL' },
];
const LAURA = {
  id: 7, nombre: 'Laura Prueba', email: 'laura@prueba.local', nif: null, area: 'seo', notas: null, alta_desde: null, user_id: null,
  empresas: [
    { issuer_id: 1, razon_social: EMPRESAS[0].razon_social, importe_acordado: 600, modalidad: 'fijo', importe_fijo: 600, tarifa_hora: null, iva_pct: 21, irpf_pct: 15 },
    { issuer_id: 2, razon_social: EMPRESAS[1].razon_social, importe_acordado: 250, modalidad: null, importe_fijo: null, tarifa_hora: null, iva_pct: null, irpf_pct: null },
  ],
};
const abrir = () => render(<ColaboradorDialog colaborador={LAURA} empresas={EMPRESAS} alCerrar={() => {}} alGuardar={() => {}} />);

describe('la ficha del colaborador', () => {
  it('lo acordado lleva su título al lado, y sin valor dice «Opcional» (no una cifra)', () => {
    abrir();
    expect(screen.getAllByText('Acordado €/mes')).toHaveLength(2);
    const ictess = screen.getByLabelText(`Importe acordado con ${EMPRESAS[1].razon_social}`);
    expect(ictess.value).toBe('250');
    expect(ictess.placeholder).toBe('Opcional');
  });

  it('las casillas de importes y porcentajes no las rellena el navegador por su cuenta', () => {
    // Prueba a mano del 12/10: Edge autocompletaba tarifa, IVA e IRPF con valores de otras veces.
    abrir();
    // Y Edge ofrecía su «Información guardada» en el NIF: tampoco en los datos de la persona.
    for (const etiqueta of [/Importe acordado con/, /Importe fijo con/, /IVA % con/, /IRPF % con/, /^Nombre/, /^Correo/, /^NIF/, /^Notas/]) {
      for (const casilla of screen.getAllByLabelText(etiqueta)) expect(casilla.getAttribute('autocomplete'), String(etiqueta)).toBe('off');
    }
  });

  it('desmarcar una empresa y volver a marcarla (un doble clic en su nombre) no la deja en blanco', () => {
    abrir();
    const casilla = screen.getByRole('checkbox', { name: EMPRESAS[0].razon_social });
    fireEvent.click(casilla);
    expect(screen.queryByLabelText(`Importe acordado con ${EMPRESAS[0].razon_social}`)).toBeNull();
    fireEvent.click(casilla);
    expect(screen.getByLabelText(`Importe acordado con ${EMPRESAS[0].razon_social}`).value).toBe('600');
    expect(screen.getByLabelText(`Importe fijo con ${EMPRESAS[0].razon_social}`).value).toBe('600');
    expect(screen.getByLabelText(`IVA % con ${EMPRESAS[0].razon_social}`).value).toBe('21');
  });
});
