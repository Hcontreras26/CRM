import client from '@/shared/api/client';

/** Una línea de la bandeja. Sin el cuerpo: eso se pide al abrir uno. */
export interface CorreoEnLista {
  id: number;
  cuando: string;
  direccion: 'salida' | 'entrada';
  remitente: string | null;
  destinatarios: string;
  asunto: string;
  estado: 'enviado' | 'fallido' | 'bloqueado' | 'recibido';
  intentos: number;
  etiquetas: string[] | null;
  project_id: number | null;
  error: string | null;
  /** Los envíos anteriores a que se guardara el texto no lo tienen. */
  tiene_cuerpo: boolean;
}

export interface CorreoCompleto extends Omit<CorreoEnLista, 'tiene_cuerpo'> {
  brevo_msg_id: string | null;
  cuerpo_html: string | null;
}

export interface Bandeja {
  total: number;
  pagina: number;
  limite: number;
  filas: CorreoEnLista[];
}

export interface Filtros {
  estado?: string | null;
  direccion?: string | null;
  busca?: string | null;
  desde?: string | null;
  hasta?: string | null;
  pagina?: number;
}

function comoParams(f: Filtros): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, String(v));
  return p.toString();
}

export const correosApi = {
  listar: (f: Filtros = {}) =>
    client.get(`/correos?${comoParams(f)}`) as Promise<{ success: boolean; data: Bandeja; error?: string }>,

  /** El único sitio que devuelve el texto del correo. */
  uno: (id: number) =>
    client.get(`/correos/${id}`) as Promise<{ success: boolean; data: CorreoCompleto; error?: string }>,

  recuento: () =>
    client.get('/correos/recuento') as Promise<{
      success: boolean; data: { enviado: number; fallido: number; bloqueado: number; recibido: number };
    }>,

  /**
   * Trae del buzon lo que haya llegado. El cron ya lo hace solo; esto es para
   * quien acaba de mandar un aviso y espera respuesta ahora.
   */
  sincronizar: () =>
    client.post('/correos/sincronizar', {}) as Promise<{
      success: boolean; data: { leidos: number; nuevos: number; motivo?: string };
    }>,
};
