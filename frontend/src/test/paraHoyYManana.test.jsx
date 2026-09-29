import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * «Lo que toca» del dashboard (#130, parte 2).
 *
 * Las dos cosas que tienen que ser verdad, y que no se ven leyendo el codigo:
 *
 *   - que cada numero lleve a la cola CON SU TRAMO PUESTO. Es la mitad del
 *     trabajo: el #132 dio por inutil un aviso que dice «mañana tienes 12» y te
 *     deja buscandolos.
 *   - que con todo a cero el bloque desaparezca. Un dashboard lleno de ceros
 *     entrena a no mirarlo.
 */

const traerResumen = vi.fn();
vi.mock('@/modules/proceso/api/agenda.api', () => ({
  traerResumen: (...a) => traerResumen(...a),
}));

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

const ParaHoyYManana = (await import('@/shared/components/dashboard/ParaHoyYManana')).default;

beforeEach(() => { traerResumen.mockReset(); navigate.mockReset(); });

const conDatos = (r) => traerResumen.mockResolvedValue({
  atrasados: 0, hoy: 0, manana: 0, esta_semana: 0, ...r,
});

describe('los cuatro tramos', () => {
  it('se pintan con sus numeros', async () => {
    conDatos({ atrasados: 123, hoy: 6, manana: 11, esta_semana: 40 });
    render(<ParaHoyYManana projectId={1} />);

    // Los numeros del dia que Diego cito en el ticket.
    expect(await screen.findByText('123')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText('Para mañana')).toBeInTheDocument();
  });

  it('«esta semana» sale de `esta_semana`, que no se llama como su tramo', async () => {
    // El tramo es «semana» y el campo del backend `esta_semana`: si se leyeran
    // igual, esta casilla saldria siempre vacia y nadie lo notaria.
    conDatos({ esta_semana: 40 });
    render(<ParaHoyYManana projectId={1} />);
    expect(await screen.findByText('40')).toBeInTheDocument();
  });
});

describe('cada numero deja la cola ya puesta', () => {
  it('pulsar «Para mañana» abre la cola en ese tramo', async () => {
    conDatos({ manana: 11 });
    render(<ParaHoyYManana projectId={1} />);
    fireEvent.click(await screen.findByLabelText(/Para mañana: 11/));
    expect(navigate).toHaveBeenCalledWith('/prospectos/cola?tramo=manana');
  });

  it('y «Atrasados» en el suyo', async () => {
    conDatos({ atrasados: 123 });
    render(<ParaHoyYManana projectId={1} />);
    fireEvent.click(await screen.findByLabelText(/Atrasados: 123/));
    expect(navigate).toHaveBeenCalledWith('/prospectos/cola?tramo=atrasados');
  });
});

describe('cuando no hay nada', () => {
  it('con todo a cero el bloque no se pinta', async () => {
    conDatos({});
    const { container } = render(<ParaHoyYManana projectId={1} />);
    await waitFor(() => expect(traerResumen).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('si la cola no contesta, tampoco estorba', async () => {
    traerResumen.mockRejectedValue(new Error('500'));
    const { container } = render(<ParaHoyYManana projectId={1} />);
    await waitFor(() => expect(traerResumen).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
