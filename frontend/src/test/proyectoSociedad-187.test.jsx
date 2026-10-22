import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/*
  «Nuevo proyecto» con su empresa (#187, prueba a mano del 19/10).

  `client` devuelve ya el cuerpo ({ success, data }). La ventana leía la lista
  de sociedades en `r.data.data` y el desplegable salía vacío: no se podía dar
  un campus nuevo a una empresa, que es justo lo que la #187 necesita («una
  empresa cubre también los campus que se creen después»).
*/

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), toast: vi.fn() }));
vi.mock('@/shared/api/client', () => ({ default: { get: api.get, post: api.post, put: api.put } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: api.toast }));

import ProjectDialog from '@/modules/settings/components/settings/ProjectDialog';

const SOCIEDADES = [
  { id: 1, razon_social: 'CEDIA Investigación y Desarrollo SL', serie: 'CEDIA' },
  { id: 2, razon_social: 'Ictess Ingeniería e Innovación SL', serie: 'ICT' },
];

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ success: true, data: SOCIEDADES });
  api.post.mockImplementation(async (url) => (url === '/projects/sociedades'
    ? { success: true, data: { id: 9, razon_social: 'Nueva SL' } }
    : { success: true, data: { id: 50 } }));
});

const rellenar = () => {
  const [nombre, slug] = screen.getAllByRole('textbox');
  fireEvent.change(nombre, { target: { value: 'Prueba 187 nuevo' } });
  fireEvent.change(slug, { target: { value: 'prueba-187-nuevo' } });
};

describe('Nuevo proyecto · la empresa (sociedad emisora)', () => {
  it('el desplegable enseña las empresas y el campus se crea con la elegida', async () => {
    render(<ProjectDialog open onClose={() => {}} />);
    const sel = await screen.findByLabelText('Sociedad emisora');
    await waitFor(() => expect(screen.getByRole('option', { name: /CEDIA Investigación/ })).toBeTruthy());
    rellenar();
    fireEvent.change(sel, { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/projects', expect.objectContaining({
      nombre: 'Prueba 187 nuevo', sociedad_emisora_id: 1,
    })));
  });

  it('con una sociedad nueva, el campus se crea con su id', async () => {
    render(<ProjectDialog open onClose={() => {}} />);
    const sel = await screen.findByLabelText('Sociedad emisora');
    rellenar();
    fireEvent.change(sel, { target: { value: '__new__' } });
    fireEvent.change(await screen.findByPlaceholderText('Nueva Sociedad SL'), { target: { value: 'Nueva SL' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/projects', expect.objectContaining({ sociedad_emisora_id: 9 })));
  });
});
