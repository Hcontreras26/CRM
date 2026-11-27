import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { pathAllowsAll, rutaAceptaSociedad } from '@/shared/components/layout/AppLayout';

/**
 * Diego, 02/11: «el panel de feedback está fallando en producción».
 *
 *  1. Con «Todos los proyectos» en la cabecera salía «Selecciona un proyecto»:
 *     la ruta no estaba en el muro, aunque el servidor ya sabía sumar todo.
 *  2. Abría en «Este mes»: el día 2 salía 0 enviados y 0 respondidos, como si
 *     no funcionara. Ahora abre en «Desde siempre» (#242) y no manda fechas.
 */

const { cabecera, get } = vi.hoisted(() => ({ cabecera: { value: {} }, get: vi.fn() }));

vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => cabecera.value }));
vi.mock('@/shared/api/client', () => ({ default: { get, post: vi.fn() }, API_BASE_URL: '/crm/api' }));

import FeedbackPanelPage from '@/modules/feedback/pages/FeedbackPanelPage';

const PANEL = {
  totales: { enviados: 283, respondidos: 10, tasa: 3.5, en_revision: 0, bloqueados: 0, sin_correo: 0, fallidos: 0 },
  porMotivo: [{ clave: 'precio', n: 3 }], porDisparador: [], porCampus: [], porEmpresa: [], porGestora: [], porMes: [],
  motivos: [{ clave: 'precio', texto: 'El precio' }], disparadores: {}, preguntas: [],
};
const ultimoPedido = () => {
  const url = get.mock.calls.map((c) => c[0]).filter((u) => u.startsWith('/feedback/panel')).at(-1);
  return new URLSearchParams(url.split('?')[1] || '');
};
const abrir = () => render(<MemoryRouter><FeedbackPanelPage /></MemoryRouter>);

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({ success: true, data: PANEL });
});

describe('el muro deja pasar Feedback', () => {
  it('con «Todos los proyectos» y con una empresa', () => {
    expect(pathAllowsAll('/informes/feedback')).toBe(true);
    expect(rutaAceptaSociedad('/informes/feedback')).toBe(true);
  });
});

describe('abre en «Desde siempre»', () => {
  it('con «Todos»: sin fechas ni ámbito, y con las cifras de siempre', async () => {
    cabecera.value = { activeProject: { id: -1 }, activeIssuerId: null, activeIssuer: null, projects: [] };
    abrir();
    await waitFor(() => expect(screen.getByText('283')).toBeTruthy());
    const p = ultimoPedido();
    expect([...p.keys()]).toEqual([]);
    expect(screen.getByRole('button', { name: 'Desde siempre' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('con una empresa: su issuerId, sin fechas; «Este mes» pone las fechas y «Desde siempre» las quita', async () => {
    cabecera.value = { activeProject: { id: -1 }, activeIssuerId: 8, activeIssuer: { nombre: 'CEDIA' }, projects: [] };
    abrir();
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(ultimoPedido().get('issuerId')).toBe('8');
    expect(ultimoPedido().has('desde')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Este mes' }));
    await waitFor(() => expect(ultimoPedido().has('desde')).toBe(true));

    fireEvent.click(screen.getByRole('button', { name: 'Desde siempre' }));
    await waitFor(() => expect(ultimoPedido().has('desde')).toBe(false));
    expect(ultimoPedido().get('issuerId')).toBe('8');
  });
});

/**
 * #593, punto 19 (#1133): con «Solo este campus», la fila de su empresa cuenta
 * solo ese campus, pero su lista abría la empresa entera (otro número).
 */
describe('«Solo este campus» y la fila de la empresa', () => {
  const ultimaLista = () => {
    const url = get.mock.calls.map((c) => c[0]).filter((u) => u.startsWith('/feedback/lista')).at(-1);
    return url ? new URLSearchParams(url.split('?')[1] || '') : null;
  };

  it('abre la lista de ese campus, no la de toda la empresa', async () => {
    cabecera.value = {
      activeProject: { id: 7, nombre: 'Psiko', sociedad_emisora_id: 8 }, activeIssuerId: null, activeIssuer: null,
      projects: [{ id: 7, sociedad_emisora_id: 8 }, { id: 9, sociedad_emisora_id: 8 }],
    };
    get.mockImplementation(async (url) => (url.startsWith('/feedback/lista')
      ? { success: true, data: [] }
      : { success: true, data: { ...PANEL, porEmpresa: [{ issuer_id: 8, project_id: null, nombre: 'CEDIA', campus: 1, enviados: 41, respondidos: 0, nota_atencion: null }] } }));
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Solo Psiko' }));
    await waitFor(() => expect(ultimoPedido().get('projectId')).toBe('7'));
    fireEvent.click(screen.getByRole('tab', { name: 'Por empresa' }));
    fireEvent.click(await screen.findByRole('button', { name: '41' }));
    await waitFor(() => expect(ultimaLista()).not.toBeNull());
    expect(ultimaLista().get('projectId')).toBe('7');
    expect(ultimaLista().has('issuerId')).toBe(false);
  });

  it('con la empresa entera arriba, la fila sigue abriendo la empresa', async () => {
    cabecera.value = {
      activeProject: { id: 7, nombre: 'Psiko', sociedad_emisora_id: 8 }, activeIssuerId: null, activeIssuer: null,
      projects: [{ id: 7, sociedad_emisora_id: 8 }, { id: 9, sociedad_emisora_id: 8 }],
    };
    get.mockImplementation(async (url) => (url.startsWith('/feedback/lista')
      ? { success: true, data: [] }
      : { success: true, data: { ...PANEL, porEmpresa: [{ issuer_id: 8, project_id: null, nombre: 'CEDIA', campus: 2, enviados: 50, respondidos: 0, nota_atencion: null }] } }));
    abrir();
    fireEvent.click(await screen.findByRole('tab', { name: 'Por empresa' }));
    fireEvent.click(await screen.findByRole('button', { name: '50' }));
    await waitFor(() => expect(ultimaLista()).not.toBeNull());
    expect(ultimaLista().get('issuerId')).toBe('8');
  });
});
