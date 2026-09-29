import client from '@/shared/api/client';

/** Un dia del resumen. El backend manda siempre los dos, «ayer» y «hoy». */
export interface DiaDelResumen {
  dia: 'ayer' | 'hoy';
  leads: number;
  contactados: number;
  ventas: number;
  sin_tocar: number;
}

/**
 * «Ayer y hoy», con datos (#130).
 *
 * El recorte por rol lo hace el servidor: una gestora recibe lo suyo aunque
 * mande otro `asesoraId`. Aqui no se decide nada de eso a proposito — un filtro
 * de pantalla se salta escribiendo la direccion a mano.
 */
export async function getResumenDelDia(
  projectIds: number[],
  asesoraId?: number | null,
): Promise<DiaDelResumen[]> {
  const params = new URLSearchParams();
  if (projectIds?.length) params.set('projectIds', projectIds.join(','));
  if (asesoraId) params.set('asesoraId', String(asesoraId));
  // `/informes`, no `/reports`: el modulo se sirve en castellano y el alias
  // viejo existe pero las nueve llamadas del frontal dicen `/informes/...`.
  const r = await client.get(`/informes/resumen-del-dia?${params.toString()}`);
  return r?.data ?? [];
}
