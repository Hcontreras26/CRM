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
  /** El campus del correo, si lo tiene. */
  campus: string | null;
  /** Las personas del CRM detrás de los destinatarios y del remitente, si las hay. */
  para_quien: string | null;
  de_quien: string | null;
  error: string | null;
  /** Los envíos anteriores a que se guardara el texto no lo tienen. */
  tiene_cuerpo: boolean;
  /** El buzón por el que entró (#1032). Null en lo que sale y en lo del buzón del servidor. */
  buzon_id: number | null;
  buzon_nombre: string | null;
  buzon_direccion: string | null;
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
  /** Un buzón (#1032), o 'servidor' para lo que entró por el del .env. */
  buzon?: number | 'servidor' | null;
  pagina?: number;
}

/**
 * Un buzón conectado (#1032). SIN la conexión: la API no devuelve nunca el
 * servidor, el usuario ni la contraseña, solo si están guardados.
 */
export interface Buzon {
  id: number;
  nombre: string;
  direccion: string;
  project_id: number | null;
  project_nombre: string | null;
  empresa_id: number | null;
  empresa_nombre: string | null;
  empresa_sin_correo: boolean | null;
  configurada: boolean;
  ultima_lectura_at: string | null;
  ultimo_resultado: 'ok' | 'error' | null;
  ultimo_error: string | null;
  recibidos: number;
}

/** Lo que se escribe en el formulario. En un cambio, lo que se deje en blanco no se toca. */
export interface BuzonForm {
  nombre?: string;
  direccion?: string;
  usuario?: string;
  clave?: string;
  host?: string;
  puerto?: number;
  project_id?: number | null;
  empresa_id?: number | null;
}

/** Si el buzón es de una empresa sin correo de facturación, se ofrece ponerlo. */
export interface OfertaCorreoEmpresa { empresaId: number; empresa: string; direccion: string }

export interface ResultadoLectura {
  leidos: number;
  nuevos: number;
  motivo?: 'SIN_BUZON' | 'ERROR';
  detalle?: string;
  buzones?: Array<{ id: number | null; nombre: string; direccion: string; leidos: number; nuevos: number; motivo?: string; detalle?: string }>;
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
  sincronizar: (buzonId?: number | null) =>
    client.post('/correos/sincronizar', buzonId ? { buzonId } : {}) as Promise<{
      success: boolean; data: ResultadoLectura;
    }>,

  // ── Buzones (#1032) ──────────────────────────────────────────────────────
  buzones: () =>
    client.get('/correos/buzones') as Promise<{ success: boolean; data: Buzon[]; error?: string }>,

  conectarBuzon: (b: BuzonForm) =>
    client.post('/correos/buzones', b) as Promise<{
      success: boolean; data: Buzon; ofrecerCorreoEmpresa: OfertaCorreoEmpresa | null; error?: string;
    }>,

  cambiarBuzon: (id: number, b: BuzonForm) =>
    client.patch(`/correos/buzones/${id}`, b) as Promise<{
      success: boolean; data: Buzon; ofrecerCorreoEmpresa: OfertaCorreoEmpresa | null; error?: string;
    }>,

  quitarBuzon: (id: number) =>
    client.delete(`/correos/buzones/${id}`) as Promise<{ success: boolean; error?: string }>,

  /** Con lo escrito y, si es uno guardado, lo que falte de lo guardado. No guarda nada. */
  probarBuzon: (b: BuzonForm, id?: number | null) =>
    client.post(id ? `/correos/buzones/${id}/probar` : '/correos/buzones/probar', b) as Promise<{
      success: boolean; data: { ok: boolean; mensajes?: number; motivo?: string }; error?: string;
    }>,

  /** Poner la dirección del buzón como correo de facturación de su empresa, si sigue vacío. */
  usarComoCorreoDeEmpresa: (id: number) =>
    client.post(`/correos/buzones/${id}/correo-de-empresa`, {}) as Promise<{
      success: boolean; data: { id: number; razon_social: string; email: string } | null; motivo?: string;
    }>,
};
