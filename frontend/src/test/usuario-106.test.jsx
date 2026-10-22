import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/*
  «Usuario» (alta y edición) con las piezas comunes (#106): había dos estilos
  de etiqueta en el mismo diálogo, el asterisco escrito a mano en el texto y
  las ayudas sueltas debajo. Ahora todo es el Field compartido.
*/

const avisos = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: avisos.toast }));
vi.mock('@/shared/components/ui/portal', () => ({ default: ({ children }) => children }));

import UserFormDialog from '@/modules/users/components/UserFormDialog';

const base = {
  projects: [], canResetPassword: true, canChangeEmail: true, loading: false,
  onClose: vi.fn(), onSubmit: vi.fn(), onCheckEmail: vi.fn().mockResolvedValue(null), onResetPassword: vi.fn(),
};
const usuario = { id: 4, nombre: 'Laura', email: 'laura@empresa.com', role: 'gestor', projects: [] };

describe('Usuario (#106)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // Visto en la prueba a mano: el globo «Rellene este campo» del navegador
  // tapaba el aviso del CRM, que ya comprueba nombre, email y proyecto.
  it('avisa el CRM, no el navegador: sin nombre, dice cuál falta', () => {
    const { container } = render(<UserFormDialog {...base} user={null} />);
    const form = container.querySelector('form');
    expect(form.noValidate).toBe(true);
    // Todo vacío: todo lo que falta, en un solo aviso (visto en la prueba a
    // mano: decía solo «Falta el nombre», y vacío no es «demasiado corto»).
    fireEvent.submit(form);
    expect(avisos.toast).toHaveBeenLastCalledWith(expect.objectContaining({
      title: 'Faltan datos',
      description: 'Falta el nombre en «Nombre», el email en «Email» y al menos un proyecto en «Proyectos asignados».',
    }));
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: 'A' } });
    fireEvent.submit(form);
    expect(avisos.toast.mock.calls.at(-1)[0].description).toMatch(/^Falta un nombre de al menos 2 letras en «Nombre», el email/);
    expect(base.onSubmit).not.toHaveBeenCalled();
  });

  it('si solo falta una cosa, su aviso de siempre', () => {
    render(<UserFormDialog {...base} user={usuario} />);
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: '' } });
    fireEvent.submit(screen.getByLabelText(/^Nombre/).closest('form'));
    expect(avisos.toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Falta el nombre', description: 'Escríbelo en «Nombre».' }));
  });

  it('alta: nombre, email y rol con el Field común, marcados como obligatorios', () => {
    render(<UserFormDialog {...base} user={null} />);
    expect(screen.getByLabelText(/^Nombre/)).toBeTruthy();
    expect(screen.getByLabelText(/^Email/)).toBeTruthy();
    expect(screen.getAllByText('(obligatorio)')).toHaveLength(3);
    // El asterisco ya no va escrito dentro del texto de la etiqueta.
    expect(screen.queryByText('Nombre *')).toBeNull();
  });

  it('todas las etiquetas con el mismo estilo (antes había dos)', () => {
    const { container } = render(<UserFormDialog {...base} user={usuario} />);
    const estilos = new Set([...container.querySelectorAll('label[for]')].map((l) => l.className));
    expect(estilos.size).toBe(1);
  });

  it('las ayudas van con su campo: la del correo, la del teléfono y la de la contraseña', () => {
    render(<UserFormDialog {...base} user={usuario} />);
    const ayudaDe = (campo) => campo.closest('div.min-w-0').textContent;
    expect(ayudaDe(screen.getByLabelText(/^Email/))).toMatch(/Es con lo que entra/);
    expect(ayudaDe(screen.getByLabelText('Teléfono (WhatsApp)'))).toMatch(/widget de WhatsApp/);
    expect(ayudaDe(screen.getByLabelText('Reiniciar contraseña'))).toMatch(/Mínimo 8 caracteres/);
  });

  // Visto en la prueba de ISEIE (aquí pasaba igual): Escape no cerraba.
  it('Escape cierra la ventana; con el rol abierto, solo el desplegable', () => {
    render(<UserFormDialog {...base} user={usuario} />);
    const rol = screen.getByRole('combobox', { name: /^Rol/ });
    fireEvent.click(rol);
    fireEvent.keyDown(rol, { key: 'Escape' });
    expect(base.onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(base.onClose).toHaveBeenCalledTimes(1);
  });

  it('el aviso del correo dice cómo escribirlo', () => {
    render(<UserFormDialog {...base} user={null} />);
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: 'Ana Test' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ana@' } });
    fireEvent.submit(screen.getByLabelText(/^Nombre/).closest('form'));
    // Sin proyecto, va en la misma lista que el proyecto que falta.
    expect(avisos.toast.mock.calls.at(-1)[0].description).toMatch(/un email válido en «Email» \(nombre@dominio\.com\)/);
  });
});
