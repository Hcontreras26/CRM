// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

/*
  CRM#893 · En «APIs globales», que se vea qué clave usa la IA de verdad (la del
  campus, la global de la web o la del servidor), sin enseñar la clave.
*/

const { api } = vi.hoisted(() => ({ api: { get: vi.fn() } }));
vi.mock('@/shared/api/client', () => ({ default: { get: (...a) => api.get(...a), post: vi.fn(), delete: vi.fn() } }));
vi.mock('@/shared/hooks/useToast', () => ({ toast: vi.fn() }));

const { default: ApisTab } = await import('@/modules/settings/components/settings/ApisTab');

function servidor(ia) {
  api.get.mockImplementation(async (url) => {
    if (url === '/credentials') return { success: true, data: [] };
    if (url === '/credentials/ia') return { success: true, data: ia };
    return { success: true, data: null };
  });
}

beforeEach(() => api.get.mockReset());
afterEach(() => cleanup());

describe('APIs globales dice qué clave usa la IA', () => {
  it('la global de la web', async () => {
    servidor({ origen: 'global', texto: 'La IA usa la global de la web.' });
    render(<ApisTab />);
    const linea = await screen.findByRole('status');
    expect(linea).toHaveTextContent('La IA usa la global de la web.');
    expect(linea).toHaveAttribute('data-ia-en-uso', 'global');
    expect(linea.textContent).not.toMatch(/sk-/);
  });

  it('ninguna: lo dice en tono de aviso', async () => {
    servidor({ origen: null, texto: 'No hay ninguna clave de Claude: la IA no funciona.' });
    render(<ApisTab />);
    const linea = await screen.findByRole('status');
    expect(linea).toHaveAttribute('data-ia-en-uso', 'ninguna');
    expect(linea.className).toMatch(/warning/);
  });

  it('si el servidor no contesta, no se inventa nada', async () => {
    api.get.mockImplementation(async (url) => {
      if (url === '/credentials/ia') throw Object.assign(new Error('no'), { status: 403 });
      return { success: true, data: [] };
    });
    render(<ApisTab />);
    await screen.findByText('Claude AI (Anthropic)');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
