import client from '@/shared/api/client';

/**
 * La campana, contra el backend (#111).
 *
 * Lo que llega ya viene agrupado y clasificado desde el servidor: la cuenta de
 * un grupo se hace en SQL, así que «×98» es 98 aunque la pantalla pida 20.
 */

/** Pide hacer algo. */
export type Clase = 'accion' | 'aviso';

export interface Aviso {
  id: number;
  type: string;
  /** Nombre legible del tipo («Prospecto asignado»). */
  etiqueta: string;
  clase: Clase;
  title: string;
  message: string | null;
  link_path: string | null;
  is_read: boolean;
  created_at: string;
  /** Identifica la fila agrupada. `id:123` si va sola. */
  grupo: string;
  /** Cuántos avisos hay detrás de esta fila. 1 si no se agrupa. */
  veces: number;
  /** De esos, cuántos sin leer. */
  sin_leer: number;
  /** El más antiguo del grupo. */
  desde: string;
}

export interface TipoDeAviso {
  tipo: string;
  clase: Clase;
  etiqueta: string;
  descripcion: string | null;
}

export interface Preferencias {
  tipos: TipoDeAviso[];
  apagados: string[];
  /** `false` solo si faltara `avisos_apagados` (migración 132, ya aplicada). */
  guardable: boolean;
  aviso: string | null;
}

export async function listarAvisos(limit = 100): Promise<Aviso[]> {
  const res = await client.get<Aviso[]>('/notifications', { params: { limit } })
    .catch(() => ({ success: false, data: [] as Aviso[] }));
  return res.success && Array.isArray(res.data) ? res.data : [];
}

/** Marca leída una fila entera, no solo la última del grupo. */
export async function marcarGrupoLeido(grupo: string): Promise<void> {
  await client.patch('/notifications/read-group', { grupo });
}

export async function marcarTodasLeidas(): Promise<void> {
  await client.patch('/notifications/mark-all-read');
}

export async function leerPreferencias(): Promise<Preferencias | null> {
  const res = await client.get<Preferencias>('/notifications/preferences').catch(() => null);
  return res?.success ? res.data : null;
}

/**
 * Guarda los tipos apagados. Devuelve el aviso del servidor si todavía no se
 * puede —falta la migración— en vez de fingir que se guardó.
 */
export async function guardarPreferencias(apagados: string[]): Promise<{ ok: boolean; error?: string }> {
  try {
    await client.put('/notifications/preferences', { apagados });
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.data?.error || err?.message || 'No se pudo guardar.' };
  }
}
