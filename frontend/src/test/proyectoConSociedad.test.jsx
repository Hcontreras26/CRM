import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/*
  «Nuevo proyecto» no dejaba elegir empresa (28/10/2026): el desplegable solo
  traía «Sin sociedad» y «Crear nueva». `client` ya devuelve el cuerpo
  ({ success, data }) y el diálogo leía `r.data.data`. Lo mismo al crear una
  sociedad nueva: se creaba pero el proyecto se guardaba sin ella.
*/

const get = vi.fn();
const post = vi.fn();
vi.mock('@/shared/api/client', () => ({ default: { get: (...a) => get(...a), post: (...a) => post(...a), patch: vi.fn() } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { default: ProjectDialog } = await import('@/modules/settings/components/settings/ProjectDialog');

const SOCIEDADES = [
  { id: 8, razon_social: 'CEDIA Investigación y Desarrollo SL', serie: null },
  { id: 9, razon_social: 'Ictess Ingeniería e Innovación SL', serie: 'IC' },
];

beforeEach(() => {
  get.mockReset(); post.mockReset();
  get.mockImplementation(async (url) => (url === '/projects/sociedades' ? { success: true, data: SOCIEDADES } : { success: true, data: [] }));
});

describe('Nuevo proyecto: la sociedad emisora', () => {
  it('el desplegable trae las empresas que existen', async () => {
    render(<ProjectDialog open onClose={() => {}} />);
    const select = await screen.findByLabelText('Sociedad emisora');
    await waitFor(() => expect(select.querySelectorAll('option')).toHaveLength(4));
    expect(screen.getByRole('option', { name: 'CEDIA Investigación y Desarrollo SL' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ictess Ingeniería e Innovación SL (IC)' })).toBeInTheDocument();
  });

  it('al editar un proyecto se puede cambiar de empresa', async () => {
    render(<ProjectDialog open onClose={() => {}} existing={{ id: 4, nombre: 'ICTESS', slug: 'ictess', type: 'crm', sociedad_emisora_id: 8 }} />);
    const select = await screen.findByLabelText('Sociedad emisora');
    await waitFor(() => expect(select.value).toBe('8'));
    fireEvent.change(select, { target: { value: '9' } });
    expect(select.value).toBe('9');
  });
});
