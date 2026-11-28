import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';

/*
  #1199 · El cambio de correo pendiente y su historial, en la ficha de Usuarios.

  - Con `users.cambios_correo`: el pendiente (a qué dirección, cuándo lo pidió,
    hasta cuándo vale, intentos) y los anteriores, de qué correo a cuál.
  - «Anular» pregunta antes y, al confirmar, llama al servidor y la ficha
    queda sin pendiente.
  - Sin el permiso, la sección no sale y ni se pregunta al servidor.
  - Si el servidor dice que no (403/404), la sección no sale.
*/

const avisos = vi.hoisted(() => ({ toast: vi.fn() }));
const red = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: avisos.toast }));
vi.mock('@/shared/components/ui/portal', () => ({ default: ({ children }) => children }));
vi.mock('@/shared/api/client', () => ({ default: red }));
vi.mock('@/modules/permissions/api/permissions.api', () => ({
  getCatalogo: vi.fn(async () => ({ roles: [], secciones: [] })),
  getFicha: vi.fn(async () => null),
  guardarExcepciones: vi.fn(), cambiarRolAMedida: vi.fn(), vistaPreviaDeAlta: vi.fn(),
}));

const { default: UserFormDialog } = await import('@/modules/users/components/UserFormDialog');

const laura = { id: 4, nombre: 'Laura', email: 'laura@empresa.com', role: 'gestor', projects: [] };
const base = {
  user: laura, projects: [], canResetPassword: false, canChangeEmail: false, loading: false,
  onClose: vi.fn(), onSubmit: vi.fn(), onCheckEmail: vi.fn().mockResolvedValue(null), onResetPassword: vi.fn(),
};
const PENDIENTE = {
  id: 9, estado: 'pendiente', de: 'laura@empresa.com', a: 'laura.nueva@empresa.com',
  pedido_at: '2026-11-26T10:00:00Z', expira_at: '2026-11-26T10:15:00Z', intentos: 2, cuando: '2026-11-26T10:15:00Z',
};
const ANTERIOR = {
  id: 7, estado: 'confirmado', de: 'laura.vieja@empresa.com', a: 'laura@empresa.com',
  pedido_at: '2026-11-01T09:00:00Z', expira_at: '2026-11-01T09:15:00Z', intentos: 1, cuando: '2026-11-01T09:03:00Z',
};
const esperar = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const pidioLaFicha = () => red.get.mock.calls.some(([url]) => url === '/users/4/cambios-de-correo');

beforeEach(() => {
  vi.clearAllMocks();
  red.get.mockImplementation(async (url) => {
    if (url === '/users/4/cambios-de-correo') return { success: true, data: { pendiente: PENDIENTE, historial: [ANTERIOR], intentos_max: 5 } };
    throw Object.assign(new Error('No'), { status: 404 });
  });
  red.post.mockResolvedValue({ success: true, data: { pendiente: null, historial: [{ ...PENDIENTE, estado: 'anulado' }, ANTERIOR], intentos_max: 5 } });
});

describe('#1199 · la sección «Cambio de correo» de la ficha', () => {
  it('con el permiso: el pendiente con su dirección, fechas e intentos, y los anteriores', async () => {
    render(<UserFormDialog {...base} verCambiosDeCorreo />);
    const seccion = await screen.findByTestId('cambio-de-correo');
    const s = within(seccion);
    expect(s.getByRole('heading', { name: 'Cambio de correo' })).toBeInTheDocument();
    expect(s.getByText('laura.nueva@empresa.com')).toBeInTheDocument();
    expect(s.getByText('2 de 5')).toBeInTheDocument();
    expect(s.getByText('Lo pidió')).toBeInTheDocument();
    expect(s.getByText('Vale hasta')).toBeInTheDocument();
    expect(s.getByText('Confirmado')).toBeInTheDocument();
    expect(s.getByText(/laura\.vieja@empresa\.com/)).toBeInTheDocument();
    // Nada que se parezca a un código.
    expect(seccion.textContent).not.toMatch(/\b\d{6}\b/);
  });

  it('«Anular» pregunta antes; con «Sí, anular» lo anula y la ficha se queda sin pendiente', async () => {
    render(<UserFormDialog {...base} verCambiosDeCorreo />);
    const seccion = await screen.findByTestId('cambio-de-correo');
    fireEvent.click(within(seccion).getByRole('button', { name: 'Anular' }));
    expect(red.post).not.toHaveBeenCalled();
    // «No» lo deja como estaba.
    fireEvent.click(within(seccion).getByRole('button', { name: 'No' }));
    fireEvent.click(within(seccion).getByRole('button', { name: 'Anular' }));
    fireEvent.click(within(seccion).getByRole('button', { name: 'Sí, anular' }));
    await waitFor(() => expect(red.post).toHaveBeenCalledWith('/users/4/cambios-de-correo/anular'));
    expect(await within(seccion).findByText('No tiene ningún cambio de correo pendiente.')).toBeInTheDocument();
    expect(within(seccion).getByText('Anulado')).toBeInTheDocument();
    // Anular no envía el formulario de la ficha.
    expect(base.onSubmit).not.toHaveBeenCalled();
  });

  it('sin el permiso: no sale y ni se pregunta al servidor', async () => {
    render(<UserFormDialog {...base} />);
    await esperar();
    expect(screen.queryByTestId('cambio-de-correo')).toBeNull();
    expect(pidioLaFicha()).toBe(false);
  });

  it('si el servidor dice que no (fuera de sus campus), no sale', async () => {
    red.get.mockRejectedValue(Object.assign(new Error('Usuario no encontrado'), { status: 404 }));
    render(<UserFormDialog {...base} verCambiosDeCorreo />);
    await esperar();
    expect(pidioLaFicha()).toBe(true);
    expect(screen.queryByTestId('cambio-de-correo')).toBeNull();
  });

  it('sin nada pendiente ni anterior: lo dice, sin botón de anular', async () => {
    red.get.mockImplementation(async (url) => {
      if (url === '/users/4/cambios-de-correo') return { success: true, data: { pendiente: null, historial: [], intentos_max: 5 } };
      throw Object.assign(new Error('No'), { status: 404 });
    });
    render(<UserFormDialog {...base} verCambiosDeCorreo />);
    const seccion = await screen.findByTestId('cambio-de-correo');
    expect(within(seccion).getByText('No tiene ningún cambio de correo pendiente.')).toBeInTheDocument();
    expect(within(seccion).queryByRole('button', { name: 'Anular' })).toBeNull();
  });
});
