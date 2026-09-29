import {
  Users, Folder, Key, Envelope, ShieldCheck, PlugsConnected, Globe, ListChecks,
  ChatCircleText, Lightning, Tree, Receipt, EnvelopeOpen, CalendarBlank, type Icon,
} from '@phosphor-icons/react';
export interface SettingsTab {
  id: string;
  label: string;
  icon: Icon;
  to?: string;
}

export const TABS: SettingsTab[] = [
  { id: 'projects',     label: 'Proyectos',           icon: Folder },
  { id: 'users',        label: 'Usuarios',            icon: Users },
  { id: 'availability', label: 'Disponibilidad',      icon: CalendarBlank },
  { id: 'roles',        label: 'Roles y Permisos',    icon: ShieldCheck,    to: '/configuracion/roles' },
  { id: 'fields',       label: 'Campos custom',       icon: ListChecks,     to: '/configuracion/campos' },
  { id: 'cat-tree',     label: 'Árbol de categorías', icon: Tree,           to: '/configuracion/categorias-arbol' },
  { id: 'channels',     label: 'Canales',             icon: ChatCircleText, to: '/configuracion/canales' },
  { id: 'proceso',      label: 'Proceso comercial',   icon: ListChecks,     to: '/prospectos/proceso' },
  { id: 'forms',        label: 'Formularios',         icon: Globe },
  { id: 'webhooks',     label: 'Webhooks',            icon: PlugsConnected, to: '/captacion/webhooks' },
  { id: 'sequences',    label: 'Email seguimiento',   icon: Envelope,       to: '/secuencias-email' },
  { id: 'templates',    label: 'Plantillas email',    icon: EnvelopeOpen,   to: '/configuracion/plantillas-email' },
  { id: 'shortcuts',    label: 'Atajos rápidos',      icon: Lightning,      to: '/configuracion/atajos' },
  { id: 'documents',    label: 'Numeración docs',     icon: Receipt,        to: '/configuracion/documentos' },
  { id: 'apis',         label: 'APIs globales',       icon: Key },
  { id: 'security',     label: 'Seguridad',           icon: ShieldCheck },
];

export const ROLE_STYLES: Record<string, string> = {
  superadmin: 'bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400',
  soporte: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400',
  admin: 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400',
  gestor: 'bg-muted text-muted-foreground',
};

// Estas tres vivian aqui copiadas. Ahora hay una sola copia en shared/lib/ui;
// se re-exportan para no romper a quien ya las importaba desde aqui.
export { AVATAR_COLORS, avatarColorFor, getInitials, inputClass } from '@/shared/lib/ui';

export const SERVICES_CATALOG = [
  { service: 'brevo', name: 'Brevo (Email transaccional)', description: 'API Key para envio de emails desde cada proyecto (remitente configurable)', placeholder: 'xkeysib-...', global: false },
  { service: 'meta', name: 'Meta Marketing API', description: 'Token larga duracion + account_id', placeholder: 'EAAD...', global: false },
  { service: 'google_ads', name: 'Google Ads API', description: 'Developer Token + OAuth2', placeholder: 'developer-token', global: false },
  { service: 'gsc', name: 'Google Search Console', description: 'OAuth2 + property URL', placeholder: 'refresh_token', global: false },
  { service: 'stripe', name: 'Stripe (Restricted Key)', description: 'Solo lectura - suscripciones', placeholder: 'rk_live_...', global: false },
  { service: 'claude', name: 'Claude AI (Anthropic)', description: 'Para reportes y chat IA', placeholder: 'sk-ant-...', global: true },
];
