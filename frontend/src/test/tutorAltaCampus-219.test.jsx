import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

/*
  #219 · «+ Nuevo tutor» desactivado si arriba hay una empresa o «Todos».

  Terminada cuando: con CEDIA o «Todos» arriba, «+ Nuevo tutor» abre el
  formulario con un desplegable de campus; al elegirlo se cargan sus
  formaciones, y al guardar se guardan.
*/

const avisos = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: avisos.toast }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'superadmin' } }) }));

// La cabecera: una empresa (CEDIA) con dos campus, sin campus elegido.
const CEDIA = vi.hoisted(() => ({ id: 7, nombre: 'CEDIA' }));
const CAMPUS = vi.hoisted(() => ({ lista: [{ id: 1, nombre: 'Psiko' }, { id: 2, nombre: 'Fono' }] }));
const CABECERA = vi.hoisted(() => ({ activeProject: { id: -1 } }));
vi.mock('@/contexts/ProjectContext', () => ({
  useProjectContext: () => ({ activeProject: CABECERA.activeProject, projects: CAMPUS.lista, activeIssuer: CEDIA, activeIssuerId: 7 }),
}));
vi.mock('@/shared/hooks/useAmbito', () => ({ useProyectosDelAmbito: () => CAMPUS.lista }));

const get = vi.hoisted(() => vi.fn());
vi.mock('@/shared/api/client', () => ({ default: { get } }));
vi.mock('@/modules/tutores/components/Entregables', () => ({ default: () => null }));
vi.mock('@/modules/tutores/components/ConsultasDelTutor', () => ({ default: () => null }));
vi.mock('@/modules/users/api/users.api', () => ({ avisoCambioCorreo: vi.fn() }));
const api = vi.hoisted(() => ({
  listar: vi.fn(), colaboraciones: vi.fn(), ajustes: vi.fn(), alta: vi.fn(), crearColaboracion: vi.fn(),
}));
vi.mock('@/modules/tutores/api/tutores.api', () => ({ tutoresApi: api }));

import TutoresPage from '@/modules/tutores/pages/TutoresPage';

const esperar = () => act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
const FORMACIONES = {
  1: [{ id: 11, nombre: 'Máster en Psicología', precio: 900 }],
  2: [{ id: 21, nombre: 'Logopedia infantil', precio: 600 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  CAMPUS.lista = [{ id: 1, nombre: 'Psiko' }, { id: 2, nombre: 'Fono' }];
  CABECERA.activeProject = { id: -1 };
  get.mockImplementation((url) => {
    const m = url.match(/projectId=(\d+)/);
    return Promise.resolve({ success: true, data: m ? (FORMACIONES[m[1]] || []) : [] });
  });
  api.listar.mockResolvedValue({ success: true, data: [] });
  api.colaboraciones.mockResolvedValue({ success: true, data: [] });
  api.ajustes.mockResolvedValue({ success: true, data: { aplica_desde: '2026-08-01', pct_por_defecto: 10 } });
  api.alta.mockResolvedValue({ success: true, data: { id: 9, entraYa: true } });
  api.crearColaboracion.mockResolvedValue({ success: true });
});

async function abrirAlta() {
  const r = render(<TutoresPage />);
  await esperar();
  const boton = screen.getByRole('button', { name: /Nuevo tutor/ });
  expect(boton.disabled).toBe(false);
  fireEvent.click(boton);
  await esperar();
  const form = r.container.querySelector('input[name="nombre"]').closest('form');
  fireEvent.change(form.querySelector('input[name="nombre"]'), { target: { value: 'Ana Tutora' } });
  fireEvent.change(form.querySelector('input[name="email"]'), { target: { value: 'ana@prueba.local' } });
  return form;
}

describe('Nuevo tutor con una empresa o «Todos» arriba (#219)', () => {
  it('el botón ya no está gris, y el formulario pide el campus entre los de la empresa', async () => {
    const form = await abrirAlta();
    const campus = form.querySelector('#alta-campus');
    expect(campus).toBeTruthy();
    expect([...campus.options].map((o) => o.textContent)).toEqual(['Elige el campus…', 'Psiko', 'Fono']);
    expect(screen.queryByText(/elige un campus para dar de alta/i)).toBeNull();
  });

  it('sin campus no se da de alta, y lo dice', async () => {
    const form = await abrirAlta();
    await act(async () => { fireEvent.submit(form); });
    expect(api.alta).not.toHaveBeenCalled();
    expect(avisos.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Falta el campus' }));
  });

  it('al elegir el campus se cargan SUS formaciones, y al guardar entra en él con su curso', async () => {
    const form = await abrirAlta();
    fireEvent.change(form.querySelector('#alta-campus'), { target: { value: '2' } });
    await esperar();
    expect(get).toHaveBeenCalledWith('/products?projectId=2&limit=500');

    // El curso sale del catálogo de Fono, no del de Psiko.
    const curso = form.querySelector('#alta-curso');
    fireEvent.focus(curso);
    fireEvent.change(curso, { target: { value: 'logo' } });
    await esperar();
    expect(screen.queryByText('Máster en Psicología')).toBeNull();
    fireEvent.mouseDown(screen.getByText('Logopedia infantil'));
    fireEvent.click(screen.getByText('Logopedia infantil'));
    await esperar();

    await act(async () => { fireEvent.submit(form); });
    await esperar();
    expect(api.alta).toHaveBeenCalledWith(expect.objectContaining({ projectIds: [2] }));
    expect(api.crearColaboracion).toHaveBeenCalledWith(expect.objectContaining({ tutorId: 9, productId: 21 }));
  });

  it('con una empresa de un solo campus, ya viene elegido', async () => {
    CAMPUS.lista = [{ id: 2, nombre: 'Fono' }];
    const form = await abrirAlta();
    expect(form.querySelector('#alta-campus').value).toBe('2');
    await act(async () => { fireEvent.submit(form); });
    await esperar();
    expect(api.alta).toHaveBeenCalledWith(expect.objectContaining({ projectIds: [2] }));
  });

  it('con un campus arriba no pregunta: es ese', async () => {
    CABECERA.activeProject = { id: 1 };
    const form = await abrirAlta();
    expect(form.querySelector('#alta-campus')).toBeNull();
    await act(async () => { fireEvent.submit(form); });
    await esperar();
    expect(api.alta).toHaveBeenCalledWith(expect.objectContaining({ projectIds: [1] }));
  });
});
