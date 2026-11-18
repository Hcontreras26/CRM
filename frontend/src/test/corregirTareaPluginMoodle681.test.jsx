import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

/**
 * Corregir desde el CRM (#681): poner la nota ESCRIBE en Moodle, así que el formulario
 * va detrás de PLUGIN_MOODLE (revisión de Diego de la #689, punto 1). Apagado (/crm),
 * se ven las entregas pero no hay nota que poner: queda «Corregir en Moodle».
 *
 *   npx vitest run src/test/corregirTareaPluginMoodle681.test.jsx
 */
const bandera = vi.hoisted(() => ({ encendida: false }));
vi.mock('@/shared/lib/pluginMoodle', () => ({ get PLUGIN_MOODLE() { return bandera.encendida; } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));
vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn(), post: vi.fn() }, API_BASE_URL: '/api', getAccessToken: () => null, setAccessToken: () => {} }));

const TAREA = {
  tarea: {
    id: 77, nombre: 'Tarea 1', notaMax: 10, entrega: null, enunciado: '', comentarios: true,
    moodleUrl: 'https://campus.test/mod/assign/view.php?id=7&action=grading', calificable: true, enGrupo: false,
  },
  entregas: [{
    alumnoId: 900, alumno: 'Ana', email: 'ana@test', estado: 'sin_corregir', entregadaAt: '2026-11-05T10:00:00Z',
    texto: 'Mi entrega', archivos: [], nota: null, ultimoMensaje: null,
  }],
};

const { tutoresApi } = await import('@/modules/tutores/api/tutores.api');
const { default: CorregirTareaPage } = await import('@/modules/tutores/pages/CorregirTareaPage');

function abrir() {
  return render(
    <MemoryRouter initialEntries={['/mis-cursos/campus/tarea/4/30/77']}>
      <Routes><Route path="/mis-cursos/campus/tarea/:projectId/:cursoId/:tareaId" element={<CorregirTareaPage />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.spyOn(tutoresApi, 'verTarea').mockResolvedValue({ success: true, data: TAREA });
});

describe('CorregirTareaPage y PLUGIN_MOODLE (#681)', () => {
  it('apagado: se ve la entrega, sin formulario de nota, y se corrige en Moodle', async () => {
    bandera.encendida = false;
    abrir();
    expect(await screen.findByText('Mi entrega')).toBeTruthy();
    expect(screen.queryByLabelText('Nota')).toBeNull();
    expect(screen.queryByRole('button', { name: /Guardar/ })).toBeNull();
    const enlace = screen.getByRole('link', { name: /Corregir en Moodle/ });
    expect(enlace.getAttribute('href')).toBe(TAREA.tarea.moodleUrl);
  });

  it('encendido: el formulario de nota está', async () => {
    bandera.encendida = true;
    abrir();
    await screen.findByText('Mi entrega');
    await waitFor(() => expect(screen.getByLabelText('Nota')).toBeTruthy());
    expect(screen.getAllByRole('button', { name: /Guardar/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /Corregir en Moodle/ })).toBeNull();
  });
});
