import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CifrasClientes from '@/modules/clients/components/CifrasClientes';

describe('las cuatro cifras de Clientes', () => {
  it('sin clientes no pinta una fila de ceros', () => {
    const { container } = render(
      <CifrasClientes totalClientes={0} facturado={0} cobrado={0} pendiente={0} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('dice cuántos son, cuánto se vendió y cuánto queda', () => {
    render(<CifrasClientes totalClientes={12} facturado={3900} cobrado={2700} pendiente={1200} />);
    expect(screen.getByText('Clientes')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Facturado')).toBeInTheDocument();
    expect(screen.getByText('Cobrado')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('el porcentaje cobrado sale de lo facturado, no del aire', () => {
    render(<CifrasClientes totalClientes={3} facturado={1000} cobrado={250} pendiente={750} />);
    expect(screen.getByText('25% de lo facturado')).toBeInTheDocument();
    expect(screen.getByText('75% sin cobrar')).toBeInTheDocument();
  });

  it('sin nada facturado no divide entre cero', () => {
    render(<CifrasClientes totalClientes={2} facturado={0} cobrado={0} pendiente={0} />);
    expect(screen.getByText('todavía nada')).toBeInTheDocument();
    expect(screen.getByText('todo al día')).toBeInTheDocument();
  });
});
