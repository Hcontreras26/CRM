import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

/**
 * El panel de «a quién le toca» y su botón de repartir (#11).
 *
 * Lo de que la lista sea la misma que usa el reparto se prueba contra la base
 * en `backend/tests/repartoMismaLista.test.js`. Aquí va lo de la pantalla, y
 * sobre todo el botón: toca la propiedad de fichas de otras personas, así que
 * lo que importa es cuándo NO sale y qué pasa cuando no hay a quién dárselas.
 */

const get = vi.fn();
const post = vi.fn(async () => ({ success: true, data: { reassigned: 3, total_pending: 3 } }));
vi.mock('@/shared/api/client', () => ({
  default: { get: (...a) => get(...a), post: (...a) => post(...a) },
}));

const toast = vi.fn();
vi.mock('@/shared/hooks/useToast', () => ({ toast: (...a) => toast(...a) }));

let puedeAsignar = true;
vi.mock('@/shared/hooks/usePermission', () => ({
  default: () => ({ can: () => puedeAsignar }),
}));

const ProximoGestor = (await import('@/modules/leads/components/ProximoGestor')).default;

const LAURA = { id: 4, nombre: 'Laura Garcia' };
const CARLOS = { id: 5, nombre: 'Carlos Ruiz' };

function estado(extra = {}) {
  return {
    success: true,
    data: {
      gestores: [LAURA, CARLOS],
      last_assigned_at: new Date().toISOString(),
      last_gestor: CARLOS,
      next_gestor: LAURA,
      sin_responsable: 0,
      ...extra,
    },
  };
}

beforeEach(() => {
  get.mockReset();
  post.mockClear();
  toast.mockClear();
  puedeAsignar = true;
  get.mockResolvedValue(estado());
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('lo que enseña', () => {
  it('dice a quién le toca el siguiente', async () => {
    render(<ProximoGestor projectId={1} />);
    expect(await screen.findByText('Laura Garcia')).toBeInTheDocument();
  });

  it('sin nadie en el reparto lo dice, y no finge un próximo', async () => {
    get.mockResolvedValue(estado({ gestores: [], next_gestor: null, last_gestor: null }));
    render(<ProximoGestor projectId={1} />);
    expect(await screen.findByText(/Sin gestores en el reparto/)).toBeInTheDocument();
  });

  it('sin nadie Y con fichas paradas, dice cuántas esperan', async () => {
    // «Puede pasar» y «ya está pasando» son avisos distintos.
    get.mockResolvedValue(estado({ gestores: [], next_gestor: null, sin_responsable: 7 }));
    render(<ProximoGestor projectId={1} />);
    expect(await screen.findByText(/Ya hay/)).toBeInTheDocument();
    expect(await screen.findByText('7')).toBeInTheDocument();
  });

  it('si el último que recibió ya no está en el reparto, lo dice', async () => {
    // Si no, se lee como que le vuelve a tocar.
    get.mockResolvedValue(estado({ last_gestor: { ...CARLOS, fuera_del_reparto: true } }));
    render(<ProximoGestor projectId={1} />);
    expect(await screen.findByText(/ya no está en el reparto/)).toBeInTheDocument();
  });

  it('en modo «Todos los proyectos» no sale, y ni siquiera pregunta', async () => {
    // El id de «Todos» es -1, que es truthy: con un `if (!projectId)` esto
    // pedía /projects/-1/queue-state y pintaba «sin gestores en el reparto» en
    // una vista donde la pregunta ni aplica — cada proyecto tiene su cola.
    const { container } = render(<ProximoGestor projectId={-1} />);
    await waitFor(() => expect(container.textContent).toBe(''));
    expect(get).not.toHaveBeenCalled();
  });

  it('sin proyecto tampoco', async () => {
    const { container } = render(<ProximoGestor projectId={null} />);
    await waitFor(() => expect(container.textContent).toBe(''));
    expect(get).not.toHaveBeenCalled();
  });

  it('si no se puede leer, no pinta nada en vez de un panel vacío', async () => {
    // Un panel vacío se leería como «no hay gestores», que es otra respuesta.
    get.mockRejectedValue(new Error('sin red'));
    const { container } = render(<ProximoGestor projectId={1} />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});

describe('el botón de repartir los que no tienen dueño', () => {
  it('no sale si no hay ninguno suelto', async () => {
    render(<ProximoGestor projectId={1} />);
    await screen.findByText('Laura Garcia');
    expect(screen.queryByText(/Reasignar/)).toBeNull();
  });

  it('no sale a quien no puede asignar, aunque los haya', async () => {
    // El endpoint es admin. Enseñar el botón a una gestora seria ofrecerle algo
    // que le va a contestar 403.
    puedeAsignar = false;
    get.mockResolvedValue(estado({ sin_responsable: 3 }));
    render(<ProximoGestor projectId={1} />);
    await screen.findByText('Laura Garcia');
    expect(screen.queryByText(/Reasignar/)).toBeNull();
  });

  it('sale con el número, para no pulsarlo a ciegas', async () => {
    get.mockResolvedValue(estado({ sin_responsable: 3 }));
    render(<ProximoGestor projectId={1} />);
    expect(await screen.findByText('Reasignar 3 sin responsable')).toBeInTheDocument();
  });

  it('pregunta antes, diciendo cuántos y entre cuántos', async () => {
    get.mockResolvedValue(estado({ sin_responsable: 3 }));
    render(<ProximoGestor projectId={1} />);
    fireEvent.click(await screen.findByText('Reasignar 3 sin responsable'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('3 prospectos'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('entre 2'));
  });

  it('si se cancela, no reparte nada', async () => {
    window.confirm.mockReturnValue(false);
    get.mockResolvedValue(estado({ sin_responsable: 3 }));
    render(<ProximoGestor projectId={1} />);
    fireEvent.click(await screen.findByText('Reasignar 3 sin responsable'));
    expect(post).not.toHaveBeenCalled();
  });

  it('reparte y avisa a la pantalla de al lado', async () => {
    // El listado de prospectos tiene delante las fichas que acaban de cambiar
    // de dueño: si no se entera, enseña lo de antes.
    const onReasignado = vi.fn();
    get.mockResolvedValue(estado({ sin_responsable: 3 }));
    render(<ProximoGestor projectId={1} onReasignado={onReasignado} />);
    fireEvent.click(await screen.findByText('Reasignar 3 sin responsable'));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/leads/reassign-pending?projectId=1', {}));
    await waitFor(() => expect(onReasignado).toHaveBeenCalled());
  });

  it('«no hay nadie disponible» no se cuenta como que el botón falló', async () => {
    // El servidor contesta success con un motivo. Enseñar «error» ahí mandaria
    // a buscar un fallo que no existe: lo que pasa es que hoy no hay a quién.
    post.mockResolvedValueOnce({
      success: true, data: { reassigned: 0, total_pending: 0, reason: 'NO_ACTIVE_GESTORES' },
    });
    get.mockResolvedValue(estado({ sin_responsable: 3 }));
    render(<ProximoGestor projectId={1} />);
    fireEvent.click(await screen.findByText('Reasignar 3 sin responsable'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'No hay nadie en el reparto' })
    ));
  });

  it('si entre el número y el clic ya no quedaba ninguno, se dice sin contradecirse', async () => {
    // El contador se relee cada 30 s. «0 repartidos · se han asignado por
    // turno» dice dos cosas incompatibles y hace dudar de si funcionó.
    post.mockResolvedValueOnce({ success: true, data: { reassigned: 0, total_pending: 0 } });
    get.mockResolvedValue(estado({ sin_responsable: 3 }));
    render(<ProximoGestor projectId={1} />);
    fireEvent.click(await screen.findByText('Reasignar 3 sin responsable'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Ya no quedaba ninguno' })
    ));
  });

  it('un fallo de verdad se dice como fallo', async () => {
    post.mockRejectedValueOnce(new Error('500'));
    get.mockResolvedValue(estado({ sin_responsable: 3 }));
    render(<ProximoGestor projectId={1} />);
    fireEvent.click(await screen.findByText('Reasignar 3 sin responsable'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'No se pudo repartir' })
    ));
  });
});
