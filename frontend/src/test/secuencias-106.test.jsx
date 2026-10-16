import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

/*
  «Secuencias de email» con las piezas comunes (#106): la plantilla de cada
  paso con su Field (era un desplegable pequeño, con un icono y sin
  etiqueta), se valida antes de guardar diciendo qué falta y en qué paso, y
  los errores ya no se callan ni salen con la descripción vacía.
*/

const h = vi.hoisted(() => ({ toast: vi.fn(), get: vi.fn(), post: vi.fn(), del: vi.fn() }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: h.toast }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ({ activeProject: { id: 1, nombre: 'Psiko' } }) }));
vi.mock('@/shared/api/client', () => ({ default: { get: h.get, post: h.post, patch: vi.fn(), delete: h.del } }));
vi.mock('@/modules/email-templates/api/templates.api', () => ({
  emailTemplatesApi: { list: vi.fn().mockResolvedValue({ success: true, data: [{ id: 4, name: 'Bienvenida' }] }) },
}));

import EmailSequencesPage from '@/modules/email-sequences/pages/EmailSequencesPage';

const esperar = () => act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });

describe('Secuencias de email (#106)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.get.mockResolvedValue({ success: true, data: [
      { id: 9, nombre: 'Seguimiento', trigger_event: 'lead_created', steps: [], active: true },
    ] });
  });

  const nueva = async () => {
    render(<EmailSequencesPage />);
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Nueva secuencia' }));
    await esperar();
  };

  it('la plantilla del paso lleva su Field, al tamaño de los demás', async () => {
    await nueva();
    const plantilla = screen.getByRole('combobox', { name: 'Plantilla del paso 1' });
    expect(plantilla.closest('div.min-w-0').textContent).toMatch(/^Plantilla/);
    expect(plantilla.className).not.toMatch(/\bh-8\b/);
  });

  it('no guarda sin nombre ni un paso vacío, y dice qué falta y dónde', async () => {
    await nueva();
    fireEvent.click(screen.getByRole('button', { name: /Guardar/ }));
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Faltan datos',
      description: 'Falta el nombre de la secuencia, el asunto y el cuerpo del paso 1.',
    }));
    expect(h.post).not.toHaveBeenCalled();
  });

  it('el nombre, y el asunto y el cuerpo de un paso sin plantilla, se marcan obligatorios', async () => {
    await nueva();
    expect(screen.getAllByText('(obligatorio)')).toHaveLength(3);
  });

  it('si no se puede borrar, lo dice (antes se callaba)', async () => {
    h.del.mockRejectedValue({ data: { error: 'Tiene envíos en curso' } });
    render(<EmailSequencesPage />);
    await esperar();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar secuencia' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'No se pudo eliminar la secuencia', description: 'Tiene envíos en curso',
    })));
  });
});
