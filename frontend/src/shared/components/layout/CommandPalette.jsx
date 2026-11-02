import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectContext } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { crearCan } from '@/shared/hooks/usePermission';
import { ROLE_LABELS_CORTOS } from '@/modules/users/lib/usersUi';
import { STATUS_LABEL } from '@/modules/tasks/lib/taskUi';
import { useIdsDelAmbito } from '@/shared/hooks/useAmbito';
import {
  NAV_SECTIONS,
  entradasDeSeccion,
  canSeeItem,
  applyLabel,
  esSoloColaboraciones,
} from '@/shared/components/layout/Sidebar';
import { isBetaAllowed } from '@/shared/config/betaConfig';
import { rolesDe } from '@/shared/lib/roles';
import client from '@/shared/api/client';
import {
  MagnifyingGlass,
  SquaresFour,
  Package,
  User,
  ArrowRight,
  Plus,
  Moon,
  Sun,
  SignOut,
  ClockCounterClockwise,
  Lightning,
  Keyboard,
  Receipt,
  Kanban,
  ChatCircleText,
  UserGear,
} from '@phosphor-icons/react';

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

export function sinAcentos(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function fuzzyScore(label, keywords, q) {
  const normQ = sinAcentos(q).trim();
  if (!normQ) return 0;
  const text = sinAcentos(`${label || ''} ${keywords || ''}`);
  if (text.includes(normQ)) return 1;
  // match por iniciales de palabras (e.g. "ca" matches "Cuentas por cobrar Anuales")
  const initials = text.split(/\s+/).map((w) => w[0]).join('');
  if (initials.startsWith(normQ)) return 0.8;
  return 0;
}

/**
 * Las páginas que encuentra alguien: exactamente las de su menú (#591).
 *
 * Mismo recorrido que `Sidebar`: la sección que no aplica a este tipo de
 * proyecto (`salvoTipo`), `entradasDeSeccion` para las entradas, `canSeeItem`
 * para los hijos de un grupo, y fuera lo «Próximamente» (la marca del propio
 * menú o la lista de la beta). Nada de una lista aparte: lo nuevo del menú sale
 * solo, con el nombre que le ponga la empresa, y lo que el menú no enseña
 * tampoco se encuentra aquí.
 */
export function paginasDelBuscador({ user, can, activeProject }) {
  const soloColab = esSoloColaboraciones(user);
  const userRoles = rolesDe(user);
  const modules = activeProject?.modules;
  const projectType = activeProject?.type;
  const labelOverrides = activeProject?.sidebar_labels;
  const abre = (it) => it.to && !it.href && !it.comingSoon && isBetaAllowed(it.to);

  const list = [];
  const seen = new Set();
  const meter = (it, sublabel, iconoPadre) => {
    if (!abre(it) || seen.has(it.to)) return;
    seen.add(it.to);
    list.push({
      label: applyLabel(it.label, labelOverrides),
      sublabel: applyLabel(sublabel, labelOverrides),
      detail: it.detail || '',
      to: it.to,
      icon: it.icon || iconoPadre || SquaresFour,
      keywords: [it.keywords, it.detail, sublabel].filter(Boolean).join(' '),
    });
  };

  for (const section of NAV_SECTIONS) {
    if (Array.isArray(section.salvoTipo) && section.salvoTipo.includes(projectType)) continue;
    for (const item of entradasDeSeccion(section, { user, can, modules, projectType, soloColab })) {
      if (Array.isArray(item.children)) {
        item.children
          .filter((c) => canSeeItem(c, userRoles, modules, projectType, soloColab, user, can))
          .forEach((c) => meter(c, item.label, item.icon));
      } else {
        meter(item, section.label);
      }
    }
  }
  return list;
}

/**
 * Qué tipos de resultado busca alguien (#591): los mismos permisos que
 * protegen su pantalla y su ruta, los efectivos de /auth/me (con sus
 * excepciones), nunca el nombre del rol. Si falta el permiso no se llama al
 * servidor; el ámbito (sus campus, solo lo suyo si es gestora) lo pone él.
 *
 * La única excepción es quien es SOLO tutor: el catálogo le da `leads.view` y
 * `products.view` (TODOS), pero su menú no tiene ni Prospectos ni Productos.
 * Diego tiene que decidir si se le quitan del catálogo; mientras, el buscador
 * no se los enseña (el mismo recorte que hace `canSeeItem`).
 */
export function queBusca({ user, can }) {
  const tiene = (p) => typeof can === 'function' && can(p) === true;
  const roles = rolesDe(user);
  const soloTutor = roles.length === 1 && roles[0] === 'tutor';
  const personas = !soloTutor && tiene('leads.view');
  const productos = !soloTutor && tiene('products.view');
  return {
    personas,
    clientes: personas && tiene('clients.view'),
    productos,
    crearProspecto: personas && tiene('leads.create'),
    crearProducto: productos && tiene('products.create'),
    // Ventas por número y facturas: el servidor acota a sus campus y, si es
    // gestora, a las suyas. Al tutor, como con las personas, se le deja fuera.
    ventas: !soloTutor && tiene('conversions.view'),
    facturas: !soloTutor && tiene('facturas.view'),
    tareas: tiene('tasks.view_own') || tiene('tasks.view_all'),
    // Las consultas de alumnos: las suyas si las atiende; las de sus campus si las supervisa.
    consultasPanel: tiene('consultas.view'),
    consultasPropias: tiene('consultas.atender') && !tiene('consultas.view'),
    // Personas del equipo: quien puede ver usuarios. El servidor da todos a
    // superadmin y soporte, y al resto solo los de sus campus.
    usuarios: tiene('users.view'),
  };
}

/** A dónde lleva cada resultado. Rutas de App.jsx (lo comprueba la prueba). */
export const destinoDePersona = (l) => (l.status === 'convertido' ? `/clientes/${l.id}` : `/prospectos/${l.id}`);
export const destinoDeProducto = (p) => `/productos/${p.id}`;
export const destinoDeVenta = (v) => `/finanzas/ventas/${v.id}`;
// Una factura no tiene ficha propia: se abre la venta de la que cuelga, o la lista.
export const destinoDeFactura = (f) => (f.conversion_id ? `/finanzas/ventas/${f.conversion_id}` : '/finanzas/facturas');
export const destinoDeTarea = (t) => `/tareas?id=${t.id}`;
export const destinoDeConsulta = (c) => `/consultas/${c.id}`;
// Un usuario no tiene ficha: la pestaña Usuarios de Configuración, con su nombre en el buscador.
export const destinoDeUsuario = (u) => `/configuracion?pestana=users&buscar=${encodeURIComponent(u.nombre || u.email || '')}`;

/**
 * Si antes de abrir un resultado hay que ponerse en su campus (revisión del
 * 02/11). La ficha de un producto pide un campus en la cabecera: con «Todos» o
 * con una empresa, llevaba al muro «Elige un campus». La de una venta (y la
 * factura, que abre su venta) vale con una empresa (`CON_SOCIEDAD_OK`), pero
 * no con «Todos». Las personas no: `/prospectos/:id` y `/clientes/:id` abren
 * con cualquier cabecera.
 */
export function campusAlAbrir(item, { unCampus, todos }) {
  // Un reciente guarda el tipo de lo que abrió (`tipo`): vale lo mismo.
  const tipo = item.tipo || item.type;
  if (!item.projectId || unCampus) return null;
  if (tipo === 'product') return Number(item.projectId);
  if ((tipo === 'venta' || tipo === 'factura') && todos) return Number(item.projectId);
  return null;
}

/** «1234» o «#1234»: el número de una venta. */
export const numeroDeVenta = (q) => (/^#?\d{1,9}$/.test(q.trim()) ? q.trim().replace('#', '') : null);
/** «F-2026/0641» se guarda como «2026/0641»: se quita la «F-» de delante. */
export const terminoDeFactura = (q) => q.trim().replace(/^f\s*-?\s*(?=\d)/i, '');

/**
 * Un reciente solo se enseña si hoy se podría volver a encontrar: si a alguien
 * le quitan un permiso, el reciente de esa pantalla desaparece con él.
 */
export function recienteSigueValiendo(to, { pages, busca }) {
  if (pages.some((p) => p.to === to)) return true;
  if (/^\/prospectos\/\d+$/.test(to)) return busca.personas;
  if (/^\/clientes\/\d+$/.test(to)) return busca.clientes;
  if (/^\/productos\/\d+$/.test(to)) return busca.productos;
  if (/^\/finanzas\/ventas\/\d+$/.test(to)) return busca.ventas || busca.facturas;
  if (/^\/tareas\?id=\d+$/.test(to)) return busca.tareas;
  if (/^\/consultas\/\d+$/.test(to)) return busca.consultasPanel || busca.consultasPropias;
  if (to.startsWith('/configuracion?pestana=users')) return busca.usuarios;
  return false;
}

const SIN_OTROS = { ventas: [], facturas: [], tareas: [], consultas: [], usuarios: [] };
/** Letras a partir de las que se pregunta al servidor. */
export const MIN_SERVIDOR = 2;

/**
 * Lo que llega del servidor como clave («por_hacer», «gestor»), dicho como lo
 * dice el resto del CRM; si no hay etiqueta, «por_hacer» → «Por hacer».
 */
export function legible(valor, etiquetas = {}) {
  if (!valor) return '';
  if (etiquetas[valor]) return etiquetas[valor];
  const s = String(valor).replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [recents, setRecents] = useState(() => getRecents());
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();
  const { activeProject, projects, switchProject, activeIssuerId, isAllProjects } = useProjectContext();
  const { user, logout, permissions } = useAuth();
  const { theme, toggleTheme } = useTheme();
  // `usePermission()` da una función `can` NUEVA en cada render. Aquí no vale:
  // `busca` y `search` dependen de ella, y una búsqueda «nueva» en cada render
  // relanzaba la búsqueda, que al pintar provocaba otro render… en bucle (se vio
  // en local: 75 peticiones por un «gonzalez»). La misma `can`, una vez por
  // usuario y mapa de permisos.
  const can = useMemo(() => crearCan(user, permissions), [user, permissions]);
  const idsDelAmbito = useIdsDelAmbito();

  const pages = useMemo(() => paginasDelBuscador({ user, can, activeProject }), [user, can, activeProject]);
  const busca = useMemo(() => queBusca({ user, can }), [user, can]);

  // Crear solo si puede crear y su menú tiene la pantalla: si no, es el muro.
  const quickActions = useMemo(() => [
    busca.crearProspecto && pages.some((p) => p.to === '/prospectos')
      && { id: 'qa-new-lead', label: 'Crear nuevo prospecto', icon: Plus, keywords: 'nuevo lead crear contacto', run: () => navigate('/prospectos?new=1') },
    busca.crearProducto && pages.some((p) => p.to === '/productos')
      && { id: 'qa-new-product', label: 'Crear nuevo producto', icon: Plus, keywords: 'nuevo producto crear catalogo', run: () => navigate('/productos?new=1') },
    { id: 'qa-toggle-theme', label: theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro', icon: theme === 'dark' ? Sun : Moon, keywords: 'tema dark light claro oscuro', run: () => toggleTheme() },
    { id: 'qa-shortcuts', label: 'Ver atajos de teclado', icon: Keyboard, keywords: 'atajos teclado shortcuts ayuda', run: () => window.dispatchEvent(new Event('crm:open-shortcuts')) },
    { id: 'qa-logout', label: 'Cerrar sesión', icon: SignOut, keywords: 'logout salir', run: async () => { await logout(); navigate('/login'); } },
  ].filter(Boolean), [busca, pages, theme, toggleTheme, navigate, logout]);

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
  const [otros, setOtros] = useState(SIN_OTROS);
  const [searching, setSearching] = useState(false);
  // El catálogo de cada campus se pide una vez por apertura, no en cada tecla:
  // con una empresa arriba eran catorce peticiones por letra.
  const catalogos = useRef(new Map());
  useEffect(() => { if (open) catalogos.current = new Map(); }, [open]);
  // Cada búsqueda lleva su número: si escribes «go» y luego «gonzalez», la
  // respuesta de «go» puede llegar la última y tapar la buena. Solo vale la última.
  const ultima = useRef(0);

  const search = useCallback(async (q) => {
    const turno = ++ultima.current;
    const vigente = () => turno === ultima.current;
    const vaciar = () => { setLeadResults([]); setProductResults([]); setOtros(SIN_OTROS); setSearching(false); };
    // Al servidor, desde dos letras (o un número de venta): con una sola, cada
    // tecla eran siete búsquedas sobre toda la base. Páginas y acciones, desde la primera.
    if (!q || (q.length < MIN_SERVIDOR && !numeroDeVenta(q))) return vaciar();

    // Un campus, o los del ámbito («Todos» o una empresa): el servidor exige
    // projectId o projectIds y los recorta a los de la persona.
    const hasSingleProject = activeProject?.id && activeProject.id > 0;
    const campus = hasSingleProject ? [activeProject.id] : idsDelAmbito;
    // Con un solo dígito, solo la venta de ese número; lo demás, desde dos letras.
    const b = q.length < MIN_SERVIDOR ? { ventas: busca.ventas } : busca;
    const algo = Object.values(b).some(Boolean);
    if (!campus.length || !algo) return vaciar();
    const ambito = hasSingleProject ? `projectId=${activeProject.id}` : `projectIds=${campus.join(',')}`;
    const lista = (r, campo) => (r?.success ? (campo ? r.data?.[campo] : r.data) : null);
    const pedir = (url) => client.get(url).catch(() => ({ success: false }));
    const nada = { success: true, data: [] };

    const catalogoDe = (pid) => {
      if (!catalogos.current.has(pid)) {
        catalogos.current.set(pid, client.get(`/products?projectId=${pid}`)
          .then((r) => (r.success && Array.isArray(r.data) ? r.data : []))
          .catch(() => []));
      }
      return catalogos.current.get(pid);
    };

    // Cada tipo, solo con su permiso: si falta, no se llama (#591). El ámbito
    // (sus campus, y si es gestora solo lo suyo) lo pone la ruta del servidor.
    const texto = encodeURIComponent(q);
    const numero = numeroDeVenta(q);
    // Las consultas van por la cabecera: un campus, o una empresa; con «Todos», las de sus campus.
    const ambitoConsultas = hasSingleProject ? `&projectId=${activeProject.id}` : (activeIssuerId ? `&issuerId=${activeIssuerId}` : '');
    // Usuarios: acotados a la cabecera si hay un campus o una empresa; con «Todos», sin acotar
    // (al superadmin le saldría solo quien tiene campus, y soporte no tiene ninguno).
    const ambitoUsuarios = hasSingleProject || activeIssuerId ? `&projectIds=${campus.join(',')}` : '';

    setSearching(true);
    try {
      const [leadsRes, catalogo, ventaRes, facturasRes, tareasRes, consultasRes, usuariosRes] = await Promise.all([
        b.personas
          // `includeConverted`: Diego, 14/09: buscar también a los clientes;
          // solo para quien puede abrir su ficha (clients.view).
          ? pedir(`/leads?${ambito}&search=${texto}&limit=5${b.clientes ? '&includeConverted=1' : ''}`)
          : nada,
        b.productos
          ? Promise.all(campus.map(catalogoDe)).then((listas) => {
            const vistos = new Set();
            return listas.flat().filter((p) => !vistos.has(p.id) && vistos.add(p.id));
          })
          : [],
        // Una venta por su número: la ficha ya comprueba campus y, si es gestora, que sea suya.
        b.ventas && numero ? pedir(`/conversions/${numero}`) : { success: false },
        // La lista de facturas entiende un campus cada vez (`GET /invoices` no
        // acepta `projectIds`): con «Todos» eran diez peticiones por búsqueda.
        // Facturas, solo con un campus en la cabecera (revisión del 02/11).
        b.facturas && hasSingleProject
          ? pedir(`/invoices?projectId=${activeProject.id}&search=${encodeURIComponent(terminoDeFactura(q))}&limit=5`)
          : nada,
        b.tareas ? pedir(`/tasks?search=${texto}`) : nada,
        b.consultasPanel ? pedir(`/consultas?buscar=${texto}${ambitoConsultas}`)
          : b.consultasPropias ? pedir(`/consultas/mias?buscar=${texto}`) : nada,
        b.usuarios ? pedir(`/users/buscar?q=${texto}${ambitoUsuarios}`) : nada,
      ]);
      if (!vigente()) return;

      setLeadResults(lista(leadsRes) || []);
      // Productos: filtrado aquí, sin acentos (Diego, 02/11).
      const normQ = sinAcentos(q);
      setProductResults(catalogo.filter((p) =>
        sinAcentos(p.nombre).includes(normQ) || sinAcentos(p.codigo || p.sku).includes(normQ),
      ).slice(0, 5));
      const venta = ventaRes.success && ventaRes.data?.id ? ventaRes.data : null;
      const deLista = (r, campo) => { const l = lista(r, campo); return Array.isArray(l) ? l.slice(0, 5) : []; };
      setOtros({
        ventas: venta ? [venta] : [],
        facturas: deLista(facturasRes),
        tareas: deLista(tareasRes),
        consultas: deLista(consultasRes, 'consultas'),
        usuarios: deLista(usuariosRes),
      });
    } catch {
      if (vigente()) vaciar();
    } finally {
      if (vigente()) setSearching(false);
    }
  }, [activeProject?.id, activeIssuerId, idsDelAmbito, busca]);

  useEffect(() => {
    // Cerrado no busca: si se cierra con Escape dejando texto y luego cambia la
    // cabecera, no hay nadie mirando.
    if (!open) return undefined;
    const q = query.trim();
    // «Buscando…» desde que escribes, no desde que sale la petición: si no, entre
    // tecla y respuesta asomaba «No hay resultados».
    if (q.length >= MIN_SERVIDOR || numeroDeVenta(q)) setSearching(true);
    const timer = setTimeout(() => search(q), 250);
    return () => clearTimeout(timer);
  }, [open, query, search]);

  // Construye la lista plana de resultados (con grupos visuales) según query
  const groups = useMemo(() => {
    const q = query.trim();
    const out = [];

    if (!q) {
      // Estado inicial: recientes + acciones rápidas
      const vigentes = recents.filter((r) => recienteSigueValiendo(r.to, { pages, busca }));
      if (vigentes.length > 0) {
        out.push({
          label: 'Recientes',
          items: vigentes.map((r) => ({
            type: 'recent',
            label: r.label,
            sublabel: r.sublabel,
            to: r.to,
            tipo: r.tipo,
            projectId: r.projectId,
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
        items: pages.slice(0, 6).map((s) => ({ type: 'section', ...s })),
      });
      return out;
    }

    // Con query — calcula scores y agrupa
    const sectionMatches = pages
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
        label: 'Personas',
        items: leadResults.map((l) => ({
          type: 'lead',
          label: l.nombre,
          sublabel: (l.email || l.telefono || `#${l.id}`)
            + (l.status === 'convertido' ? ' · cliente' : ''),
          to: destinoDePersona(l),
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
          to: destinoDeProducto(p),
          projectId: p.project_id,
          icon: Package,
        })),
      });
    }
    const euros = (n) => (n != null && n !== '' ? `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 2 })} €` : '');
    const grupo = (label, filas, item) => { if (filas.length) out.push({ label, items: filas.map(item) }); };
    grupo('Ventas', otros.ventas, (v) => ({
      type: 'venta', label: `Venta ${v.id}`, icon: Receipt, to: destinoDeVenta(v), projectId: v.project_id,
      sublabel: [v.lead_nombre, v.producto_contratado, euros(v.importe_total)].filter(Boolean).join(' · '),
    }));
    grupo('Facturas', otros.facturas, (f) => ({
      type: 'factura', label: `${f.tipo === 'proforma' ? 'Proforma' : 'Factura'} ${f.codigo || f.numero}`, icon: Receipt, to: destinoDeFactura(f), projectId: f.project_id,
      sublabel: [f.cliente_nombre, euros(f.total)].filter(Boolean).join(' · '),
    }));
    grupo('Tareas', otros.tareas, (t) => ({
      type: 'tarea', label: t.title, icon: Kanban, to: destinoDeTarea(t), sublabel: legible(t.status, STATUS_LABEL),
    }));
    grupo('Consultas', otros.consultas, (c) => ({
      type: 'consulta', label: c.alumno_nombre || `Consulta ${c.id}`, icon: ChatCircleText, to: destinoDeConsulta(c),
      sublabel: [c.curso_nombre, legible(c.estado)].filter(Boolean).join(' · '),
    }));
    grupo('Usuarios', otros.usuarios, (u) => ({
      type: 'usuario', label: u.nombre, icon: UserGear, to: destinoDeUsuario(u),
      sublabel: [u.email, legible(u.role, ROLE_LABELS_CORTOS), u.active === false ? 'Inactivo' : ''].filter(Boolean).join(' · '),
    }));
    return out;
  }, [query, recents, quickActions, projectActions, pages, busca, leadResults, productResults, otros]);

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
      pushRecent({ label: item.label, sublabel: item.sublabel, to: item.to, tipo: item.tipo || item.type, projectId: item.projectId });
      const pid = campusAlAbrir(item, { unCampus: activeProject?.id > 0, todos: isAllProjects });
      if (pid) switchProject(pid);
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
            placeholder="Buscar personas, ventas, facturas, páginas…"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-results"
            aria-activedescendant={flatItems[selectedIdx] ? `command-palette-opcion-${selectedIdx}` : undefined}
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
              <p className="text-sm text-muted-foreground" role="status">
                {!query ? 'Empieza a escribir para buscar.'
                  : searching ? 'Buscando…'
                    : `No hay resultados para “${query}”`}
              </p>
              {query && !searching && (
                <p className="text-[11px] text-muted-foreground/70 mt-1">
                  Prueba con un nombre, correo, teléfono, número de venta o factura, o el nombre de una pantalla.
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
                      id={`command-palette-opcion-${idx}`}
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
