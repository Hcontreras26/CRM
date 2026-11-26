import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import FeedbackEncuestaPage from '@/modules/feedback/pages/FeedbackEncuestaPage';
import { respuestasEnCsv } from '@/modules/feedback/components/FeedbackEnReportes';

/**
 * Tercera tanda de la auditoría de Feedback (#1154): la encuesta, que se tiene
 * que poder contestar entera solo con el teclado y con lector de pantalla, y el
 * CSV de respuestas.
 */

const ENCUESTA = {
  marca: 'Psiko Aprende', logo_url: null, color: '#1f4e79', fondo: null, nombre: 'María', programa: 'Máster', respondida: false,
  preguntas: [
    { clave: 'motivo', tipo: 'unica', texto: '¿Por qué no seguiste?', obligatoria: true, ayuda: 'Elige la que más pese',
      opciones: [{ clave: 'precio', texto: 'El precio' }, { clave: 'otro', texto: 'Otro motivo' }], escribir: 'otro' },
    { clave: 'decidirse', tipo: 'varias', texto: '¿Qué te ayudaría a decidirte?',
      opciones: [{ clave: 'beca', texto: 'Una beca' }, { clave: 'fechas', texto: 'Otras fechas' }] },
    { clave: 'comentarios', tipo: 'texto', texto: 'Deja tus comentarios', opciones: [] },
  ],
};

let fetchMock;
beforeEach(() => {
  fetchMock = vi.fn(async (url, opciones) => ({
    status: 200,
    json: async () => (opciones?.method === 'POST' ? { success: true, data: { ya: false } } : { success: true, data: ENCUESTA }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  window.scrollTo = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

const abrir = () => render(
  <MemoryRouter initialEntries={['/feedback/abcdefghijklmnopqrstuvwxyz']}>
    <Routes><Route path="/feedback/:token" element={<FeedbackEncuestaPage />} /></Routes>
  </MemoryRouter>,
);

describe('la encuesta con teclado y lector de pantalla', () => {
  it('la obligatoria se anuncia como tal y su ayuda va enlazada', async () => {
    abrir();
    const motivo = await screen.findByLabelText(/¿Por qué no seguiste\?/);
    expect(motivo.tagName).toBe('SELECT');
    expect(motivo.getAttribute('aria-required')).toBe('true');
    expect(screen.getByText('(obligatoria)').className).toContain('sr-only');
    const ayuda = document.getElementById(motivo.getAttribute('aria-describedby'));
    expect(ayuda?.textContent).toBe('Elige la que más pese');
  });

  it('«varias» es un grupo con su leyenda y casillas con nombre', async () => {
    abrir();
    const grupo = await screen.findByRole('group', { name: /¿Qué te ayudaría a decidirte\?/ });
    expect(grupo.tagName).toBe('FIELDSET');
    expect(screen.getByRole('checkbox', { name: 'Una beca', hidden: true })).toBeTruthy();
  });

  it('«Enviar» se alcanza con el tabulador aunque falte la obligatoria, y lleva a ella', async () => {
    abrir();
    const motivo = await screen.findByLabelText(/¿Por qué no seguiste\?/);
    const enviar = screen.getByRole('button', { name: 'Enviar' });
    expect(enviar.disabled).toBe(false);
    expect(enviar.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(enviar.getAttribute('aria-describedby'))?.textContent).toMatch(/Contesta al menos la primera/);
    fireEvent.click(enviar);
    expect(document.activeElement).toBe(motivo);
    expect(motivo.getAttribute('aria-invalid')).toBe('true');
    // No se ha mandado nada.
    expect(fetchMock.mock.calls.filter(([, o]) => o?.method === 'POST')).toHaveLength(0);
  });

  it('contestada, el foco va al «¡Gracias!»', async () => {
    abrir();
    const motivo = await screen.findByLabelText(/¿Por qué no seguiste\?/);
    fireEvent.change(motivo, { target: { value: 'precio' } });
    const enviar = screen.getByRole('button', { name: 'Enviar' });
    expect(enviar.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(enviar);
    const gracias = await screen.findByRole('heading', { name: /¡Gracias, María!/ });
    await waitFor(() => expect(document.activeElement).toBe(gracias));
  });

  it('un error al enviar se anuncia (role="alert")', async () => {
    fetchMock.mockImplementation(async (url, o) => ({
      status: 500,
      json: async () => (o?.method === 'POST' ? { success: false, error: 'Se cayó' } : { success: true, data: ENCUESTA }),
    }));
    abrir();
    fireEvent.change(await screen.findByLabelText(/¿Por qué no seguiste\?/), { target: { value: 'precio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Se cayó'));
  });
});

describe('el CSV de respuestas', () => {
  const DATOS = {
    preguntas: [{ clave: 'motivo', tipo: 'unica', texto: '¿Por qué no seguiste?', opciones: [{ clave: 'precio', texto: 'El precio' }] }],
    disparadores: { dia7: 'Al 7.º día sin comprar' },
  };
  const FILA = {
    id: 1, lead_id: 1, lead_nombre: 'María', email: 'm@x.es', project_id: 3, proyecto: 'Psiko', gestora: 'Ana',
    disparador: 'dia7', estado: 'enviado', enviado_at: '2026-11-09T23:30:00Z', respondido_at: '2026-11-10T09:00:00Z',
    motivo: 'precio', comentario: null, nota_envio: null, created_at: '2026-11-09T23:30:00Z', respuestas: { motivo: 'precio' },
  };

  it('«Cuándo se envió» es la fecha (en Madrid) y el motivo del envío va aparte', () => {
    const [cab, fila] = respuestasEnCsv(DATOS, [FILA]);
    const cols = cab.split(',');
    const vals = fila.split(',');
    const i = cols.indexOf('"Cuándo se envió"');
    expect(i).toBeGreaterThan(-1);
    // 23:30 UTC del 9 son las 00:30 del 10 en Madrid.
    expect(vals[i]).toBe('"2026-11-10"');
    expect(vals[cols.indexOf('"Por qué se envió"')]).toBe('"Al 7.º día sin comprar"');
    expect(vals[cols.indexOf('"¿Por qué no seguiste?"')]).toBe('"El precio"');
  });
});
