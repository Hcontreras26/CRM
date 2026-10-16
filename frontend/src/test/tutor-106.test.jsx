import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

/*
  «Tutor» (nuevo tutor, editar tutor y añadir formación) con las piezas
  comunes (#106): no había ni Field ni la clase común —cada campo con sus
  clases y dos estilos de etiqueta—, la fila de «Sus cursos» no se apilaba en
  el móvil (cuatro columnas fijas) y las ayudas iban a 11 px.
*/

vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { role: 'superadmin' } }) }));
vi.mock('@/contexts/ProjectContext', () => ({
  useProjectContext: () => ({ activeProject: { id: 1 }, projects: [{ id: 1, nombre: 'Psiko' }], activeIssuer: null, activeIssuerId: null }),
}));
// La misma lista siempre: una nueva en cada pintado relanza la carga sin fin.
const CAMPUS = vi.hoisted(() => [{ id: 1, nombre: 'Psiko' }]);
vi.mock('@/shared/hooks/useAmbito', () => ({ useProyectosDelAmbito: () => CAMPUS }));
vi.mock('@/shared/api/client', () => ({ default: { get: vi.fn().mockResolvedValue({ success: true, data: [] }) } }));
vi.mock('@/modules/tutores/components/Entregables', () => ({ default: () => null }));
vi.mock('@/modules/users/api/users.api', () => ({ avisoCambioCorreo: vi.fn() }));
vi.mock('@/modules/tutores/api/tutores.api', () => ({
  tutoresApi: {
    listar: vi.fn().mockResolvedValue({ success: true, data: [
      { id: 3, nombre: 'Tutora Prueba', email: 'tutora@prueba.local', iban: 'ES00', active: true, es_de_este_proyecto: true, formaciones: 0 },
    ] }),
    colaboraciones: vi.fn().mockResolvedValue({ success: true, data: [] }),
    ajustes: vi.fn().mockResolvedValue({ success: true, data: { aplica_desde: '2026-08-01', pct_por_defecto: 10 } }),
  },
}));

import TutoresPage from '@/modules/tutores/pages/TutoresPage';

const esperar = () => act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
const abrirPagina = async () => {
  const r = render(<TutoresPage />);
  await esperar();
  return r;
};
const camposDe = (form) => [...form.querySelectorAll('input:not([type=checkbox]):not([type=hidden]), textarea')];

describe('Tutor (#106)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('nuevo tutor: cada campo con el Field común, enlazado, y con la clase común', async () => {
    await abrirPagina();
    fireEvent.click(screen.getByRole('button', { name: /Nuevo tutor/ }));
    for (const nombre of [/^Nombre y apellidos/, /^Correo/, 'DNI / NIF', 'Teléfono', 'IBAN', 'Contraseña', '%', 'Lo lleva desde']) {
      expect(screen.getByLabelText(nombre)).toBeTruthy();
    }
    const form = screen.getByLabelText(/^Nombre y apellidos/).closest('form');
    // El buscador de cursos es una pieza común aparte (BuscadorEnLista) con su
    // propio campo por dentro: no es de este formulario.
    for (const c of camposDe(form).filter((c) => !c.className.includes('bg-transparent'))) {
      expect(c.className).toMatch(/bg-muted\/50/);
    }
    expect(screen.getAllByText('(obligatorio)').length).toBeGreaterThanOrEqual(2);
  });

  it('nuevo tutor: la fila de «Sus cursos» se apila en el móvil', async () => {
    await abrirPagina();
    fireEvent.click(screen.getByRole('button', { name: /Nuevo tutor/ }));
    const fila = screen.getByLabelText('%').closest('div.min-w-0').parentElement;
    expect(fila.className).toMatch(/grid-cols-2 sm:grid-cols-\[/);
  });

  it('editar tutor: el Field común, las ayudas con su campo y «Cobra desde» igual', async () => {
    await abrirPagina();
    fireEvent.click(screen.getByText('Tutora Prueba'));
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: /Editar tutor/ }));
    const ayudaDe = (campo) => campo.closest('div.min-w-0').textContent;
    expect(ayudaDe(screen.getByLabelText(/^Correo/))).toMatch(/Es con lo que entra al CRM/);
    expect(ayudaDe(screen.getByLabelText('IBAN'))).toMatch(/Se guarda sin espacios/);
    const cobra = screen.getByLabelText('Cobra desde');
    expect(cobra.className).toMatch(/bg-muted\/50/);
    for (const c of camposDe(cobra.closest('form'))) expect(c.className).toMatch(/bg-muted\/50/);
  });

  it('añadir formación: porcentaje y fechas con el Field común y en fila que se apila', async () => {
    await abrirPagina();
    fireEvent.click(screen.getByText('Tutora Prueba'));
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: /Añadir formación/ }));
    const pct = screen.getByLabelText(/^Porcentaje/);
    expect(pct.className).toMatch(/bg-muted\/50/);
    expect(screen.getByLabelText('Hasta').className).toMatch(/bg-muted\/50/);
    expect(pct.closest('div.min-w-0').parentElement.className).toMatch(/grid-cols-1 sm:grid-cols-3/);
  });
});
