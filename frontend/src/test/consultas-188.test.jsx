import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/*
  Consultas de alumnos, fase 2 (#188): la bandeja del tutor, el panel de
  administración y una consulta (responder con adjuntos, reintentar, reasignar).
*/

const api = vi.hoisted(() => ({
  mias: vi.fn(), panel: vi.fn(), ver: vi.fn(), responder: vi.fn(), reintentar: vi.fn(), cerrar: vi.fn(),
  tutoresPosibles: vi.fn(), reasignar: vi.fn(), leerAhora: vi.fn(), abrirAdjunto: vi.fn(), toast: vi.fn(),
  user: { role: 'tutor' },
}));
vi.mock('@/modules/consultas/api/consultas.api', async (original) => {
  const real = await original();
  return { ...real, consultasApi: api };
});
vi.mock('@/shared/hooks/useToast', () => ({ toast: api.toast }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: api.user }) }));
vi.mock('@/contexts/ProjectContext', () => ({
  useProjectContext: () => ({ activeProject: { id: 1, nombre: 'Psiko' }, activeIssuerId: null }),
}));

import { semaforo } from '@/modules/consultas/api/consultas.api';
import ConsultasPage from '@/modules/consultas/pages/ConsultasPage';
import ConsultaPage from '@/modules/consultas/pages/ConsultaPage';

const horasAtras = (h) => new Date(Date.now() - h * 3600_000).toISOString();
const fila = (extra = {}) => ({
  id: 5, project_id: 1, campus: 'Psiko', empresa: 'CEDIA', alumno_nombre: 'Alumna Uno', alumno_email: 'a@campus.es',
  curso_nombre: 'Curso de prueba', tutor_id: 7, tutor: 'Tutora', estado: 'abierta', entrada_at: horasAtras(20),
  espera_desde: horasAtras(20), ultimo_mensaje: 'No encuentro el tema 3', sin_enviar: 0,
  asignada_at: null, primera_lectura_at: null, primera_respuesta_at: null, cerrada_at: null, reabierta_at: null, ...extra,
});
const detalle = (extra = {}) => ({
  ...fila(), plazoHoras: 24, puedes: 'tutor', eventos: [{ tipo: 'entrada', at: horasAtras(20), quien: null, detalle: null }],
  mensajes: [{ id: 1, autor: 'alumno', autor_nombre: null, texto: 'No encuentro el tema 3', escrito_at: horasAtras(20),
    enviado_campus_at: null, error_envio: null, en_el_campus: true, adjuntos: [] }],
  ...extra,
});

const enLaFicha = () => render(
  <MemoryRouter initialEntries={['/consultas/5']}>
    <Routes><Route path="/consultas/:id" element={<ConsultaPage />} /></Routes>
  </MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  api.user = { role: 'tutor' };
  api.mias.mockResolvedValue({ success: true, data: { consultas: [fila()], plazoHoras: 24 } });
  api.panel.mockResolvedValue({ success: true, data: { consultas: [fila({ tutor: null, tutor_id: null })], plazoHoras: 24 } });
  api.ver.mockResolvedValue({ success: true, data: detalle() });
  api.tutoresPosibles.mockResolvedValue({ success: true, data: [{ id: 7, nombre: 'Tutora' }, { id: 8, nombre: 'Otro tutor' }] });
});

describe('el semáforo del plazo (24 h)', () => {
  it('verde, ámbar desde las 3/4 partes, rojo pasado el plazo; las respondidas no esperan', () => {
    expect(semaforo({ estado: 'abierta', espera_desde: horasAtras(2), entrada_at: horasAtras(2) }, 24).color).toBe('verde');
    expect(semaforo({ estado: 'abierta', espera_desde: horasAtras(20), entrada_at: horasAtras(20) }, 24).color).toBe('ambar');
    expect(semaforo({ estado: 'abierta', espera_desde: horasAtras(30), entrada_at: horasAtras(30) }, 24).color).toBe('rojo');
    expect(semaforo({ estado: 'respondida', espera_desde: null, entrada_at: horasAtras(30) }, 24)).toBeNull();
  });
});

describe('Consultas (#188) · la lista', () => {
  it('el tutor ve su bandeja: sus pendientes, con el semáforo', async () => {
    render(<MemoryRouter><ConsultasPage /></MemoryRouter>);
    expect(await screen.findByText('Alumna Uno')).toBeTruthy();
    expect(api.mias).toHaveBeenCalledWith(expect.objectContaining({ estado: 'pendientes' }));
    expect(api.panel).not.toHaveBeenCalled();
    expect(screen.getByText(/Cerca del plazo/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Leer el campus ahora/ })).toBeNull();
  });

  it('administración ve el panel del campus de arriba, con «Solo sin tutor» y «Leer el campus ahora»', async () => {
    api.user = { role: 'admin' };
    render(<MemoryRouter><ConsultasPage /></MemoryRouter>);
    expect(await screen.findByText(/Sin tutor/)).toBeTruthy();
    expect(api.panel).toHaveBeenCalledWith({ projectId: 1, issuerId: null }, expect.objectContaining({ estado: 'pendientes' }));
    fireEvent.click(screen.getByLabelText('Solo sin tutor'));
    await waitFor(() => expect(api.panel).toHaveBeenLastCalledWith({ projectId: 1, issuerId: null }, expect.objectContaining({ sinTutor: true })));
    expect(screen.getByRole('button', { name: /Leer el campus ahora/ })).toBeTruthy();
  });
});

describe('Consultas (#188) · una consulta', () => {
  it('responder vacío dice qué falta; con texto y un adjunto, lo envía', async () => {
    api.responder.mockResolvedValue({ success: true, data: { enviado: true, error: null, consulta: detalle({ estado: 'respondida' }) } });
    enLaFicha();
    await screen.findByText('No encuentro el tema 3', { selector: 'p' });
    fireEvent.click(screen.getByRole('button', { name: /Responder/ }));
    expect(await screen.findByText('Falta la respuesta: escríbela aquí.')).toBeTruthy();
    expect(api.responder).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/^Tu respuesta/), { target: { value: 'Está en la sección 2.' } });
    const pdf = new File(['%PDF'], 'temario.pdf', { type: 'application/pdf' });
    fireEvent.change(document.getElementById('consulta-adjuntos'), { target: { files: [pdf] } });
    expect(screen.getByText('temario.pdf')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Responder/ }));
    await waitFor(() => expect(api.responder).toHaveBeenCalledWith(5, 'Está en la sección 2.', [pdf]));
    expect(api.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Respuesta enviada' }));
  });

  it('una respuesta que no llegó al campus dice por qué y se puede reintentar', async () => {
    api.ver.mockResolvedValue({ success: true, data: detalle({ mensajes: [
      { id: 2, autor: 'tutor', autor_nombre: 'Tutora', texto: 'Mira la sección 2', escrito_at: horasAtras(1),
        enviado_campus_at: null, error_envio: 'Falta el token del tutor en este campus', en_el_campus: false, adjuntos: [] },
    ] }) });
    api.reintentar.mockResolvedValue({ success: true, data: { enviado: true } });
    enLaFicha();
    expect(await screen.findByText(/No ha llegado al campus: Falta el token del tutor/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/ }));
    await waitFor(() => expect(api.reintentar).toHaveBeenCalledWith(2));
  });

  it('administración reasigna (a otro, no al mismo) y no responde', async () => {
    api.user = { role: 'admin' };
    api.ver.mockResolvedValue({ success: true, data: detalle({ puedes: 'admin' }) });
    api.reasignar.mockResolvedValue({ success: true, data: detalle({ puedes: 'admin', tutor_id: 8 }) });
    enLaFicha();
    await screen.findByText('Alumna Uno');
    expect(screen.queryByLabelText(/^Tu respuesta/)).toBeNull();
    fireEvent.click(await screen.findByRole('combobox', { name: 'Reasignar a otro tutor' }));
    expect(screen.queryByRole('option', { name: 'Tutora' })).toBeNull();
    fireEvent.mouseDown(screen.getByRole('option', { name: 'Otro tutor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
    await waitFor(() => expect(api.reasignar).toHaveBeenCalledWith(5, 8));
  });
});
