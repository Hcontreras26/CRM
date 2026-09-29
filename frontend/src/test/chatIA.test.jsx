import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';
import {
  render, screen, waitFor, fireEvent, renderHook,
} from '@testing-library/react';

/**
 * La pantalla de preguntar a la IA (#30).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE SE FIJA AQUI NO ES EL CHAT
 *
 * Es POR QUE no se puede escribir cuando no se puede. Hay cuatro motivos —sin
 * proyecto, sin clave, tope agotado, límite por hora— y cada uno se arregla en
 * un sitio distinto: eligiendo arriba, en Configuración, esperando al día 1, o
 * esperando un rato.
 *
 * Antes de esta pantalla los cuatro se veían exactamente igual: escribías,
 * pulsabas enviar y no pasaba nada. El hook empezaba con
 *
 *     if (!text?.trim() || !projectId || streaming) return;
 *
 * y ese `return` mudo es lo que se viene a arreglar. Por eso las pruebas que
 * más importan son las de los avisos, no la de que llegue la respuesta.
 * ─────────────────────────────────────────────────────────────────────────────
 */

let proyectoActivo = { id: 1, nombre: 'Psiko Aprende' };
vi.mock('@/contexts/ProjectContext', () => ({
  useProjectContext: () => ({ activeProject: proyectoActivo }),
}));

const get = vi.fn();
vi.mock('@/shared/api/client', () => ({
  default: { get: (...a) => get(...a) },
  getAccessToken: () => 'token',
}));

const streamChatMessage = vi.fn(async () => {});
vi.mock('@/modules/ai-chat/api/claude-chat.api', async () => {
  const real = await vi.importActual('@/modules/ai-chat/api/claude-chat.api');
  return {
    ...real,
    streamChatMessage: (...a) => streamChatMessage(...a),
    estadoDelChat: (id) => get(`/claude/status?projectId=${id}`),
    listarConversaciones: () => get('/claude/conversations'),
    mensajesDe: (id) => get(`/claude/conversations/${id}`),
  };
});

const AIChatPage = (await import('@/modules/ai-chat/pages/AIChatPage')).default;
const { useClaudeChat } = await import('@/modules/ai-chat/hooks/useClaudeChat');

const GASTO_SANO = {
  instalado: true, tope: 20, gastado: 2, queda: 18, porcentaje: 10,
  cerca: false, agotado: false, llamadas: 3, fallosAlApuntar: 0, aviso: null,
};

function estado(extra = {}) {
  return {
    success: true,
    data: {
      api_configured: true,
      rate_limit_per_hour: 20,
      used_last_hour: 0,
      gasto: GASTO_SANO,
      warning: null,
      ...extra,
    },
  };
}

beforeEach(() => {
  proyectoActivo = { id: 1, nombre: 'Psiko Aprende' };
  streamChatMessage.mockClear();
  get.mockReset();
  get.mockImplementation(async (url) => {
    if (url.includes('/claude/status')) return estado();
    if (url.includes('/claude/conversations')) return { success: true, data: [] };
    return { success: true, data: null };
  });
});

describe('sin proyecto elegido', () => {
  it('lo dice, en vez de dejar una caja que no hace nada', async () => {
    proyectoActivo = null;
    render(<AIChatPage />);
    expect(await screen.findByText('Elige un proyecto')).toBeInTheDocument();
  });

  it('ni siquiera le pregunta al servidor', async () => {
    proyectoActivo = null;
    render(<AIChatPage />);
    await waitFor(() => expect(screen.getByText('Elige un proyecto')).toBeInTheDocument());
    expect(get).not.toHaveBeenCalledWith(expect.stringContaining('/claude/status'));
  });

  it('el «todos los proyectos» (-1) cuenta como sin proyecto', async () => {
    // Es truthy, así que un `if (!projectId)` lo dejaría pasar y pediría
    // /claude/status?projectId=-1.
    proyectoActivo = { id: -1, nombre: 'Todos' };
    render(<AIChatPage />);
    expect(await screen.findByText('Elige un proyecto')).toBeInTheDocument();
  });
});

describe('el hook, por su cuenta', () => {
  /**
   * La pantalla tiene su propio guard para «sin proyecto», así que las pruebas
   * de arriba pasan aunque el hook se calle. El hook es público y lo puede usar
   * otra pantalla que no lo tenga: si él también se calla, el fallo vuelve.
   */
  it('sin proyecto da el motivo, no null', async () => {
    const { result } = renderHook(() => useClaudeChat(null));
    await waitFor(() => expect(result.current.porQueNoSePuede).toMatch(/proyecto/i));
  });

  it('sin proyecto no llama a enviar aunque se lo pidan', async () => {
    const { result } = renderHook(() => useClaudeChat(null));
    await result.current.enviar('hola');
    expect(streamChatMessage).not.toHaveBeenCalled();
  });

  it('con proyecto y todo bien, no hay motivo', async () => {
    const { result } = renderHook(() => useClaudeChat(1));
    await waitFor(() => expect(result.current.estado).toBeTruthy());
    expect(result.current.porQueNoSePuede).toBeNull();
  });
});

describe('los cuatro motivos por los que no se puede escribir', () => {
  it('sin clave lo dice, y dice dónde se pone', async () => {
    get.mockImplementation(async (url) => (url.includes('/claude/status')
      ? estado({ api_configured: false })
      : { success: true, data: [] }));
    render(<AIChatPage />);
    expect(await screen.findByText(/Falta la clave de IA/)).toBeInTheDocument();
    expect(screen.getByText(/Configuración/)).toBeInTheDocument();
  });

  it('con el tope agotado dice cuánto y cuándo vuelve', async () => {
    get.mockImplementation(async (url) => (url.includes('/claude/status')
      ? estado({ gasto: { ...GASTO_SANO, gastado: 22.5, agotado: true, queda: 0, porcentaje: 113 } })
      : { success: true, data: [] }));
    render(<AIChatPage />);
    expect(await screen.findByText(/tope de gasto/i)).toBeInTheDocument();
    expect(screen.getByText(/día 1/)).toBeInTheDocument();
  });

  it('la falta de clave manda sobre el tope: sin clave el tope da igual', async () => {
    // Son dos arreglos en dos sitios distintos. Enseñar el del tope cuando lo
    // que falta es la clave manda a la persona al sitio equivocado.
    get.mockImplementation(async (url) => (url.includes('/claude/status')
      ? estado({ api_configured: false, gasto: { ...GASTO_SANO, agotado: true } })
      : { success: true, data: [] }));
    render(<AIChatPage />);
    expect(await screen.findByText(/Falta la clave/)).toBeInTheDocument();
    expect(screen.queryByText(/tope de gasto/i)).toBeNull();
  });

  it('pasado el límite por hora lo dice con el número', async () => {
    get.mockImplementation(async (url) => (url.includes('/claude/status')
      ? estado({ used_last_hour: 20 })
      : { success: true, data: [] }));
    render(<AIChatPage />);
    expect(await screen.findByText(/20 mensajes esta hora/)).toBeInTheDocument();
  });

  it('bloqueada, el botón de enviar no manda nada', async () => {
    get.mockImplementation(async (url) => (url.includes('/claude/status')
      ? estado({ api_configured: false })
      : { success: true, data: [] }));
    render(<AIChatPage />);
    await screen.findByText(/Falta la clave/);
    fireEvent.click(screen.getByText(/¿Cuántos prospectos/));
    expect(streamChatMessage).not.toHaveBeenCalled();
  });
});

describe('cuando sí se puede', () => {
  it('no sale ningún aviso', async () => {
    render(<AIChatPage />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(screen.queryByText(/Falta la clave/)).toBeNull();
    expect(screen.queryByText(/tope de gasto/i)).toBeNull();
  });

  it('una sugerencia se manda con un clic', async () => {
    render(<AIChatPage />);
    const s = await screen.findByText(/¿Cuántos prospectos/);
    fireEvent.click(s);
    await waitFor(() => expect(streamChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 1 }),
      expect.any(Function),
    ));
  });

  it('el gasto del mes está a la vista, que es dinero de verdad', async () => {
    render(<AIChatPage />);
    expect(await screen.findByText('2 / 20 USD')).toBeInTheDocument();
  });

  it('si el tope no está instalado se dice, y no se pinta un 0 tranquilizador', async () => {
    // `instalado: false` quiere decir «no hay tope», que no es lo mismo que
    // «llevas cero gastado».
    get.mockImplementation(async (url) => (url.includes('/claude/status')
      ? estado({ gasto: { ...GASTO_SANO, instalado: false, gastado: 0 } })
      : { success: true, data: [] }));
    render(<AIChatPage />);
    expect(await screen.findByText('Sin tope instalado')).toBeInTheDocument();
  });
});
