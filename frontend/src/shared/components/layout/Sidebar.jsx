import {
  ListChecks, useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  CalendarCheck,
  SquaresFour,
  Users,
  Package,
  Megaphone,
  ChartLineUp,
  ChartBar,
  Gear,
  SignOut,
  CaretDown,
  CaretRight,
  Moon,
  Sun,
  Calculator,
  Receipt,
  UserCheck,
  Coins,
  MagnifyingGlass,
  Robot,
  Sparkle,
  Envelope,
  Globe,
  PlugsConnected,
  WarningCircle,
  ShoppingBag,
  BookOpen,
  Headset,
  ActivityIcon as Activity,
  FilePdf,
  UserCircle,
  CaretUp,
  Wrench,
  Clock,
  EyeSlash,
  CaretLeft,
  CreditCard,
  ChatCircleText,
  ChatsCircle,
  ArrowSquareOut,
  Lightning,
  WebhooksLogo,
  Tree,
  GraduationCap,
  CurrencyEur,
  TrendUp,
  TrendDown,
  Wallet,
  HandCoins,
  GitMerge,
  CopySimple,
  WhatsappLogo,
  ChatText,
  UsersThree, QrCode, Warning, Key } from '@phosphor-icons/react';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectContext } from '@/contexts/ProjectContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/shared/lib/utils';
import { lazy, Suspense } from 'react';
import client from '@/shared/api/client';
import Portal from '@/shared/components/ui/portal';
import { isFloatingDockHidden, setFloatingDockHidden } from './FloatingDock';
import { toast } from '@/shared/hooks/useToast';
import { getLocalLogo } from '@/shared/lib/projectLogos';
import { isBetaAllowed, BETA_MODE, BETA_VERSION } from '@/shared/config/betaConfig';
import { moduloApagado } from '@/shared/lib/modulos';

const ProjectSettingsDialog = lazy(() => import('@/modules/settings/components/ProjectSettingsDialog'));
const NotificationsBell = lazy(() => import('./NotificationsBell'));
const IS_REDESIGN_NAV_ENABLED = import.meta.env.DEV
  || (import.meta.env.BASE_URL || '').startsWith('/testeo/')
  || (import.meta.env.BASE_URL || '').startsWith('/testeo2/');

// Secciones del sidebar — cada una con label + items.
// Cada item: roles (omitir=todos) + module (clave en project.modules; omitir=siempre)
const NAV_SECTIONS = [
  {
    label: 'Testeo',
    items: [
      { label: 'TESTEO2', to: '/testeo2', href: '/testeo2/prospectos', icon: ChartBar, previewOnly: true, featured: true },
      { label: 'SUITE DASH', to: '/suite-dash', href: '/testeo2/suite-dash', icon: Sparkle, previewOnly: true, featured: true },
    ],
  },
  {
    label: 'Principal',
    items: [
      { label: 'Dashboard', to: '/', icon: SquaresFour },
      // Prospectos cuelga de si mismo, como WhatsApp: la lista y la cola del
      // dia son el mismo sitio. La cola describe por donde va cada prospecto,
      // asi que colgarla de aqui dice de que va sin tener que explicarlo.
      //
      // `defaultOpen` porque esta es la pantalla del dia: si el grupo arrancara
      // cerrado, la gestora pagaria un clic de mas cada manana.
      {
        label: 'Prospectos',
        icon: Users,
        module: 'leads',
        defaultOpen: true,
        children: [
          // `end` porque si no, estando en la cola o en el proceso este
          // tambien se marcaria activo: el resaltado diria que estas en dos
          // sitios a la vez.
          { label: 'Lista de prospectos', to: '/prospectos', icon: Users, end: true },
          { label: 'La cola del día', to: '/prospectos/cola', icon: CalendarCheck },
          // El proceso, al lado de la cola: es lo que la cola aplica. Leerlo
          // lo puede hacer cualquiera; editarlo, solo admin.
          { label: 'Proceso comercial', to: '/prospectos/proceso', icon: ListChecks },
        ],
      },
      // WhatsApp cuelga de su propia entrada, con lo suyo escalonado debajo: son
      // tres pantallas del mismo sitio, no tres apartados sueltos del menu.
      {
        label: 'WhatsApp',
        icon: WhatsappLogo,
        module: 'whatsapp',
        apagable: 'whatsapp',
        children: [
          // Un solo sitio: el Chat. «Mi WhatsApp» y el panel del equipo eran del
          // metodo viejo —cada gestora en un navegador remoto— y tener los dos a la
          // vez es lo que confunde: dos pantallas que parecen lo mismo y no lo son.
          // Abierto a todo el equipo por decision del owner. El aviso previo —lo
          // que puede pasarle a su numero— ya esta, con su casilla y su registro
          // de quien lo acepto (tarea #45).
          { label: 'Chat', to: '/whatsapp/chat', icon: ChatText },
          { label: 'Plantillas', to: '/whatsapp/plantillas', icon: ChatText },
          // El banco de mensajes (#101). Va aqui y no dentro del chat porque no
          // es el chat: uno sirve para conversar y este para buscar, auditar y
          // llevarse una copia. El servidor recorta lo que ve cada cual — un
          // admin lo ve entero, una gestora solo su numero.
          { label: 'Banco de mensajes', to: '/whatsapp/banco', icon: ChatText },
          // «WhatsApp del equipo» no esta: entraba en la sesion de cada gestora
          // a traves del navegador remoto, y ese metodo se retiro. Su pantalla y
          // su codigo de servidor se borraron el 21/08/2026 — no quedaba ni una
          // ruta que llegara a ellos. Vuelve cuando se rehaga sobre el chat
          // nuevo, que ya guarda las conversaciones: sera leerlas, no meterse en
          // la sesion de nadie.
          // Sin recorte por rol: cada gestora enlaza SU numero, y el servidor solo
          // la deja tocar el suyo. Estaba solo para administradores, asi que la
          // pantalla existia pero ninguna gestora podia llegar a ella.
          { label: 'Conexión', to: '/whatsapp/conexion', icon: QrCode },
          // La guia, en el menu y no escondida: si hay que preguntar donde esta,
          // ya se ha perdido a quien tenia que leerla.
          { label: 'Cómo se usa', to: '/whatsapp/ayuda', icon: BookOpen },
        ],
      },
      // Ventas vive en Principal (flujo diario) y también en Finanzas. Clientes
      // y Revisión duplicados pasan a la sección Clientes al final.
      { label: 'Ventas', to: '/finanzas/ventas', icon: Receipt, module: 'conversions' },
    ],
  },
  {
    label: 'Captación',
    items: [
      { label: 'Email', to: '/secuencias-email', icon: Envelope, roles: ['superadmin', 'admin'], module: 'email_sequences' },
      { label: 'Formularios', to: '/captacion', icon: Globe, roles: ['superadmin', 'admin'], module: 'forms' },
      { label: 'Make', to: '/captacion/make', icon: Lightning, roles: ['superadmin', 'admin'], module: 'make' },
      { label: 'Webhooks', to: '/captacion/webhooks', icon: WebhooksLogo, roles: ['superadmin', 'admin'], module: 'webhooks' },
      { label: 'Widget web', to: '/captacion/whatsapp', icon: WhatsappLogo, roles: ['superadmin', 'admin', 'soporte'] },
      { label: 'Campañas', to: '/campanas', icon: Megaphone, roles: ['superadmin', 'admin'] },
      { label: 'Tráfico orgánico', to: '/campanas/seo', icon: MagnifyingGlass, roles: ['superadmin', 'admin'] },
    ],
  },
  {
    label: 'Publicidad',
    items: [
      { label: 'Meta Ads', to: '/meta-ads', icon: ChartBar, roles: ['superadmin', 'admin'] },
      { label: 'Google Ads', to: '/google-ads', icon: ChartBar, roles: ['superadmin', 'admin'], comingSoon: true, statusTag: 'Próx.' },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { label: 'Productos', to: '/productos', icon: Package, roles: ['superadmin', 'admin'], module: 'products' },
      { label: 'Cursos pendientes', to: '/productos/pendientes', icon: Clock, roles: ['superadmin', 'admin'], module: 'products' },
      { label: 'WooCommerce', to: '/productos/woocommerce', icon: ShoppingBag, roles: ['superadmin', 'admin'], module: 'woocommerce' },
      { label: 'Árbol de categorías', to: '/productos/arbol', icon: Tree, roles: ['superadmin', 'admin'], module: 'products' },
      { label: 'Certificados', to: '/documentos', icon: FilePdf, roles: ['superadmin', 'admin'], module: 'documents' },
    ],
  },
  {
    label: 'Tutores',
    items: [
      { label: 'Tutores', to: '/tutores', icon: GraduationCap, roles: ['superadmin', 'admin'], module: 'tutores' },
      // Lo unico que ve un tutor: sus cursos y lo que le corresponde.
      { label: 'Mis cursos', to: '/mis-cursos', icon: GraduationCap, roles: ['tutor'] },
      { label: 'Sin tutor', to: '/tutores/sin-tutor', icon: Warning, roles: ['superadmin', 'admin'], module: 'tutores' },
      { label: 'Comisiones', to: '/tutores/comisiones', icon: Coins, roles: ['superadmin', 'admin'], module: 'tutores' },
    ],
  },
  {
    label: 'Finanzas',
    items: [
      { label: 'Dashboard', to: '/finanzas', icon: ChartBar, roles: ['superadmin', 'admin'], statusTag: 'Pruebas' },
      { label: 'Ventas', to: '/finanzas/ventas', icon: Receipt, module: 'conversions', statusTag: 'Pruebas' },
      { label: 'Ingresos', to: '/finanzas/ingresos', icon: TrendUp, roles: ['superadmin', 'admin'], module: 'accounting_income', statusTag: 'Pruebas' },
      { label: 'Conversiones', to: '/finanzas/conversiones', icon: CurrencyEur, roles: ['superadmin', 'admin'], module: 'conversions', statusTag: 'Pruebas' },
      { label: 'Egresos', to: '/finanzas/egresos', icon: TrendDown, roles: ['superadmin', 'admin'], module: 'accounting_expenses', statusTag: 'Pruebas' },
      { label: 'Cuentas por cobrar', to: '/finanzas/por-cobrar', icon: Wallet, roles: ['superadmin', 'admin', 'soporte', 'gestor'] },
      { label: 'Cuentas por pagar', to: '/finanzas/por-pagar', icon: Receipt, roles: ['superadmin', 'admin'], module: 'accounting_payable', statusTag: 'Pruebas' },
      { label: 'Comisiones', to: '/finanzas/comisiones', icon: HandCoins, roles: ['superadmin', 'admin'], module: 'commissions', statusTag: 'Pruebas' },
      { label: 'Nóminas', to: '/finanzas/nominas', icon: Calculator, roles: ['superadmin', 'admin'], module: 'payroll', statusTag: 'Pruebas' },
      { label: 'Pendientes de facturar', to: '/finanzas/pendiente-facturar', icon: WarningCircle, roles: ['superadmin', 'admin'], statusTag: 'Pruebas' },
      { label: 'Pagos Stripe', to: '/finanzas/pagos-stripe', icon: CreditCard, roles: ['superadmin', 'admin'], statusTag: 'Pruebas' },
      { label: 'Facturación', to: '/finanzas/facturas', icon: Receipt, roles: ['superadmin', 'admin', 'soporte', 'gestor'], permiso: 'factura_manager' },
      { label: 'Integraciones', to: '/finanzas/integraciones', icon: PlugsConnected, roles: ['superadmin', 'admin'], statusTag: 'Pruebas' },
    ],
  },
  {
    label: 'Análisis',
    items: [
      { label: 'Reportes', to: '/informes', icon: ChartLineUp, roles: ['superadmin', 'admin'], module: 'reports' },
      { label: 'Análisis IA', to: '/informes/ia', icon: Sparkle, roles: ['superadmin', 'admin'], projectType: 'ia' },
      { label: 'Chat IA', to: '/chat-ia', icon: ChatCircleText, roles: ['superadmin', 'admin'] },
    ],
  },
  {
    // Clientes = consulta de datos de clientes (no ventas). Va al final.
    label: 'Clientes',
    items: [
      { label: 'Clientes', to: '/clientes', icon: UserCheck, module: 'clients' },
      { label: 'Revisión duplicados', to: '/prospectos/revision-duplicados', icon: GitMerge, roles: ['superadmin', 'admin'], module: 'leads' },
      { label: 'Buscar duplicados', to: '/prospectos/duplicados', icon: CopySimple, roles: ['superadmin', 'admin'], module: 'leads' },
      { label: 'Matrículas', to: '/clientes/matriculas', icon: GraduationCap, module: 'matriculas' },
    ],
  },
  // Conexión (MCP de Claude). Diego: «estará en el menú en la sección de
  // conexión y pondrás algo como MCP». «Roles únicamente que tendrán acceso a
  // Claude: super admin, admin, personas que se le puedes colocar».
  // `accesoMcp` y no `roles`/`permiso`: soporte se salta esos dos, y aquí no
  // puede. Es la misma regla que el servidor (`puedeUsarMcp` en mcp.acceso.js).
  {
    label: 'Conexión',
    items: [
      { label: 'MCP', to: '/conexion/mcp', icon: Robot, accesoMcp: true },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { label: 'Mensajes', to: '/mensajes', icon: ChatsCircle },
      { label: 'Solicitudes de cambio', to: '/solicitudes-cambio', icon: GitMerge },
      { label: 'Notificaciones', to: '/notificaciones', icon: BookOpen },
      // El tutor entra aqui: es donde cambia su contraseña.
      { label: 'Mis preferencias', to: '/preferencias', icon: UserCircle, roles: ['superadmin', 'admin', 'gestor', 'tutor'] },
      { label: 'Soporte', to: '/soporte', icon: Headset },
      // Claves y variables (#80). Los mismos roles que exige el servidor con
      // `soloRoles`: ofrecer en el menu lo que la API va a negar es peor que
      // no ofrecerlo.
      { label: 'Claves y variables', to: '/configuracion/claves', icon: Key, roles: ['superadmin', 'soporte'] },
      { label: 'Status', to: '/status', icon: Activity },
      { label: 'Manual de usuario', to: '/manual', icon: BookOpen },
    ],
  },
];

// CRM-217: catálogo de labels personalizables del sidebar para el editor de
// "Etiquetas sidebar" en ProjectSettingsDialog. Cada label original sirve de
// clave de override en `projects.sidebar_labels`.
export function getSidebarLabelCatalog() {
  return NAV_SECTIONS.map((section) => {
    const labels = [];
    for (const item of section.items) {
      labels.push({ label: item.label, type: item.children ? 'group' : 'item' });
      if (item.children) {
        for (const child of item.children) labels.push({ label: child.label, type: 'child' });
      }
    }
    return { section: section.label, labels };
  });
}

// Aplica el override (si existe) y deja el original en otro caso.
export function applyLabel(original, overrides) {
  if (!overrides || typeof overrides !== 'object') return original;
  const o = overrides[original];
  return typeof o === 'string' && o.trim().length > 0 ? o : original;
}

// Interruptor de compilacion para dejar una parte fuera de una instalacion sin
// borrar su codigo. Se usa con WhatsApp, que en produccion todavia no se enciende
// —esta en revision— pero viaja en el mismo build que el resto.
//
// Va aqui y no en los bundles del servidor porque esto es el menu: el modulo del
// backend puede estar montado y aun asi no querer enseñarlo.
// El criterio vive en shared/lib/modulos: no es solo el menu, tambien lo usa el
// aviso de llamada entrante. Teniendolo en dos sitios se llega a que uno diga
// que si y el otro que no.

// Espejo de `puedeUsarMcp` (backend/src/modules/mcp/mcp.acceso.js).
export function tieneAccesoMcp(role, permisos) {
  if (role === 'superadmin' || role === 'admin') return true;
  if (role === 'tutor') return false;
  return permisos?.usa_mcp === true;
}

function canSeeItem(item, role, modules, projectType, soloColaboraciones, permisos) {
  if (item.apagable && moduloApagado(item.apagable)) return false;
  if (item.previewOnly && !IS_REDESIGN_NAV_ENABLED) return false;
  // projectType filter (e.g. solo proyectos IA): aplica a todos los roles
  if (item.projectType && projectType !== item.projectType) return false;
  // Un tutor solo ve lo suyo: lo que no le nombre expresamente queda fuera.
  // Al reves —listar lo prohibido— se olvida siempre algo, y lo que se olvida
  // es un tutor paseandose por Prospectos o por Finanzas.
  if (role === 'tutor') return Array.isArray(item.roles) && item.roles.includes('tutor');
  // MCP de Claude: super admin y admin por su rol; el resto solo con la casilla.
  // Va ANTES del atajo de soporte: «roles únicamente», dijo Diego.
  if (item.accesoMcp) return tieneAccesoMcp(role, permisos);
  // Un gestor de colaboraciones se dedica SOLO a los tutores: no lleva
  // prospectos, ni ventas, ni finanzas. Se declara lo que puede ver, igual que
  // con el tutor — enumerar lo prohibido deja fuera siempre la pantalla nueva.
  if (soloColaboraciones) {
    // «Sin tutor» faltaba, y era un olvido de la lista, no una decisión: el
    // servidor ya la dejaba entrar —`formacionesSinTutor` pasa por
    // `exigirGestion`, que acepta la casilla de colaboraciones— y era la
    // pantalla la que se la escondía. Y es justo la que dice qué formaciones
    // están sin cubrir, o sea el trabajo de quien lleva las colaboraciones.
    //
    // Van las TRES del apartado. «Mis cursos» no: esa es la de un tutor
    // mirando lo suyo, no la de quien los organiza.
    return ['/tutores', '/tutores/sin-tutor', '/tutores/comisiones', '/preferencias']
      .includes(item.to);
  }

  // soporte ve todo (rol generico tipo dev)
  if (role === 'soporte' || role === 'superadmin') {
    if (item.module && modules && modules[item.module] === false) return false;
    return true;
  }
  // Un permiso acotado manda sobre el rol.
  //
  // La entrada de Facturacion la ve quien PUEDE facturar, no todo el que sea
  // gestor. En ISEIE ninguna gestora factura —lo hacen Adriana y Daniela, que
  // son admin— y aun asi las doce veian el panel. En ISEIH lo veia Vanessa, que
  // es «gestor» pero lleva tutores.
  //
  // Se comprueba solo para gestor: un admin puede facturar por su rol, y a
  // soporte y superadmin se les ha dejado pasar justo arriba.
  if (item.permiso && role === 'gestor' && !permisos?.[item.permiso]) return false;
  if (item.roles && !item.roles.includes(role)) return false;
  if (item.module && modules && modules[item.module] === false) return false;
  return true;
}

function NavGroup({ icon: Icon, label, children, defaultOpen, role, modules, projectType, soloColab, permisos, labelOverrides, onNavigate, collapsed, onExpandSidebar }) {
  const visible = children
    .filter((c) => canSeeItem(c, role, modules, projectType, soloColab, permisos))
    .map((c) => ({ ...c, comingSoon: !isBetaAllowed(c.to) }));
  const location = useLocation();
  const hasActiveChild = visible.some((c) => !c.comingSoon && (location.pathname === c.to || location.pathname.startsWith(c.to + '/')));
  // En BETA: si TODO el grupo está coming-soon lo mantenemos visible (deshabilitado)
  const allComingSoon = visible.length > 0 && visible.every((c) => c.comingSoon);
  const [open, setOpen] = useState(hasActiveChild || !!defaultOpen);
  // Si se llega a una pantalla de dentro desde fuera (un enlace, la barra de
  // direcciones), el grupo se abre solo: si no, el apartado marcado como activo
  // quedaria escondido. Cerrarlo a mano se respeta.
  useEffect(() => { if (hasActiveChild) setOpen(true); }, [hasActiveChild]);
  if (!visible.length) return null;
  const displayLabel = applyLabel(label, labelOverrides);

  // En modo collapsed: el grupo se renderiza como un boton compacto.
  // Click → expande el sidebar y abre el grupo. Tooltip nativo via title.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => { onExpandSidebar?.(); setOpen(true); }}
        title={displayLabel}
        aria-label={displayLabel}
        className={cn(
          'w-full flex items-center justify-center h-10 rounded-md transition-colors',
          hasActiveChild ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
        )}
      >
        <Icon size={18} weight={hasActiveChild ? 'duotone' : 'regular'} />
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] transition-all',
          hasActiveChild ? 'text-foreground font-bold' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
        )}
      >
        <Icon size={18} weight={hasActiveChild ? 'duotone' : 'regular'} />
        {displayLabel}
        <CaretRight size={12} weight="bold" className={cn('ml-auto transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="ml-4 mt-0.5 pl-4 border-l border-border space-y-0.5">
          {visible.map((child) => (
            child.comingSoon ? (
              <div
                key={child.to}
                title={child.statusTag ? `${applyLabel(child.label, labelOverrides)} — ${child.statusTag}` : 'Próximamente'}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] text-muted-foreground/50 cursor-not-allowed select-none"
              >
                <span className="truncate">{applyLabel(child.label, labelOverrides)}</span>
                <span className="ml-auto text-[9px] uppercase tracking-wider bg-muted/60 text-muted-foreground/70 px-1.5 py-0.5 rounded">{child.statusTag || 'Próximamente'}</span>
              </div>
            ) : (
              <NavLink
                key={child.to}
                to={child.to}
                end={child.end ?? child.to === '/accounting'}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'block px-3 py-1.5 rounded-lg text-[12px] transition-all',
                    isActive
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                  )
                }
              >
                {applyLabel(child.label, labelOverrides)}
              </NavLink>
            )
          ))}
        </div>
      )}
    </div>
  );
}

// Mapa de nombres Phosphor → componente, para externalPanels (CRM-155).
const EXTERNAL_ICONS = {
  Globe, CreditCard, ChartLineUp, ShoppingBag, ChatCircleText, Envelope, Headset,
  PlugsConnected, Robot, Sparkle, Coins, Receipt, Calculator, BookOpen, FilePdf,
};

function externalIconFor(name) {
  return EXTERNAL_ICONS[name] || Globe;
}

function ExternalPanelItem({ panel, collapsed, onClick }) {
  const Icon = externalIconFor(panel.icon);
  const opensInTab = panel.open_in === 'tab';

  if (opensInTab) {
    return (
      <a
        href={panel.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        title={collapsed ? panel.label : undefined}
        aria-label={collapsed ? panel.label : panel.label}
        className={cn(
          'relative flex items-center rounded-md text-[13px] transition-all text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
          collapsed ? 'justify-center h-10' : 'gap-3 px-3 py-2.5',
        )}
      >
        <Icon size={18} weight="regular" />
        {!collapsed && (
          <>
            <span className="truncate">{panel.label}</span>
            <ArrowSquareOut size={11} weight="bold" className="ml-auto text-muted-foreground/60 flex-shrink-0" />
          </>
        )}
      </a>
    );
  }

  return (
    <NavLink
      to={`/external/${panel.id}`}
      onClick={onClick}
      title={collapsed ? panel.label : undefined}
      aria-label={collapsed ? panel.label : undefined}
      className={({ isActive }) =>
        cn(
          'relative flex items-center rounded-md text-[13px] transition-all',
          collapsed ? 'justify-center h-10' : 'gap-3 px-3 py-2.5',
          isActive
            ? 'bg-primary/10 text-primary font-bold shadow-sm'
            : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span aria-hidden="true" className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary" />
          )}
          <Icon size={18} weight={isActive ? 'duotone' : 'regular'} />
          {!collapsed && <span className="truncate">{panel.label}</span>}
        </>
      )}
    </NavLink>
  );
}

function NavItem({ to, href, icon: Icon, label, badge, labelOverrides, onClick, collapsed, featured }) {
  const displayLabel = applyLabel(label, labelOverrides);
  const location = useLocation();
  const comingSoon = !href && !isBetaAllowed(to);
  if (comingSoon) {
    return (
      <div
        title={`${displayLabel} — Próximamente`}
        aria-label={`${displayLabel} — Próximamente`}
        className={cn(
          'relative flex items-center rounded-md text-[13px] text-muted-foreground/50 cursor-not-allowed select-none',
          collapsed ? 'justify-center h-10' : 'gap-3 px-3 py-2.5'
        )}
      >
        <Icon size={18} weight="regular" />
        {!collapsed && (
          <>
            <span className="truncate">{displayLabel}</span>
            <span className="ml-auto text-[9px] uppercase tracking-wider bg-muted/60 text-muted-foreground/70 px-1.5 py-0.5 rounded">Próximamente</span>
          </>
        )}
      </div>
    );
  }
  if (href) {
    const hrefPath = href.replace(/\/$/, '');
    const isActive = typeof window !== 'undefined'
      ? window.location.pathname === hrefPath
        || window.location.pathname.startsWith(`${hrefPath}/`)
        || (hrefPath === '/testeo2/prospectos' && (window.location.pathname === '/testeo2' || window.location.pathname === '/testeo2/'))
      : location.pathname === to;
    return (
      <a
        href={href}
        onClick={onClick}
        title={collapsed ? displayLabel : undefined}
        aria-label={collapsed ? displayLabel : undefined}
        className={cn(
          'relative flex items-center rounded-md text-[13px] transition-all',
          collapsed
            ? 'justify-center h-10'
            : 'gap-3 px-3 py-2.5',
          isActive
            ? featured
              ? 'bg-primary text-primary-foreground font-bold shadow-sm'
              : 'bg-primary/10 text-primary font-bold shadow-sm'
            : featured
              ? 'border border-primary/20 bg-primary/5 text-primary font-bold hover:bg-primary/10'
              : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
        )}
      >
        {isActive && !collapsed && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary"
          />
        )}
        <span className="relative">
          <Icon size={18} weight={isActive ? 'duotone' : 'regular'} />
          {collapsed && badge && (
            <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 px-1 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </span>
        {!collapsed && displayLabel}
        {!collapsed && badge && (
          <span className="ml-auto text-[10px] font-bold bg-primary/10 text-primary rounded-full px-2 py-0.5">
            {badge}
          </span>
        )}
      </a>
    );
  }
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClick}
      title={collapsed ? displayLabel : undefined}
      aria-label={collapsed ? displayLabel : undefined}
      className={({ isActive }) =>
        cn(
          'relative flex items-center rounded-md text-[13px] transition-all',
          collapsed
            ? 'justify-center h-10'
            : 'gap-3 px-3 py-2.5',
          isActive
            ? featured
              ? 'bg-primary text-primary-foreground font-bold shadow-sm'
              : 'bg-primary/10 text-primary font-bold shadow-sm'
            : featured
              ? 'border border-primary/20 bg-primary/5 text-primary font-bold hover:bg-primary/10'
              : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span
              aria-hidden="true"
              className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary"
            />
          )}
          <span className="relative">
            <Icon size={18} weight={isActive ? 'duotone' : 'regular'} />
            {collapsed && badge && (
              <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 px-1 rounded-full bg-primary text-primary-foreground text-[8px] font-bold flex items-center justify-center">
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </span>
          {!collapsed && displayLabel}
          {!collapsed && badge && (
            <span className="ml-auto text-[10px] font-bold bg-primary/10 text-primary rounded-full px-2 py-0.5">
              {badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

// Las iniciales con las que se reconoce una marca sin logo.
//
// Casi todas empiezan por «IS» —ISECD, ISEF, ISSLOGG, ISAEG, ISEIH—, asi que
// coger las dos primeras letras las deja a todas igual: «IS, IS, IS». Se quita
// ese prefijo comun y se cogen las dos siguientes: EC, EF, SL, AE, EI. Cada una
// distinta, y siguen siendo su nombre.
function inicialesDe(nombre = '') {
  const limpio = String(nombre).trim();
  if (!limpio) return '··';
  const palabras = limpio.split(/\s+/).filter(Boolean);
  if (palabras.length > 1) {
    return (palabras[0][0] + palabras[1][0]).toUpperCase();
  }
  const sola = palabras[0].toUpperCase();
  const sinPrefijo = sola.length > 4 && sola.startsWith('IS') ? sola.slice(2) : sola;
  return sinPrefijo.slice(0, 2);
}

// El color sale del propio nombre, siempre el mismo para la misma marca. Asi
// ISECD es verde hoy y verde mañana: la memoria visual funciona porque el color
// no cambia, no porque sea bonito.
const TONOS = [
  'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300',
];
function tonoDe(nombre = '') {
  let n = 0;
  for (const ch of String(nombre)) n = (n * 31 + ch.charCodeAt(0)) % 9973;
  return TONOS[n % TONOS.length];
}

function ProjectAvatar({ project, size = 'md' }) {
  const { theme } = useTheme();
  const [falloImagen, setFalloImagen] = useState(false);
  const dim = size === 'lg' ? 'w-12 h-12' : size === 'sm' ? 'w-7 h-7' : 'w-8 h-8';

  // «Todos los proyectos» va primero: no es una marca, es una vista.
  if (project?.isAll) {
    return (
      <div className={`${dim} rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 flex items-center justify-center flex-shrink-0 font-bold text-[11px]`}>
        ALL
      </div>
    );
  }

  const externo = project?.logo_url && /^https?:\/\//i.test(project.logo_url);
  const src = project?.logo_url
    ? (externo
        ? project.logo_url
        : `${(import.meta.env.BASE_URL || '/crm/').replace(/\/$/, '')}/api/projects/${project.id}/logo`)
    : getLocalLogo(project?.slug, theme);

  if (src && !falloImagen) {
    return (
      // Fondo claro SIEMPRE, tambien en modo oscuro: estos logos vienen de las
      // webs y muchos son de tinta oscura sobre transparente. Sin el fondo
      // desaparecen en el panel oscuro y queda un cuadro vacio.
      <span className={`${dim} rounded-lg bg-white ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-center overflow-hidden flex-shrink-0`}>
        <img
          src={src}
          alt=""
          width={24}
          height={24}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-contain p-[3px]"
          // Si el logo no carga —una web caida, una direccion cambiada— se
          // enseñan las iniciales. Antes se escondia la imagen y quedaba un
          // hueco, que parece que la pantalla esta rota.
          onError={() => setFalloImagen(true)}
        />
      </span>
    );
  }

  if (project?.emoji) {
    return (
      <div className={`${dim} rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 ${size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg'}`}>
        {project.emoji}
      </div>
    );
  }

  // Sin logo y sin emoji: iniciales con su color. Antes las tres marcas sin
  // logo compartian el mismo icono de cajita y no habia forma de distinguirlas
  // de un vistazo, que es justo para lo que sirve un icono.
  return (
    <div
      className={`${dim} rounded-lg ${tonoDe(project?.nombre)} flex items-center justify-center flex-shrink-0 font-bold ${size === 'lg' ? 'text-base' : size === 'sm' ? 'text-[10px]' : 'text-[11px]'} tracking-tight`}
      title={project?.nombre || ''}
    >
      {inicialesDe(project?.nombre)}
    </div>
  );
}

export default function Sidebar({ onNavigate, collapsed = false, onToggleCollapsed }) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { activeProject, switchProject, projects, activeIssuer, switchIssuer } = useProjectContext();
  const { theme, toggleTheme } = useTheme();
  const [configOpen, setConfigOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [userMenuPos, setUserMenuPos] = useState(null);
  const [userMenuView, setUserMenuView] = useState('main'); // 'main' | 'hide-dock'
  const [dockHidden, setDockHidden] = useState(() => isFloatingDockHidden());
  const [newLeadsBadge, setNewLeadsBadge] = useState(0);
  const [spamReportsBadge, setSpamReportsBadge] = useState(0);
  const [msgUnreadBadge, setMsgUnreadBadge] = useState(0);

  // Estado de secciones colapsadas (Captación, Catálogo, Finanzas, etc.).
  // Persistido en localStorage. Por defecto, abierto: Principal + la sección
  // de la ruta activa. El resto cerradas para reducir ruido visual.
  const location = useLocation();
  const SECTIONS_KEY = 'crm-sidebar-sections-v1';
  const [openSections, setOpenSections] = useState(() => {
    function autoOpen() {
      const out = {};
      for (const s of NAV_SECTIONS) {
        const has = s.items.some((it) => {
          if (location.pathname === it.to) return true;
          if (it.children?.some((c) => location.pathname === c.to || location.pathname.startsWith((c.to || '') + '/'))) return true;
          return it.to && it.to !== '/' && location.pathname.startsWith(it.to + '/');
        });
        out[s.label] = s.label === 'Principal' || s.label === 'Testeo' || has;
      }
      return out;
    }
    try {
      const stored = localStorage.getItem(SECTIONS_KEY);
      if (stored) return { ...autoOpen(), ...JSON.parse(stored) };
    } catch { /* ignore */ }
    return autoOpen();
  });
  // Al navegar, abrir automáticamente la sección de la nueva ruta si estaba cerrada.
  useEffect(() => {
    setOpenSections((prev) => {
      const next = { ...prev };
      for (const s of NAV_SECTIONS) {
        const has = s.items.some((it) => {
          if (location.pathname === it.to) return true;
          if (it.children?.some((c) => location.pathname === c.to || location.pathname.startsWith((c.to || '') + '/'))) return true;
          return it.to && it.to !== '/' && location.pathname.startsWith(it.to + '/');
        });
        if (has && !next[s.label]) next[s.label] = true;
      }
      return next;
    });
  }, [location.pathname]);
  function toggleSection(label) {
    setOpenSections((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // Reset al cerrar el menu
  useEffect(() => { if (!userMenuOpen) setUserMenuView('main'); }, [userMenuOpen]);

  function showDock() {
    setFloatingDockHidden(false);
    setDockHidden(false);
    setUserMenuOpen(false);
    toast({ title: 'Herramientas restauradas' });
  }
  function hideDockSession() {
    setFloatingDockHidden(true, 'session');
    setDockHidden(true);
    setUserMenuOpen(false);
    toast({
      title: 'Herramientas ocultas',
      description: 'Volverán a aparecer al recargar. Puedes restaurarlas desde el icono de la esquina o tu menú de avatar.',
      duration: 6000,
    });
  }
  function hideDockPersist() {
    setFloatingDockHidden(true, 'persist');
    setDockHidden(true);
    setUserMenuOpen(false);
    toast({
      title: 'Herramientas ocultas',
      description: 'Quedarán ocultas hasta que las restaures desde el icono de la esquina o tu menú de avatar.',
      duration: 6000,
    });
  }
  const pickerRef = useRef(null);
  const pickerBtnRef = useRef(null);
  const pickerPopRef = useRef(null);
  const userBtnRef = useRef(null);
  const userMenuRef = useRef(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function compute() {
      const btn = pickerBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const margin = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = Math.max(rect.width, 220);
      const maxH = Math.min(320, vh - rect.bottom - margin * 2);
      let left = rect.left;
      if (left + width + margin > vw) left = vw - width - margin;
      if (left < margin) left = margin;
      // Si no hay espacio abajo, abrir hacia arriba
      let top = rect.bottom + 6;
      if (top + maxH + margin > vh && rect.top > maxH) {
        top = rect.top - 6 - maxH;
      }
      setPickerPos({ top, left, width, maxHeight: maxH });
    }
    compute();
    function onDocClick(e) {
      if (pickerBtnRef.current?.contains(e.target)) return;
      if (pickerPopRef.current?.contains(e.target)) return;
      setPickerOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setPickerOpen(false); }
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  // User menu: posicionamiento + click fuera
  useEffect(() => {
    if (!userMenuOpen || !userBtnRef.current) return;
    function compute() {
      const rect = userBtnRef.current.getBoundingClientRect();
      // Anclado al boton del avatar; el ancho lo decide el contenido (w-max)
      // pero garantizamos un minimo del ancho del trigger.
      setUserMenuPos({
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left,
        minWidth: rect.width,
      });
    }
    compute();
    function onDocClick(e) {
      if (userBtnRef.current?.contains(e.target)) return;
      if (userMenuRef.current?.contains(e.target)) return;
      setUserMenuOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setUserMenuOpen(false); }
    window.addEventListener('resize', compute);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', compute);
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [userMenuOpen]);

  // Cerrar el menu al cambiar de ruta (reusa `location` declarado más arriba).
  useEffect(() => { setUserMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!activeProject?.id) return;
    let cancelled = false;
    let interval = null;

    async function fetchBadge() {
      if (typeof document !== 'undefined' && document.hidden) return;
      try {
        const res = await client.get(`/leads?projectId=${activeProject.id}&status=nuevo&limit=1`);
        if (!cancelled && res.success) setNewLeadsBadge(res.pagination?.total || 0);
      } catch {}
    }
    function start() {
      stop();
      fetchBadge();
      // 5 min: badge no requiere precision tiempo-real; al volver a la pestaña refrescamos via visibilitychange.
      interval = setInterval(fetchBadge, 5 * 60 * 1000);
    }
    function stop() {
      if (interval) { clearInterval(interval); interval = null; }
    }
    function onVisibilityChange() {
      if (document.hidden) stop();
      else start();
    }

    if (typeof document === 'undefined' || !document.hidden) start();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    return () => {
      cancelled = true;
      stop();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [activeProject?.id]);

  // Badge de reportes de spam pendientes — solo superadmin
  useEffect(() => {
    if (user?.role !== 'superadmin') return;
    let cancelled = false;
    async function fetchSpamCount() {
      try {
        const res = await client.get('/leads/spam-reports/count');
        if (!cancelled && res.success) setSpamReportsBadge(res.data?.count || 0);
      } catch {}
    }
    fetchSpamCount();
    const interval = setInterval(fetchSpamCount, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user?.role]);

  // Badge de mensajes no leidos
  useEffect(() => {
    let cancelled = false;
    async function fetchMsgCount() {
      try {
        const res = await client.get('/mensajes/conversations/unread-count');
        if (!cancelled && res.success) setMsgUnreadBadge(res.data?.count || 0);
      } catch {}
    }
    fetchMsgCount();
    const interval = setInterval(fetchMsgCount, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const initials = user?.nombre?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '??';
  // Vanessa y quien lleve las colaboraciones: solo tutores, nada mas.
  // Un admin con la casilla NO se recorta: ya lo ve todo por su rol.
  const soloColab = user?.gestor_colaboraciones === true
    && !['superadmin', 'admin', 'soporte'].includes(user?.role);

  // Quien lleva las colaboraciones no es una gestora: se la llama por su trabajo,
  // que es dar de alta profesores y ajustarles el porcentaje.
  const rolLabel = user?.gestor_colaboraciones
    ? 'Colaboraciones'
    : ({ superadmin: 'Superadmin', admin: 'Admin', gestor: 'Gestor', soporte: 'Soporte', tutor: 'Tutor' }[user?.role] || '');

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <aside
      role="navigation"
      aria-label="Menu principal"
      className={cn(
        'border-r bg-card h-screen fixed left-0 top-0 flex flex-col z-40 transition-[width] duration-200',
        collapsed ? 'w-16 p-2' : 'w-60 lg:w-64 p-4'
      )}
    >
      {/* La cabecera: el logo grande arriba y los textos debajo.
          En una linea no cabia: con el logo, «MultiCRM» y la chapa de BETA en
          240 pixeles, el nombre acababa cortado en «Multi…». Apilado, el logo
          se ve de verdad —es lo que dice en que marca estas— y el texto cabe
          entero. */}
      <div className={cn('mb-6', collapsed ? 'flex flex-col items-center gap-2' : 'px-2')}>
        <div className={cn('flex', collapsed ? 'flex-col items-center gap-2' : 'items-start justify-between gap-2')}>
          {activeProject && activeProject.id !== -1 ? (
            <ProjectAvatar project={activeProject} size={collapsed ? 'md' : 'lg'} />
          ) : (
            <div className={cn(
              'rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-sm flex-shrink-0',
              collapsed ? 'w-8 h-8' : 'w-12 h-12',
            )}>
              <Package size={collapsed ? 16 : 22} weight="bold" />
            </div>
          )}
          {onToggleCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapsed}
              aria-label={collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
              title={collapsed ? 'Expandir (Ctrl+B)' : 'Contraer (Ctrl+B)'}
              className="hidden lg:flex w-7 h-7 rounded-md items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0"
            >
              {collapsed ? <CaretRight size={14} weight="bold" /> : <CaretLeft size={14} weight="bold" />}
            </button>
          )}
        </div>

        {!collapsed && (
          <div className="mt-2 min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-semibold text-sm text-foreground truncate">MultiCRM</span>
              {BETA_MODE && (
                <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded flex-shrink-0">
                  BETA {BETA_VERSION}
                </span>
              )}
            </div>
            {/* La marca, ya con toda la anchura para ella: aqui si cabe entera. */}
            <span className="block text-[11px] text-muted-foreground truncate">
              {activeProject?.id === -1
                ? 'todas las marcas'
                : (activeProject?.nombre || 'sin marca elegida')}
            </span>
          </div>
        )}
      </div>

      {/* Project Selector */}
      <div className={cn('mb-6', collapsed ? 'px-0' : 'px-1')}>
        {!collapsed && (
          <label className="text-xs font-medium text-muted-foreground px-2 mb-1.5 block">
            Proyecto
          </label>
        )}
        <div className={cn('flex items-center', collapsed ? 'flex-col gap-1.5' : 'gap-2')}>
          <div className={cn('relative', collapsed ? 'w-full' : 'min-w-0 flex-1')} ref={pickerRef}>
            <button
              type="button"
              ref={pickerBtnRef}
              onClick={() => setPickerOpen((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              aria-label={`Selector de proyecto. Ahora: ${activeIssuer
                ? `${activeIssuer.nombre} · ${activeIssuer.campus.length} campus`
                : (activeProject?.nombre || 'sin elegir')}`}
              title={activeIssuer
                ? `${activeIssuer.nombre} · ${activeIssuer.campus.length} campus`
                : (collapsed ? activeProject?.nombre : undefined)}
              className={cn(
                'rounded-lg border border-border text-sm font-semibold bg-secondary text-foreground outline-none cursor-pointer flex items-center focus:border-primary focus:ring-2 focus:ring-primary/10 transition-all',
                collapsed
                  ? 'w-full h-10 justify-center'
                  : 'w-full min-w-0 min-h-9 py-1 pl-1 pr-8 gap-2'
              )}
            >
              <ProjectAvatar project={activeProject} size="sm" />
              {!collapsed && (
                <>
                  {/* La cuenta va DEBAJO, no al lado. En la misma linea le
                      quitaba el ancho al nombre y «CEDIA Investigacion y
                      Desarrollo» se quedaba en «CEDIA Investigacion y Desarroll…»,
                      que es justo lo que hay que poder leer. */}
                  <span className="min-w-0 flex-1 text-left leading-tight">
                    <span className="block truncate">
                      {activeIssuer ? activeIssuer.nombre : (activeProject?.nombre || 'Selecciona proyecto')}
                    </span>
                    {activeIssuer && (
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                        {activeIssuer.campus.length} campus
                      </span>
                    )}
                  </span>
                  <CaretDown size={12} weight="bold" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </>
              )}
            </button>
            {pickerOpen && pickerPos && (
              <Portal>
                <ul
                  ref={pickerPopRef}
                  role="listbox"
                  aria-label="Lista de proyectos"
                  style={{
                    position: 'fixed',
                    top: pickerPos.top,
                    left: pickerPos.left,
                    width: pickerPos.width,
                    maxHeight: pickerPos.maxHeight,
                  }}
                  className="z-[60] overflow-y-auto rounded-lg border border-border bg-card shadow-2xl py-1 animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-150 sidebar-scroll"
                >
                  {(() => {
                    // Orden: agrupado por SOCIEDAD emisora (los sin sociedad al
                    // final) y, dentro de cada una, por antiguedad.
                    //
                    // Antes iba por orden alfabetico y eso mezclaba las marcas
                    // con las que se trabaja todos los dias con las que aun no
                    // tienen ni web: ISEIH quedaba la quinta, detras de ISAEG,
                    // ISECD e ISEF. Por antiguedad, lo que mas se usa queda
                    // arriba, que es donde se busca sin leer.
                    const sorted = [...projects].sort((a, b) => {
                      const sA = a.sociedad_nombre || 'zzz';
                      const sB = b.sociedad_nombre || 'zzz';
                      if (sA !== sB) return sA.localeCompare(sB, 'es');
                      return (a.id || 0) - (b.id || 0);
                    });
                    // Para poder decir «CEDIA · 6 campus» sin recontar en
                    // cada encabezado.
                    const campusPorSociedad = projects.reduce((cuenta, p) => {
                      const id = p.sociedad_emisora_id;
                      if (id) cuenta[id] = (cuenta[id] || 0) + 1;
                      return cuenta;
                    }, {});
                    const allEntry = projects.length > 1 ? (
                      <li key="__all__" role="option" aria-selected={!activeIssuer && activeProject?.id === -1}>
                        <button
                          type="button"
                          onClick={() => { switchProject(-1); setPickerOpen(false); }}
                          className={cn(
                            'w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left hover:bg-secondary transition-colors border-b border-border',
                            !activeIssuer && activeProject?.id === -1 && 'bg-secondary font-semibold'
                          )}
                        >
                          <ProjectAvatar project={{ isAll: true }} size="sm" />
                          <span className="flex-1 truncate">Todos los proyectos</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300 font-bold">vista global</span>
                        </button>
                      </li>
                    ) : null;
                    let lastSoc = undefined;
                    const items = sorted.map((p) => {
                      const isActive = !activeIssuer && p.id === activeProject?.id;
                      const soc = p.sociedad_nombre || null;
                      const showHeader = soc !== lastSoc;
                      lastSoc = soc;
                      return (
                        <div key={p.id}>
                          {showHeader && (
                            // Los encabezados eran letra muerta: se leian y no
                            // se podian pulsar (#120). Al elegir uno se pide esa
                            // sociedad entera —sus campus sumados—, que es lo que
                            // Carlos mira. «Sin sociedad» no agrupa nada, asi que
                            // ese sigue siendo un titulo y no un boton.
                            soc && p.sociedad_emisora_id ? (
                              <li role="option" aria-selected={activeIssuer?.id === Number(p.sociedad_emisora_id)}>
                                <button
                                  type="button"
                                  onClick={() => { switchIssuer(Number(p.sociedad_emisora_id)); setPickerOpen(false); }}
                                  className={cn(
                                    'w-full flex items-center gap-2 px-2 pt-2 pb-0.5 text-left hover:bg-secondary transition-colors',
                                    activeIssuer?.id === Number(p.sociedad_emisora_id) && 'bg-secondary'
                                  )}
                                >
                                  <span title={soc} className="min-w-0 flex-1 truncate text-[10px] font-bold uppercase tracking-wide text-muted-foreground/60">
                                    {soc}
                                  </span>
                                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                    {campusPorSociedad[p.sociedad_emisora_id] || 0} campus
                                  </span>
                                </button>
                              </li>
                            ) : (
                              <div className="px-2 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/60 select-none">
                                {soc || 'Sin sociedad'}
                              </div>
                            )
                          )}
                          <li role="option" aria-selected={isActive}>
                            <button
                              type="button"
                              onClick={() => { switchProject(Number(p.id)); setPickerOpen(false); }}
                              className={cn(
                                'w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left hover:bg-secondary transition-colors',
                                isActive && 'bg-secondary font-semibold'
                              )}
                            >
                              <ProjectAvatar project={p} size="sm" />
                              <span className="flex-1 truncate">{p.nombre}</span>
                            </button>
                          </li>
                        </div>
                      );
                    });
                    return <>{allEntry}{items}</>;
                  })()}
                </ul>
              </Portal>
            )}
          </div>
          {(user?.role === 'admin' || user?.role === 'superadmin') && activeProject && !activeProject.isAll && !collapsed && (
            <button
              onClick={() => setConfigOpen(true)}
              className="w-9 h-9 rounded-lg border border-border bg-secondary hover:bg-muted flex items-center justify-center flex-shrink-0 transition-colors"
              title={`Configurar ${activeProject.nombre}`}
              aria-label="Configurar proyecto activo"
            >
              <Gear size={14} weight="bold" className="text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Buscador (oculto en collapsed; sigue accesible via Ctrl+K) */}
      {!collapsed && (
        <div className="mb-4">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('crm:open-palette'))}
            className="w-full h-9 px-3 rounded-lg border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors group flex items-center gap-2"
            aria-label="Abrir buscador (Cmd+K)"
          >
            <MagnifyingGlass size={14} weight="bold" className="flex-shrink-0" />
            <span className="text-sm flex-1 text-left truncate">Buscar…</span>
            <kbd className="flex-shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-card text-muted-foreground/70 group-hover:text-foreground transition-colors">
              {typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl'} K
            </kbd>
          </button>
        </div>
      )}

      {configOpen && activeProject && (
        <Suspense fallback={null}>
          <ProjectSettingsDialog
            project={activeProject}
            onClose={() => setConfigOpen(false)}
          />
        </Suspense>
      )}

      {/* Navigation */}
      <nav className={cn(
        'flex-1 overflow-y-auto min-h-0 sidebar-scroll',
        collapsed ? 'space-y-2 -mr-1 pr-1' : 'space-y-4 -mr-2 pr-2'
      )}>
        {NAV_SECTIONS.map((section, sIdx) => {
          // Filtrar items que el usuario puede ver
          const visibleItems = section.items.filter((item) => canSeeItem(item, user?.role, activeProject?.modules, activeProject?.type, soloColab, user));
          if (visibleItems.length === 0) return null;
          const sectionLabel = applyLabel(section.label, activeProject?.sidebar_labels);
          const isOpen = !!openSections[section.label];
          const renderItems = () => visibleItems.map((item) =>
            item.children ? (
              <NavGroup
                key={item.label}
                {...item}
                role={user?.role}
                modules={activeProject?.modules}
                projectType={activeProject?.type}
                soloColab={soloColab}
                permisos={user}
                labelOverrides={activeProject?.sidebar_labels}
                onNavigate={onNavigate}
                collapsed={collapsed}
                onExpandSidebar={onToggleCollapsed}
              />
            ) : (
              <NavItem
                key={item.to}
                {...item}
                badge={
                  item.to === '/prospectos' && newLeadsBadge > 0 ? newLeadsBadge
                  : item.to === '/notificaciones' && spamReportsBadge > 0 ? spamReportsBadge
                  : item.to === '/mensajes' && msgUnreadBadge > 0 ? msgUnreadBadge
                  : undefined
                }
                labelOverrides={activeProject?.sidebar_labels}
                onClick={onNavigate}
                collapsed={collapsed}
              />
            )
          );
          // Modo colapsado (sidebar mini): nunca colapsamos por sección — solo
          // iconos verticales separados por divisores.
          if (collapsed) {
            return (
              <div key={section.label} className="space-y-1">
                {sIdx > 0 && <div className="mx-2 my-1.5 border-t border-border" aria-hidden="true" />}
                {renderItems()}
              </div>
            );
          }
          return (
            <div key={section.label} className="space-y-0.5">
              <button
                type="button"
                onClick={() => toggleSection(section.label)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 hover:text-foreground hover:bg-secondary/40 transition-colors select-none"
              >
                <span>{sectionLabel}</span>
                <CaretDown
                  size={10}
                  weight="bold"
                  className={cn('transition-transform duration-150', isOpen ? '' : '-rotate-90')}
                />
              </button>
              {isOpen && (
                <div className="space-y-0.5 mt-0.5 ml-1 pl-2 border-l border-border/50">
                  {renderItems()}
                </div>
              )}
            </div>
          );
        })}

        {/* Paneles externos por proyecto (CRM-155) */}
        {Array.isArray(activeProject?.external_panels) && activeProject.external_panels.length > 0 && (
          <div className={cn(collapsed ? 'space-y-1' : 'space-y-0.5')}>
            {!collapsed ? (
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 px-3 mb-1.5">
                Externos
              </p>
            ) : (
              <div className="mx-2 my-1.5 border-t border-border" aria-hidden="true" />
            )}
            {activeProject.external_panels.map((panel) => (
              <ExternalPanelItem
                key={panel.id}
                panel={panel}
                collapsed={collapsed}
                onClick={onNavigate}
              />
            ))}
          </div>
        )}
      </nav>

      {/* Footer: avatar + notificaciones */}
      <div className={cn(
        'mt-auto pt-3 border-t border-border',
        collapsed ? 'flex flex-col items-center gap-1.5' : 'flex items-center gap-2'
      )}>
        <button
          ref={userBtnRef}
          type="button"
          onClick={() => setUserMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={userMenuOpen}
          aria-label="Menu de usuario"
          title={collapsed ? `${user?.nombre || ''} · ${rolLabel}` : undefined}
          className={cn(
            'rounded-lg transition-colors flex items-center',
            collapsed
              ? 'w-10 h-10 justify-center'
              : 'flex-1 min-w-0 gap-3 p-2',
            userMenuOpen ? 'bg-secondary' : 'hover:bg-secondary/60'
          )}
        >
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-xs flex-shrink-0 overflow-hidden">
            {user?.avatar_url ? (
              <img src={`${(import.meta.env.BASE_URL || '/crm/').replace(/\/$/, '')}/api/users/${user.id}/avatar`} alt="" width={36} height={36} loading="lazy" decoding="async" className="w-full h-full object-cover" />
            ) : initials}
          </div>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-bold text-foreground truncate">{user?.nombre}</p>
                <p className="text-[10px] text-muted-foreground">{rolLabel}</p>
              </div>
              <CaretUp size={12} weight="bold" className={cn('text-muted-foreground transition-transform flex-shrink-0', !userMenuOpen && 'rotate-180')} />
            </>
          )}
        </button>
        <Suspense fallback={<div className="w-9 h-9 rounded-lg bg-secondary flex-shrink-0" />}>
          <NotificationsBell />
        </Suspense>
      </div>

      {/* User menu (Portal — escapa del sidebar) */}
      {userMenuOpen && userMenuPos && (
        <Portal>
          <div
            ref={userMenuRef}
            role="menu"
            aria-label="Acciones de usuario"
            style={{ position: 'fixed', bottom: userMenuPos.bottom, left: userMenuPos.left, minWidth: userMenuPos.minWidth }}
            className="w-max max-w-[90vw] bg-card border border-border rounded-lg shadow-xl ring-1 ring-black/5 dark:ring-white/5 z-[60] overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-1 duration-150"
          >
            {userMenuView === 'main' ? (
              <div className="py-1.5">
                <UserMenuItem
                  icon={UserCircle}
                  label="Mi perfil"
                  onClick={() => { setUserMenuOpen(false); navigate('/perfil'); onNavigate?.(); }}
                />
                {(user?.role === 'admin' || user?.role === 'superadmin') && (
                  <UserMenuItem
                    icon={Gear}
                    label="Configuración"
                    onClick={() => { setUserMenuOpen(false); navigate('/configuracion'); onNavigate?.(); }}
                  />
                )}
                <UserMenuItem
                  icon={theme === 'dark' ? Sun : Moon}
                  label={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
                  onClick={() => { toggleTheme(); }}
                />
                {location.pathname.startsWith('/manual') && (
                  <UserMenuItem
                    icon={Wrench}
                    label={dockHidden ? 'Mostrar flotantes' : 'Ocultar flotantes'}
                    onClick={() => { dockHidden ? showDock() : setUserMenuView('hide-dock'); }}
                  />
                )}
                <div className="mx-2 my-1 border-t border-border" />
                <UserMenuItem
                  icon={SignOut}
                  label="Cerrar sesión"
                  tone="danger"
                  onClick={() => { setUserMenuOpen(false); handleLogout(); }}
                />
              </div>
            ) : (
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => setUserMenuView('main')}
                  className="w-full flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CaretLeft size={12} weight="bold" /> Volver
                </button>
                <p className="px-4 pb-2 text-[11px] text-muted-foreground leading-relaxed">
                  Elige cuanto tiempo quedaran ocultas. Puedes restaurarlas desde aqui o desde el icono que aparecera en la esquina.
                </p>
                <button
                  type="button"
                  onClick={hideDockSession}
                  className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-secondary transition-colors"
                >
                  <Clock size={16} weight="regular" className="flex-shrink-0 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Solo esta sesión</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">Volverán a aparecer al recargar la página.</p>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={hideDockPersist}
                  className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-secondary transition-colors"
                >
                  <EyeSlash size={16} weight="regular" className="flex-shrink-0 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Ocultar permanentemente</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">Hasta que las restaures manualmente.</p>
                  </div>
                </button>
              </div>
            )}
          </div>
        </Portal>
      )}
    </aside>
  );
}

function UserMenuItem({ icon: Icon, label, onClick, tone = 'default' }) {
  const toneClasses = tone === 'danger'
    ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
    : 'text-foreground hover:bg-muted';
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-2.5 mx-1 rounded-md py-1.5 text-[13px] font-medium transition-colors whitespace-nowrap',
        toneClasses
      )}
      style={{ width: 'calc(100% - 8px)' }}
    >
      <Icon size={15} weight="regular" className="flex-shrink-0 text-muted-foreground" />
      <span>{label}</span>
    </button>
  );
}
