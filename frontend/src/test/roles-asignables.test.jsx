import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

/*
  Tony (admin de ICTESS, 03/11) intentó dar de alta a una persona cinco veces
  con el rol «Soporte», y cinco veces el servidor le dijo «Ese rol le daría lo
  que tú no tienes» sin decirle qué cambiar. Ahora el formulario pregunta antes
  qué roles puede dar (GET /users/roles-asignables) y los que no, salen
  apagados y con su porqué. Si aun así el servidor dice NO_LO_TIENES, se dice
  qué rol quitar.
*/

const avisos = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: avisos.toast }));
vi.mock('@/shared/components/ui/portal', () => ({ default: ({ children }) => children }));

const si = { puede: true, faltan: [], cuantos: 0 };
const noSoporte = { puede: false, faltan: ['Recuperar prospectos borrados', 'Revisar avisos de spam', 'Forma de los avisos'], cuantos: 5 };
const api = vi.hoisted(() => ({ listRolesAsignables: vi.fn() }));
vi.mock('@/modules/users/api/users.api', async (original) => ({ ...(await original()), listRolesAsignables: api.listRolesAsignables }));

import UserFormDialog from '@/modules/users/components/UserFormDialog';
import { mensajeNoLoTienes } from '@/modules/users/lib/rolesAsignables';

const base = {
  projects: [], canResetPassword: false, canChangeEmail: false, loading: false,
  onClose: vi.fn(), onSubmit: vi.fn(), onCheckEmail: vi.fn().mockResolvedValue(null), onResetPassword: vi.fn(),
};
const comoAdmin = ['superadmin', 'admin', 'gestor', 'soporte', 'project_manager', 'tutor', 'colaborador'].map((rol) => ({
  rol, nombre: rol,
  principal: rol === 'soporte' || rol === 'superadmin' ? noSoporte : si,
  anadido: rol === 'soporte' || rol === 'superadmin' ? noSoporte : si,
}));

describe('roles que no se pueden dar (Tony, 03/11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listRolesAsignables.mockResolvedValue(comoAdmin);
  });

  it('el admin ve «Soporte» desactivado, con el aviso de por qué', async () => {
    render(<UserFormDialog {...base} user={null} />);
    const aviso = await screen.findByTestId('rol-no-asignable-soporte');
    expect(aviso.textContent).toContain('No puedes dar este rol: le daría permisos que tú no tienes (Recuperar prospectos borrados, Revisar avisos de spam, Forma de los avisos…). Pídeselo a un superadmin.');
    expect(api.listRolesAsignables).toHaveBeenCalledTimes(1);

    // En el desplegable, apagado; elegirlo no lo elige.
    fireEvent.click(screen.getByRole('combobox', { name: 'Rol' }));
    const opcion = within(screen.getByRole('listbox')).getByRole('option', { name: /Soporte/ });
    expect(opcion.getAttribute('aria-disabled')).toBe('true');
    fireEvent.mouseDown(opcion);
    expect(screen.getByRole('combobox', { name: 'Rol' }).textContent).not.toMatch(/Soporte/);
    // La lista sigue abierta; los que sí puede dar, no están apagados.
    expect(within(screen.getByRole('listbox')).getByRole('option', { name: 'Admin' }).getAttribute('aria-disabled')).toBeNull();
  });

  it('y lo mismo en las casillas de roles añadidos', async () => {
    render(<UserFormDialog {...base} user={null} />);
    const aviso = await screen.findByTestId('extra-no-asignable-soporte');
    expect(aviso.textContent).toContain('Pídeselo a un superadmin.');
    const boton = screen.getByRole('button', { name: /Soporte/ });
    expect(boton.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Tutor / Profesor' }).disabled).toBe(false);
  });

  it('al editar no se pide la lista: lo que ya tenía no es «dar»', () => {
    render(<UserFormDialog {...base} user={{ id: 4, nombre: 'Laura', email: 'laura@empresa.com', role: 'soporte', projects: [] }} />);
    expect(api.listRolesAsignables).not.toHaveBeenCalled();
  });

  it('si la lista no llega, el formulario sigue como antes', async () => {
    api.listRolesAsignables.mockRejectedValue(new Error('caído'));
    render(<UserFormDialog {...base} user={null} />);
    await waitFor(() => expect(api.listRolesAsignables).toHaveBeenCalled());
    expect(screen.queryByTestId('rol-no-asignable-soporte')).toBeNull();
    expect(screen.getByRole('button', { name: /Soporte/ }).disabled).toBe(false);
  });
});

describe('si el servidor aun así dice NO_LO_TIENES, qué rol quitar', () => {
  const error = (data) => Object.assign(new Error('Ese rol le daría lo que tú no tienes: X'), {
    status: 403, data: { success: false, code: 'NO_LO_TIENES', error: 'Ese rol le daría lo que tú no tienes: X', data },
  });

  it('con el rol que dice el servidor', () => {
    const m = mensajeNoLoTienes(error({ roles: ['soporte'], faltan: ['Recuperar prospectos borrados'], cuantos: 1 }), { role: 'gestor', roles_extra: ['soporte'] });
    expect(m).toBe('Quita «Desarrollador / Soporte»: le daría permisos que tú no tienes (Recuperar prospectos borrados). Si de verdad lo necesita, pídeselo a un superadmin.');
  });

  it('sin él (un servidor viejo), los roles pedidos', () => {
    const m = mensajeNoLoTienes(error(undefined), { role: 'soporte', roles_extra: ['tutor'] });
    expect(m).toMatch(/^Quita «Desarrollador \/ Soporte» y «Tutor \/ Profesor»: le daría permisos que tú no tienes\./);
  });

  it('otro error no es este', () => {
    expect(mensajeNoLoTienes(new Error('Error 500'), { role: 'gestor', roles_extra: [] })).toBeNull();
  });
});
