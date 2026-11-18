import type { BrevoBloqueo } from '../api/users.api';

/** «26 de octubre de 2026», o null si Brevo no dio fecha. */
export function fechaDelBloqueo(b: Pick<BrevoBloqueo, 'bloqueado_desde'>): string | null {
  if (!b.bloqueado_desde) return null;
  const d = new Date(b.bloqueado_desde);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** «Brevo bloquea su correo desde el 26 de octubre de 2026, motivo: Rebote duro…». */
export function textoDelBloqueo(b: Pick<BrevoBloqueo, 'bloqueado_desde' | 'motivo'>): string {
  const fecha = fechaDelBloqueo(b);
  const desde = fecha ? `desde el ${fecha}` : 'desde hace un tiempo';
  return `Brevo bloquea su correo ${desde}, motivo: ${b.motivo || 'desconocido'}`;
}

/** Los bloqueos por persona, para la lista y la ficha. */
export function porPersona(bloqueos: BrevoBloqueo[]): Map<number, BrevoBloqueo> {
  const mapa = new Map<number, BrevoBloqueo>();
  for (const b of bloqueos) if (!mapa.has(b.user_id)) mapa.set(b.user_id, b);
  return mapa;
}
