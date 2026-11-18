import type { UserRole } from '@/shared/types';
import type { PuedeDarRol, RolAsignable } from '../api/users.api';
import { ROLE_LABELS } from './usersUi';

/**
 * Los roles que no se pueden dar, dichos antes de guardar (Tony, 03/11: cinco
 * altas rechazadas con «Ese rol le daría lo que tú no tienes» sin saber qué
 * cambiar). La regla es la del servidor (nadie da lo que no tiene, #423); aquí
 * solo se cuenta.
 */

const lista = (xs: string[], cuantos = xs.length) => `${xs.join(', ')}${cuantos > xs.length ? '…' : ''}`;
const comillas = (roles: string[]) => {
  const n = roles.map((r) => `«${ROLE_LABELS[r] ?? r}»`);
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} y ${n.at(-1)}` : n[0];
};

/** La línea bajo un rol que no se puede dar. Null si se puede (o aún no se sabe). */
export function motivoNoAsignable(p: PuedeDarRol | undefined): string | null {
  if (!p || p.puede) return null;
  return `No puedes dar este rol: le daría permisos que tú no tienes (${lista(p.faltan, p.cuantos)}). Pídeselo a un superadmin.`;
}

/** { rol: fila } para buscar rápido. */
export function porRol(roles: RolAsignable[] | null): Partial<Record<UserRole, RolAsignable>> {
  return Object.fromEntries((roles ?? []).map((r) => [r.rol, r]));
}

/**
 * Si el servidor aun así rechaza el alta o el cambio con NO_LO_TIENES, qué rol
 * quitar. El servidor dice cuál (`data.roles`); si no lo dijera, los que se
 * piden. Null si el error es otro.
 */
export function mensajeNoLoTienes(err: any, pedidos: { role: UserRole; roles_extra: UserRole[] }): string | null {
  const cuerpo = err?.data;
  if (cuerpo?.code !== 'NO_LO_TIENES') return null;
  const datos = cuerpo.data || {};
  const roles: string[] = Array.isArray(datos.roles) && datos.roles.length
    ? datos.roles
    : [pedidos.role, ...pedidos.roles_extra.filter((r) => r !== pedidos.role)];
  const faltan: string[] = Array.isArray(datos.faltan) ? datos.faltan : [];
  const por = faltan.length ? ` (${lista(faltan, datos.cuantos)})` : '';
  return `Quita ${comillas(roles)}: le daría permisos que tú no tienes${por}. Si de verdad lo necesita, pídeselo a un superadmin.`;
}
