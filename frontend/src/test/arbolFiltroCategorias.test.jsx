import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ArbolDeCategorias from '@/modules/product-categories/components/ArbolDeCategorias';

/**
 * El arbol de categorias como FILTRO del listado de productos (#2, cuarto AC).
 *
 * Que casa con que se prueba aparte, en `filtroDelArbol.test.ts`, que es una
 * funcion y no necesita React. Aqui van las dos cosas que SOLO se ven montando
 * el componente, y que son justo donde un filtro de arbol miente:
 *
 *   - lo que casa esta en el tercer nivel y las ramas nacen cerradas: si no se
 *     abren solas al buscar, el filtro dice que hay resultado y no se ve,
 *   - y los padres de lo que casa tienen que seguir pintados, porque son el
 *     camino para llegar hasta ello.
 */

// Cursos › Para Profesionales › Adicciones y Conductas Compulsivas
//        › Para Familias      › Adicciones
const nodo = (id, nombre, children = []) => ({ id, nombre, children, productos_count: 0 });

const ARBOL = [
  nodo(1, 'Cursos', [
    nodo(2, 'Para Profesionales', [
      nodo(3, 'Adicciones y Conductas Compulsivas'),
      nodo(4, 'Alimentación, Imagen Corporal y TCA'),
    ]),
    nodo(5, 'Para Familias', [nodo(6, 'Adicciones')]),
  ]),
  nodo(7, 'Másteres', [nodo(8, 'Neuropsicología')]),
];

const pintar = (search = '') =>
  render(
    <ArbolDeCategorias nodos={ARBOL} selectedId={null} onSelect={() => {}} search={search} />,
  );

describe('sin buscar nada', () => {
  it('se ven las raices con su primer nivel, y de ahi para abajo plegado', () => {
    pintar('');
    expect(screen.getByText('Cursos')).toBeInTheDocument();
    expect(screen.getByText('Másteres')).toBeInTheDocument();
    // Las raices nacen abiertas —se ve de que va el catalogo al entrar— pero el
    // tercer nivel no: con el arbol entero desplegado no se lee nada.
    expect(screen.getByText('Para Profesionales')).toBeInTheDocument();
    expect(screen.queryByText('Adicciones y Conductas Compulsivas')).not.toBeInTheDocument();
  });
});

describe('al buscar, la rama se abre sola', () => {
  it('«prof adicc» deja a la vista la categoria del tercer nivel', () => {
    pintar('prof adicc');
    // Sin abrir solo, esto no se veria aunque el filtro dijera que hay resultado.
    expect(screen.getByText('Adicciones y Conductas Compulsivas')).toBeInTheDocument();
  });

  it('y el camino hasta ella sigue pintado', () => {
    pintar('prof adicc');
    expect(screen.getByText('Cursos')).toBeInTheDocument();
    expect(screen.getByText('Para Profesionales')).toBeInTheDocument();
  });

  it('la otra «Adicciones», la de Familias, NO sale', () => {
    pintar('prof adicc');
    expect(screen.queryByText('Para Familias')).not.toBeInTheDocument();
    expect(screen.queryByText('Adicciones')).not.toBeInTheDocument();
  });

  it('y la rama que no tiene nada dentro se va entera', () => {
    pintar('prof adicc');
    expect(screen.queryByText('Másteres')).not.toBeInTheDocument();
  });
});

describe('los acentos, que es por lo que se hizo esto', () => {
  it('«alimentacion» sin tilde encuentra «Alimentación»', () => {
    pintar('alimentacion');
    expect(screen.getByText('Alimentación, Imagen Corporal y TCA')).toBeInTheDocument();
  });

  it('«neuropsicologia» sin tilde encuentra la de Másteres', () => {
    pintar('neuropsicologia');
    expect(screen.getByText('Neuropsicología')).toBeInTheDocument();
  });
});

describe('elegir una categoria', () => {
  it('avisa con el nodo pulsado', () => {
    const elegir = vi.fn();
    render(<ArbolDeCategorias nodos={ARBOL} selectedId={null} onSelect={elegir} search="" />);
    fireEvent.click(screen.getByText('Cursos'));
    expect(elegir).toHaveBeenCalledWith(expect.objectContaining({ id: 1, nombre: 'Cursos' }));
  });

  it('volver a pulsar la que ya estaba elegida la quita', () => {
    const elegir = vi.fn();
    render(<ArbolDeCategorias nodos={ARBOL} selectedId={1} onSelect={elegir} search="" />);
    fireEvent.click(screen.getByText('Cursos'));
    expect(elegir).toHaveBeenCalledWith(null);
  });
});

describe('desplegar a mano sigue funcionando', () => {
  it('pulsar la flecha abre la rama cerrada', () => {
    pintar('');
    fireEvent.click(screen.getByLabelText('Desplegar Para Profesionales'));
    expect(screen.getByText('Adicciones y Conductas Compulsivas')).toBeInTheDocument();
  });

  it('y volver a pulsarla la cierra', () => {
    pintar('');
    fireEvent.click(screen.getByLabelText('Desplegar Para Profesionales'));
    fireEvent.click(screen.getByLabelText('Plegar Para Profesionales'));
    expect(screen.queryByText('Adicciones y Conductas Compulsivas')).not.toBeInTheDocument();
  });
});
