import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowClockwise,
  ArrowRight,
  Bell,
  BookOpen,
  CalendarBlank,
  ChartBar,
  ChatCircleText,
  CheckCircle,
  Clock,
  CreditCard,
  DotsThreeVertical,
  Envelope,
  FilePdf,
  Funnel,
  Gear,
  Globe,
  Lightning,
  MagnifyingGlass,
  Package,
  Plus,
  Pulse,
  SlidersHorizontal,
  Sparkle,
  SquaresFour,
  TrendUp,
  UserCircle,
  UserPlus,
  Users,
  Wallet,
} from '@phosphor-icons/react';
import { useLeads } from '@/modules/leads/hooks/useLeads';
import { useProjectContext } from '@/contexts/ProjectContext';
import StatusBadge, { STATUS_KEYS, STATUS_LABELS } from '@/shared/components/ui/StatusBadge';
import ChannelBadge, { CHANNEL_LABELS } from '@/shared/components/ui/ChannelBadge';
import { cn } from '@/shared/lib/utils';
import { PANTALLAS_IA } from '@/shared/lib/pantallasIA';

const SUITEDASH_NAV_SECTIONS = [
  {
    label: 'Testeo',
    items: [
      { label: 'TESTEO2', detail: 'Panel funcional actual', icon: ChartBar, route: '/prospectos', tone: 'cyan' },
      { label: 'SUITE DASH', detail: 'Rediseno SuiteDash', icon: Sparkle, area: 'Dashboard', tone: 'violet' },
    ],
  },
  {
    label: 'Principal',
    items: [
      { label: 'Dashboard', detail: 'Vista ejecutiva', icon: SquaresFour, area: 'Dashboard', tone: 'slate' },
      {
        label: 'Prospectos',
        detail: 'Listado, pipeline y audiencias',
        icon: Users,
        route: '/prospectos',
        tone: 'cyan',
        children: [
          { label: 'Listado', route: '/prospectos' },
          { label: 'Pipeline', route: '/prospectos/pipeline' },
          { label: 'Audiencias Meta', route: '/prospectos/audiencias' },
          { label: 'Revision duplicados', route: '/prospectos/revision-duplicados' },
        ],
      },
      {
        label: 'Clientes',
        detail: 'Clientes y matriculas',
        icon: UserCircle,
        route: '/clientes',
        tone: 'emerald',
        children: [
          { label: 'Directorio', route: '/clientes' },
          { label: 'Solicitud de admisión', route: '/clientes/matriculas' },
        ],
      },
    ],
  },
  {
    label: 'Captacion',
    items: [
      { label: 'Email', detail: 'Secuencias y plantillas', icon: Envelope, route: '/secuencias-email', tone: 'blue' },
      { label: 'Formularios', detail: 'Forms y entradas', icon: Globe, route: '/captacion', tone: 'blue' },
      // Make y los webhooks, juntos en Conexión › Webhooks desde la #690.
      { label: 'Webhooks', detail: 'Todos, por su función', icon: Pulse, route: '/conexion/webhooks', tone: 'slate' },
      { label: 'WhatsApp', detail: 'Widget y captacion', icon: ChatCircleText, route: '/captacion/whatsapp', tone: 'emerald' },
    ],
  },
  {
    label: 'Publicidad',
    items: [
      { label: 'Meta Ads', detail: 'Campanas Meta', icon: ChartBar, route: '/meta-ads', tone: 'blue' },
      { label: 'Google Ads', detail: 'Campanas Google', icon: ChartBar, route: '/campanas/google', tone: 'amber' },
      { label: 'Campanas', detail: 'Vista de campanas', icon: ChartBar, route: '/campanas', tone: 'slate' },
      { label: 'Trafico organico', detail: 'SEO y busqueda', icon: MagnifyingGlass, route: '/campanas/seo', tone: 'emerald' },
    ],
  },
  {
    label: 'Catalogo',
    items: [
      { label: 'Productos', detail: 'Catalogo principal', icon: Package, route: '/productos', tone: 'violet' },
      { label: 'Cursos pendientes', detail: 'Oferta por completar', icon: Clock, route: '/productos/pendientes', tone: 'amber' },
      { label: 'WooCommerce', detail: 'Sincronizacion tienda', icon: Globe, route: '/productos/woocommerce', tone: 'emerald' },
      { label: 'Arbol categorias', detail: 'Taxonomia comercial', icon: BookOpen, route: '/productos/arbol', tone: 'slate' },
      { label: 'Documentos', detail: 'Archivos y plantillas', icon: FilePdf, route: '/documentos', tone: 'slate' },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { label: 'Dashboard finanzas', detail: 'Resumen contable', icon: Wallet, route: '/finanzas', tone: 'emerald' },
      { label: 'Ventas', detail: 'Ventas registradas', icon: CreditCard, route: '/finanzas/ventas', tone: 'emerald' },
      { label: 'Ingresos', detail: 'Entradas de caja', icon: TrendUp, route: '/finanzas/ingresos', tone: 'emerald' },
      { label: 'Conversiones', detail: 'Leads convertidos', icon: CheckCircle, route: '/finanzas/conversiones', tone: 'violet' },
      { label: 'Egresos', detail: 'Salidas y gastos', icon: Wallet, route: '/finanzas/egresos', tone: 'amber' },
      { label: 'Por cobrar', detail: 'Cuentas pendientes', icon: Clock, route: '/finanzas/por-cobrar', tone: 'cyan' },
      { label: 'Por pagar', detail: 'Obligaciones', icon: CreditCard, route: '/finanzas/por-pagar', tone: 'amber' },
      { label: 'Comisiones', detail: 'Comisiones comerciales', icon: Users, route: '/finanzas/comisiones', tone: 'blue' },
      { label: 'Nominas', detail: 'Equipo y pagos', icon: UserCircle, route: '/finanzas/nominas', tone: 'slate' },
      { label: 'Pendiente facturar', detail: 'Facturacion pendiente', icon: FilePdf, route: '/finanzas/pendiente-facturar', tone: 'amber' },
      { label: 'Pagos Stripe', detail: 'Pagos online', icon: CreditCard, route: '/finanzas/pagos-stripe', tone: 'violet' },
      { label: 'Facturacion', detail: 'Facturas y series', icon: FilePdf, route: '/finanzas/facturas', tone: 'blue' },
      { label: 'Integraciones', detail: 'Servicios conectados', icon: Lightning, route: '/finanzas/integraciones', tone: 'slate' },
    ],
  },
  {
    label: 'Analisis',
    items: [
      { label: 'Reportes', detail: 'KPIs por proyecto', icon: TrendUp, route: '/informes', tone: 'cyan' },
      // Las pantallas de IA del CRM (#30), apagadas desde el 10/11 (`PANTALLAS_IA`).
      ...(PANTALLAS_IA ? [
        { label: 'Analisis IA', detail: 'Lectura inteligente', icon: Sparkle, route: '/informes/ia', tone: 'violet' },
        { label: 'Chat IA', detail: 'Asistente interno', icon: ChatCircleText, route: '/chat-ia', tone: 'blue' },
      ] : []),
    ],
  },
  {
    label: 'Sistema',
    items: [
      { label: 'Mensajes', detail: 'Inbox interno', icon: ChatCircleText, route: '/mensajes', tone: 'blue' },
      { label: 'Solicitudes cambio', detail: 'Gestion de cambios', icon: CheckCircle, route: '/solicitudes-cambio', tone: 'amber' },
      { label: 'Notificaciones', detail: 'Avisos del sistema', icon: Bell, route: '/notificaciones', tone: 'cyan' },
      { label: 'Preferencias', detail: 'Ajustes personales', icon: UserCircle, route: '/preferencias', tone: 'slate' },
      { label: 'Soporte', detail: 'Ayuda operativa', icon: BookOpen, route: '/soporte', tone: 'emerald' },
      { label: 'Status', detail: 'Estado del sistema', icon: Pulse, route: '/status', tone: 'slate' },
      { label: 'Manual', detail: 'Guia de usuario', icon: BookOpen, route: '/manual', tone: 'blue' },
      { label: 'Configuracion', detail: 'Roles, campos y proyecto', icon: Gear, route: '/configuracion', tone: 'slate' },
    ],
  },
];

const DASHBOARD_MODULES = [
  { label: 'Prospectos', detail: 'Mesa comercial', icon: Users, route: '/prospectos', tone: 'cyan' },
  { label: 'Clientes', detail: 'Cuentas activas', icon: UserCircle, route: '/clientes', tone: 'emerald' },
  { label: 'Finanzas', detail: 'Caja y facturacion', icon: Wallet, route: '/finanzas', tone: 'emerald' },
  { label: 'Reportes', detail: 'KPIs y analisis', icon: TrendUp, route: '/informes', tone: 'blue' },
];

const CRM_AREAS = [
  { label: 'Prospectos', detail: 'Pipeline, estados y audiencias', icon: Users, tone: 'cyan', metric: 'Leads' },
  { label: 'Clientes', detail: 'Ficha, matriculas y seguimiento', icon: UserCircle, tone: 'emerald', metric: 'Cuentas' },
  { label: 'Captacion', detail: 'Forms, email, Make y webhooks', icon: Globe, tone: 'blue', metric: 'Entradas' },
  { label: 'Campanas', detail: 'Meta, Google y trafico organico', icon: ChartBar, tone: 'amber', metric: 'Ads' },
  { label: 'Productos', detail: 'Catalogo, cursos y WooCommerce', icon: Package, tone: 'violet', metric: 'Oferta' },
  { label: 'Finanzas', detail: 'Ventas, ingresos, egresos y facturas', icon: Wallet, tone: 'emerald', metric: 'Caja' },
  { label: 'Reportes', detail: 'KPIs, IA y analisis por proyecto', icon: TrendUp, tone: 'cyan', metric: 'BI' },
  { label: 'Mensajes', detail: 'Conversaciones y notificaciones', icon: ChatCircleText, tone: 'blue', metric: 'Inbox' },
  { label: 'Documentos', detail: 'Archivos, contratos y plantillas', icon: FilePdf, tone: 'slate', metric: 'Docs' },
  { label: 'Configuracion', detail: 'Roles, campos, canales y atajos', icon: Gear, tone: 'slate', metric: 'Admin' },
];

const AREA_ROUTES = {
  Dashboard: '/',
  Prospectos: '/prospectos',
  Clientes: '/clientes',
  Captacion: '/captacion',
  Campanas: '/campanas',
  Productos: '/productos',
  Finanzas: '/finanzas',
  Reportes: '/informes',
  Mensajes: '/mensajes',
  Documentos: '/documentos',
  Config: '/configuracion',
  Configuracion: '/configuracion',
};

const CHILD_ROUTES = {
  Pipeline: '/prospectos/pipeline',
  Audiencias: '/prospectos/audiencias',
  Duplicados: '/prospectos/revision-duplicados',
  Directorio: '/clientes',
  Matriculas: '/clientes/matriculas',
  Email: '/secuencias-email',
  Formularios: '/captacion',
  Make: '/conexion/webhooks/make',
  Webhooks: '/conexion/webhooks/prospectos',
  'Meta Ads': '/campanas/meta',
  'Google Ads': '/campanas/google',
  SEO: '/campanas/seo',
  Catalogo: '/productos',
  Cursos: '/productos/pendientes',
  WooCommerce: '/productos/woocommerce',
  Ventas: '/finanzas/ventas',
  Ingresos: '/finanzas/ingresos',
  Egresos: '/finanzas/egresos',
  Facturas: '/finanzas/facturas',
  Reportes: '/informes',
  ...(PANTALLAS_IA ? { 'Analisis IA': '/informes/ia' } : {}),
  Messages: '/mensajes',
  Files: '/documentos',
  Billing: '/finanzas/facturas',
  'Client Portal': '/clientes',
};

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  ...STATUS_KEYS.map((value) => ({ value, label: STATUS_LABELS[value] || value })),
];

const CHANNEL_OPTIONS = [
  { value: '', label: 'Todos los canales' },
  ...Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label })),
];

const STAGES = [
  { key: 'qualified', label: 'Qualified', helper: 'Leads nuevos', stripe: 'bg-cyan-500', statuses: ['nuevo', 'por_contactar'] },
  { key: 'contact', label: 'Contact Made', helper: 'Conversacion abierta', stripe: 'bg-emerald-500', statuses: ['contactado'] },
  { key: 'proposal', label: 'Proposal Made', helper: 'Oferta y seguimiento', stripe: 'bg-amber-500', statuses: ['en_seguimiento', 'proxima_convocatoria'] },
  { key: 'won', label: 'Won / Client', helper: 'Convertidos', stripe: 'bg-violet-500', statuses: ['convertido'] },
  { key: 'lost', label: 'Lost / Later', helper: 'No interesados', stripe: 'bg-rose-500', statuses: ['no_interesado'] },
];

const FALLBACK_LEADS = [
  {
    id: 'demo-1',
    nombre: 'Mariana Rivas',
    email: 'mariana.demo@example.com',
    telefono: '+34 600 111 222',
    estado: 'nuevo',
    origen: 'meta_ads',
    producto_nombre: 'Master Ejecutivo',
    producto_precio: 1480,
    producto_moneda: 'EUR',
    responsable_nombre: 'Equipo admisiones',
    created_at: new Date().toISOString(),
    next_reminder_at: new Date().toISOString(),
  },
  {
    id: 'demo-2',
    nombre: 'Carlos Vera',
    email: 'carlos.demo@example.com',
    telefono: '+34 600 333 444',
    estado: 'contactado',
    origen: 'whatsapp',
    producto_nombre: 'Diplomado Comercial',
    producto_precio: 720,
    producto_moneda: 'EUR',
    responsable_nombre: 'Laura Gomez',
    created_at: new Date(Date.now() - 86400000).toISOString(),
    next_reminder_at: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: 'demo-3',
    nombre: 'Ana Torres',
    email: 'ana.demo@example.com',
    telefono: '+34 600 555 666',
    estado: 'en_seguimiento',
    origen: 'google_ads',
    producto_nombre: 'Programa Profesional',
    producto_precio: 2150,
    producto_moneda: 'EUR',
    responsable_nombre: 'Manuel Casas',
    created_at: new Date(Date.now() - 172800000).toISOString(),
    next_reminder_at: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: 'demo-4',
    nombre: 'Luis Ortega',
    email: 'luis.demo@example.com',
    telefono: '+34 600 777 888',
    estado: 'convertido',
    origen: 'referido',
    producto_nombre: 'Especializacion Online',
    producto_precio: 980,
    producto_moneda: 'EUR',
    responsable_nombre: 'Equipo ventas',
    created_at: new Date(Date.now() - 345600000).toISOString(),
    next_reminder_at: '',
  },
  {
    id: 'demo-5',
    nombre: 'Patricia Leon',
    email: 'patricia.demo@example.com',
    telefono: '+34 600 999 000',
    estado: 'no_interesado',
    origen: 'organico',
    producto_nombre: 'Certificacion',
    producto_precio: 590,
    producto_moneda: 'EUR',
    responsable_nombre: 'Sin asignar',
    created_at: new Date(Date.now() - 604800000).toISOString(),
    next_reminder_at: '',
  },
];

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function leadValue(lead) {
  return toNumber(lead.producto_precio || lead.importe_total || lead.valor_estimado);
}

function money(value, currency = 'EUR') {
  const n = toNumber(value);
  if (!n) return 'Sin importe';
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: currency || 'EUR',
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n.toLocaleString('es-ES')} ${currency || 'EUR'}`;
  }
}

function dateLabel(value) {
  if (!value) return 'Sin fecha';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Sin fecha';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function stageFor(lead) {
  const status = lead.estado || lead.status || 'nuevo';
  return STAGES.find((stage) => stage.statuses.includes(status))?.key || 'qualified';
}

function daysFromToday(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

function reminderLabel(value) {
  const delta = daysFromToday(value);
  if (delta === null) return { label: 'Sin evento', tone: 'muted' };
  if (delta < 0) return { label: `Vencido ${Math.abs(delta)}d`, tone: 'danger' };
  if (delta === 0) return { label: 'Hoy', tone: 'warning' };
  if (delta === 1) return { label: 'Manana', tone: 'info' };
  return { label: `En ${delta}d`, tone: 'muted' };
}

function MetricCard({ icon: Icon, label, value, detail, tone = 'default' }) {
  const tones = {
    default: 'bg-white text-slate-950 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-950 border-emerald-200',
    amber: 'bg-amber-50 text-amber-950 border-amber-200',
    cyan: 'bg-cyan-50 text-cyan-950 border-cyan-200',
  };
  return (
    <div className={cn('min-w-0 rounded-lg border p-4 shadow-sm', tones[tone])}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <Icon size={18} weight="bold" className="shrink-0 text-slate-500" />
      </div>
      <div className="mt-3 truncate text-2xl font-bold tabular-nums text-slate-950">{value}</div>
      <div className="mt-1 truncate text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function SidebarModuleItem({ item, active, onClick }) {
  const Icon = item.icon || SquaresFour;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
        active
          ? 'bg-white text-slate-950 shadow-sm'
          : 'text-slate-300 hover:bg-white/10 hover:text-white',
      )}
    >
      <Icon size={17} weight={active ? 'bold' : 'regular'} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{item.label}</span>
        {item.detail ? (
          <span className={cn('block truncate text-[11px]', active ? 'text-slate-500' : 'text-slate-500 group-hover:text-slate-400')}>
            {item.detail}
          </span>
        ) : null}
      </span>
      {item.children?.length ? (
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold', active ? 'bg-slate-100 text-slate-500' : 'bg-white/10 text-slate-400')}>
          {item.children.length}
        </span>
      ) : null}
    </button>
  );
}

function DashboardQuickCard({ item, onClick }) {
  const Icon = item.icon || SquaresFour;
  const tones = {
    cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[86px] items-start gap-3 rounded-md border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
    >
      <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md ring-1', tones[item.tone] || tones.slate)}>
        <Icon size={19} weight="bold" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-slate-950">{item.label}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">{item.detail}</span>
      </span>
      <ArrowRight size={14} weight="bold" className="mt-1 shrink-0 text-slate-300 transition-colors group-hover:text-cyan-600" />
    </button>
  );
}

function StatusMeter({ label, count, totalCount, color }) {
  const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="truncate font-semibold text-slate-600">{label}</span>
        <span className="font-bold tabular-nums text-slate-950">{count}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AreaCard({ area, active, onClick }) {
  const Icon = area.icon;
  const tones = {
    cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex min-h-[86px] items-start gap-3 rounded-md border bg-white p-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50',
        active ? 'border-cyan-400 ring-2 ring-cyan-100' : 'border-slate-200',
      )}
    >
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md ring-1', tones[area.tone] || tones.slate)}>
        <Icon size={18} weight="bold" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-slate-950">{area.label}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">{area.detail}</span>
      </span>
    </button>
  );
}

function PipelineCard({ lead, selected, onSelect, onOpen }) {
  const reminder = reminderLabel(lead.next_reminder_at);
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.();
        }
      }}
      className={cn(
        'w-full cursor-pointer rounded-md border bg-white p-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50',
        selected ? 'border-cyan-400 ring-2 ring-cyan-100' : 'border-slate-200',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-950">{lead.producto_nombre || lead.producto_interes || lead.nombre || 'Deal sin nombre'}</p>
          <p className="mt-1 truncate text-xs text-slate-500">{lead.nombre || 'Contacto sin nombre'}</p>
        </div>
        <DotsThreeVertical size={17} weight="bold" className="shrink-0 text-slate-400" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="rounded bg-cyan-50 px-2 py-0.5 text-[11px] font-bold uppercase text-cyan-700">
          {STATUS_LABELS[lead.estado || lead.status] || lead.estado || 'Open'}
        </span>
        <span className="text-sm font-bold tabular-nums text-slate-900">{money(leadValue(lead), lead.producto_moneda || 'EUR')}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
        <span className="inline-flex min-w-0 items-center gap-1">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700">
            {initials(lead.responsable_nombre || lead.gestor || lead.nombre)}
          </span>
          <span className="truncate">{lead.responsable_nombre || lead.gestor || 'Sin asignar'}</span>
        </span>
        <span
          className={cn(
            'shrink-0 rounded px-1.5 py-0.5 font-semibold',
            reminder.tone === 'danger' && 'bg-rose-50 text-rose-700',
            reminder.tone === 'warning' && 'bg-amber-50 text-amber-700',
            reminder.tone === 'info' && 'bg-blue-50 text-blue-700',
            reminder.tone === 'muted' && 'bg-slate-100 text-slate-500',
          )}
        >
          {reminder.label}
        </span>
      </div>
      {String(lead.id).startsWith('demo-') ? null : (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen?.();
          }}
          className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-cyan-700 hover:underline"
        >
          Abrir ficha <ArrowRight size={11} weight="bold" />
        </button>
      )}
    </article>
  );
}

function AutomationCard({ icon: Icon, title, text, state, tone, onClick }) {
  const toneClass = {
    active: 'bg-emerald-50 text-emerald-700',
    draft: 'bg-amber-50 text-amber-700',
    paused: 'bg-slate-100 text-slate-600',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-slate-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-700">
          <Icon size={18} weight="bold" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-bold text-slate-950">{title}</h3>
            <span className={cn('ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', toneClass)}>
              {state}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
        </div>
      </div>
    </button>
  );
}

function ModuleButton({ item, active, onClick }) {
  const Icon = item.icon || SquaresFour;
  const tones = {
    cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    violet: 'bg-violet-50 text-violet-700 ring-violet-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex min-h-[76px] items-start gap-3 rounded-md border bg-white p-3 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50',
        active ? 'border-cyan-400 ring-2 ring-cyan-100' : 'border-slate-200',
      )}
    >
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md ring-1', tones[item.tone] || tones.slate)}>
        <Icon size={18} weight="bold" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-slate-950">{item.label}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">{item.detail}</span>
      </span>
      {item.route ? <ArrowRight size={14} weight="bold" className="mt-1 shrink-0 text-slate-300 transition-colors group-hover:text-cyan-600" /> : null}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <Sparkle size={24} weight="bold" className="mx-auto text-cyan-600" />
      <h2 className="mt-3 text-base font-bold text-slate-950">Sin registros para este filtro</h2>
      <p className="mt-1 text-sm text-slate-500">Cambia los filtros o actualiza la vista para leer los datos de testeo.</p>
    </div>
  );
}

export default function SuiteDashCrmPreviewPage() {
  const navigate = useNavigate();
  const { activeProject, projects, isAllProjects } = useProjectContext();
  const {
    leads,
    stats,
    total,
    search,
    setSearch,
    filterEstado,
    setFilterEstado,
    filterOrigen,
    setFilterOrigen,
    sortMode,
    setSortMode,
    loading,
    error,
    refetch,
  } = useLeads();
  const [selectedId, setSelectedId] = useState(null);
  const [activeArea, setActiveArea] = useState('Dashboard');
  const [pipelineView, setPipelineView] = useState('board');

  const sourceLeads = leads.length ? leads : FALLBACK_LEADS;
  const selectedLead = sourceLeads.find((lead) => lead.id === selectedId) || sourceLeads[0] || null;
  const usingFallback = !loading && leads.length === 0;
  const testeo2Home = (import.meta.env.BASE_URL || '').startsWith('/testeo2/') ? '/' : '/testeo2';
  const projectLabel = isAllProjects
    ? `Todos los proyectos (${projects?.length || 0})`
    : activeProject?.nombre || 'Proyecto testeo';

  const grouped = useMemo(() => {
    const next = Object.fromEntries(STAGES.map((stage) => [stage.key, []]));
    sourceLeads.forEach((lead) => {
      next[stageFor(lead)]?.push(lead);
    });
    return next;
  }, [sourceLeads]);

  const summary = useMemo(() => {
    const totalValue = sourceLeads.reduce((sum, lead) => sum + leadValue(lead), 0);
    const overdue = sourceLeads.filter((lead) => {
      const delta = daysFromToday(lead.next_reminder_at);
      return delta !== null && delta < 0;
    }).length;
    const won = sourceLeads.filter((lead) => (lead.estado || lead.status) === 'convertido').length;
    const activeAutomations = Math.max(4, Math.round(sourceLeads.length / 2));
    return { totalValue, overdue, won, activeAutomations };
  }, [sourceLeads]);

  const statusBreakdown = useMemo(() => (
    STATUS_KEYS.map((status) => ({
      status,
      label: STATUS_LABELS[status] || status,
      count: sourceLeads.filter((lead) => (lead.estado || lead.status) === status).length,
    })).filter((item) => item.count > 0)
  ), [sourceLeads]);

  const channelBreakdown = useMemo(() => {
    const counts = new Map();
    sourceLeads.forEach((lead) => {
      const key = lead.origen || lead.canal_detectado || lead.canal || 'otro';
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [sourceLeads]);

  const upcomingLeads = useMemo(() => (
    [...sourceLeads]
      .filter((lead) => lead.next_reminder_at)
      .sort((a, b) => (daysFromToday(a.next_reminder_at) ?? 999) - (daysFromToday(b.next_reminder_at) ?? 999))
      .slice(0, 4)
  ), [sourceLeads]);

  const recentLeads = useMemo(() => (
    [...sourceLeads]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 5)
  ), [sourceLeads]);

  function clearFilters() {
    setSearch('');
    setFilterEstado('');
    setFilterOrigen('');
    setSortMode('recent_value');
  }

  function openLead(lead) {
    if (!lead || String(lead.id).startsWith('demo-')) return;
    navigate(`/prospectos/${lead.id}`);
  }

  function openRoute(path) {
    if (!path) return;
    navigate(path);
  }

  function openNavItem(item) {
    const area = item.area || item.label;
    setActiveArea(area);
    if (!item.children?.length && item.route) openRoute(item.route);
  }

  function exportCsv() {
    const rows = sourceLeads.map((lead) => ({
      nombre: lead.nombre || '',
      email: lead.email || '',
      telefono: lead.telefono || '',
      estado: STATUS_LABELS[lead.estado || lead.status] || lead.estado || lead.status || '',
      canal: lead.origen || lead.canal_detectado || lead.canal || '',
      responsable: lead.responsable_nombre || lead.gestor || '',
      programa: lead.producto_nombre || lead.producto_interes || '',
      valor: leadValue(lead),
    }));
    const headers = Object.keys(rows[0] || {
      nombre: '',
      email: '',
      telefono: '',
      estado: '',
      canal: '',
      responsable: '',
      programa: '',
      valor: '',
    });
    const csv = [
      headers.join(','),
      ...rows.map((row) => headers.map((key) => `"${String(row[key] ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectLabel.replace(/\s+/g, '-').toLowerCase()}-suite-dash.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const viewButtonClass = (view) => cn(
    'h-8 rounded-md px-3 text-xs font-bold transition-colors',
    pipelineView === view
      ? 'bg-slate-950 text-white'
      : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[256px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-800 bg-slate-950 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
          <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-cyan-500 text-white">
              <Package size={19} weight="bold" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">Suite Dash</p>
              <p className="truncate text-xs text-slate-400">CRM workspace</p>
            </div>
          </div>

          <div className="border-b border-white/10 px-4 py-3">
            <button
              type="button"
              onClick={() => setActiveArea('Dashboard')}
              className="flex w-full items-center gap-3 rounded-md bg-white/5 px-3 py-2 text-left ring-1 ring-white/10 transition-colors hover:bg-white/10"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white text-[10px] font-bold text-slate-950">
                CRM
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-white">{projectLabel}</span>
                <span className="block truncate text-[11px] text-slate-400">Proyecto activo</span>
              </span>
            </button>
          </div>

          <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
            {SUITEDASH_NAV_SECTIONS.map((section) => (
              <div key={section.label} className="space-y-1">
                <p className="px-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">{section.label}</p>
                {section.items.map((item) => {
                  const isActive = activeArea === (item.area || item.label);
                  return (
                    <div key={item.label}>
                      <SidebarModuleItem item={item} active={isActive} onClick={() => openNavItem(item)} />
                      {item.children?.length && isActive ? (
                        <div className="ml-5 mt-1 space-y-1 border-l border-white/10 pl-3">
                          {item.children.map((child) => (
                            <button
                              key={child.label}
                              type="button"
                              onClick={() => openRoute(child.route)}
                              className="block h-7 w-full rounded px-2 text-left text-xs font-semibold text-slate-400 hover:bg-white/10 hover:text-white"
                            >
                              {child.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>

          <div className="border-t border-white/10 p-4">
            <div className="rounded-md bg-white/5 p-3 ring-1 ring-white/10">
              <p className="text-xs font-bold text-white">Version de prueba</p>
              <p className="mt-1 text-xs leading-5 text-slate-400">Shell completo para validar UX antes de tocar la app actual.</p>
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex min-h-16 flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between lg:px-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-cyan-700">
                  <Sparkle size={14} weight="bold" />
                  CRM + funnels + client portal
                </div>
                <h1 className="mt-1 truncate text-xl font-bold text-slate-950 md:text-2xl">Dashboard</h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate('/prospectos')}
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  /testeo2
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/prospectos')}
                  className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Vista actual
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/prospectos?new=1')}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-cyan-600 px-3 text-sm font-bold text-white hover:bg-cyan-700"
                >
                  <Plus size={15} weight="bold" />
                  Nuevo lead
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/notificaciones')}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  aria-label="Notificaciones"
                >
                  <Bell size={17} weight="bold" />
                </button>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1680px] space-y-5 p-4 lg:p-6">
            <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
              <div className="grid gap-3 xl:grid-cols-[minmax(220px,1fr)_170px_170px_170px_auto]">
                <label className="relative min-w-0">
                  <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar contacto, programa o email"
                    className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                  />
                </label>
                <select
                  value={filterEstado}
                  onChange={(event) => setFilterEstado(event.target.value)}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value || option.label} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={filterOrigen}
                  onChange={(event) => setFilterOrigen(event.target.value)}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                >
                  {CHANNEL_OPTIONS.map((option) => (
                    <option key={option.value || option.label} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value)}
                  className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100"
                >
                  <option value="recent_value">Reciente + valor</option>
                  <option value="urgency">Urgencia</option>
                  <option value="recent">Mas recientes</option>
                  <option value="value">Mayor valor</option>
                </select>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <SlidersHorizontal size={15} weight="bold" />
                    Limpiar
                  </button>
                  <button
                    type="button"
                    onClick={refetch}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-bold text-white hover:bg-slate-800"
                  >
                    <ArrowClockwise size={15} weight="bold" />
                    Actualizar
                  </button>
                </div>
              </div>
            </section>

            {error && !usingFallback ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
                {error}
              </div>
            ) : null}

            <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={Users} label="Contactos CRM" value={total || stats?.total || sourceLeads.length} detail={usingFallback ? 'Datos demo visibles' : 'Datos vivos de testeo'} tone="cyan" />
              <MetricCard icon={Wallet} label="Forecast pipeline" value={money(summary.totalValue)} detail="Valor de oportunidades visibles" tone="emerald" />
              <MetricCard icon={Clock} label="Follow-ups vencidos" value={summary.overdue} detail="Eventos que requieren accion" tone="amber" />
              <MetricCard icon={Lightning} label="Automations" value={summary.activeAutomations} detail="Flujos listos para operar" />
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)_minmax(300px,0.75fr)]">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Salud comercial</h2>
                    <p className="text-sm text-slate-500">Estados y canales de los contactos visibles.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/prospectos/pipeline')}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Pipeline <ArrowRight size={12} weight="bold" />
                  </button>
                </div>
                <div className="mt-4 grid gap-5 md:grid-cols-2">
                  <div className="space-y-3">
                    {(statusBreakdown.length ? statusBreakdown : [{ status: 'nuevo', label: 'Sin datos', count: 0 }]).slice(0, 6).map((item, index) => (
                      <StatusMeter
                        key={item.status}
                        label={item.label}
                        count={item.count}
                        totalCount={sourceLeads.length}
                        color={['bg-blue-500', 'bg-amber-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500', 'bg-cyan-500'][index] || 'bg-slate-400'}
                      />
                    ))}
                  </div>
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Canales principales</p>
                    {channelBreakdown.map((item) => (
                      <div key={item.channel} className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
                        <ChannelBadge channel={item.channel} />
                        <span className="text-sm font-bold tabular-nums text-slate-950">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Siguientes acciones</h2>
                    <p className="text-sm text-slate-500">Seguimientos ordenados por urgencia.</p>
                  </div>
                  <CalendarBlank size={22} weight="bold" className="text-cyan-600" />
                </div>
                <div className="mt-4 space-y-3">
                  {(upcomingLeads.length ? upcomingLeads : sourceLeads.slice(0, 3)).map((lead) => {
                    const reminder = reminderLabel(lead.next_reminder_at);
                    return (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(lead.id);
                          openLead(lead);
                        }}
                        className="flex w-full items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-left hover:bg-white"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                          {initials(lead.nombre)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-slate-950">{lead.nombre || 'Sin nombre'}</span>
                          <span className="block truncate text-xs text-slate-500">{lead.producto_nombre || lead.producto_interes || 'Sin programa'}</span>
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded px-2 py-1 text-xs font-bold',
                            reminder.tone === 'danger' && 'bg-rose-50 text-rose-700',
                            reminder.tone === 'warning' && 'bg-amber-50 text-amber-700',
                            reminder.tone === 'info' && 'bg-blue-50 text-blue-700',
                            reminder.tone === 'muted' && 'bg-slate-100 text-slate-500',
                          )}
                        >
                          {reminder.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Accesos clave</h2>
                    <p className="text-sm text-slate-500">El resto vive en el sidebar.</p>
                  </div>
                  <SquaresFour size={22} weight="bold" className="text-slate-400" />
                </div>
                <div className="mt-4 grid gap-2">
                  {DASHBOARD_MODULES.map((item) => (
                    <DashboardQuickCard
                      key={item.label}
                      item={item}
                      onClick={() => openRoute(item.route)}
                    />
                  ))}
                </div>
              </div>
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <section className="min-w-0 space-y-5">
                <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <h2 className="text-lg font-bold text-slate-950">Deal Stages Pipeline</h2>
                      <p className="text-sm text-slate-500">Vista Kanban para mover ventas, forecast y onboarding.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setPipelineView('board')} className={viewButtonClass('board')}>Board</button>
                      <button type="button" onClick={() => setPipelineView('table')} className={viewButtonClass('table')}>Table</button>
                      <button type="button" onClick={() => setPipelineView('forecast')} className={viewButtonClass('forecast')}>Forecast</button>
                    </div>
                  </div>

                  {loading ? (
                    <div className="grid gap-3 overflow-x-auto p-4 xl:grid-cols-5">
                      {STAGES.map((stage) => (
                        <div key={stage.key} className="min-h-[260px] rounded-md border border-slate-200 bg-slate-50 p-3">
                          <div className="h-5 w-28 rounded bg-slate-200 animate-pulse" />
                          <div className="mt-4 space-y-3">
                            <div className="h-28 rounded bg-slate-200 animate-pulse" />
                            <div className="h-28 rounded bg-slate-200 animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : sourceLeads.length === 0 ? (
                    <div className="p-4"><EmptyState /></div>
                  ) : pipelineView === 'table' ? (
                    <div className="overflow-x-auto p-4">
                      <table className="w-full min-w-[760px] text-sm">
                        <thead className="text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2 text-left font-bold">Deal</th>
                            <th className="px-3 py-2 text-left font-bold">Estado</th>
                            <th className="px-3 py-2 text-left font-bold">Responsable</th>
                            <th className="px-3 py-2 text-left font-bold">Siguiente</th>
                            <th className="px-3 py-2 text-right font-bold">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sourceLeads.map((lead) => (
                            <tr key={lead.id} className="border-t border-slate-100">
                              <td className="px-3 py-3 font-bold text-slate-950">{lead.producto_nombre || lead.producto_interes || lead.nombre || 'Deal sin nombre'}</td>
                              <td className="px-3 py-3"><StatusBadge status={lead.estado || lead.status} showIcon /></td>
                              <td className="px-3 py-3 text-slate-600">{lead.responsable_nombre || lead.gestor || 'Sin asignar'}</td>
                              <td className="px-3 py-3 text-slate-600">{reminderLabel(lead.next_reminder_at).label}</td>
                              <td className="px-3 py-3 text-right font-bold">{money(leadValue(lead), lead.producto_moneda || 'EUR')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : pipelineView === 'forecast' ? (
                    <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
                      {STAGES.map((stage) => {
                        const stageLeads = grouped[stage.key] || [];
                        const stageValue = stageLeads.reduce((sum, lead) => sum + leadValue(lead), 0);
                        return (
                          <button
                            key={stage.key}
                            type="button"
                            onClick={() => setPipelineView('board')}
                            className="rounded-md border border-slate-200 bg-slate-50 p-4 text-left hover:bg-white"
                          >
                            <span className={cn('block h-1 w-10 rounded-full', stage.stripe)} />
                            <span className="mt-3 block text-sm font-bold text-slate-950">{stage.label}</span>
                            <span className="mt-2 block text-2xl font-bold tabular-nums text-slate-950">{money(stageValue)}</span>
                            <span className="mt-1 block text-xs text-slate-500">{stageLeads.length} oportunidades</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid gap-3 overflow-x-auto p-4 xl:grid-cols-5">
                      {STAGES.map((stage) => {
                        const stageLeads = grouped[stage.key] || [];
                        const stageValue = stageLeads.reduce((sum, lead) => sum + leadValue(lead), 0);
                        return (
                          <div key={stage.key} className="min-w-[210px] rounded-md border border-slate-200 bg-slate-50 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={cn('h-2.5 w-2.5 rounded-full', stage.stripe)} />
                                  <h3 className="truncate text-sm font-bold text-slate-950">{stage.label}</h3>
                                </div>
                                <p className="mt-1 text-xs text-slate-500">{stage.helper}</p>
                              </div>
                              <span className="rounded bg-white px-2 py-1 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                                {stageLeads.length}
                              </span>
                            </div>
                            <div className="mt-3 text-xs font-semibold text-slate-500">{money(stageValue)}</div>
                            <div className="mt-3 space-y-3">
                              {stageLeads.length ? stageLeads.slice(0, 5).map((lead) => (
                                <PipelineCard
                                  key={lead.id}
                                  lead={lead}
                                  selected={selectedLead?.id === lead.id}
                                  onSelect={() => setSelectedId(lead.id)}
                                  onOpen={() => openLead(lead)}
                                />
                              )) : (
                                <div className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-center text-xs font-semibold text-slate-400">
                                  Sin deals
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">Directorio CRM</h2>
                      <p className="text-sm text-slate-500">Lista compacta de leads, clientes y siguientes acciones.</p>
                    </div>
                    <button
                      type="button"
                      onClick={exportCsv}
                      className="hidden h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 md:inline-flex"
                    >
                      Export
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[920px] text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-3 text-left font-bold">Contacto</th>
                          <th className="px-4 py-3 text-left font-bold">Tipo</th>
                          <th className="px-4 py-3 text-left font-bold">Estado</th>
                          <th className="px-4 py-3 text-left font-bold">Canal</th>
                          <th className="px-4 py-3 text-left font-bold">Responsable</th>
                          <th className="px-4 py-3 text-right font-bold">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sourceLeads.slice(0, 8).map((lead) => (
                          <tr
                            key={lead.id}
                            onClick={() => setSelectedId(lead.id)}
                            className={cn(
                              'cursor-pointer border-t border-slate-100 hover:bg-slate-50',
                              selectedLead?.id === lead.id && 'bg-cyan-50/60',
                            )}
                          >
                            <td className="px-4 py-3">
                              <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                                  {initials(lead.nombre)}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate font-bold text-slate-950">{lead.nombre || 'Sin nombre'}</p>
                                  <p className="truncate text-xs text-slate-500">{lead.email || lead.telefono || 'Sin contacto'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">
                                {lead.producto_nombre || lead.producto_interes || 'CRM Target'}
                              </span>
                            </td>
                            <td className="px-4 py-3"><StatusBadge status={lead.estado || lead.status} showIcon /></td>
                            <td className="px-4 py-3"><ChannelBadge channel={lead.origen || lead.canal_detectado || lead.canal} /></td>
                            <td className="px-4 py-3 text-slate-600">{lead.responsable_nombre || lead.gestor || 'Sin asignar'}</td>
                            <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-950">{money(leadValue(lead), lead.producto_moneda || 'EUR')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              <aside className="space-y-5">
                <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">Ficha rapida</h2>
                      <p className="text-sm text-slate-500">Lectura sin salir del workspace.</p>
                    </div>
                    <UserCircle size={24} weight="bold" className="text-slate-400" />
                  </div>
                  {selectedLead ? (
                    <div className="mt-4 space-y-4">
                      <div className="flex items-start gap-3">
                        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-slate-950 text-sm font-bold text-white">
                          {initials(selectedLead.nombre)}
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-bold text-slate-950">{selectedLead.nombre}</h3>
                          <p className="truncate text-sm text-slate-500">{selectedLead.email || selectedLead.telefono || 'Sin contacto'}</p>
                        </div>
                      </div>
                      <div className="grid gap-2 text-sm">
                        <div className="rounded-md bg-slate-50 p-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Programa</p>
                          <p className="mt-1 font-bold text-slate-950">{selectedLead.producto_nombre || selectedLead.producto_interes || 'Sin programa'}</p>
                        </div>
                        <div className="rounded-md bg-slate-50 p-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Siguiente evento</p>
                          <p className="mt-1 font-bold text-slate-950">{reminderLabel(selectedLead.next_reminder_at).label}</p>
                        </div>
                        <div className="rounded-md bg-slate-50 p-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Creado</p>
                          <p className="mt-1 font-bold text-slate-950">{dateLabel(selectedLead.created_at)}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openLead(selectedLead)}
                        disabled={String(selectedLead.id).startsWith('demo-')}
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-cyan-600 px-3 text-sm font-bold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        Abrir ficha actual
                        <ArrowRight size={14} weight="bold" />
                      </button>
                    </div>
                  ) : null}
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">Onboarding FLOWs</h2>
                      <p className="text-sm text-slate-500">Automatizaciones conectadas al CRM.</p>
                    </div>
                    <Pulse size={22} weight="bold" className="text-cyan-600" />
                  </div>
                  <div className="mt-4 space-y-3">
                    <AutomationCard icon={UserPlus} title="Nuevo lead a pipeline" text="Asigna responsable, crea recordatorio y registra origen." state="active" tone="active" onClick={() => navigate('/prospectos?new=1')} />
                    <AutomationCard icon={CalendarBlank} title="Follow-up programado" text="Genera evento comercial si el prospecto queda sin contacto." state="active" tone="active" onClick={() => navigate('/prospectos/pipeline')} />
                    <AutomationCard icon={CheckCircle} title="Convertido a cliente" text="Activa documentos, matricula y carpeta de cliente." state="draft" tone="draft" onClick={() => navigate('/clientes')} />
                    <AutomationCard icon={TrendUp} title="Forecast semanal" text="Resume valor abierto, deals vencidos y conversiones." state="paused" tone="paused" onClick={() => navigate('/informes')} />
                  </div>
                </section>

                <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">Actividad reciente</h2>
                      <p className="text-sm text-slate-500">Ultimos contactos captados.</p>
                    </div>
                    <Clock size={22} weight="bold" className="text-slate-400" />
                  </div>
                  <div className="mt-4 space-y-3">
                    {recentLeads.map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => {
                          setSelectedId(lead.id);
                          openLead(lead);
                        }}
                        className="flex w-full items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-left hover:bg-white"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                          {initials(lead.nombre)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-bold text-slate-950">{lead.nombre || 'Sin nombre'}</span>
                          <span className="block truncate text-xs text-slate-500">{dateLabel(lead.created_at)}</span>
                        </span>
                        <StatusBadge status={lead.estado || lead.status} />
                      </button>
                    ))}
                  </div>
                </section>
              </aside>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
