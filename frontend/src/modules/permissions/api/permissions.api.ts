import client from '@/shared/api/client';
import type { PermissionMap } from '@/shared/hooks/usePermission';

// Roles a medida y la vista que estrena cada rol.
//
// El backend ya esta: `/permissions/system-defaults` sirve el catalogo entero
// (recursos, acciones, widgets y elementos del menu) y las vistas de los cuatro
// roles fijos. Se lee de ahi a proposito, en vez de copiarlo aqui: la copia es
// justo lo que hizo que el frontal hablara `leads.read` mientras el backend
// decia `leads.view`.

// Los nombres son los de la tabla: `label` y `description`. Estaban declarados
// como `nombre` y `descripcion`, que no es lo que devuelve el backend, asi que
// todo rol a medida se pintaba sin nombre — sin fallar, solo en blanco.
export interface CustomRole {
  id: number;
  label: string;
  description?: string | null;
  base_role?: string | null;
  permissions?: PermissionMap;
  active?: boolean;
}

// Custom roles son globales (no por proyecto). El parámetro projectId se acepta
// por compat pero no se envía al backend.
export async function listCustomRoles(_projectId?: number): Promise<CustomRole[]> {
  const res = await client.get(`/permissions/custom-roles`);
  return (res.data as CustomRole[]) || [];
}

export interface RoleView {
  default_route?: string;
  hidden_sidebar_items?: string[];
  dashboard_widgets?: string[];
  compact_sidebar?: boolean;
}

export interface CatalogItem { id: string; label: string; scope?: string }

export interface SystemDefaults {
  resources: Record<string, string[]>;
  roles: Record<string, PermissionMap | null>;
  views: Record<string, RoleView>;
  catalogs: { dashboard_widgets: CatalogItem[]; sidebar_items: CatalogItem[] };
}

/** Catalogo y vistas por defecto. La autoridad esta en el backend. */
export async function getSystemDefaults(): Promise<SystemDefaults> {
  const res = await client.get(`/permissions/system-defaults`);
  return res.data as SystemDefaults;
}

/**
 * La vista de un rol: nombre para los fijos, id numerico para los a medida.
 *
 * El backend la envuelve en `view` y devuelve al lado `is_system` y `role`.
 * Leer el nivel de arriba deja todos los campos en undefined y la pantalla se
 * pinta entera a cero sin dar ningun error.
 */
export async function getRoleView(roleKey: string | number): Promise<RoleView> {
  const res = await client.get(`/permissions/role-views/${roleKey}`);
  return ((res.data as { view?: RoleView })?.view || {}) as RoleView;
}

/**
 * Guarda la vista de un rol a medida.
 *
 * Solo acepta id numerico: los cuatro fijos viven en el codigo del backend y
 * responden 400 si se intentan guardar. La pantalla ni ofrece el boton.
 */
export async function setRoleView(id: number, view: RoleView): Promise<RoleView> {
  const res = await client.put(`/permissions/role-views/${id}`, view);
  // Al guardar la envuelve en `default_view`, que no es como la devuelve el GET.
  return ((res.data as { default_view?: RoleView })?.default_view || view) as RoleView;
}

/**
 * Los 8 permisos de Tareas de un rol (`admin`, `gestor`… o `custom:<id>`), como
 * mandan ahora. Los cambian superadmin y admin (Diego, 08/10, #210).
 */
export async function getRolePermissions(roleKey: string): Promise<Record<string, boolean>> {
  const res = await client.get(`/permissions/role-permissions/${roleKey}`);
  return ((res.data as { permissions?: Record<string, boolean> })?.permissions || {});
}

export async function saveRolePermissions(
  roleKey: string,
  permissions: Record<string, boolean>,
): Promise<Record<string, boolean>> {
  const res = await client.put(`/permissions/role-permissions/${roleKey}`, { permissions });
  return ((res.data as { permissions?: Record<string, boolean> })?.permissions || permissions);
}
