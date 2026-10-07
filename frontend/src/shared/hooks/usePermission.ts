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

// Permisos por rol fijo del sistema.
//
// Son el RESPALDO: si el backend manda los suyos —y los manda— ganan ellos.
// Esta tabla cubre los 4 roles base para el rato entre que se entra y llega
// `/auth/me`, y para el caso de que esa llamada falle.
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, PermissionMap> = {
  superadmin: { '*': true },
  admin: {
    'leads.view': true,         'leads.create': true,       'leads.edit': true,         'leads.delete': true,       'leads.export': true,       'leads.assign': true,       'leads.bulk_action': true,
    'conversions.view': true,    'conversions.create': true,  'conversions.edit': true,    'conversions.delete': true,
    'conversions.sin_gestora': true,
    'products.view': true,    'products.create': true,  'products.edit': true,    'products.delete': true,
    'clients.view': true,    'clients.create': true,  'clients.edit': true,    'clients.delete': true,  'clients.export': true,
    'dossiers.view': true,    'dossiers.upload': true,  'dossiers.delete': true,
    'commissions.view': true,    'commissions.create': true,  'commissions.edit': true,    'commissions.delete': true,
    'matriculas.view': true,    'matriculas.create': true,  'matriculas.edit': true,    'matriculas.delete': true,
    'accounting.view': true,    'accounting.create': true,  'accounting.edit': true,    'accounting.delete': true,
    'accounts_payable.view': true,    'accounts_payable.create': true,  'accounts_payable.edit': true,    'accounts_payable.delete': true,
    'payroll.view': true,    'payroll.create': true,  'payroll.edit': true,    'payroll.delete': true,
    'reports.view': true,    'reports.export': true,
    'ia.view': true,
    'woocommerce.view': true,  'woocommerce.sync': true,
    'webhooks.view': true,    'webhooks.create': true,  'webhooks.edit': true,    'webhooks.delete': true,
    'forms.view': true,    'forms.create': true,  'forms.edit': true,    'forms.delete': true,
    'email_sequences.view': true,    'email_sequences.create': true,  'email_sequences.edit': true,    'email_sequences.delete': true,
    'users.view': false,    'users.create': false,  'users.edit': false,    'users.delete': false,
    'settings.view': true,  'settings.edit': true,
    'field_defs.view': true,  'field_defs.edit': true,
    'channels.view': true,  'channels.edit': true,
    'roles.view': true,   'roles.edit': false,
    'tasks.view_all': true, 'tasks.view_own': true, 'tasks.create': true, 'tasks.assign': true, 'tasks.edit': true, 'tasks.delete': true,
  },
  gestor: {
    'leads.view': true,          'leads.create': true,        'leads.edit': true,          'leads.delete': false,       'leads.export': false,       'leads.assign': false,       'leads.bulk_action': false,
    'conversions.view': true,     'conversions.create': true,   'conversions.edit': true,     'conversions.delete': false,
    'conversions.sin_gestora': false,
    'products.view': true,     'products.create': false,  'products.edit': false,    'products.delete': false,
    'clients.view': true,     'clients.create': true,   'clients.edit': true,     'clients.delete': false,  'clients.export': false,
    'dossiers.view': true,     'dossiers.upload': false,  'dossiers.delete': false,
    'commissions.view': true,     'commissions.create': false,  'commissions.edit': false,    'commissions.delete': false,
    'matriculas.view': true,     'matriculas.create': true,   'matriculas.edit': true,     'matriculas.delete': false,
    'accounting.view': false,    'accounting.create': false,  'accounting.edit': false,    'accounting.delete': false,
    'accounts_payable.view': false,    'accounts_payable.create': false,  'accounts_payable.edit': false,    'accounts_payable.delete': false,
    'payroll.view': false,    'payroll.create': true,   'payroll.edit': false,    'payroll.delete': false,
    'reports.view': false,    'reports.export': false,
    'ia.view': false,
    'woocommerce.view': false,  'woocommerce.sync': false,
    'webhooks.view': false,    'webhooks.create': false,  'webhooks.edit': false,    'webhooks.delete': false,
    'forms.view': false,    'forms.create': false,  'forms.edit': false,    'forms.delete': false,
    'email_sequences.view': false,    'email_sequences.create': false,  'email_sequences.edit': false,    'email_sequences.delete': false,
    'users.view': false,    'users.create': false,  'users.edit': false,    'users.delete': false,
    'settings.view': false,  'settings.edit': false,
    'field_defs.view': false,  'field_defs.edit': false,
    'channels.view': true,   'channels.edit': false,
    'roles.view': false,  'roles.edit': false,
    'tasks.view_all': false, 'tasks.view_own': true, 'tasks.create': true, 'tasks.assign': false, 'tasks.edit': true, 'tasks.delete': false,
  },
  // Soporte NO es acceso total: el backend lo define como mirar y poco mas.
  // Antes `can()` lo saltaba con un `return true` y veia todos los botones.
  soporte: {
    'leads.view': true,          'leads.create': true,        'leads.edit': true,          'leads.delete': false,       'leads.export': false,       'leads.assign': false,       'leads.bulk_action': false,
    'conversions.view': true,     'conversions.create': false,  'conversions.edit': false,    'conversions.delete': false,
    'products.view': true,     'products.create': false,  'products.edit': false,    'products.delete': false,
    'clients.view': true,     'clients.create': false,  'clients.edit': false,    'clients.delete': false,  'clients.export': false,
    'dossiers.view': true,     'dossiers.upload': false,  'dossiers.delete': false,
    'commissions.view': false,    'commissions.create': false,  'commissions.edit': false,    'commissions.delete': false,
    'matriculas.view': true,     'matriculas.create': false,  'matriculas.edit': false,    'matriculas.delete': false,
    'accounting.view': false,    'accounting.create': false,  'accounting.edit': false,    'accounting.delete': false,
    'accounts_payable.view': false,    'accounts_payable.create': false,  'accounts_payable.edit': false,    'accounts_payable.delete': false,
    'payroll.view': false,    'payroll.create': false,  'payroll.edit': false,    'payroll.delete': false,
    'reports.view': true,     'reports.export': false,
    'ia.view': true,
    'woocommerce.view': false,  'woocommerce.sync': false,
    'webhooks.view': true,     'webhooks.create': false,  'webhooks.edit': false,    'webhooks.delete': false,
    'forms.view': true,     'forms.create': false,  'forms.edit': false,    'forms.delete': false,
    'email_sequences.view': false,    'email_sequences.create': false,  'email_sequences.edit': false,    'email_sequences.delete': false,
    'users.view': false,    'users.create': false,  'users.edit': false,    'users.delete': false,
    'settings.view': false,  'settings.edit': false,
    'field_defs.view': false,  'field_defs.edit': false,
    'channels.view': true,   'channels.edit': false,
    'roles.view': false,  'roles.edit': false,
    'tasks.view_all': false, 'tasks.view_own': true, 'tasks.create': true, 'tasks.assign': false, 'tasks.edit': true, 'tasks.delete': false,
  },
  // Un tutor no tiene permisos de gestion: entra a lo suyo —sus cursos y sus
  // comisiones— y el menu ya se lo recorta enumerando lo que puede ver. Vacio
  // y explicito: sin esta entrada el tipo no cuadraba y `can()` devolvia falso
  // para todo por accidente en vez de por decision.
  tutor: {},
  // Colaborador (#210, fase 5): solo su tablero de tareas. Espejo del backend.
  colaborador: {
    'tasks.view_all': false, 'tasks.view_own': true, 'tasks.create': true, 'tasks.assign': false, 'tasks.edit': true, 'tasks.delete': false,
  },
};

// Espejo de ALL_RESOURCES del backend. La pantalla de Roles pinta las casillas
// desde aqui, asi que si esto se desvia se guardan en la base claves que ningun
// guardia mira. `permisosEspejo.test.js` compara las dos listas.
export const PERMISSION_RESOURCES: ReadonlyArray<PermissionResource> = [
  { key: 'leads',            label: 'Prospectos',           actions: ['view', 'create', 'edit', 'delete', 'export', 'assign', 'bulk_action'] },
  { key: 'conversions',      label: 'Conversiones',         actions: ['view', 'create', 'edit', 'delete', 'sin_gestora'] },
  { key: 'products',         label: 'Productos',            actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'clients',          label: 'Clientes',             actions: ['view', 'create', 'edit', 'delete', 'export'] },
  { key: 'dossiers',         label: 'Dosieres',             actions: ['view', 'upload', 'delete'] },
  { key: 'commissions',      label: 'Comisiones',           actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'matriculas',       label: 'Matrículas',           actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'accounting',       label: 'Contabilidad',         actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'accounts_payable', label: 'Cuentas por pagar',    actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'payroll',          label: 'Nóminas',              actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'reports',          label: 'Informes',             actions: ['view', 'export'] },
  { key: 'ia',               label: 'IA',                   actions: ['view'] },
  { key: 'woocommerce',      label: 'WooCommerce',          actions: ['view', 'sync'] },
  { key: 'webhooks',         label: 'Webhooks',             actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'forms',            label: 'Formularios',          actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'email_sequences',  label: 'Secuencias de correo', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'users',            label: 'Usuarios',             actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'settings',         label: 'Configuración',        actions: ['view', 'edit'] },
  { key: 'field_defs',       label: 'Campos',               actions: ['view', 'edit'] },
  { key: 'channels',         label: 'Canales',              actions: ['view', 'edit'] },
  { key: 'roles',            label: 'Roles',                actions: ['view', 'edit'] },
  { key: 'tasks',            label: 'Tareas',               actions: ['view_all', 'view_own', 'create', 'assign', 'edit', 'delete'] },
];

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

export default function usePermission(): UsePermissionResult {
  const { user, permissions } = useAuth();

  function can(permission: PermissionKey): boolean {
    if (!user) return false;
    // Solo el superadmin lo puede todo. Soporte NO: el backend le da un mapa
    // restrictivo y saltarselo aqui le pintaba botones que su rol no permite.
    if (tieneRolDe(user, 'superadmin')) return true;
    // Los del backend, que mandan sobre la tabla de abajo.
    //
    // Se leian de `user.permissions` y ahi no estan: `/auth/me` los devuelve AL
    // LADO del usuario, no dentro. O sea que esta rama no se cumplia nunca y
    // todo el mundo caia en los defaults — los roles a medida no pintaban nada
    // aunque el backend llevara tiempo calculandolos.
    //
    // Solo en lo que el backend DEFINE: lo que no esta en su mapa sigue saliendo
    // de la tabla de abajo, como hasta ahora. Y no para el tutor: el backend no
    // tiene tabla de tutor y le calcula la de gestora, que le pintaria botones
    // que no son suyos.
    if (permissions && user.role !== 'tutor') {
      if (permissions['*'] === true) return true;
      if (Object.prototype.hasOwnProperty.call(permissions, permission)) {
        return permissions[permission] === true;
      }
    }
    // Respaldo: los de cada uno de sus roles, sumados. Basta con que UNO lo
    // permita —si se cruzaran al reves, añadir un rol quitaria permisos—.
    return rolesDe(user).some((r) => {
      const defaults = ROLE_DEFAULT_PERMISSIONS[r] || {};
      return defaults[permission] === true || defaults['*'] === true;
    });
  }

  return {
    can,
    role: user?.role,
    roles: rolesDe(user),
    tieneRol: (...roles: UserRole[]) => tieneRolDe(user, ...roles),
    isAdmin: tieneRolDe(user, 'admin', 'superadmin'),
  };
}
