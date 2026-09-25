import { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Toaster from './Toaster';
import CommandPalette from './CommandPalette';
import { List, X } from '@phosphor-icons/react';
import { cn } from '@/shared/lib/utils';
import { toast } from '@/shared/hooks/useToast';
import { useProjectContext } from '@/contexts/ProjectContext';
import NeedsProjectBanner from '@/shared/components/ui/NeedsProjectBanner';

// Rutas que SÍ funcionan en modo "Todos los proyectos" (vista global).
// El resto requiere un proyecto concreto (catálogo, settings, finanzas, etc.).
const ALL_PROJECTS_OK = [
  /^\/$/,                          // Dashboard
  // Prospectos (rutas reales en espanol — los regex viejos /leads no se usaban)
  /^\/prospectos$/,                // Lista de prospectos
  /^\/prospectos\/cola$/,          // La cola del dia — el servidor acota por gestora
  // Ventas: la consulta ya sabe hacerlo sin proyecto —cada fila dice de cual
  // es— y el muro tapaba una vista que funcionaba.
  /^\/finanzas\/ventas$/,
  /^\/ventas$/,
  // Tutores: las tres consultas ya aceptan «sin proyecto» y devuelven el
  // nombre del proyecto en cada fila, asi que la vista general se lee sola.
  // Quien lleva las colaboraciones trabaja con los profesores de todas las
  // marcas a la vez: obligarle a elegir una por una era pedirle nueve vueltas.
  /^\/tutores$/,
  /^\/tutores\/sin-tutor$/,
  /^\/tutores\/comisiones$/,
  /^\/prospectos\/pipeline$/,      // Kanban
  /^\/prospectos\/audiencias$/,    // Audiencias Meta
  /^\/prospectos\/\d+$/,           // Detalle de prospecto
  // Clientes
  /^\/clientes$/,
  /^\/clientes\/matriculas$/,
  /^\/clientes\/\d+$/,
  // Legacy (por si algun link viejo apunta a /leads o /clients)
  /^\/leads$/, /^\/leads\/pipeline$/, /^\/leads\/\d+$/,
  /^\/clients$/, /^\/clients\/\d+$/,
  // Generales (no dependen de proyecto)
  /^\/profile$/,
  /^\/preferences$/,
  /^\/notificaciones$/,
  /^\/manual$/,
  /^\/settings$/,
  /^\/soporte$/,
  /^\/status$/,
  /^\/ai-chat$/,
  /^\/prueba_ui(?:_[a-z]+)?$/,
];

function pathAllowsAll(pathname) {
  return ALL_PROJECTS_OK.some((rx) => rx.test(pathname));
}

// Con una sociedad elegida (#120), Reportes SI funciona: pide sus campus
// sumados con `issuerId`. El resto de pantallas sigue necesitando un proyecto
// concreto, asi que se comportan igual que con «todos los proyectos» — que es
// lo que ya sabian hacer.
// Las pantallas de CIFRAS aceptan una sociedad: sumar varios campus
// significa algo. Las de configuracion no entran aqui a proposito —un
// webhook o un formulario se montan PARA UN PROYECTO, y «el webhook de
// CEDIA» no existe—: ahi el muro de «elige un proyecto» es la respuesta
// correcta, no un fallo.
const CON_SOCIEDAD_OK = [
  /^\/informes$/, /^\/ventas$/, /^\/finanzas\/ventas$/,
  // Facturacion: el listado ya filtra por `issuer_id` --la sociedad que emite la
  // factura-- y las ventas sin factura por sus campus. Diego: «si elijo facturas
  // y estoy eligiendo CEDIA debe de salir, no debe de salir esto».
  /^\/finanzas\/facturas$/,
  // Y EMITIR UNA, tambien. Diego, 25/09: «como voy a registrar una venta de una
  // empresa y me sale esto, no puede pasar».
  //
  // La pantalla YA sabe: tiene su propio selector de proyecto --y solo ofrece
  // los de la misma sociedad, que no se factura cruzado--. Lo que pasaba es que
  // el muro se levantaba antes de que llegara a pintarlo, asi que ese selector
  // no lo veia nadie. Con el listado ya abierto y la emision cerrada, se podia
  // mirar una factura de CEDIA pero no hacerla.
  /^\/finanzas\/facturas\/nueva$/,
  // Prospectos, su kanban y Clientes. La pantalla y el servidor YA saben sumar
  // varios campus --mandan `projectIds` y el modelo los recibe--: lo unico que
  // faltaba era que el muro les dejara pasar. Diego, 15/09: «en prospectos si
  // elijo empresas deben de salir».
  /^\/prospectos$/,
  /^\/prospectos\/pipeline$/,
  /^\/prospectos\/\d+$/,
  /^\/clientes$/,
  /^\/clientes\/\d+$/,
  // El proceso comercial (#89 · #90). La cola suma los campus de la empresa —el
  // servidor ya sabia recibir varios proyectos— y la pantalla de los pasos
  // pregunta cual, pero solo entre los de esa empresa. Diego, 14/09: «estos
  // procesos en empresas deben ser por empresa, no por proyecto».
  /^\/prospectos\/cola$/,
  /^\/prospectos\/proceso$/,
  // El Dashboard. Diego, 15/09: «es por empresa, eso lo sabes» — y el 17 otra
  // vez, viendo el muro con CEDIA puesta: «aqui debo de tener la opcion de
  // verlos todos».
  //
  // La pantalla YA sabe hacerlo y no hay que tocarla: `useDashboard` llama a
  // `useIdsDelAmbito`, que con una empresa elegida devuelve SUS campus y
  // ninguno mas, y despues suma las estadisticas de cada uno. Lo unico que
  // pasaba es que el muro se levantaba antes de que la pantalla llegara a
  // pintarse, asi que ese trabajo no se veia nunca.
  /^\/$/,
  // Tutores y Mis cursos. Diego, 15/09: «no me deja elegir la empresa ni los
  // proyectos». Las dos pantallas YA mandan `issuerId` y el servidor ya lo
  // traduce con `proyectosDelAmbito`; faltaba esta lista. «Sin tutor» se queda
  // fuera a proposito: guarda el -1 pero todavia no manda la empresa, asi que
  // abrirle el muro le dejaria la pantalla vacia.
  /^\/tutores$/,
  /^\/tutores\/comisiones$/,
  /^\/mis-cursos$/,
  /*
    Y lo que no es de ningun proyecto.

    Tu perfil es tuyo y el manual es el manual: con una empresa puesta salia el
    aviso de «elige un campus» para ir a mirar tus notificaciones. El muro esta
    para que una pantalla no ensene cifras de un ambito que no sabe sumar; estas
    no ensenan cifras de nada.
  */
  /^\/perfil$/,
  /^\/preferencias$/,
  /^\/notificaciones$/,
  /^\/manual$/,
  /^\/soporte$/,
  /^\/status$/,
  /^\/registro$/,
  /^\/mensajes$/,
  /^\/chat-ia$/,
  /^\/documentos$/,
  /^\/solicitudes-cambio$/,
  /^\/solicitudes-cambio\/\d+$/,
  /^\/configuracion\/atajos$/,
  /^\/configuracion\/roles$/,
  /^\/configuracion\/claves$/,
  // Analisis de ventas (#136). El servidor es el mismo modulo `sales` que ya
  // sabe de sociedades; lo unico que faltaba era que la pantalla mandara
  // `issuerId` y que la ruta no chocara con el muro de aqui.
  /^\/finanzas\/ventas-analisis$/,
  // WhatsApp (#128, #138). El chat es de la GESTORA, no del proyecto: sus
  // conversaciones son las mismas con una empresa puesta que con uno de sus
  // campus. Lo unico que miraba el proyecto --buscar un prospecto para empezar
  // y la lista de plantillas-- pasa a mirar la empresa entera.
  //
  // Sin esto, WhatsApp llegaria a produccion tapado por el muro justo para
  // quien tiene una sociedad elegida, que es como trabaja Diego.
  /^\/whatsapp$/,
  /^\/whatsapp\/chat$/,
  /^\/whatsapp\/plantillas$/,
  /^\/whatsapp\/banco$/,
  /^\/whatsapp\/conexion$/,
  /^\/whatsapp\/ayuda$/,
];

function rutaAceptaSociedad(pathname) {
  return CON_SOCIEDAD_OK.some((rx) => rx.test(pathname));
}

function AllProjectsGuard({ pathname, children }) {
  const { isAllProjects, activeIssuer } = useProjectContext();
  if (activeIssuer) {
    if (rutaAceptaSociedad(pathname)) return children;
    // El aviso decia «tienes activa la vista Todos los proyectos» con CEDIA
    // puesta. No era verdad, y mandaba a tocar el selector equivocado.
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <NeedsProjectBanner sociedad={activeIssuer.nombre} />
      </div>
    );
  }
  if (isAllProjects && !pathAllowsAll(pathname)) {
    return <div className="p-6 max-w-2xl mx-auto"><NeedsProjectBanner /></div>;
  }
  return children;
}

const FloatingDock = lazy(() => import('./FloatingDock'));
const ShortcutsFAB = lazy(() => import('./ShortcutsFAB'));
const PWAInstallPrompt = lazy(() => import('./PWAInstallPrompt'));
const PWAUpdatePrompt = lazy(() => import('./PWAUpdatePrompt'));
const KeyboardShortcutsModal = lazy(() => import('./KeyboardShortcutsModal'));
const OfflineBanner = lazy(() => import('./OfflineBanner'));
// Avisa de una llamada de WhatsApp desde cualquier pantalla del CRM. Va aqui
// y no en el modulo de WhatsApp a proposito: la llamada se pierde justo
// cuando la gestora esta en otra parte y el movil no lo tiene delante.
const AvisoDeLlamada = lazy(() => import('./AvisoDeLlamada'));
// Avisa de un mensaje entrante desde cualquier pantalla. Antes de esto el CRM
// no avisaba de nada cuando entraba un WhatsApp.
const AvisoDeMensaje = lazy(() => import('./AvisoDeMensaje'));

const COLLAPSED_KEY = 'crm.sidebar.collapsed';

// Mapa de "n" (nuevo) según ruta actual
const NEW_ACTIONS = {
  '/prospectos': { url: '/prospectos?new=1', label: 'prospecto' },
  '/clientes': { url: '/prospectos?new=1', label: 'prospecto' },
  '/productos': { url: '/productos?new=1', label: 'producto' },
  '/captacion': { url: '/captacion?new=1', label: 'formulario' },
  '/captacion/webhooks': { url: '/captacion/webhooks?new=1', label: 'webhook' },
  '/secuencias-email': { url: '/secuencias-email?new=1', label: 'secuencia' },
  '/accounting/expenses': { url: '/accounting/expenses?new=1', label: 'egreso' },
  '/accounting/payable': { url: '/accounting/payable?new=1', label: 'cuenta por pagar' },
};

// Navegación rápida G + tecla
const G_TARGETS = {
  d: '/',
  l: '/prospectos',
  c: '/clientes',
  p: '/productos',
  r: '/informes',
  a: '/accounting',
  s: '/configuracion',
};

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
  });
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const hideFloating = pathname.startsWith('/documentos');

  // Estado del prefijo "g" para navegación rápida (g + d/l/c/p/r/a/s)
  const gPendingRef = useRef(false);
  const gTimerRef = useRef(null);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }

  // Atajos globales de teclado
  useEffect(() => {
    function isTyping() {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (document.activeElement?.isContentEditable) return true;
      return false;
    }

    function clearGPending() {
      gPendingRef.current = false;
      if (gTimerRef.current) {
        clearTimeout(gTimerRef.current);
        gTimerRef.current = null;
      }
    }

    function onKey(e) {
      // Cmd/Ctrl + B → toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === 'b' && !e.shiftKey && !e.altKey) {
        if (isTyping()) return;
        e.preventDefault();
        toggleCollapsed();
        return;
      }

      // Si el usuario está escribiendo, no procesamos atajos sin modificadores
      if (isTyping()) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // ? → modal de atajos (Shift+/ en teclados ES y US)
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
        clearGPending();
        return;
      }

      // Secuencia "g" + tecla
      if (gPendingRef.current) {
        const target = G_TARGETS[e.key.toLowerCase()];
        clearGPending();
        if (target) {
          e.preventDefault();
          navigate(target);
        }
        return;
      }
      if (e.key === 'g' || e.key === 'G') {
        gPendingRef.current = true;
        gTimerRef.current = setTimeout(clearGPending, 1500);
        return;
      }

      // n → nuevo (según ruta actual)
      if (e.key === 'n' || e.key === 'N') {
        const action = NEW_ACTIONS[pathname] || NEW_ACTIONS[Object.keys(NEW_ACTIONS).find((p) => pathname.startsWith(p)) || ''];
        if (action) {
          e.preventDefault();
          navigate(action.url);
          toast({ title: `Nuevo ${action.label}`, duration: 1500 });
        }
        return;
      }
    }

    function onOpenShortcuts() { setShortcutsOpen(true); }

    window.addEventListener('keydown', onKey);
    window.addEventListener('crm:open-shortcuts', onOpenShortcuts);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('crm:open-shortcuts', onOpenShortcuts);
      clearGPending();
    };
  }, [navigate, pathname]);

  return (
    <div className="min-h-screen bg-background">
      {/* Skip-to-content (a11y) — visible solo con foco por teclado */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-3 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:shadow-lg focus:font-semibold focus:text-sm"
      >
        Saltar al contenido
      </a>

      {/* Mobile topbar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border flex items-center px-4 z-30">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="p-2 rounded-md hover:bg-muted transition-colors"
        >
          <List size={22} weight="bold" />
        </button>
        <span className="ml-3 font-semibold text-sm">MultiCRM</span>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative w-60 h-full">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Cerrar menu"
              className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </div>

      {/* Main content - Suspense interno para que el sidebar no se desmonte al lazy-cargar paginas */}
      <main
        id="main-content"
        role="main"
        aria-label="Contenido principal"
        tabIndex={-1}
        className={cn(
          'p-4 pt-[72px] lg:p-6 lg:pt-6 xl:p-8 transition-[margin] duration-200 focus:outline-none',
          collapsed ? 'lg:ml-16' : 'lg:ml-64'
        )}
      >
        <Suspense fallback={
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        }>
          {/* Fade-in suave en cada cambio de ruta — key={pathname} fuerza remount */}
          <div key={pathname} className="animate-in fade-in duration-200">
            <AllProjectsGuard pathname={pathname}>
              <Outlet />
            </AllProjectsGuard>
          </div>
        </Suspense>
      </main>

      <Toaster />
      <CommandPalette />
      {pathname.startsWith('/manual') && !mobileOpen && (
        <Suspense fallback={null}>
          <FloatingDock />
        </Suspense>
      )}
      {!hideFloating && !mobileOpen && (
        <Suspense fallback={null}>
          <ShortcutsFAB />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <PWAInstallPrompt />
      </Suspense>
      <Suspense fallback={null}>
        <PWAUpdatePrompt />
      </Suspense>
      <Suspense fallback={null}>
        <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <OfflineBanner />
      </Suspense>
      <Suspense fallback={null}>
        <AvisoDeLlamada />
        <AvisoDeMensaje />
      </Suspense>
    </div>
  );
}
