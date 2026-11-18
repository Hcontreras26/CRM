import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * «Mi campus» (#681, parte 7): el contador «X cursos por desarrollar» arriba, con las
 * entregas y las dudas, y también cuando está al día; y el % hecho de cada alumno, con
 * «—» (no 0 %) si el curso no tiene seguimiento o Moodle no lo da.
 */

let datos: any;
vi.mock('@/shared/api/client', () => ({
  default: { get: async () => ({ success: true, data: datos }) },
}));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { default: MiCampusPage } = await import('@/modules/tutores/pages/MiCampusPage');

const pendiente = (id: number) => ({
  id, nombre: `Curso nuevo ${id}`, tipo: 'curso', estado: 'en_desarrollo', campus: 'Fono', fechaComprometida: null,
  avance: { foto: false, video: false, modulos: 20 },
});
const alumno = (id: number, nombre: string, progreso: number | null) => ({
  id, nombre, email: null, ultimoAcceso: new Date().toISOString(), progreso, mensajeUrl: '#',
});
const curso = (extra: any = {}) => ({
  id: 30, nombre: 'Curso A', url: '#', error: null, seguimiento: true, avisoProgreso: null,
  alumnos: [alumno(900, 'Ana', 40), alumno(901, 'Beto', null), alumno(902, 'Carla', 0)],
  dudas: [], tareas: [], ...extra,
});
const conCampus = (cursos: any[], pendientes: any[]) => ({
  leidoAt: new Date().toISOString(), pendientes, sinConectar: [],
  campus: [{ projectId: 3, campus: 'Fono', url: '#', error: null, cursos, dudasSinCurso: [] }],
});

const pagina = () => render(<MemoryRouter><MiCampusPage /></MemoryRouter>);

beforeEach(() => { datos = null; });

describe('Mi campus · el contador de cursos por desarrollar', () => {
  it('con entregas y dudas: las tres cifras en la misma línea', async () => {
    datos = conCampus([curso({
      dudas: [{ consultaId: 1, alumnoId: 900, alumno: 'Ana', desde: null }],
      tareas: [{ id: 77, nombre: 'Tarea 1', entrega: null, corregirUrl: '#', sinCorregir: [{ alumnoId: 900, alumno: 'Ana', entregadaAt: null }] }],
    })], [pendiente(1), pendiente(2)]);
    pagina();
    const r = await screen.findByTestId('resumen-mi-campus');
    expect(r.textContent).toBe('Hoy tienes 1 entrega por corregir, 1 duda sin contestar y 2 cursos por desarrollar.');
  });

  it('al día: lo dice, y aún así cuenta lo que queda por desarrollar', async () => {
    datos = conCampus([curso()], [pendiente(1)]);
    pagina();
    const r = await screen.findByTestId('resumen-mi-campus');
    expect(r.textContent).toContain('Estás al día');
    expect(r.textContent).toContain('Te queda 1 curso por desarrollar.');
  });

  it('al día y sin nada por desarrollar: no hay contador', async () => {
    datos = conCampus([curso()], []);
    pagina();
    const r = await screen.findByTestId('resumen-mi-campus');
    expect(r.textContent).not.toContain('por desarrollar');
  });

  it('sin ningún campus conectado no dice «al día», pero sí los cursos por desarrollar', async () => {
    datos = { leidoAt: new Date().toISOString(), campus: [], pendientes: [pendiente(1), pendiente(2), pendiente(3)], sinConectar: [] };
    pagina();
    const r = await screen.findByTestId('resumen-mi-campus');
    expect(r.textContent).toBe('Tienes 3 cursos por desarrollar.');
  });
});

describe('Mi campus · el % hecho de cada alumno', () => {
  it('el % de Moodle; «—» si no hay dato; un 0 real es 0%', async () => {
    datos = conCampus([curso()], []);
    pagina();
    // El curso sin nada que hacer sale cerrado: se abre.
    fireEvent.click(await screen.findByRole('button', { name: /Curso A/ }));
    const celdas = await screen.findAllByTestId('progreso-alumno');
    const texto = celdas.map((c) => c.textContent?.replace(/ /g, ' '));
    // Ordenados por nombre: Ana, Beto, Carla.
    expect(texto[0]).toBe('40%');
    expect(texto[1]).toMatch(/^—/);
    expect(texto[2]).toBe('0%');
  });

  it('curso sin seguimiento de finalización: «—» en todos y se explica', async () => {
    datos = conCampus([curso({ seguimiento: false, alumnos: [alumno(903, 'Eva', null)] })], []);
    pagina();
    fireEvent.click(await screen.findByRole('button', { name: /Curso A/ }));
    const [celda] = await screen.findAllByTestId('progreso-alumno');
    expect(celda.textContent).toMatch(/^—/);
    expect(within(celda).getByText(/no tiene activado el seguimiento/)).toBeTruthy();
    expect(screen.getAllByText(/el % hecho sale como «—»/).length).toBeGreaterThan(0);
  });
});
