/*
  ¿Le sale «Eliminar» en este prospecto? (CRM#1220)

  Por permiso y con el alcance del servidor, nunca por rol (#423). Antes se
  miraba `role === 'admin' | 'superadmin'` y, si no, que el responsable fuera
  ella: a Raquel, líder de equipo con `leads.delete`, no le salía en los de las
  gestoras de su equipo, que el servidor sí le deja borrar.

  La pantalla no sabe quién es de su equipo; el servidor sí. Por eso la lista
  trae `puede_eliminar` en cada fila (`modules/leads/puede-eliminar.js`, la
  misma regla que el borrado) y aquí se usa tal cual. Si una fila no lo trae
  (otra pantalla, un servidor viejo), la regla de siempre sin roles: con
  `leads.delete_cualquiera`, todos; con `leads.delete`, los suyos sin convertir.
  Mismo fichero en CRM-ISEIE (paridad).
*/
export interface LeadParaEliminar {
  responsable_id?: number | null;
  status?: string;
  puede_eliminar?: boolean;
}

export function puedeEliminarLead(
  lead: LeadParaEliminar,
  can: (permiso: string) => boolean,
  userId: number | null | undefined,
): boolean {
  if (!can('leads.delete')) return false;
  if (typeof lead.puede_eliminar === 'boolean') return lead.puede_eliminar;
  if (can('leads.delete_cualquiera')) return true;
  return userId != null && lead.responsable_id === userId && lead.status !== 'convertido';
}
