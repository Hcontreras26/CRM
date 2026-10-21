import { useAuth } from '@/contexts/AuthContext';
import type { UserRole } from '@/shared/types';
import { rolesDe, tieneRol as tieneRolDe } from '@/shared/lib/roles';

export type PermissionKey = string;
export type PermissionMap = Record<PermissionKey, boolean>;

export interface PermissionResource {
  key: string;
  label: string;
  actions: string[];
}

export interface FixedRole {
  key: UserRole;
  label: string;
  desc: string;
  color: 'rose' | 'violet' | 'sky' | 'emerald';
}

// Los permisos de cada rol NO viven aquí (#423). Había una copia de la tabla
// del servidor y otra de la lista de recursos, y una prueba que las comparaba;
// en cuanto el catálogo creció, la copia era una tercera lista que mantener.
// Ahora el mapa de cada persona llega del servidor con el login y con
// /auth/me, y el catálogo con `/permissions/catalogo`.

export const FIXED_ROLES: ReadonlyArray<FixedRole> = [
  { key: 'superadmin', label: 'Superadmin', desc: 'Acceso total. Solo este rol gestiona usuarios.', color: 'rose' },
  { key: 'admin',      label: 'Admin',      desc: 'Acceso operativo completo, no gestiona usuarios.', color: 'violet' },
  { key: 'gestor',     label: 'Gestor',     desc: 'Solo proyectos asignados, solo sus leads.', color: 'sky' },
  // El tutor no entra al CRM normal: solo ve sus formaciones y lo suyo.
  { key: 'tutor',      label: 'Tutor',      desc: 'Colaborador externo. Solo sus formaciones y sus comisiones.', color: 'violet' },
  { key: 'soporte',    label: 'Soporte',    desc: 'Acceso de solo lectura para soporte técnico.', color: 'emerald' },
];

export interface UsePermissionResult {
  can: (permission: PermissionKey) => boolean;
  /** El rol PRINCIPAL. Para preguntar por uno cualquiera, `tieneRol`. */
  role: UserRole | undefined;
  /** Todos sus roles: el principal y los añadidos. */
  roles: UserRole[];
  /** Si lo tiene, da igual que sea el principal o uno de mas. */
  tieneRol: (...roles: UserRole[]) => boolean;
  isAdmin: boolean;
}

/**
 * El `can` de una persona, sin React (#423): lo usa el hook y lo usan las
 * pruebas del menú, que necesitan saber qué ve cada perfil sin montar nada.
 */
export function crearCan(user: Parameters<typeof rolesDe>[0] | null | undefined, permissions: PermissionMap | null | undefined) {
  return function can(permission: PermissionKey): boolean {
    if (!user) return false;
    // Solo el superadmin lo puede todo. Soporte NO: el backend le da un mapa
    // restrictivo y saltarselo aqui le pintaba botones que su rol no permite.
    if (tieneRolDe(user, 'superadmin')) return true;
    // El mapa del servidor, que llega con el login y con /auth/me (al lado del
    // usuario, no dentro). No hay tabla de respaldo (#423): sin mapa todavía,
    // nada — mejor un botón que tarda un instante en salir que uno que sale y
    // no debía.
    //
    // No para quien es solo tutor: su pantalla es la suya (ProtectedRoute) y
    // ningún botón del CRM normal le corresponde.
    if (!permissions || user.role === 'tutor') return false;
    if (permissions['*'] === true) return true;
    return permissions[permission] === true;
  };
}

export default function usePermission(): UsePermissionResult {
  const { user, permissions } = useAuth();
  const can = crearCan(user, permissions);

  return {
    can,
    role: user?.role,
    roles: rolesDe(user),
    tieneRol: (...roles: UserRole[]) => tieneRolDe(user, ...roles),
    isAdmin: tieneRolDe(user, 'admin', 'superadmin'),
  };
}
