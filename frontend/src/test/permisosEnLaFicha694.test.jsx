import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react';

/*
  #694 · Los permisos siempre a la vista en la ficha de usuario.

  - Editando: la sección «Permisos» está en la propia ficha, sin pulsar nada,
    con de dónde le viene cada uno; una excepción se guarda ahí mismo.
  - En el alta: lo que trae el rol elegido, y las excepciones se ajustan antes
    de crearla y viajan con el alta.
  - Nadie da lo que no tiene: «Sí» no se ofrece para lo que quien da de alta no
    tiene. Sin «Permisos de cada persona», solo lectura.
*/

const avisos = vi.hoisted(() => ({ toast: vi.fn() }));
const api = vi.hoisted(() => ({ getCatalogo: vi.fn(), getFicha: vi.fn(), guardarExcepciones: vi.fn(), cambiarRolAMedida: vi.fn(), vistaPreviaDeAlta: vi.fn() }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: avisos.toast }));
vi.mock('@/shared/components/ui/portal', () => ({ default: ({ children }) => children }));
vi.mock('@/modules/permissions/api/permissions.api', () => api);

const { default: UserFormDialog } = await import('@/modules/users/components/UserFormDialog');

const CATALOGO = {
  roles: [],
  secciones: [{
    clave: 'comercial', nombre: 'Comercial', recursos: [{
      clave: 'leads', nombre: 'Prospectos', acciones: [
        { clave: 'leads.view', nombre: 'Ver prospectos', descripcion: '' },
        { clave: 'leads.export', nombre: 'Exportar prospectos', descripcion: '' },
        { clave: 'leads.borrar', nombre: 'Borrar prospectos', descripcion: '' },
      ],
    }],
  }],
};
const base = {
  projects: [{ id: 1, nombre: 'ISEIH' }], canResetPassword: true, canChangeEmail: false, loading: false,
  onClose: vi.fn(), onSubmit: vi.fn(), onCheckEmail: vi.fn().mockResolvedValue(null), onResetPassword: vi.fn(),
};
const esperar = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
// La sección siempre enseña «Solo lo que puede»; para ver todo, se quita.
const verTodo = () => fireEvent.click(screen.getByLabelText('Solo lo que puede'));
const abrirComercial = () => fireEvent.click(screen.getByRole('button', { name: /Comercial/ }));

beforeEach(() => {
  vi.clearAllMocks();
  api.getCatalogo.mockResolvedValue(CATALOGO);
  api.guardarExcepciones.mockResolvedValue({});
});

describe('#694 · editando: los permisos en la propia ficha', () => {
  const laura = { id: 4, nombre: 'Laura', email: 'laura@empresa.com', role: 'gestor', projects: [{ project_id: 1, can_view: true, can_edit: true }] };
  const ficha = (puedeEditar) => ({
    persona: { id: 4, nombre: 'Laura', email: 'laura@empresa.com', role: 'gestor', roles_extra: [], active: true },
    mapa: { 'leads.view': true, 'leads.export': false, 'leads.borrar': false },
    origenes: { 'leads.view': { tipo: 'rol', rol: 'gestor' }, 'leads.export': { tipo: 'rol', rol: 'gestor' }, 'leads.borrar': { tipo: 'rol', rol: 'gestor' } },
    excepciones: {}, rolAMedida: null, rolesAMedida: [], registro: [], puedeEditar,
  });

  it('se ven sin abrir otro diálogo, con de dónde le viene cada uno', async () => {
    api.getFicha.mockResolvedValue(ficha(true));
    render(<UserFormDialog {...base} user={laura} />);
    await esperar();
    expect(screen.getByRole('heading', { name: 'Permisos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ver permisos/ })).toBeNull();
    abrirComercial();
    expect(screen.getByText('Ver prospectos')).toBeInTheDocument();
    expect(screen.getByText('Su rol: Gestora')).toBeInTheDocument();
  });

  it('una excepción se guarda ahí mismo', async () => {
    api.getFicha.mockResolvedValue(ficha(true));
    render(<UserFormDialog {...base} user={laura} />);
    await esperar();
    verTodo(); abrirComercial();
    const grupo = screen.getByRole('radiogroup', { name: 'Excepción para Exportar prospectos' });
    fireEvent.click(within(grupo).getByRole('radio', { name: 'Sí' }));
    await esperar();
    expect(api.guardarExcepciones).toHaveBeenCalledWith(4, { 'leads.export': true });
  });

  it('sin «Permisos de cada persona», solo lectura', async () => {
    api.getFicha.mockResolvedValue(ficha(false));
    render(<UserFormDialog {...base} user={laura} />);
    await esperar();
    abrirComercial();
    expect(screen.getByText(/solo lectura/)).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });
});

describe('#694 · en el alta: lo que trae el rol, y sus excepciones antes de crearla', () => {
  const vista = (excepciones = {}, misPermisos = null) => ({
    mapa: { 'leads.view': true, 'leads.export': excepciones['leads.export'] === true, 'leads.borrar': false },
    origenes: {
      'leads.view': { tipo: 'rol', rol: 'gestor' },
      'leads.export': excepciones['leads.export'] === true ? { tipo: 'excepcion' } : { tipo: 'rol', rol: 'gestor' },
      'leads.borrar': { tipo: 'rol', rol: 'gestor' },
    },
    puedeEditar: true, misPermisos,
  });

  it('pide lo que trae el rol elegido y, con una excepción, vuelve a pedirlo con ella', async () => {
    api.vistaPreviaDeAlta.mockImplementation(async ({ excepciones }) => vista(excepciones));
    render(<UserFormDialog {...base} user={null} />);
    await esperar();
    expect(api.vistaPreviaDeAlta).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'gestor', excepciones: {} }));
    verTodo(); abrirComercial();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Excepción para Exportar prospectos' })).getByRole('radio', { name: 'Sí' }));
    await esperar();
    expect(api.vistaPreviaDeAlta).toHaveBeenLastCalledWith(expect.objectContaining({ excepciones: { 'leads.export': true } }));
    expect(screen.getByText('Excepción suya')).toBeInTheDocument();
    // No se guarda nada todavía: va con el alta.
    expect(api.guardarExcepciones).not.toHaveBeenCalled();
  });

  it('las excepciones viajan con el alta', async () => {
    api.vistaPreviaDeAlta.mockImplementation(async ({ excepciones }) => vista(excepciones));
    const onSubmit = vi.fn();
    const { container } = render(<UserFormDialog {...base} user={null} onSubmit={onSubmit} />);
    await esperar();
    verTodo(); abrirComercial();
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Excepción para Exportar prospectos' })).getByRole('radio', { name: 'Sí' }));
    await esperar();
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: 'Ana Nueva' } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ana@empresa.com' } });
    const campus = container.querySelector('input[type="checkbox"][value="1"]') || screen.getAllByRole('checkbox').find((c) => /ISEIH/.test(c.closest('label')?.textContent || ''));
    if (campus) fireEvent.click(campus);
    fireEvent.submit(container.querySelector('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ excepciones: { 'leads.export': true } });
  });

  it('«Sí» no se ofrece para lo que quien da de alta no tiene', async () => {
    api.vistaPreviaDeAlta.mockResolvedValue(vista({}, ['leads.view']));
    render(<UserFormDialog {...base} user={null} />);
    await esperar();
    verTodo(); abrirComercial();
    const si = within(screen.getByRole('radiogroup', { name: 'Excepción para Exportar prospectos' })).getByRole('radio', { name: 'Sí' });
    expect(si).toBeDisabled();
    expect(si).toHaveAttribute('title', 'No lo puedes dar: tú no lo tienes');
  });

  it('si deja de poder ajustarlas (la persona nueva es admin), se quitan las que llevaba y se dice por qué', async () => {
    // Revisión de la #698: con excepciones puestas, pasar a un rol que no le
    // toca ajustar haría que el alta diera 403 al crear.
    let esAdmin = false;
    api.vistaPreviaDeAlta.mockImplementation(async ({ excepciones }) => (esAdmin
      ? { ...vista(excepciones), puedeEditar: false, motivo: 'Los permisos de un admin los cambia el superadmin.' }
      : vista(excepciones)));
    render(<UserFormDialog {...base} user={null} />);
    await esperar();
    verTodo(); abrirComercial();
    esAdmin = true;
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Excepción para Exportar prospectos' })).getByRole('radio', { name: 'Sí' }));
    await waitFor(() => expect(api.vistaPreviaDeAlta).toHaveBeenLastCalledWith(expect.objectContaining({ excepciones: {} })));
    expect(await screen.findByText('Los permisos de un admin los cambia el superadmin.')).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('sin uno de sus campus elegido no deja tocarlas, y dice por qué; al marcar el campus, se lo pregunta al servidor', async () => {
    api.vistaPreviaDeAlta.mockImplementation(async ({ projectIds = [] }) => (projectIds.length
      ? vista({})
      : { ...vista({}), puedeEditar: false, motivo: 'Para darle permisos, ponle primero uno de tus campus.' }));
    const { container } = render(<UserFormDialog {...base} user={null} />);
    await esperar();
    expect(api.vistaPreviaDeAlta).toHaveBeenLastCalledWith(expect.objectContaining({ projectIds: [] }));
    expect(screen.getByText('Para darle permisos, ponle primero uno de tus campus.')).toBeInTheDocument();
    verTodo(); abrirComercial();
    expect(screen.queryByRole('radiogroup', { name: 'Excepción para Exportar prospectos' })).toBeNull();
    const campus = container.querySelector('input[type="checkbox"][value="1"]') || screen.getAllByRole('checkbox').find((c) => /ISEIH/.test(c.closest('label')?.textContent || ''));
    fireEvent.click(campus);
    await esperar();
    expect(api.vistaPreviaDeAlta).toHaveBeenLastCalledWith(expect.objectContaining({ projectIds: [1] }));
    expect(screen.queryByText('Para darle permisos, ponle primero uno de tus campus.')).toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Excepción para Exportar prospectos' })).toBeInTheDocument();
  });
});
