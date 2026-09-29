import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render, screen, fireEvent, waitFor, within,
} from '@testing-library/react';

/**
 * La cascada de categorías (#2).
 *
 * La lógica de andar el árbol se prueba aparte en `arbolDeCategorias.test.ts`.
 * Aquí van las tres cosas que sólo se ven montando el componente, y que son
 * justo donde una cascada se vuelve molesta o mentirosa:
 *
 *   - vaciar un nivel de abajo no puede tirar la rama entera,
 *   - no se pintan selectores que no llevan a ningún sitio,
 *   - una categoría guardada que no está en la lista tiene que verse, porque
 *     si no se pierde al guardar y nadie se entera.
 */

const get = vi.fn(async () => ({ success: true, data: [{ nombre: 'Rama' }, { nombre: 'Vieja' }] }));
vi.mock('@/shared/api/client', () => ({ default: { get: (...a) => get(...a) } }));

const CascadaDeCategorias = (await import('@/modules/product-categories/components/CascadaDeCategorias')).default;

// Cursos › Para Profesionales › Adicciones › Conductas
const ARBOL = [
  { id: 1, parent_id: null, nombre: 'Cursos' },
  { id: 2, parent_id: 1, nombre: 'Para Profesionales' },
  { id: 3, parent_id: 2, nombre: 'Adicciones' },
  { id: 4, parent_id: 3, nombre: 'Conductas' },
  { id: 7, parent_id: null, nombre: 'Másteres' },
];

/**
 * Abre el desplegable de un nivel y pulsa una opción por su texto.
 *
 * Dos cosas que no son obvias y que costaron un rato: `Select` cierra la opción
 * con `onMouseDown` y no con `onClick` —un `fireEvent.click` no hace nada—, y
 * hay que buscar DENTRO de la lista abierta, porque el mismo texto («—») está
 * también en el botón de los otros niveles.
 */
function elegirEn(nivel, textoOpcion) {
  fireEvent.click(screen.getByLabelText(`Categoría ${nivel}`));
  fireEvent.mouseDown(within(screen.getByRole('listbox')).getByText(textoOpcion));
}

beforeEach(() => { get.mockClear(); });

describe('cuántos selectores se ven', () => {
  it('sin nada elegido, sólo el primero', () => {
    render(<CascadaDeCategorias categorias={ARBOL} valor={null} onCambiar={() => {}} />);
    expect(screen.getByLabelText('Categoría 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Categoría 2')).toBeNull();
  });

  it('con una hoja elegida, la rama entera y ni uno más', () => {
    // Cuatro niveles reales; un quinto vacío sería un desplegable que no lleva
    // a ningún sitio y que además hace dudar de si falta elegir algo.
    render(<CascadaDeCategorias categorias={ARBOL} valor={4} onCambiar={() => {}} />);
    expect(screen.getByLabelText('Categoría 4')).toBeInTheDocument();
    expect(screen.queryByLabelText('Categoría 5')).toBeNull();
  });

  it('a media rama sale el siguiente, para poder bajar', () => {
    render(<CascadaDeCategorias categorias={ARBOL} valor={2} onCambiar={() => {}} />);
    expect(screen.getByLabelText('Categoría 3')).toBeInTheDocument();
    expect(screen.queryByLabelText('Categoría 4')).toBeNull();
  });

  it('enseña la ruta elegida en texto', () => {
    render(<CascadaDeCategorias categorias={ARBOL} valor={4} onCambiar={() => {}} />);
    expect(screen.getByText('Cursos › Para Profesionales › Adicciones › Conductas')).toBeInTheDocument();
  });
});

describe('bajar y subir por la rama', () => {
  it('elegir en un nivel manda ese id', () => {
    const onCambiar = vi.fn();
    render(<CascadaDeCategorias categorias={ARBOL} valor={null} onCambiar={onCambiar} />);
    elegirEn(1, 'Cursos');
    expect(onCambiar).toHaveBeenCalledWith(1);
  });

  it('vaciar un nivel de abajo deja elegido el de encima, NO borra la rama', () => {
    // Es el punto entero. Vaciar «Categoría 3» estando en
    // Cursos › Para Profesionales › Adicciones tiene que dejar
    // Cursos › Para Profesionales, no dejarlo todo en blanco: son dos
    // decisiones que la persona sigue viendo en pantalla y no ha tocado.
    const onCambiar = vi.fn();
    render(<CascadaDeCategorias categorias={ARBOL} valor={3} onCambiar={onCambiar} />);
    elegirEn(3, '—');
    expect(onCambiar).toHaveBeenCalledWith(2);
  });

  it('vaciar el primero sí quita la categoría entera', () => {
    const onCambiar = vi.fn();
    render(<CascadaDeCategorias categorias={ARBOL} valor={3} onCambiar={onCambiar} />);
    elegirEn(1, 'Sin categoría');
    expect(onCambiar).toHaveBeenCalledWith(null);
  });
});

describe('una categoría guardada que ya no sale en la lista', () => {
  it('lo dice, en vez de pintar la cascada vacía', async () => {
    // `listByProject` no devuelve las desactivadas. Sin aviso, el formulario se
    // abre como si el producto no tuviera categoría y al guardar se pierde.
    render(<CascadaDeCategorias categorias={ARBOL} valor={999} onCambiar={() => {}} />);
    await waitFor(() => expect(screen.getByText(/ya no sale en/)).toBeInTheDocument());
  });

  it('va a buscar su nombre para poder nombrarla', async () => {
    render(<CascadaDeCategorias categorias={ARBOL} valor={999} onCambiar={() => {}} />);
    await waitFor(() => expect(get).toHaveBeenCalledWith('/product-categories/999/ancestors'));
    expect(await screen.findByText('Rama › Vieja')).toBeInTheDocument();
  });

  it('si ni el nombre se puede traer, avisa igual con el número', async () => {
    get.mockRejectedValueOnce(new Error('sin red'));
    render(<CascadaDeCategorias categorias={ARBOL} valor={999} onCambiar={() => {}} />);
    expect(await screen.findByText('categoría #999')).toBeInTheDocument();
  });

  it('sólo se pierde a propósito, pulsando quitar', async () => {
    const onCambiar = vi.fn();
    render(<CascadaDeCategorias categorias={ARBOL} valor={999} onCambiar={onCambiar} />);
    fireEvent.click(await screen.findByText('Quitar la categoría'));
    expect(onCambiar).toHaveBeenCalledWith(null);
  });

  it('no avisa mientras la lista todavía no ha cargado', () => {
    // Con `categorias` vacío no se sabe si falta o si aún no llegó. Avisar ahí
    // sería asustar en cada apertura del formulario.
    render(<CascadaDeCategorias categorias={[]} valor={4} onCambiar={() => {}} />);
    expect(screen.queryByText(/ya no sale en/)).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
