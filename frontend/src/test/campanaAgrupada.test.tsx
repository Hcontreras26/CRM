import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationsList from '@/modules/notificaciones/components/NotificationsList';

/**
 * La campana, por dentro (#111).
 *
 * Diego, el 07/09: 98 sin leer y casi todas la misma. «Si todo avisa, nada
 * avisa». Lo que se comprueba aquí es que la pantalla hace las tres cosas que
 * pidió y que se ven desde fuera:
 *
 *   - lo repetido en una fila, con su «×N»,
 *   - lo que pide hacer algo separado de lo que solo hay que saber,
 *   - y al abrir una fila agrupada se marca el grupo ENTERO, no la última.
 *
 * Lo tercero es lo que más importa. Marcando solo la última de seis quedarían
 * cinco, el número no bajaría, y la agrupación sería un maquillaje.
 */

const navegado: string[] = [];
vi.mock('react-router-dom', async () => {
  const real = await vi.importActual<any>('react-router-dom');
  return { ...real, useNavigate: () => (r: string) => { navegado.push(r); } };
});

const patch = vi.fn(async (..._a: any[]) => ({ success: true, data: {} }));
let filas: any[] = [];
vi.mock('@/shared/api/client', () => ({
  default: {
    get: async () => ({ success: true, data: filas }),
    patch: (...a: any[]) => patch(...a),
  },
}));

const ahora = new Date().toISOString();

function aviso(p: Partial<any>) {
  return {
    id: 1, type: 'lead_asignado', etiqueta: 'Prospecto asignado', clase: 'accion',
    title: 'Algo', message: null, link_path: null, is_read: false,
    created_at: ahora, grupo: 'id:1', veces: 1, sin_leer: 1, desde: ahora,
    ...p,
  };
}

function pintar() {
  return render(<MemoryRouter><NotificationsList /></MemoryRouter>);
}

beforeEach(() => {
  patch.mockClear();
  navegado.length = 0;
  filas = [];
});

describe('lo repetido va en una fila', () => {
  it('enseña el ×N que manda el servidor', async () => {
    filas = [aviso({
      type: 'catalogo_revision', etiqueta: 'Revisión diaria', clase: 'aviso',
      title: 'Revisión diaria: hay cosas sin atar',
      grupo: 'catalogo_revision', veces: 98, sin_leer: 98,
    })];
    pintar();
    expect(await screen.findByText('×98')).toBeTruthy();
  });

  it('el número NO se cuenta aquí: se pinta el del servidor', async () => {
    // Solo llega una fila. Si la pantalla contase filas diría «×1», y ese es
    // justo el error que hace que el número mienta cuando hay `limit`.
    filas = [aviso({ grupo: 'catalogo_revision', veces: 30, sin_leer: 30, clase: 'aviso' })];
    pintar();
    expect(await screen.findByText('×30')).toBeTruthy();
    expect(screen.queryByText('×1')).toBeNull();
  });

  it('una que va sola no lleva contador', async () => {
    filas = [aviso({ title: 'Prospecto nuevo' })];
    pintar();
    await screen.findByText('Prospecto nuevo');
    expect(screen.queryByText(/^×/)).toBeNull();
  });
});

describe('hacer y saber van separados', () => {
  it('cada una cae en su sección', async () => {
    filas = [
      aviso({ id: 1, grupo: 'id:1', title: 'Tienes un prospecto', clase: 'accion' }),
      aviso({ id: 2, grupo: 'id:2', title: 'Se cerró una venta sola', clase: 'aviso', etiqueta: 'Venta automática' }),
    ];
    pintar();

    await screen.findByText('Para hacer');
    expect(screen.getByText('Para saber')).toBeTruthy();

    // La de acción va antes que el separador de «Para saber»; la informativa,
    // después. Es la separación que pidió Diego, comprobada por posición.
    const texto = document.body.textContent || '';
    expect(texto.indexOf('Tienes un prospecto')).toBeLessThan(texto.indexOf('Para saber'));
    expect(texto.indexOf('Se cerró una venta sola')).toBeGreaterThan(texto.indexOf('Para saber'));
  });

  it('un tipo que la pantalla no conoce no desaparece: cae en «para saber»', async () => {
    filas = [aviso({ title: 'De un tipo raro', clase: 'loquesea' as any, etiqueta: 'tipo_raro' })];
    pintar();
    await screen.findByText('De un tipo raro');
  });
});

describe('al abrir', () => {
  it('marca el GRUPO entero, no la última', async () => {
    filas = [aviso({
      title: 'Revisión diaria', grupo: 'catalogo_revision', veces: 6, sin_leer: 6, clase: 'aviso',
    })];
    pintar();
    fireEvent.click(await screen.findByText('Revisión diaria'));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith('/notifications/read-group', { grupo: 'catalogo_revision' });
  });

  it('y lleva a la ficha de la que habla', async () => {
    // El cuarto punto de Diego: «que la campana lleve a algún sitio».
    filas = [aviso({ title: 'Prospecto 42', link_path: '/prospectos/42' })];
    pintar();
    fireEvent.click(await screen.findByText('Prospecto 42'));

    await waitFor(() => expect(navegado).toContain('/prospectos/42'));
  });

  it('si ya estaba leída no vuelve a marcarla', async () => {
    filas = [aviso({ title: 'Ya leída', is_read: true, sin_leer: 0, link_path: '/prospectos/7' })];
    pintar();
    fireEvent.click(await screen.findByText('Ya leída'));

    await waitFor(() => expect(navegado).toContain('/prospectos/7'));
    expect(patch).not.toHaveBeenCalled();
  });
});
