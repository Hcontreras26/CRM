import client from '@/shared/api/client';
import type { UserRole } from '@/shared/types';

/**
 * El equipo comercial de una administradora (Carlos, 09/11/2026): las gestoras
 * a su cargo. Con alguna, esa persona ve solo lo suyo y lo de ellas; sin
 * ninguna, todo lo de sus campus.
 */
export interface GestoraDelEquipo {
  id: number;
  nombre: string;
  email: string;
  role: UserRole;
  active: boolean;
  en_equipo: boolean;
}

export interface EquipoComercial {
  lider_id: number;
  gestora_ids: number[];
  /** Las que tiene y las que se le pueden poner (gestoras de sus campus). */
  gestoras: GestoraDelEquipo[];
  /** Si quien mira puede cambiarlo (`equipos.gestionar`): lo dice el servidor. */
  puede_cambiar?: boolean;
}

export async function getEquipoComercial(userId: number): Promise<EquipoComercial> {
  const res = await client.get(`/users/${userId}/equipo-comercial`);
  if (!res.success) throw new Error(res.error || 'No se pudo cargar el equipo');
  return res.data;
}

export async function setEquipoComercial(userId: number, gestoraIds: number[]): Promise<EquipoComercial> {
  const res = await client.put(`/users/${userId}/equipo-comercial`, { gestoraIds });
  if (!res.success) throw new Error(res.error || 'No se pudo guardar el equipo');
  return res.data;
}
