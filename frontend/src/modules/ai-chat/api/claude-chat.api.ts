import client, { getAccessToken } from '@/shared/api/client';

/**
 * Hablar con Claude sobre los datos del CRM (#30).
 *
 * El envío NO pasa por el cliente de axios: la respuesta llega en trocitos
 * (SSE) y hay que leerla según entra, no cuando termina. Por eso este fichero
 * usa `fetch` a pelo para esa llamada, y el cliente normal para el resto.
 */

export type ChatEventType = 'start' | 'delta' | 'done' | 'error';

/** Lo que el servidor sabe del gasto en IA de este mes. */
export interface GastoIA {
  instalado: boolean;
  tope: number;
  gastado: number | null;
  queda: number | null;
  porcentaje: number;
  cerca: boolean;
  agotado: boolean;
  llamadas: number;
  inciertas?: number;
  fallosAlApuntar: number;
  aviso: string | null;
}

export interface ChatEvent {
  type: ChatEventType;
  content?: string;
  messageId?: string;
  error?: string;
  code?: string;
  /** 'NO_API_KEY' | 'TOPE_AGOTADO' | un aviso de que queda poco. */
  warning?: string;
  gasto?: GastoIA;
  usage?: { promptTokens: number; completionTokens: number };
}

export interface EstadoDelChat {
  api_configured: boolean;
  rate_limit_per_hour: number;
  used_last_hour: number;
  gasto: GastoIA;
  warning: string | null;
}

export interface Conversacion {
  id: string;
  title: string | null;
  project_id: number | null;
  updated_at: string;
}

export interface MensajeGuardado {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export interface StreamChatPayload {
  message: string;
  projectId: number;
  /** Para seguir una conversación que ya existe en vez de empezar otra. */
  conversationId?: string | null;
  signal?: AbortSignal;
}

export type ChatEventHandler = (event: ChatEvent) => void;

/** ¿Se puede escribir ahora? Clave, tope y cuántas van esta hora. */
export const estadoDelChat = (projectId: number) =>
  client.get(`/claude/status?projectId=${projectId}`);

/** Las conversaciones de quien pregunta, de la más reciente a la más vieja. */
export const listarConversaciones = () => client.get('/claude/conversations');

/** Los mensajes de una conversación, para poder retomarla. */
export const mensajesDe = (conversationId: string) =>
  client.get(`/claude/conversations/${conversationId}`);

/**
 * Manda un mensaje y va soltando la respuesta según llega.
 *
 * Los errores NO se lanzan: se avisan por `onEvent` con `type: 'error'`. Quien
 * llama está pintando una conversación, y ahí un `throw` deja la burbuja a
 * medias sin decir por qué.
 */
export async function streamChatMessage(
  { message, projectId, conversationId, signal }: StreamChatPayload,
  onEvent: ChatEventHandler,
): Promise<void> {
  const baseUrl = (import.meta.env.BASE_URL || '/crm/').replace(/\/$/, '');
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/claude/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAccessToken() || ''}`,
      },
      body: JSON.stringify({ message, projectId, conversationId: conversationId || undefined }),
      signal,
    });
  } catch (e: any) {
    // Cancelar es una decisión de quien escribe, no una avería: se avisa
    // distinto para que la pantalla no pinte un error rojo al pulsar «parar».
    if (e?.name === 'AbortError') return;
    onEvent({ type: 'error', error: 'No se pudo conectar con el servidor.' });
    return;
  }

  if (!res.ok) {
    // El servidor contesta JSON normal en los errores —falta proyecto, tope,
    // límite por hora—, no SSE. Se lee y se pasa tal cual: el mensaje que
    // escribió el servidor es mejor que uno genérico de aquí.
    const err = await res.json().catch(() => null);
    onEvent({
      type: 'error',
      error: err?.error || `El servidor contestó ${res.status}.`,
      code: err?.code,
    });
    return;
  }
  if (!res.body) {
    onEvent({ type: 'error', error: 'La respuesta llegó vacía.' });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const trozos = buffer.split('\n\n');
      buffer = trozos.pop() || '';
      for (const linea of trozos) {
        if (!linea.startsWith('data:')) continue;
        try {
          onEvent(JSON.parse(linea.slice(5).trim()) as ChatEvent);
        } catch {
          // Un trozo suelto que no es JSON no puede tumbar la conversación.
        }
      }
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') return;
    onEvent({ type: 'error', error: 'Se cortó la conexión mientras respondía.' });
  }
}
