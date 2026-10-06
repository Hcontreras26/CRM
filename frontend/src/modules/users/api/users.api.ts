import client from '@/shared/api/client';
import type { UserRole } from '@/shared/types';

/** Un proyecto asignado, con su flag de round-robin. */
export interface ProjectAssignment {
  projectId: number;
  recibeLeads: boolean;
}

export interface CrmUser {
  id: number;
  nombre: string;
  email: string;
  /** El rol PRINCIPAL. Es el que sale en las listas y el que mira medio CRM. */
  role: UserRole;
  /** Roles de MAS: solo suman permisos. Vacio en casi todo el mundo. */
  roles_extra?: UserRole[];
  active: boolean;
  last_login_at: string | null;
  created_at: string | null;
  whatsapp_phone: string | null;
  whatsapp_display_name: string | null;
  avatar_url: string | null;
  projects: ProjectAssignment[];
  /**
   * Los permisos acotados. Van aparte del rol a proposito: ser «gestor» no basta
   * para decidir quien factura — Vanessa lo es y no debe.
   *
   * Estuvieron sin llegar aqui: el listado del backend los usaba en el WHERE
   * pero no los incluia en el SELECT, asi que nadie podia ver quien los tenia.
   * Por eso a Ana Comercial le falto uno desde su alta sin que nadie lo notara.
   * Ya vienen.
   */
  factura_manager?: boolean;
  editar_fechas_factura?: boolean;
  gestor_colaboraciones?: boolean;
  /**
   * Si usa el WhatsApp del CRM (#128).
   *
   * `null` significa que la migracion 156 todavia no esta aplicada — no que
   * este apagado. La pantalla lo distingue: con null la casilla no se puede
   * tocar y dice por que, en vez de dejar apagar algo que no se va a guardar.
   */
  usa_whatsapp?: boolean | null;
}

export interface ListUsersParams {
  /** Proyecto concreto, o undefined para todos. */
  projectId?: number;
  /** El backend topa en 100. */
  limit?: number;
  page?: number;
}

export interface ListUsersResult {
  users: CrmUser[];
  /** Cuantos hay en total en el servidor — puede ser mayor que users.length. */
  total: number;
}

/**
 * El backend devuelve los proyectos en dos formas segun la antiguedad del dato:
 * `projects: [{projectId, recibeLeads}]` (actual) y `project_ids: [1,2]` (viejo).
 * Aqui se normaliza a una sola para que ningun componente tenga que saberlo.
 */
function normalizeProjects(raw: any): ProjectAssignment[] {
  const lista = raw?.projects;
  if (Array.isArray(lista) && lista.length > 0 && typeof lista[0] === 'object' && lista[0] !== null && 'projectId' in lista[0]) {
    return lista.map((p: any) => ({ projectId: Number(p.projectId), recibeLeads: !!p.recibeLeads }));
  }
  return (raw?.project_ids || []).map((id: number) => ({ projectId: Number(id), recibeLeads: false }));
}

function normalizeUser(raw: any): CrmUser {
  return {
    id: raw.id,
    nombre: raw.nombre || raw.name || '',
    email: raw.email || '',
    role: raw.role,
    // Los roles de mas, si los tiene. Vacio en casi todo el mundo.
    roles_extra: Array.isArray(raw.roles_extra) ? raw.roles_extra : [],
    active: raw.active !== false,
    last_login_at: raw.last_login_at ?? null,
    created_at: raw.created_at ?? null,
    whatsapp_phone: raw.whatsapp_phone ?? null,
    whatsapp_display_name: raw.whatsapp_display_name ?? null,
    avatar_url: raw.avatar_url ?? null,
    projects: normalizeProjects(raw),
    factura_manager: !!raw.factura_manager,
    editar_fechas_factura: !!raw.editar_fechas_factura,
    gestor_colaboraciones: !!raw.gestor_colaboraciones,
    // Sin `!!`: hace falta distinguir «apagado» de «todavia no hay columna».
    usa_whatsapp: raw.usa_whatsapp ?? null,
  };
}

export async function listUsers({ projectId, limit = 100, page = 1 }: ListUsersParams = {}): Promise<ListUsersResult> {
  const res = await client.get('/users', {
    params: {
      limit,
      page,
      // La pantalla de Usuarios es la que tiene que verlos a todos: profesores y
      // colaboraciones incluidos. El resto del CRM los pide sin este flag.
      incluirTodos: 'true',
      // El sentinel -1 («todos los proyectos») no vale: el backend valida > 0.
      projectId: projectId && projectId > 0 ? projectId : undefined,
    },
  });
  if (!res.success) throw new Error(res.error || 'No se pudieron cargar los usuarios');
  return {
    users: (res.data || []).map(normalizeUser),
    total: res.pagination?.total ?? (res.data || []).length,
  };
}

export interface CreateUserPayload {
  nombre: string;
  email: string;
  role: UserRole;
  /** Roles de MAS. Solo suman permisos; el principal sigue siendo `role`. */
  roles_extra?: UserRole[];
  projects: ProjectAssignment[];
}

export interface CreateUserResult {
  user: CrmUser;
  /** Link de invitacion — solo viene si el envio por email no salio. */
  setPasswordToken?: string;
}

export async function createUser(payload: CreateUserPayload): Promise<CreateUserResult> {
  const res = await client.post('/users', payload);
  if (!res.success) throw new Error(res.error || 'No se pudo crear el usuario');
  return { user: normalizeUser(res.data), setPasswordToken: res.data?.setPasswordToken };
}

/** Solo estos campos acepta el backend hoy. El email NO se puede cambiar. */
export interface UpdateUserPayload {
  nombre?: string;
  /** Solo lo acepta el servidor si quien lo manda es super admin (#246). */
  email?: string;
  /** Con el correo nuevo, mandarle el enlace para poner contraseña allí (#246). */
  reenviarEnlace?: boolean;
  role?: UserRole;
  /** Roles de MAS. Una lista vacia los quita todos, que es lo que se espera. */
  roles_extra?: UserRole[];
  projects?: ProjectAssignment[];
  /**
   * Formato viejo, que aqui sirve para una cosa que el nuevo no puede: dejar a
   * un usuario SIN proyectos. El backend lee `projects: []` como «no tocar»
   * (cae al else y se queda en null), mientras que `projectIds: []` si
   * desactiva todas sus asignaciones. Ver user.model.js · update().
   */
  projectIds?: number[];
  whatsapp_phone?: string;
  /**
   * Las casillas del formulario. Faltaban aqui, y por eso no se mandaban: el
   * dialogo las pintaba, se marcaban y al volver seguian como estaban. El
   * backend si las acepta desde el principio (`updateUserSchema`).
   */
  factura_manager?: boolean;
  editar_fechas_factura?: boolean;
  /** WhatsApp del CRM (#128). */
  usa_whatsapp?: boolean;
}

export async function updateUser(id: number, payload: UpdateUserPayload): Promise<CrmUser> {
  const res = await client.patch(`/users/${id}`, payload);
  if (!res.success) throw new Error(res.error || 'No se pudo actualizar el usuario');
  return normalizeUser(res.data);
}

export async function deactivateUser(id: number): Promise<{ leads_huerfanizados?: number; leads_reasignados?: number }> {
  const res = await client.delete(`/users/${id}`);
  if (!res.success) throw new Error(res.error || 'No se pudo desactivar el usuario');
  return res.data || {};
}

export async function reactivateUser(id: number): Promise<void> {
  const res = await client.patch(`/users/${id}/reactivate`);
  if (!res.success) throw new Error(res.error || 'No se pudo reactivar el usuario');
}

/**
 * Reset de contraseña por un superadmin. Cierra las sesiones activas del usuario.
 * Repetida, con las reglas de «Establece tu contraseña» (#248).
 */
export async function setUserPassword(id: number, password: string, confirmPassword: string): Promise<void> {
  const res = await client.patch(`/users/${id}/password`, { password, confirmPassword });
  if (!res.success) throw new Error(res.error || 'No se pudo cambiar la contraseña');
}

/** Si cambiarle el correo a alguien puede dejarle sin prospectos de Make (#248). */
export interface AvisoCambioCorreo {
  email: string;
  campusEnReparto: number;
  prospectosAsignados: number;
  enviosDeMake: number;
  recibeProspectos: boolean;
}

export async function avisoCambioCorreo(id: number): Promise<AvisoCambioCorreo> {
  const res = await client.get(`/users/${id}/aviso-correo`);
  if (!res.success) throw new Error(res.error || 'No se pudo comprobar si recibe prospectos');
  return res.data as AvisoCambioCorreo;
}
