import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectContext } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import client from '@/shared/api/client';
import {
  MagnifyingGlass,
  SquaresFour,
  Users,
  UserCheck,
  Package,
  Megaphone,
  CurrencyEur,
  Gear,
  User,
  ArrowRight,
  FacebookLogo,
  GoogleLogo,
  ChartBar,
  Calculator,
  Receipt,
  Wallet,
  Coins,
  Export,
  Plus,
  Moon,
  Sun,
  SignOut,
  ClockCounterClockwise,
  Lightning,
  FilePdf,
  Envelope,
  Globe,
  Headset,
  BookOpen,
  CreditCard,
  Keyboard,
} from '@phosphor-icons/react';

// Páginas / secciones navegables
const SECTIONS = [
  { label: 'Dashboard', to: '/', icon: SquaresFour, keywords: 'inicio home panel' },
  { label: 'Prospectos', to: '/prospectos', icon: Users, keywords: 'leads contactos' },
  { label: 'Pipeline', to: '/prospectos/pipeline', icon: Users, keywords: 'kanban embudo' },
  { label: 'Audiencias', to: '/prospectos/audiencias', icon: Export, keywords: 'segmentos exportar' },
  { label: 'Clientes', to: '/clientes', icon: UserCheck, keywords: 'cuentas convertidos' },
  { label: 'Matrículas', to: '/clientes/matriculas', icon: UserCheck, keywords: 'inscripciones' },
  { label: 'Productos', to: '/productos', icon: Package, keywords: 'catalogo' },
  { label: 'Documentos', to: '/documentos', icon: FilePdf, keywords: 'pdf archivos dossier' },
  { label: 'Email seguimiento', to: '/secuencias-email', icon: Envelope, keywords: 'secuencias drip' },
  { label: 'Formularios', to: '/captacion', icon: Globe, keywords: 'captura webhook forms' },
  { label: 'Webhooks', to: '/captacion/webhooks', icon: Globe, keywords: 'integraciones api' },
  { label: 'Make', to: '/captacion/make', icon: Globe, keywords: 'make automatizacion' },
  { label: 'Campañas — Consolidado', to: '/campanas', icon: Megaphone, keywords: 'ads' },
  { label: 'Campañas — Meta Ads', to: '/campanas/meta', icon: FacebookLogo, keywords: 'facebook instagram' },
  { label: 'Campañas — Google Ads', to: '/campanas/google', icon: GoogleLogo, keywords: 'adwords' },
  { label: 'Tráfico orgánico (SEO)', to: '/campanas/seo', icon: MagnifyingGlass, keywords: 'organic search console' },
  { label: 'Contabilidad', to: '/accounting', icon: Calculator },
  { label: 'Ingresos', to: '/accounting/income', icon: CurrencyEur, keywords: 'revenue facturacion' },
  { label: 'Conversiones y pagos', to: '/revenue', icon: CurrencyEur, keywords: 'pagos ventas' },
  { label: 'Egresos', to: '/accounting/expenses', icon: Receipt, keywords: 'gastos costes' },
  { label: 'Cuentas por cobrar', to: '/accounting/receivable', icon: Wallet, keywords: 'cobros pendientes' },
  { label: 'Cuentas por pagar', to: '/accounting/payable', icon: Wallet, keywords: 'pagos pendientes' },
  { label: 'Stripe', to: '/stripe', icon: CreditCard, keywords: 'mrr churn suscripciones saas ia', projectType: 'ia' },
  { label: 'Comisiones', to: '/commissions', icon: Coins, keywords: 'gestores' },
  { label: 'Nóminas', to: '/payroll', icon: Coins, keywords: 'salarios' },
  { label: 'Reportes', to: '/informes', icon: ChartBar, keywords: 'analytics estadisticas' },
  { label: 'Soporte / Novedades', to: '/soporte', icon: Headset, keywords: 'ayuda changelog' },
  { label: 'Manual', to: '/manual', icon: BookOpen, keywords: 'documentacion ayuda' },
  { label: 'Configuración', to: '/configuracion', icon: Gear, keywords: 'ajustes preferencias' },
];

const RECENT_KEY = 'crm.palette.recents';
const MAX_RECENTS = 5;

function getRecents() {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function pushRecent(entry) {
  try {
    const list = getRecents().filter((e) => e.to !== entry.to);
    list.unshift(entry);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENTS)));
  } catch {}
}

function fuzzyScore(label, keywords, q) {
  const text = `${label} ${keywords || ''}`.toLowerCase();
  if (text.includes(q)) return 1;
  // match por iniciales de palabras (e.g. "ca" matches "Cuentas por cobrar Anuales")
  const initials = text.split(/\s+/).map((w) => w[0]).join('');
  if (initials.startsWith(q)) return 0.8;
  return 0;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [recents, setRecents] = useState(() => getRecents());
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const { activeProject, projects, switchProject } = useProjectContext();
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Quick actions disponibles según proyecto + tema actual
  const quickActions = useMemo(() => [
    { id: 'qa-new-lead', label: 'Crear nuevo prospecto', icon: Plus, keywords: 'nuevo lead crear contacto', run: () => navigate('/prospectos?new=1') },
    { id: 'qa-new-product', label: 'Crear nuevo producto', icon: Plus, keywords: 'nuevo producto crear catalogo', run: () => navigate('/products?new=1') },
    { id: 'qa-toggle-theme', label: theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro', icon: theme === 'dark' ? Sun : Moon, keywords: 'tema dark light claro oscuro', run: () => toggleTheme() },
    { id: 'qa-shortcuts', label: 'Ver atajos de teclado', icon: Keyboard, keywords: 'atajos teclado shortcuts ayuda', run: () => window.dispatchEvent(new Event('crm:open-shortcuts')) },
    { id: 'qa-logout', label: 'Cerrar sesión', icon: SignOut, keywords: 'logout salir', run: async () => { await logout(); navigate('/login'); } },
  ], [theme, toggleTheme, navigate, logout]);

  // Cambio de proyecto como acción rápida
  const projectActions = useMemo(() => (
    (projects || [])
      .filter((p) => p.id !== activeProject?.id)
      .map((p) => ({
        id: `proj-${p.id}`,
        label: `Cambiar a ${p.nombre}`,
        sublabel: 'Proyecto',
        icon: SquaresFour,
        keywords: `proyecto cambiar ${p.nombre} ${p.slug || ''}`,
        run: () => switchProject(Number(p.id)),
      }))
  ), [projects, activeProject?.id, switchProject]);

  // Keyboard shortcut + evento custom
  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery('');
        setSelectedIdx(0);
        setRecents(getRecents());
      }
      if (e.key === 'Escape') setOpen(false);
    }
    function handleOpen() {
      setOpen(true);
      setQuery('');
      setSelectedIdx(0);
      setRecents(getRecents());
    }
    window.addEventListener('keydown', handleKey);
    window.addEventListener('crm:open-palette', handleOpen);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('crm:open-palette', handleOpen);
    };
  }, []);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const [leadResults, setLeadResults] = useState([]);
  const [productResults, setProductResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const search = useCallback(async (q) => {
    if (!q || !activeProject?.id) {
      setLeadResults([]);
      setProductResults([]);
      return;
    }
    setSearching(true);
    try {
      const [leadsRes, productsRes] = await Promise.all([
        // `includeConverted` NO se puede quitar: sin el, /leads añade
        // `status <> 'convertido'` y la busqueda general esconde a TODO el que
        // ya compro --justo a quien mas se busca, para cobrar o facturar--.
        // Diego, 14/09: busco a un cliente por nombre y por correo y no sale.
        // Con «Todos» o una empresa el proyecto activo es -1: mandarlo tal cual
        // hacia que el servidor rechazara la busqueda y el buscador no
        // encontraba a nadie (28/09: miles de rechazos, Ana y Dayana incluidas).
        // Sin proyecto concreto se busca en todo lo suyo; los productos, que son
        // de un campus, solo con uno elegido.
        client.get(`/leads?${activeProject.id > 0 ? `projectId=${activeProject.id}&` : ''}search=${encodeURIComponent(q)}&limit=5&includeConverted=1`).catch(() => ({ success: false })),
        activeProject.id > 0
          ? client.get(`/products?projectId=${activeProject.id}`).catch(() => ({ success: false }))
          : Promise.resolve({ success: true, data: [] }),
      ]);
      setLeadResults(leadsRes.success ? (leadsRes.data || []) : []);
      // Filtrado client-side para productos (típicamente <100/proyecto)
      const lower = q.toLowerCase();
      const products = productsRes.success
        ? (productsRes.data || []).filter((p) =>
            (p.nombre || '').toLowerCase().includes(lower) ||
            (p.codigo || '').toLowerCase().includes(lower)
          ).slice(0, 5)
        : [];
      setProductResults(products);
    } catch {
      setLeadResults([]);
      setProductResults([]);
    } finally {
      setSearching(false);
    }
  }, [activeProject?.id]);

  useEffect(() => {
    const timer = setTimeout(() => search(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  // Construye la lista plana de resultados (con grupos visuales) según query
  const groups = useMemo(() => {
    const q = query.toLowerCase().trim();
    const out = [];

    // Filtra secciones que requieran cierto tipo de proyecto (e.g. Stripe solo IA)
    const visibleSections = SECTIONS.filter((s) => !s.projectType || s.projectType === activeProject?.type);

    if (!q) {
      // Estado inicial: recientes + acciones rápidas
      if (recents.length > 0) {
        out.push({
          label: 'Recientes',
          items: recents.map((r) => ({
            type: 'recent',
            label: r.label,
            sublabel: r.sublabel,
            to: r.to,
            icon: ClockCounterClockwise,
          })),
        });
      }
      out.push({
        label: 'Acciones rápidas',
        items: quickActions.map((a) => ({ type: 'action', ...a })),
      });
      out.push({
        label: 'Páginas frecuentes',
        items: visibleSections.slice(0, 6).map((s) => ({ type: 'section', ...s })),
      });
      return out;
    }

    // Con query — calcula scores y agrupa
    const sectionMatches = visibleSections
      .map((s) => ({ ...s, score: fuzzyScore(s.label, s.keywords, q) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    const actionMatches = [...quickActions, ...projectActions]
      .map((a) => ({ ...a, score: fuzzyScore(a.label, a.keywords, q) }))
      .filter((a) => a.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (actionMatches.length > 0) {
      out.push({
        label: 'Acciones',
        items: actionMatches.map((a) => ({ type: 'action', ...a })),
      });
    }
    if (sectionMatches.length > 0) {
      out.push({
        label: 'Páginas',
        items: sectionMatches.map((s) => ({ type: 'section', ...s })),
      });
    }
    if (leadResults.length > 0) {
      out.push({
        // «Personas» y no «Prospectos»: desde hoy la lista trae tambien a los
        // que ya compraron, y llamarlos prospectos seria mentir en la etiqueta.
        label: 'Personas',
        items: leadResults.map((l) => ({
          type: 'lead',
          label: l.nombre,
          // Quien ya compro se dice, porque ahora si sale en la lista: sin esto
          // un cliente y un prospecto vivo se leen igual, y no son lo mismo ni
          // se les escribe igual.
          sublabel: (l.email || l.telefono || `#${l.id}`)
            + (l.status === 'convertido' ? ' · cliente' : ''),
          to: `/leads/${l.id}`,
          icon: User,
        })),
      });
    }
    if (productResults.length > 0) {
      out.push({
        label: 'Productos',
        items: productResults.map((p) => ({
          type: 'product',
          label: p.nombre,
          sublabel: p.codigo ? `${p.codigo} · ${p.precio ? `${p.precio}€` : ''}` : (p.precio ? `${p.precio}€` : ''),
          to: `/products/${p.id}`,
          icon: Package,
        })),
      });
    }
    return out;
  }, [query, recents, quickActions, projectActions, leadResults, productResults, activeProject?.type]);

  const flatItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => { setSelectedIdx(0); }, [query]);

  // Mantener el item seleccionado dentro del viewport del scroll
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  function executeItem(item) {
    if (item.type === 'action' && typeof item.run === 'function') {
      item.run();
      setOpen(false);
      setQuery('');
      return;
    }
    if (item.to) {
      pushRecent({ label: item.label, sublabel: item.sublabel, to: item.to });
      navigate(item.to);
      setOpen(false);
      setQuery('');
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && flatItems[selectedIdx]) {
      e.preventDefault();
      executeItem(flatItems[selectedIdx]);
    }
  }

  if (!open) return null;

  let runningIdx = 0;
  return (
    <div role="dialog" aria-label="Búsqueda rápida" className="fixed inset-0 !m-0 z-[60] flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative bg-card rounded-lg border border-border shadow-dialog w-full max-w-xl mx-4 overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 border-b border-border">
          <MagnifyingGlass size={18} className="text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar prospectos, productos, páginas…"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-results"
            className="min-w-0 w-full h-12 sm:h-14 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {searching && <span className="hidden sm:inline text-[10px] text-muted-foreground font-mono animate-pulse flex-shrink-0">buscando…</span>}
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-1 rounded-md bg-muted text-[10px] font-medium text-muted-foreground border border-border flex-shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} id="command-palette-results" role="listbox" className="max-h-[400px] overflow-y-auto p-2 sidebar-scroll">
          {flatItems.length === 0 ? (
            <div className="py-10 text-center">
              <Lightning size={28} weight="regular" className="text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {query ? `No hay resultados para “${query}”` : 'Empieza a escribir para buscar.'}
              </p>
              {query && (
                <p className="text-[11px] text-muted-foreground/70 mt-1">
                  Prueba con un nombre, email, código de producto o sección.
                </p>
              )}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="mb-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60 px-3 py-1.5">
                  {group.label}
                </p>
                {group.items.map((item) => {
                  const idx = runningIdx++;
                  const Icon = item.icon || ArrowRight;
                  const active = selectedIdx === idx;
                  return (
                    <button
                      key={`${group.label}-${idx}`}
                      data-idx={idx}
                      role="option"
                      aria-selected={active}
                      onClick={() => executeItem(item)}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] transition-colors ${
                        active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon size={16} weight={active ? 'duotone' : 'regular'} className="flex-shrink-0" />
                      <div className="flex-1 min-w-0 text-left">
                        <span className="font-medium block truncate">{item.label}</span>
                        {item.sublabel && (
                          <span className="text-[11px] text-muted-foreground truncate block">{item.sublabel}</span>
                        )}
                      </div>
                      <ArrowRight size={12} className="ml-auto opacity-30 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="hidden sm:flex px-4 py-2.5 border-t border-border items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-medium">↑↓</kbd> navegar</span>
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-medium">↵</kbd> seleccionar</span>
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-medium">esc</kbd> cerrar</span>
          <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-medium">?</kbd> atajos</span>
          {activeProject?.nombre && (
            <span className="ml-auto truncate min-w-0">en <strong>{activeProject.nombre}</strong></span>
          )}
        </div>
      </div>
    </div>
  );
}
