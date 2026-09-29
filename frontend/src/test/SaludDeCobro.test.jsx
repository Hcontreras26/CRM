import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SaludDeCobro from '@/modules/clients/components/SaludDeCobro';

const NADA = { vencido: 0, semana: 0, mes: 0, despues: 0, sinFecha: 0 };

describe('reparto del cobro pendiente', () => {
  it('sin nada pendiente no se pinta', () => {
    const { container } = render(<SaludDeCobro tramos={NADA} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reparte por plazo y lo dice en euros, no en recibos', () => {
    render(<SaludDeCobro tramos={{ ...NADA, vencido: 300, semana: 600, mes: 300 }} />);
    expect(screen.getByText('Vencido')).toBeInTheDocument();
    expect(screen.getByText('Esta semana')).toBeInTheDocument();
    // El importe, no un «2 · 40%»: lo que importa de un cobro es cuánto es.
    expect(screen.getByText(/600/)).toBeInTheDocument();
  });

  it('lo vencido va primero, que es como se mira', () => {
    render(<SaludDeCobro tramos={{ ...NADA, vencido: 100, despues: 900 }} />);
    const etiquetas = screen.getAllByText(/Vencido|Esta semana|Este mes|Más adelante|Sin fecha/);
    expect(etiquetas[0]).toHaveTextContent('Vencido');
  });
});
