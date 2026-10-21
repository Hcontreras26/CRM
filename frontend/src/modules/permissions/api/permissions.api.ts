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

// ── Una clave suelta por rol y por persona: «Diplomas (Certifex) · Ver» (#384) ──

/** Una persona de un rol, con la clave como la tiene. */
export interface PersonaConClave {
  id: number;
  nombre: string;
  email: string;
  /** Su excepción: true, false, o null si tiene lo que diga su rol. */
  excepcion: boolean | null;
  /** Lo que manda al final (rol + rol a medida + excepción). */
  puede: boolean;
}

/** Si un rol (`gestor`, `soporte`… o `custom:<id>`) tiene la clave. */
export async function getClaveDeRol(clave: string, roleKey: string): Promise<boolean> {
  const res = await client.get(`/permissions/claves/${encodeURIComponent(clave)}/rol/${encodeURIComponent(roleKey)}`);
  return (res.data as { permitido?: boolean })?.permitido === true;
}

/** Dársela o quitársela a un rol entero. Solo el superadmin. */
export async function setClaveDeRol(clave: string, roleKey: string, permitido: boolean): Promise<boolean> {
  const res = await client.put(`/permissions/claves/${encodeURIComponent(clave)}/rol/${encodeURIComponent(roleKey)}`, { permitido });
  return (res.data as { permitido?: boolean })?.permitido === true;
}

/** Las personas de un rol (las de sus campus, si quien pregunta es admin). */
export async function personasDeLaClave(clave: string, roleKey: string): Promise<PersonaConClave[]> {
  const res = await client.get(`/permissions/claves/${encodeURIComponent(clave)}/personas?roleKey=${encodeURIComponent(roleKey)}`);
  return (res.data as PersonaConClave[]) || [];
}

/** A una persona: true (dársela), false (quitársela) o null (como su rol). Solo ESA clave. */
export async function setClaveDePersona(clave: string, userId: number, permitido: boolean | null): Promise<{ excepcion: boolean | null; puede: boolean }> {
  const res = await client.put(`/permissions/claves/${encodeURIComponent(clave)}/personas/${userId}`, { permitido });
  return res.data as { excepcion: boolean | null; puede: boolean };
}
