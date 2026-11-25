// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

/**
 * La línea de la semana en «Tráfico orgánico» (CRM#1156): la última semana de
 * Search Console contra la anterior; lo que avisa el lunes, en rojo. Un campus
 * sin Search Console, o una petición que falla, no pinta nada ni rompe.
 */

const get = vi.hoisted(() => vi.fn());
vi.mock('@/shared/api/client', () => ({ default: { get, post: vi.fn() } }));

const { LineaSemana, useSemanaGsc } = await import('@/modules/seo/components/LineaSemana');

afterEach(() => { cleanup(); get.mockReset(); });

const SEMANA = {
  con_datos: true,
  completa: true,
  reciente: true,
  actual: { desde: '2026-11-16', hasta: '2026-11-22', clics: 420, impresiones: 12000, ctr: 4.67, posicion: 9, dias: 7 },
  anterior: { desde: '2026-11-09', hasta: '2026-11-15', clics: 700, impresiones: 13333, ctr: 7, posicion: 8, dias: 7 },
  variacion: { clics: -40, impresiones: -10, posicion: 1 },
  caidas: ['clics'],
};

function ConHook({ projectId, conectado }) {
  const s = useSemanaGsc(projectId, conectado);
  return <div data-testid="caja"><LineaSemana semana={s} /></div>;
}

describe('la línea de la semana', () => {
  it('enseña clics, impresiones y posición con su variación', () => {
    render(<LineaSemana semana={SEMANA} />);
    const l = screen.getByTestId('linea-semana');
    expect(l.textContent).toMatch(/Semana del 16 nov al 22 nov contra la anterior/);
    expect(l.textContent).toMatch(/420 clics \(−40,0 %\)/);
    expect(l.textContent).toMatch(/12\.000 impresiones \(−10,0 %\)/);
    expect(l.textContent).toMatch(/posición media 9,0 \(\+1,0\)/);
  });

  it('lo que avisa el lunes sale en rojo, y solo eso', () => {
    render(<LineaSemana semana={SEMANA} />);
    expect(screen.getByText('(−40,0 %)', { exact: false }).className).toMatch(/text-destructive/);
    expect(screen.getByText('(−10,0 %)', { exact: false }).className).not.toMatch(/text-destructive/);
    expect(screen.getByLabelText('Ha caído')).toBeTruthy();
  });

  it('sin caída no hay icono', () => {
    render(<LineaSemana semana={{ ...SEMANA, caidas: [] }} />);
    expect(screen.queryByLabelText('Ha caído')).toBeNull();
  });

  it('con la semana a medias no compara', () => {
    render(<LineaSemana semana={{ ...SEMANA, completa: false }} />);
    expect(screen.getByTestId('linea-semana').textContent).toMatch(/faltan días en Search Console, no se compara/);
  });

  it('sin datos (campus sin Search Console) no pinta nada', () => {
    const { container } = render(<LineaSemana semana={{ con_datos: false }} />);
    expect(container.textContent).toBe('');
  });
});

describe('la petición', () => {
  it('pide /search-console/semana del campus conectado', async () => {
    get.mockResolvedValue({ success: true, data: SEMANA });
    render(<ConHook projectId={3} conectado />);
    await waitFor(() => expect(screen.getByTestId('linea-semana')).toBeTruthy());
    expect(get).toHaveBeenCalledWith('/search-console/semana?projectId=3');
  });

  it('sin conectar no pide nada', () => {
    render(<ConHook projectId={3} conectado={false} />);
    expect(get).not.toHaveBeenCalled();
    expect(screen.getByTestId('caja').textContent).toBe('');
  });

  it('si la petición falla no rompe la pantalla', async () => {
    get.mockRejectedValue(new Error('500'));
    render(<ConHook projectId={3} conectado />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.getByTestId('caja').textContent).toBe('');
  });
});
