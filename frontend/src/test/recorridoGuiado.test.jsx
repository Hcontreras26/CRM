import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import RecorridoGuiado, { recorridoPendiente } from '@/shared/components/ui/RecorridoGuiado';
import { PASOS_TABLERO, CLAVE_RECORRIDO_TABLERO } from '@/modules/tasks/lib/recorridoTablero';

// El recorrido guiado del tablero (Diego, 12/10: «un tutorial guiado, para verlo y todo»).

const PASOS = [
  { titulo: 'Bienvenida', texto: 'Son {pasos} pasos' },
  { donde: '[data-recorrido="a"]', titulo: 'Lo que hay', texto: 'Esto existe' },
  { donde: '[data-recorrido="no-esta"]', titulo: 'Lo que no hay', texto: 'Un colaborador no lo ve' },
  { titulo: 'Final', texto: 'Hasta luego' },
];

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  document.body.innerHTML = '<div data-recorrido="a">objetivo</div>';
});
afterEach(() => { vi.useRealTimers(); });

describe('el recorrido guiado', () => {
  it('cuenta sus pasos y avanza', () => {
    render(<RecorridoGuiado pasos={PASOS} clave="k1" alCerrar={() => {}} />, { container: document.body.appendChild(document.createElement('div')) });
    expect(screen.getByText('Son 4 pasos')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByText('Lo que hay')).toBeInTheDocument();
  });
  it('salta lo que esa persona no tiene en pantalla', () => {
    render(<RecorridoGuiado pasos={PASOS} clave="k2" alCerrar={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.queryByText('Lo que no hay')).toBeNull();
    expect(screen.getByText('Final')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entendido' })).toBeInTheDocument();
  });
  it('se marca como visto al abrirse, y Escape lo cierra', () => {
    const alCerrar = vi.fn();
    expect(recorridoPendiente('k3')).toBe(true);
    render(<RecorridoGuiado pasos={PASOS} clave="k3" alCerrar={alCerrar} />);
    expect(recorridoPendiente('k3')).toBe(false);
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }); });
    expect(alCerrar).toHaveBeenCalled();
  });
});

describe('los pasos del tablero', () => {
  it('empiezan presentando y terminan diciendo cómo volver a verlo', () => {
    expect(PASOS_TABLERO[0].donde).toBeUndefined();
    expect(PASOS_TABLERO.at(-1).texto).toMatch(/Recorrido/);
    expect(CLAVE_RECORRIDO_TABLERO).toMatch(/tablero/);
  });
  it('cada paso señala una pieza marcada en la pantalla (o el menú)', () => {
    for (const p of PASOS_TABLERO.filter((x) => x.donde)) {
      expect(p.donde).toMatch(/data-recorrido="[a-z]+"|tareas\/revisar/);
    }
  });
});
