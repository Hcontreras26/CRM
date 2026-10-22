import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

/*
  «Campos personalizados» con las piezas comunes (#106): el campo tal como
  sale en los formularios (CustomFieldRenderer, que llevaba la etiqueta a
  mano con un rojo suelto y un textarea con clases propias) y la pestaña donde
  se definen (FieldsTab, cuyos campos de editar no tenían etiqueta).
*/

vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));
vi.mock('@/shared/api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ success: true, data: [
      { id: 8, field_key: 'nivel', label: 'Nivel de estudios', type: 'select', required: true, grupo: 'Perfil', options: ['Grado', 'Máster'] },
    ] }),
    post: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  },
}));

import CustomFieldRenderer from '@/modules/field-definitions/components/CustomFieldRenderer';
import FieldsTab from '@/modules/settings/components/projectSettings/FieldsTab';

const campo = (type, extra = {}) => ({ id: 1, field_key: 'k', label: 'Mi campo', type, required: true, ...extra });

describe('CustomFieldRenderer (#106)', () => {
  it('el obligatorio con el Field común: con su nombre, no un asterisco rojo suelto', () => {
    render(<CustomFieldRenderer field={campo('text')} value="" />);
    expect(screen.getByText('(obligatorio)')).toBeTruthy();
    expect(screen.getByLabelText(/^Mi campo/).className).toMatch(/bg-muted\/50/);
  });

  it('el área de texto con la clase común', () => {
    render(<CustomFieldRenderer field={campo('textarea')} value="" />);
    const t = screen.getByLabelText(/^Mi campo/);
    expect(t.tagName).toBe('TEXTAREA');
    expect(t.className).toMatch(/h-9 .*h-auto/);
  });

  it('el desplegable, con el Field y su nombre', () => {
    render(<CustomFieldRenderer field={campo('select', { options: { choices: ['A'] } })} value="" />);
    expect(screen.getByRole('combobox', { name: 'Mi campo' })).toBeTruthy();
    expect(screen.getByText('(obligatorio)')).toBeTruthy();
  });
});

describe('FieldsTab (#106)', () => {
  // Visto en la prueba a mano: sin clave o sin etiqueta salía el globo del
  // navegador; y si no, no pasaba nada y no se decía por qué.
  it('nuevo campo: avisa el CRM de lo que falta, no el navegador', async () => {
    const { toast } = await import('@/shared/hooks/useToast');
    const client = (await import('@/shared/api/client')).default;
    render(<FieldsTab project={{ id: 1, lead_base_fields_config: {} }} onSaved={vi.fn()} />);
    await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
    const clave = screen.getByLabelText(/^Clave interna/);
    expect(clave.closest('form').noValidate).toBe(true);
    await act(async () => { fireEvent.submit(clave.closest('form')); });
    // Las dos vacías: las dos en un solo aviso.
    expect(toast).toHaveBeenLastCalledWith(expect.objectContaining({
      title: 'Faltan datos', description: 'Falta la clave en «Clave interna» y la etiqueta en «Etiqueta visible».', variant: 'destructive',
    }));
    fireEvent.change(clave, { target: { value: 'nivel_ingles' } });
    await act(async () => { fireEvent.submit(clave.closest('form')); });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Falta la etiqueta', variant: 'destructive' }));
    expect(client.post).not.toHaveBeenCalled();
  });

  it('editar un campo: cada casilla con su etiqueta y la clase común', async () => {
    render(<FieldsTab project={{ id: 1, lead_base_fields_config: {} }} onSaved={vi.fn()} />);
    await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
    fireEvent.click(screen.getByRole('button', { name: 'Editar campo' }));
    for (const nombre of [/^Etiqueta visible/, 'Sección', 'Opciones']) {
      const c = screen.getAllByLabelText(nombre).at(-1);
      expect(c.className).toMatch(/bg-muted\/50/);
      expect(c.className).not.toMatch(/h-8/);
    }
  });

  it('la vista previa, con las etiquetas enlazadas y en español', async () => {
    render(<FieldsTab project={{ id: 1, lead_base_fields_config: {} }} onSaved={vi.fn()} />);
    await act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
    fireEvent.click(screen.getByRole('button', { name: 'Vista previa' }));
    expect(screen.getByText(/Así se verán los campos/)).toBeTruthy();
    expect(screen.getByLabelText(/^Nivel de estudios/)).toBeTruthy();
  });
});
