import { useCallback, useEffect, useRef, useState } from 'react';
import {
  streamChatMessage, estadoDelChat, listarConversaciones, mensajesDe,
  type ChatEvent, type EstadoDelChat, type Conversacion, type GastoIA,
} from '../api/claude-chat.api';
import { lista } from '@/shared/lib/lista';

/**
 * El estado de una conversación con Claude (#30).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE NO HACE: CALLARSE
 *
 * La versión anterior empezaba así:
 *
 *     if (!text?.trim() || !projectId || streaming) return;
 *
 * Sin proyecto, escribías, pulsabas enviar y NO PASABA NADA. Ni aviso, ni
 * error, ni nada: la pantalla parecía rota. Y no era un caso raro — el chat
 * responde sobre los datos de UN proyecto, así que sin proyecto elegido es el
 * caso normal la primera vez que alguien entra.
 *
 * Aquí cada motivo por el que no se puede escribir tiene su frase, y la
 * pantalla la enseña. Un `return` mudo es la peor de las respuestas.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  streaming?: boolean;
  error?: string;
  /** 'NO_API_KEY' | 'TOPE_AGOTADO' | aviso de que queda poco. */
  warning?: string;
  /** Cuándo se dijo. Las recién enviadas se sellan aquí; las guardadas traen la suya. */
  ts?: string;
}

export interface UseClaudeChatResult {
  mensajes: ChatMessage[];
  enviando: boolean;
  /** `null` mientras no se sabe. */
  estado: EstadoDelChat | null;
  gasto: GastoIA | null;
  conversaciones: Conversacion[];
  conversacionId: string | null;
  /** Por qué no se puede escribir ahora mismo, o `null` si sí se puede. */
  porQueNoSePuede: string | null;
  enviar: (texto: string) => Promise<void>;
  parar: () => void;
  nueva: () => void;
  abrir: (id: string) => Promise<void>;
  recargarEstado: () => Promise<void>;
}

export function useClaudeChat(projectId: number | null | undefined): UseClaudeChatResult {
  const [mensajes, setMensajes] = useState<ChatMessage[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [estado, setEstado] = useState<EstadoDelChat | null>(null);
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
  const [conversacionId, setConversacionId] = useState<string | null>(null);
  const abortar = useRef<AbortController | null>(null);

  const hayProyecto = typeof projectId === 'number' && projectId > 0;

  const recargarEstado = useCallback(async () => {
    if (!hayProyecto) { setEstado(null); return; }
    try {
      const r = await estadoDelChat(projectId as number);
      if (r.success) setEstado(r.data);
    } catch { /* la pantalla ya avisa por otras vías */ }
  }, [hayProyecto, projectId]);

  const recargarConversaciones = useCallback(async () => {
    try {
      const r = await listarConversaciones();
      if (r.success) setConversaciones(lista<Conversacion>(r.data));
    } catch { /* el historial es un extra: sin el, el chat sigue sirviendo */ }
  }, []);

  useEffect(() => { recargarEstado(); }, [recargarEstado]);
  useEffect(() => { recargarConversaciones(); }, [recargarConversaciones]);

  /**
   * El motivo, en una frase, por el que ahora mismo no se puede escribir.
   *
   * El orden importa: se dice lo que hay que arreglar PRIMERO. Sin proyecto no
   * sirve de nada saber que falta la clave, porque tampoco podrías usarla.
   */
  const porQueNoSePuede = (() => {
    if (!hayProyecto) {
      return 'Elige un proyecto arriba: el chat responde sobre los datos de uno concreto.';
    }
    if (!estado) return null;   // todavía no se sabe; no se afirma nada
    if (!estado.api_configured) {
      // Antes que el tope: sin clave, el tope da igual — y son dos arreglos
      // distintos, en dos sitios distintos.
      return 'Falta la clave de IA. Se pone en Configuración › APIs, o en el servidor.';
    }
    if (estado.gasto?.agotado) {
      return `Se alcanzó el tope de gasto en IA de este mes (${estado.gasto.gastado} de ${estado.gasto.tope} USD). `
        + 'Vuelve el día 1, o pide que suban el tope en el servidor.';
    }
    if (estado.used_last_hour >= estado.rate_limit_per_hour) {
      return `Llevas ${estado.used_last_hour} mensajes esta hora, que es el límite. Se reanuda dentro de un rato.`;
    }
    return null;
  })();

  const enviar = useCallback(async (texto: string): Promise<void> => {
    const t = texto.trim();
    if (!t || enviando || !hayProyecto) return;

    const idUsuario = `u_${Date.now()}`;
    const idClaude = `a_${Date.now()}`;
    setMensajes((prev) => [
      ...prev,
      { id: idUsuario, role: 'user', content: t, ts: new Date().toISOString() },
      { id: idClaude, role: 'assistant', content: '', streaming: true, ts: new Date().toISOString() },
    ]);
    setEnviando(true);

    const ctrl = new AbortController();
    abortar.current = ctrl;

    const parche = (cambio: Partial<ChatMessage>) =>
      setMensajes((prev) => prev.map((m) => (m.id === idClaude ? { ...m, ...cambio } : m)));

    try {
      await streamChatMessage(
        { message: t, projectId: projectId as number, conversationId: conversacionId, signal: ctrl.signal },
        (ev: ChatEvent) => {
          if (ev.type === 'start' && ev.messageId) {
            // El servidor devuelve el id de la conversación: guardarlo es lo
            // que hace que el segundo mensaje siga al primero en vez de abrir
            // una conversación nueva cada vez.
            setConversacionId((antes) => antes || ev.messageId || null);
          } else if (ev.type === 'delta') {
            setMensajes((prev) => prev.map((m) => (
              m.id === idClaude ? { ...m, content: m.content + (ev.content || '') } : m
            )));
          } else if (ev.type === 'done') {
            parche({ streaming: false, warning: ev.warning });
            if (ev.gasto) setEstado((e) => (e ? { ...e, gasto: ev.gasto as GastoIA } : e));
            recargarConversaciones();
          } else if (ev.type === 'error') {
            parche({ streaming: false, error: ev.error || 'No se pudo responder.' });
          }
        },
      );
    } finally {
      // Una respuesta cortada a medias se queda con lo que llegó y deja de
      // parpadear: sin esto, el cursor sigue latiendo para siempre.
      parche({ streaming: false });
      setEnviando(false);
      abortar.current = null;
      recargarEstado();
    }
  }, [enviando, hayProyecto, projectId, conversacionId, recargarEstado, recargarConversaciones]);

  const parar = useCallback(() => { abortar.current?.abort(); }, []);

  const nueva = useCallback(() => {
    abortar.current?.abort();
    setMensajes([]);
    setConversacionId(null);
  }, []);

  const abrir = useCallback(async (id: string) => {
    abortar.current?.abort();
    try {
      const r = await mensajesDe(id);
      if (!r.success) return;
      const guardados = lista<{ id: number; role: string; content: string; created_at?: string }>(r.data?.messages);
      setMensajes(guardados
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          id: `g_${m.id}`, role: m.role as ChatRole, content: m.content, ts: m.created_at,
        })));
      setConversacionId(id);
    } catch { /* si no se puede abrir, se queda la que estaba */ }
  }, []);

  return {
    mensajes,
    enviando,
    estado,
    gasto: estado?.gasto ?? null,
    conversaciones,
    conversacionId,
    porQueNoSePuede,
    enviar,
    parar,
    nueva,
    abrir,
    recargarEstado,
  };
}
