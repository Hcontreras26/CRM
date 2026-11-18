import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * #690 · Un webhook del Resumen abierto en otra pestaña (Ctrl/Cmd + clic o el
 * botón central) lleva su campus en la dirección: `?projectId=N`. El CRM ya lo
 * leía (#132), pero si había una EMPRESA guardada seguía mandando la empresa y
 * la ficha, que es de un campus, se quedaba en el muro. Ahora el campus de la
 * dirección quita la empresa.
 */

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/shared/api/client', () => ({
  default: { get, post },
  setAccessToken: vi.fn(),
  setOnAuthFailure: vi.fn(),
}));

import { AuthProvider, useAuth } from '@/contexts/AuthContext';

const PROYECTOS = [
  { id: 1, nombre: 'ISEIH', sociedad_emisora_id: 7 },
  { id: 2, nombre: 'Psiko Aprende', sociedad_emisora_id: 7 },
];

function Ver() {
  const { loading, activeProjectId, activeIssuerId } = useAuth();
  if (loading) return <p>cargando</p>;
  return <p data-testid="ambito">{`campus:${activeProjectId} empresa:${activeIssuerId}`}</p>;
}

const conDireccion = (search) => window.history.replaceState({}, '', `/crm/conexion/webhooks/prospectos/11${search}`);

beforeEach(() => {
  localStorage.clear();
  get.mockReset();
  get.mockResolvedValue({ success: true, data: { user: { id: 1, role: 'admin' }, permissions: {}, projects: PROYECTOS } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { accessToken: 't' } }) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('el campus de la dirección manda sobre la empresa guardada', () => {
  it('con ?projectId y una empresa guardada: se queda el campus y se quita la empresa', async () => {
    localStorage.setItem('crm_active_issuer_id', '7');
    conDireccion('?projectId=2');
    render(<AuthProvider><Ver /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('ambito').textContent).toBe('campus:2 empresa:null'));
    expect(localStorage.getItem('crm_active_issuer_id')).toBeNull();
    expect(localStorage.getItem('crm_active_project_id')).toBe('2');
  });

  it('sin ?projectId, la empresa guardada se respeta, como siempre', async () => {
    localStorage.setItem('crm_active_issuer_id', '7');
    conDireccion('');
    render(<AuthProvider><Ver /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('ambito').textContent).toMatch(/empresa:7$/));
    expect(localStorage.getItem('crm_active_issuer_id')).toBe('7');
  });

  it('al iniciar sesión con ?projectId en la dirección, igual: el campus y sin la empresa', async () => {
    localStorage.setItem('crm_active_issuer_id', '7');
    conDireccion('?projectId=2');
    // Sin sesión de antes: el refresco falla y se entra con el formulario.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    post.mockResolvedValue({ success: true, data: { accessToken: 't', user: { id: 1, role: 'admin' }, projects: PROYECTOS, permissions: {} } });
    function Entrar() {
      const { login } = useAuth();
      return <button type="button" onClick={() => login('a@b.c', 'x')}>entrar</button>;
    }
    render(<AuthProvider><Entrar /><Ver /></AuthProvider>);
    fireEvent.click(await screen.findByText('entrar'));
    await waitFor(() => expect(screen.getByTestId('ambito').textContent).toBe('campus:2 empresa:null'));
    expect(localStorage.getItem('crm_active_issuer_id')).toBeNull();
  });

  it('un ?projectId que no es de la persona no quita nada', async () => {
    localStorage.setItem('crm_active_issuer_id', '7');
    conDireccion('?projectId=99');
    render(<AuthProvider><Ver /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId('ambito').textContent).toMatch(/empresa:7$/));
  });
});
