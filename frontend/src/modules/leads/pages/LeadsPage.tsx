import SaludComercial from '../components/SaludComercial';
import CifrasProspectos from '../components/CifrasProspectos';
import SiguientesAcciones from '../components/SiguientesAcciones';
import AccesosClave from '@/shared/components/ui/AccesosClave';
import BarraFiltros from '@/shared/components/ui/BarraFiltros';
import PageHeader from '@/shared/components/ui/PageHeader';
import ComoVoy from '@/modules/reports/components/ComoVoy';
import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useLeads } from '../hooks/useLeads';
import { useWhatsappTemplates } from '../hooks/useWhatsappTemplates';
import LeadFormDialog from '../components/LeadFormDialog';
import { toast } from '@/shared/hooks/useToast';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectContext } from '@/contexts/ProjectContext';
import { useProducts } from '@/modules/products/hooks/useProducts';
import client from '@/shared/api/client';
import { Gear, ArrowCounterClockwise, ListChecks,
  MagnifyingGlass,
  Plus,

  CaretLeft,
  CaretRight,
  Users,
  WarningCircle,
  Notepad,
  PlugsConnected,
  CaretDown,
  EnvelopeSimple,
  WhatsappLogo,
  CheckCircle,
  CalendarPlus,
  Lightning,
  UploadSimple,
  ChatCircleText,
  DownloadSimple,
  ArrowsClockwise,
  Trash,
  Flag,
  ChartLineUp,
  Receipt,
  Kanban,
  Export,
  GitMerge,
} from '@phosphor-icons/react';

const ProjectSettingsDialog = lazy(() => import('@/modules/settings/components/ProjectSettingsDialog'));
const ConversionDialog = lazy(() => import('@/modules/conversions/components/ConversionDialog'));
const CsvImportDialog = lazy(() => import('../components/CsvImportDialog'));
const LeadDrawer = lazy(() => import('../components/LeadDrawer'));
const EnrollSequenceModal = lazy(() => import('../components/EnrollSequenceModal'));
const ContactedDialog = lazy(() => import('../components/ContactedDialog'));
const SoftDeleteDialog = lazy(() => import('../components/SoftDeleteDialog'));
const SpamReportDialog = lazy(() => import('../components/SpamReportDialog'));
const ExportDialog = lazy(() => import('@/shared/components/export/ExportDialog'));
const WasapiExportDialog = lazy(() => import('../components/WasapiExportDialog'));
import StatusBadge, { STATUS_LABELS, STATUS_KEYS } from '@/shared/components/ui/StatusBadge';
import QuickStatusChange from '../components/QuickStatusChange';
import ChannelBadge, { CHANNEL_LABELS } from '@/shared/components/ui/ChannelBadge';
import SearchableSelect from '@/shared/components/ui/SearchableSelect';
import MultiProjectPicker from '@/shared/components/ui/MultiProjectPicker';
import DateRangeFilter from '../components/DateRangeFilter';
import LeadFlagBadge from '../components/LeadFlagBadge';
import EmptyState from '@/shared/components/ui/EmptyState';
import LeadsFiltersBar from '../components/LeadsFiltersBar';
import QuickActions from '../components/QuickActions';
import ReminderQuickDialog from '../components/ReminderQuickDialog';
import BulkActionBar from '../components/BulkActionBar';
import usePermission from '@/shared/hooks/usePermission';
import { getLeadPriority, getPriorityStyle } from '../lib/leadPriority';
import { getLeadExportColumns } from '../lib/leadFormat';
import {
  getInitials,
  getAvatarColor,
  formatRelative,
  formatFecha,
} from '../lib/leadFormat';
import BloquePlegable from '@/shared/components/ui/BloquePlegable';
// El panel de «proximo gestor» se retiro: predecia con el round-robin del CRM
// y quien reparte es Make. Se cambio por el de abajo, que enseña lo que ha
// pasado en vez de lo que va a pasar. El componente viejo sigue en el repo.
import UltimoLeadAsignado from '../components/UltimoLeadAsignado';
import ParaHoyYManana from '@/shared/components/dashboard/ParaHoyYManana';
import { useIdsDelAmbito } from '@/shared/hooks/useAmbito';


function StatPill({ label, value, dot }: { label: string; value: number; dot?: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-muted/40 flex-shrink-0">
      {dot && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />}
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}

type ChipTone = 'default' | 'danger' | 'warning';

function QuickChip({ active, onClick, label, count, tone = 'default' }: { active: boolean; onClick: () => void; label: string; count?: number; tone?: ChipTone }) {
  const toneActive: string = {
    default: 'bg-primary text-white',
    danger: 'bg-destructive text-destructive-foreground',
    warning: 'bg-warning text-warning-foreground',
  }[tone];
  const toneIdleCount: string = {
    default: 'bg-primary/15 text-primary',
    danger: 'bg-destructive-soft text-destructive-soft-foreground',
    warning: 'bg-warning-soft text-warning-soft-foreground',
  }[tone];
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
        active ? toneActive : 'bg-muted text-muted-foreground hover:bg-muted/80'
      }`}
    >
      {label}
      {typeof count === 'number' && count > 0 && (
        <span className={`text-[10px] font-bold rounded-full px-1.5 ${active ? 'bg-white/20' : toneIdleCount}`}>{count}</span>
      )}
    </button>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b animate-pulse">
      <td className="px-5 py-3.5"><div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-full bg-muted" /><div className="w-24 h-4 bg-muted rounded" /></div></td>
      <td className="px-5 py-3.5"><div className="w-32 h-4 bg-muted rounded" /></td>
      <td className="px-5 py-3.5"><div className="w-24 h-4 bg-muted rounded" /></td>
      <td className="px-5 py-3.5"><div className="w-16 h-4 bg-muted rounded" /></td>
      <td className="px-5 py-3.5"><div className="w-20 h-5 bg-muted rounded" /></td>
      <td className="px-5 py-3.5"><div className="w-16 h-4 bg-muted rounded" /></td>
      <td className="px-5 py-3.5"><div className="w-16 h-4 bg-muted rounded" /></td>
      <td className="px-5 py-3.5"><div className="w-20 h-4 bg-muted rounded" /></td>
      <td className="px-5 py-3.5"><div className="ml-auto w-24 h-6 bg-muted rounded" /></td>
    </tr>
  );
}

export default function LeadsPage() {
  // Sube cuando algo mueve la cola del reparto y el panel tiene que releer.
  const [colaSenal, setColaSenal] = useState(0);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermission();
  // Eliminar: admin y superadmin, y desde el 01/10 la gestora con el permiso
  // «leads.delete» (#204) en SUS leads sin venta. El servidor lo vuelve a mirar.
  const puedeEliminar = (l: { responsable_id?: number | null; status?: string }) =>
    user?.role === 'superadmin' || user?.role === 'admin'
    || (can('leads.delete') && l.responsable_id === user?.id && l.status !== 'convertido');
  const {
    leads, stats, total, page, totalPages,
    setPage, search, setSearch,
    filterEstado, setFilterEstado,
    filterSeguimiento, setFilterSeguimiento,
    filterPaso, setFilterPaso,
    filterOrigen, setFilterOrigen,
    filterResponsable, setFilterResponsable,
    filterProducto, setFilterProducto,
    selectedProjectIds, setSelectedProjectIds,
    dateFrom, dateTo, setDateRange,
    sortMode, setSortMode,
    sortDir, setSortDir,
    fetchAllForExport,
    filterDup, setFilterDup,
    filterReincidente, setFilterReincidente,
    loading, error, refetch,
  } = useLeads();

  const { activeProject, projects, activeIssuerId } = useProjectContext();
  /**
   * El ámbito para la cola: un campus, o los de la empresa.
   *
   * `-1` es «todos los proyectos», un valor interno del CRM: mandarlo pediría
   * el proyecto número menos uno. Con una empresa puesta van sus campus, que
   * es lo que el servidor sabe sumar.
   */
  const idsDelAmbito = useIdsDelAmbito();
  const proyectoDeLaCola = activeProject?.id && activeProject.id !== -1 ? activeProject.id : null;
  const campusCsv = !proyectoDeLaCola && activeIssuerId && idsDelAmbito.length
    ? idsDelAmbito.join(',')
    : null;

  // Columna "Proyecto" visible siempre que el usuario tenga >1 proyecto asignado
  // (no solo en modo multi). Util para saber a qué proyecto pertenece cada lead.
  const showProjectColumn = (projects?.length || 0) > 1;
  // Programas del filtro: con proyecto concreto activo, los suyos; en "Todos"
  // solo si el filtro Proyecto tiene EXACTAMENTE un proyecto seleccionado.
  const productsPid = activeProject?.id && activeProject.id > 0
    ? activeProject.id
    : (selectedProjectIds.length === 1 ? selectedProjectIds[0] : null);
  const { products } = useProducts(productsPid);
  const { templates: waTemplates } = useWhatsappTemplates(activeProject?.id);

  // Auto-polling de leads nuevos cada 30s + detección de nuevos por id
  const lastSeenIdsRef = useRef<Set<number>>(new Set());
  const [newCount, setNewCount] = useState(0);
  useEffect(() => {
    // Inicializar set en primera carga
    if (leads.length > 0 && lastSeenIdsRef.current.size === 0) {
      lastSeenIdsRef.current = new Set(leads.map((l) => l.id));
    }
  }, [leads]);
  useEffect(() => {
    if (!activeProject?.id) return;
    const id = setInterval(() => { refetch(); }, 30000);
    return () => clearInterval(id);
  }, [activeProject?.id, refetch]);
  // Detectar nuevos tras cada refetch
  useEffect(() => {
    if (!leads.length || lastSeenIdsRef.current.size === 0) return;
    const seen = lastSeenIdsRef.current;
    const fresh = leads.filter((l) => !seen.has(l.id));
    if (fresh.length > 0) {
      setNewCount((c) => c + fresh.length);
      toast({ title: `${fresh.length} prospecto${fresh.length > 1 ? 's' : ''} nuevo${fresh.length > 1 ? 's' : ''}`, description: fresh[0].nombre });
      fresh.forEach((l) => seen.add(l.id));
    }
  }, [leads]);

  const [formOpen, setFormOpen] = useState(false);
  const [configTab, setConfigTab] = useState(null); // 'campos' | 'webhook' | null
  const [moreOpen, setMoreOpen] = useState(false);
  const [gestores, setGestores] = useState([]);
  const [convertingLead, setConvertingLead] = useState(null);
  const [confirmingContact, setConfirmingContact] = useState(null);
  const [reminderLead, setReminderLead] = useState(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [drawerLeadId, setDrawerLeadId] = useState(null);
  const [enrollLeadId, setEnrollLeadId] = useState(null);
  const [deletingLead, setDeletingLead] = useState<any>(null);
  const [reportingSpamLead, setReportingSpamLead] = useState<any>(null);
  const [exportOpen, setExportOpen] = useState(false);
  // El listado va paginado; el export debe llevarse TODO lo filtrado, así que
  // pedimos todas las filas al backend antes de abrir el diálogo.
  const [exportRows, setExportRows] = useState([]);
  const [exportLoading, setExportLoading] = useState(false);
  // Alcance del export, decidido EN EL DIÁLOGO: qué proyectos y si se respetan
  // los filtros activos ('filtros') o se exporta todo del proyecto ('todos').
  const [expProjectIds, setExpProjectIds] = useState([]);
  const [expScope, setExpScope] = useState('filtros'); // 'filtros' | 'todos'

  // Proyectos elegibles para el export (con nombre).
  const exportableProjects = (projects || []).filter((p) => p.id > 0);

  // Token para evitar que respuestas lentas de un cálculo anterior pisen al
  // último (al cambiar rápido de proyecto/alcance se combinaban datos).
  const exportReqRef = useRef(0);
  async function recomputeExport(projectIds, scope) {
    const myReq = ++exportReqRef.current;
    setExportLoading(true);
    // Sin proyectos elegidos no hay nada que traer.
    if (!projectIds || projectIds.length === 0) {
      setExportRows([]);
      if (exportReqRef.current === myReq) setExportLoading(false);
      return;
    }
    try {
      const ignoreFilters = scope === 'todos';
      const todos = await fetchAllForExport({ projectIds, ignoreFilters });
      if (exportReqRef.current !== myReq) return; // llegó una petición más nueva → descartar
      // Los filtros rápidos son client-side: solo aplican en modo 'filtros'.
      setExportRows(todos);
    } catch (err) {
      if (exportReqRef.current === myReq) toast({ title: 'No se pudo preparar el export', description: err?.message, variant: 'destructive' });
    } finally { if (exportReqRef.current === myReq) setExportLoading(false); }
  }

  async function abrirExport() {
    // Por defecto = lo que estás viendo: proyectos de la vista actual + con filtros.
    const defIds = activeProject?.id && activeProject.id > 0
      ? [activeProject.id]
      : (selectedProjectIds.length > 0 ? selectedProjectIds : exportableProjects.map((p) => p.id));
    setExpProjectIds(defIds);
    setExpScope('filtros');
    setExportOpen(true);
    await recomputeExport(defIds, 'filtros');
  }

  function toggleExportProject(id) {
    const next = expProjectIds.includes(id) ? expProjectIds.filter((x) => x !== id) : [...expProjectIds, id];
    setExpProjectIds(next);
    recomputeExport(next, expScope);
  }
  function setExportScope(scope) {
    setExpScope(scope);
    recomputeExport(expProjectIds, scope);
  }
  const [wasapiOpen, setWasapiOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]); // bulk actions
  const [, setBulkAction] = useState(null); // null | 'reassign' | 'status' | 'export'
  const [bulkLoading, setBulkLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [quickFilter, setQuickFilterState] = useState(searchParams.get('qf') || ''); // '' | 'urgent' | 'overdue' | 'today' | 'no-contact'

  // Filtros rápidos que YA filtran por estado internamente → no se combinan
  // con el filtro "Estado" (se desactiva el otro y se avisa).
  const QF_INCOMPATIBLE_ESTADO = { urgent: 'Necesitan acción hoy', 'no-contact': 'Sin contacto' };

  // Sincronizar filtro con URL para deep-linking desde el Dashboard.
  // BUGFIX: antes hacía setSearchParams({qf}) y BORRABA el resto de filtros de
  // la URL (estado, gestor, fechas, búsqueda...) — por eso "se mezclaban".
  function setQuickFilter(v) {
    setQuickFilterState(v);
    setSelectedIds([]);
    const clearEstado = !!(v && QF_INCOMPATIBLE_ESTADO[v] && filterEstado);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set('qf', v); else next.delete('qf');
      if (clearEstado) next.delete('estado');
      return next;
    }, { replace: true, preventScrollReset: true });
    if (clearEstado) {
      toast({ title: 'Filtro "Estado" desactivado', description: `"${QF_INCOMPATIBLE_ESTADO[v]}" ya filtra por estado — no pueden estar activos a la vez.` });
    }
  }

  // Al fijar "Estado" con un filtro rápido incompatible activo → se apaga el rápido y se avisa.
  function setFilterEstadoSafe(v) {
    if (v && QF_INCOMPATIBLE_ESTADO[quickFilter]) {
      const label = QF_INCOMPATIBLE_ESTADO[quickFilter];
      setQuickFilterState('');
      setSearchParams((prev) => { const n = new URLSearchParams(prev); n.delete('qf'); return n; }, { replace: true, preventScrollReset: true });
      toast({ title: `Filtro rápido "${label}" desactivado`, description: 'No puede estar activo junto al filtro "Estado".' });
    }
    setFilterEstado(v);
  }

  // CRM-147: quick-add via ?new=1 (lo dispara el FAB de atajos).
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setFormOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);


  // El filtro rapido ya no se aplica aqui: lo hace el servidor, y el export
  // pide con `qf` puesto. Habia una copia entera de la logica en este sitio;
  // dos definiciones de lo mismo acaban diciendo cosas distintas (#132).

  // La lista YA viene filtrada del servidor (#132).
  //
  // Aqui habia un `useMemo` que filtraba `leads` —una pagina de 20 de `total`—
  // asi que «mañana» enseñaba los de mañana QUE CAYERAN en esa pagina. Con 300
  // prospectos y doce para mañana podian salir dos.
  //
  // Se queda el nombre para no tocar los quince sitios que lo usan.
  const filteredLeads = leads;

  // Los contadores de las pestañas, del servidor (#132).
  //
  // Se contaban sobre la pagina, igual que el filtro, asi que la pestaña decia
  // «3» y en la base habia doce. Y `urgent` era `overdue + today + noContact`,
  // que suma DOS VECES a quien esta vencido y ademas sin contactar; el servidor
  // lo resuelve con un OR, que es lo que significa «urgente».
  const [quickCounts, setQuickCounts] = useState({
    overdue: 0, today: 0, tomorrow: 0, week: 0, noReminder: 0, noContact: 0, urgent: 0,
    // `null` mientras no exista la migracion 147: la pestaña «Por validar» no
    // se pinta, en vez de enseñar un 0 que parece «ya lo tienes todo hecho».
    sinRevisar: null as number | null,
  });
  useEffect(() => {
    const pidParam = activeProject?.id && activeProject.id > 0 ? `?projectId=${activeProject.id}` : '';
    client.get(`/leads/quick-counts${pidParam}`)
      .then((res) => {
        if (!res.success) return;
        const d = res.data || {};
        setQuickCounts((prev) => ({
          ...prev,
          overdue: d.overdue || 0, today: d.today || 0, tomorrow: d.tomorrow || 0,
          week: d.week || 0, noReminder: d.no_reminder || 0, noContact: d.no_contact || 0,
          urgent: d.urgent || 0,
          sinRevisar: prev.sinRevisar,
        }));
      })
      .catch(() => { /* las pestañas se quedan a cero, la lista sigue */ });

    // El repaso de fin de mes va aparte: depende de una tabla que puede no
    // estar, y no puede tumbar los otros siete contadores si falta.
    client.get(`/leads/revision${pidParam}`)
      .then((res) => {
        const d = res?.data;
        setQuickCounts((prev) => ({
          ...prev,
          sinRevisar: d?.disponible ? (d.pendientes || 0) : null,
        }));
      })
      .catch(() => { /* sin repaso: la pestaña no aparece */ });
    // `leads` en las dependencias a proposito: al cambiar de estado un prospecto
    // los numeros tienen que moverse, y esa es la señal de que algo cambio.
  }, [activeProject?.id, leads]);

  // Cargar lista de responsables para el filtro (solo admin/superadmin).
  // Con un proyecto concreto activo, solo los gestores de ESE proyecto;
  // en "Todos los proyectos" (id -1) sí se listan todos.
  useEffect(() => {
    if (user?.role !== 'superadmin' && user?.role !== 'admin') return;
    const pidParam = activeProject?.id && activeProject.id > 0 ? `&projectId=${activeProject.id}` : '';
    client.get(`/users?limit=100${pidParam}`)
      .then((res) => {
        if (res.success) setGestores(res.data || []);
      })
      .catch(() => toast({ title: 'Error al cargar gestores', variant: 'destructive' }));
  }, [user?.role, activeProject?.id]);

  function handleMarkContacted(lead) {
    setConfirmingContact(lead);
  }

  function handleConvert(lead) {
    setConvertingLead(lead);
  }

  function handleCreateReminder(lead) {
    setReminderLead(lead);
  }

  // Bulk actions ----------------------------------------------
  function toggleSelected(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function toggleSelectAll() {
    if (selectedIds.length === filteredLeads.length && filteredLeads.length > 0) setSelectedIds([]);
    else setSelectedIds(filteredLeads.map(l => l.id));
  }
  function clearSelection() {
    setSelectedIds([]);
    setBulkAction(null);
  }

  async function handleBulkStatusChange(newStatus) {
    setBulkLoading(true);
    let ok = 0, fail = 0;
    for (const id of selectedIds) {
      try {
        await client.patch(`/leads/${id}/status`, { status: newStatus, motivo: `Cambio masivo desde tabla` });
        ok++;
      } catch { fail++; }
    }
    setBulkLoading(false);
    setBulkAction(null);
    setSelectedIds([]);
    toast({ title: `${ok} actualizados`, description: fail > 0 ? `${fail} con error` : null });
    refetch();
  }

  async function handleBulkReassign(gestorId) {
    setBulkLoading(true);
    let ok = 0, fail = 0;
    for (const id of selectedIds) {
      try {
        await client.patch(`/leads/${id}/reassign`, { responsable_id: gestorId });
        ok++;
      } catch { fail++; }
    }
    setBulkLoading(false);
    setBulkAction(null);
    setSelectedIds([]);
    const gestor = gestores.find(g => g.id === gestorId);
    toast({ title: `${ok} reasignados a ${gestor?.nombre || ''}`, description: fail > 0 ? `${fail} con error` : null });
    refetch();
  }

  function handleBulkExportCsv() {
    const selected = filteredLeads.filter(l => selectedIds.includes(l.id));
    const headers = ['nombre', 'email', 'telefono', 'estado', 'origen', 'gestor', 'fecha'];
    const rows = selected.map(l => [
      l.nombre, l.email, l.telefono || '', l.estado || '',
      l.origen || l.canal_detectado || '', l.responsable_nombre || '',
      (l.created_at || '').slice(0, 10),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prospectos_${activeProject?.slug || 'proyecto'}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 100);
    toast({ title: `${selected.length} prospectos exportados` });
  }

/**
   * Apunta el contacto a TODOS los seleccionados.
   *
   * Diego, 23/09: las opciones del envio masivo tambien aqui. Se va uno a uno
   * contra el servidor --no hay endpoint de interacciones en bloque-- y se
   * cuenta lo que sale bien y lo que no: con cuarenta personas, un «hecho» a
   * secas no se puede comprobar a ojo.
   */
  async function marcarContactadosEnBloque() {
    if (!selectedIds.length) return;
    setBulkLoading(true);
    let bien = 0;
    let mal = 0;
    for (const id of selectedIds) {
      try {
        await client.post(`/leads/${id}/interactions`, {
          tipo: 'whatsapp',
          nota: 'Contacto en bloque',
          fecha: new Date().toISOString(),
        });
        bien += 1;
      } catch { mal += 1; }
    }
    setBulkLoading(false);
    clearSelection();
    refetch?.();
    toast(mal === 0
      ? { title: `${bien} contactos apuntados` }
      : {
        title: `${bien} apuntados, ${mal} no`,
        description: 'Los que fallaron siguen sin contacto apuntado.',
        variant: 'destructive',
      });
  }

  /** Los telefonos o los correos de los seleccionados, al portapapeles. */
  async function copiarContactosEnBloque(que: 'telefono' | 'email') {
    const elegidos = filteredLeads.filter((l) => selectedIds.includes(l.id));
    const datos = elegidos
      .map((l) => (que === 'telefono' ? l.telefono : l.email))
      .filter(Boolean) as string[];
    if (!datos.length) {
      toast({
        title: que === 'telefono' ? 'Ninguno tiene teléfono' : 'Ninguno tiene correo',
        variant: 'destructive',
      });
      return;
    }
    const { copyToClipboard } = await import('@/shared/lib/clipboard');
    const ok = await copyToClipboard(datos.join('\n'));
    toast(ok
      ? {
        title: `${datos.length} ${que === 'telefono' ? 'teléfonos' : 'correos'} copiados`,
        // Se dice cuantos se quedan fuera: pegar 38 cuando se marcaron 40 y no
        // enterarse es quedarse con dos personas sin avisar.
        description: datos.length < elegidos.length
          ? `${elegidos.length - datos.length} de los seleccionados no tienen ese dato.`
          : undefined,
      }
      : { title: 'No se ha podido copiar', variant: 'destructive' });
  }

  /**
   * Los pasos del proceso, para poder filtrar por ellos con su nombre.
   *
   * Se piden al servidor y no se escriben aquí: cada campus puede renombrarlos
   * desde «Proceso comercial», y un filtro que diga «Día 2» cuando la pantalla
   * de pasos dice «Prueba social» no lo entiende nadie.
   */
  const [pasosDelProceso, setPasosDelProceso] = useState<Array<{ clave: string; nombre: string; orden: number }>>([]);
  useEffect(() => {
    const p = new URLSearchParams();
    if (activeIssuerId) p.set('issuerId', String(activeIssuerId));
    else if (activeProject?.id && activeProject.id !== -1) p.set('projectId', String(activeProject.id));
    else { setPasosDelProceso([]); return; }
    let vivo = true;
    client.get(`/proceso/pasos?${p.toString()}`)
      .then((r: any) => {
        if (!vivo) return;
        const filas = r?.success ? (r.data || []) : [];
        setPasosDelProceso(filas.map((x: any) => ({ clave: x.clave, nombre: x.nombre, orden: x.orden })));
      })
      // Sin proceso montado no hay filtro, y ya está: no es un error que enseñar.
      .catch(() => { if (vivo) setPasosDelProceso([]); });
    return () => { vivo = false; };
  }, [activeProject?.id, activeIssuerId]);

  // Auto-log de interaccion al usar acciones rapidas (WhatsApp/Email)
  async function handleLogInteraction(lead, tipo) {
    try {
      await client.post(`/leads/${lead.id}/interactions`, {
        tipo,
        nota: tipo === 'whatsapp' ? 'Contacto por WhatsApp (acceso rápido)' : 'Email enviado (acceso rápido)',
        fecha: new Date().toISOString(),
      });
      toast({ title: 'Interacción registrada', description: `${tipo === 'whatsapp' ? 'WhatsApp' : 'Email'} con ${lead.nombre}` });
      refetch();
    } catch (e) {
      // Antes esto se callaba: «silent fail, el link igual abre». Pero el link
      // abriendo es justo lo que hace que no se note — la gestora habla con la
      // persona convencida de que queda registrado, y en la ficha no hay nada.
      // Luego alguien mira el historial y parece que nadie la contacto.
      //
      // No se bloquea a nadie: el chat se abre igual. Solo se dice que ese
      // contacto NO ha quedado apuntado, para que se apunte a mano.
      toast({
        title: 'El contacto no ha quedado registrado',
        description: 'El chat se abre igual, pero apúntalo a mano en la ficha: '
          + ((e as Error)?.message || 'no se pudo guardar la interacción'),
        variant: 'destructive',
      });
    }
  }

  async function handleConversionCreated() {
    const lead = convertingLead;
    if (!lead) return;
    // Cambiar status a convertido si no lo esta ya
    if (lead.estado !== 'convertido') {
      try {
        await client.patch(`/leads/${lead.id}/status`, { status: 'convertido', motivo: 'Conversion registrada desde lista' });
      } catch {}
    }
    setConvertingLead(null);
    toast({ title: 'Conversión registrada', description: lead.nombre });
    await refetch();
  }

  async function handleCreateLead(data) {
    // En modo ALL el dialog pasa _project_id explicitamente. En modo
    // proyecto activo, usamos activeProject.id.
    const projectId = data._project_id || activeProject?.id;
    if (!projectId || projectId === -1) {
      toast({ title: 'Error', description: 'Selecciona un proyecto primero', variant: 'destructive' });
      return;
    }

    // Resolver producto_interes_id a partir del nombre
    let productoInteresId = null;
    if (data.producto_interes) {
      const prod = products.find(p => p.nombre === data.producto_interes);
      productoInteresId = prod?.id || null;
    }

    // DEBUG: ver qué origen llega del form. Quitar tras validar.
    // eslint-disable-next-line no-console
    console.log('[handleCreateLead] data.origen recibido:', data.origen, 'tipo:', typeof data.origen);
    try {
      const res = await client.post('/leads', {
        project_id: projectId,
        nombre: data.nombre,
        email: data.email,
        telefono: data.telefono || '',
        // El usuario de WhatsApp tambien va: hay gente que solo da eso.
        //
        // Faltaba en la peticion y el servidor rechazaba el lead con «hace
        // falta al menos una forma de contacto», aunque la gestora lo hubiera
        // escrito. El formulario lo recogia y lo perdia aqui, al armar el envio.
        whatsapp_usuario: data.whatsapp_usuario || null,
        producto_interes_id: productoInteresId,
        canal: data.origen || 'directo',
        notas: data.notas || '',
        custom_fields: data.custom_fields || undefined,
      });

      if (res.success) {
        const { reincidente, duplicado } = res.data;
        let desc = 'Lead creado y asignado por round-robin';
        if (reincidente) desc = 'Prospecto REINCIDENTE detectado (mismo producto)';
        else if (duplicado) desc = 'Prospecto duplicado detectado en este proyecto';

        toast({ title: 'Lead creado', description: desc });
        await refetch();
        // Un alta mueve la cola, así que el panel de «a quién le toca» queda
        // viejo justo en el momento en que alguien lo está mirando.
        setColaSenal((n) => n + 1);
      }
    } catch (err) {
      toast({
        title: 'Error al crear lead',
        description: err?.data?.error || err?.message || 'Error desconocido',
        variant: 'destructive',
      });
      throw err;
    }
  }

  // Generar array de paginas visibles (max 5 en torno a la actual)
  function getVisiblePages() {
    const pages = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  return (
    <div className="space-y-6">
      <LeadFormDialog open={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleCreateLead} lead={null} />
      {configTab && activeProject && (
        <Suspense fallback={null}>
          <ProjectSettingsDialog
            project={activeProject}
            initialTab={configTab}
            onClose={() => setConfigTab(null)}
            onSaved={() => { /* refrescado por contexto */ }}
          />
        </Suspense>
      )}

      {/* A quién le toca el siguiente (#11). Va arriba porque es lo que se mira
          de pasada, no algo que se busca: enterarse de que te toca a ti es
          justo lo que hoy no pasa hasta que el lead ya está asignado. */}
      {/* Lo que ha recibido cada gestora de verdad (#11).
          Solo para quien manda: es una vista de como esta repartiendo Make
          entre todo el equipo, no algo que una gestora necesite de sus
          compañeras. */}
      {(user?.role === 'admin' || user?.role === 'superadmin') && (
        <UltimoLeadAsignado projectId={activeProject?.id} issuerId={activeIssuerId} />
      )}

      {/* Header compacto: titulo + acciones en la misma fila, todo h-9 */}
      <PageHeader
        title="Prospectos"
        subtitle="Explora y gestiona tus clientes potenciales"
        actions={can('leads.create') ? (
          <button
            onClick={() => setFormOpen(true)}
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-md bg-primary text-primary-foreground text-xs sm:text-sm font-semibold hover:bg-primary/90 transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
          >
            <Plus size={14} weight="bold" />
            <span className="hidden sm:inline">Nuevo prospecto</span>
            <span className="sm:hidden">Nuevo</span>
          </button>
        ) : null}
      />

      {/* Cómo va quien está mirando: su puesto en ventas y su tasa de
          conversión del mes. Va aquí y no escondido en Informes porque es la
          pantalla donde pasa el día. */}
      <ComoVoy compacto />

      {/* LA COLA DEL DÍA, AQUÍ TAMBIÉN. Diego, 23/09: «la cola del día debe
          de estar en prospectos también con atajos y todo».

          Es el mismo bloque del dashboard, no una copia: los cuatro números
          salen de `GET /proceso/cola/resumen`, que ya recorta por rol. Contar
          aquí por mi cuenta sería una segunda contabilidad de la misma cola, y
          el día que discrepen nadie sabría cuál creer.

          Cada número abre la cola con ese tramo ya puesto, y debajo van los
          atajos a las tres pantallas del proceso. */}
      <div className="space-y-2">
        <ParaHoyYManana projectId={proyectoDeLaCola} projectIds={campusCsv} />
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/prospectos/cola"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-normal font-semibold hover:bg-muted"
          >
            <ListChecks size={14} weight="bold" className="text-primary" />
            La cola del día
          </Link>
          <Link
            to="/prospectos/seguimiento"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-normal font-semibold hover:bg-muted"
          >
            <ArrowCounterClockwise size={14} weight="bold" className="text-primary" />
            Seguimiento de fin de mes
          </Link>
          <Link
            to="/prospectos/proceso"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-normal font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Gear size={14} weight="bold" />
            Proceso comercial
          </Link>
        </div>
      </div>


      {/* Barra de herramientas de la pantalla. El titulo ya no vive aqui: esta
          arriba, en la cabecera del marco, igual que en todas las demas. */}
      <div className="flex flex-wrap items-center gap-1.5">
          {/* Aqui habia un «Refrescar». Hacia lo mismo que el «Actualizar» de
              la fila de filtros —dos botones de recargar en la misma pantalla,
              #125— y lo unico que aportaba de mas, el aviso de cuantos han
              entrado, se ha mudado alli. */}
          {/* Aqui habia un «Lista / Kanban» y un «Audiencias» que llevaban a
              las mismas tres pantallas que las pestanas de arriba. Dos sitios
              para lo mismo, uno encima del otro. */}
          {filteredLeads.length > 0 && can('leads.export') && (
            <button
              onClick={abrirExport}
              disabled={exportLoading}
              title="Exportar (Excel/CSV/JSON) — todos los resultados filtrados"
              aria-label="Exportar"
              className="h-9 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-md border border-border bg-card text-xs sm:text-sm font-medium hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <DownloadSimple size={14} weight="bold" />
              <span className="hidden md:inline">{exportLoading ? 'Preparando…' : 'Exportar'}</span>
            </button>
          )}
          {/* Y aqui un «Reportes», que llevaba al mismo sitio que el acceso
              «Reportes» del bloque de arriba. Se queda el del bloque. */}
          <button
            onClick={() => setWasapiOpen(true)}
            title="Descargar plantilla Wasapi (CSV bulk WhatsApp)"
            aria-label="Wasapi"
            className="h-9 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-md border border-border bg-card text-xs sm:text-sm font-medium hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <WhatsappLogo size={14} weight="bold" />
            <span className="hidden md:inline">Wasapi</span>
          </button>
          {(user?.role === 'admin' || user?.role === 'superadmin') && (
            <div className="relative">
              <button
                onClick={() => setMoreOpen(!moreOpen)}
                className="h-9 inline-flex items-center gap-1.5 px-2.5 sm:px-3 rounded-md border border-border bg-card text-xs sm:text-sm font-medium hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                aria-expanded={moreOpen}
              >
                <span className="hidden md:inline">Configurar</span>
                <span className="md:hidden">Más</span>
                <CaretDown size={11} weight="bold" />
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-popover z-30 w-max py-1">
                  {can('leads.create') && (
                  <button
                    onClick={() => { setCsvImportOpen(true); setMoreOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2 whitespace-nowrap"
                  >
                    <UploadSimple size={13} weight="regular" className="flex-shrink-0" /> Importar desde CSV
                  </button>
                  )}
                  <div className="my-1 border-t border-border" />
                  <button
                    onClick={() => { setConfigTab('campos'); setMoreOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2 whitespace-nowrap"
                  >
                    <Notepad size={13} weight="regular" className="flex-shrink-0" /> Campos custom de prospectos
                  </button>
                  <button
                    onClick={() => { setConfigTab('webhook'); setMoreOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2 whitespace-nowrap"
                  >
                    <PlugsConnected size={13} weight="regular" className="flex-shrink-0" /> Webhook de captura
                  </button>
                  <button
                    onClick={() => { navigate('/whatsapp/plantillas'); setMoreOpen(false); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center gap-2 whitespace-nowrap"
                  >
                    <ChatCircleText size={13} weight="regular" className="flex-shrink-0" /> Plantillas de WhatsApp
                  </button>
                </div>
              )}
            </div>
          )}
      </div>

      {/* Los tres bloques de arriba, como la maqueta: que pasa, que toca hacer,
          y a donde se va desde aqui. Los numeros ya venian del servidor; solo
          se usaban para unas pildoras dentro del desplegable de filtros, donde
          no los ve nadie.

          Las proporciones son las de la maqueta: la salud manda porque es lo
          que mas se mira, y los accesos son la columna estrecha. */}
      <CifrasProspectos
        stats={stats}
        urgencias={quickCounts}
        filtroRapido={quickFilter}
        onFiltroRapido={(clave) => setQuickFilter(clave || '')}
      />

      {/* Plegable y con memoria (#125): «esta super bien, pero que se pueda
          desplegar». Ocupa la primera pantalla entera y empuja la tabla abajo
          del todo — a quien viene a mirar la tabla le sobra, y a quien viene a
          organizarse el dia le hace falta. */}
      <BloquePlegable
        clave="prospectos-resumen"
        titulo="Resumen del dia"
        resumen={
          quickCounts.urgent > 0
            ? `${quickCounts.urgent} piden atención`
            : 'Nada urgente'
        }
      >
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)_minmax(260px,0.7fr)]">
        <SaludComercial
          stats={stats}
          onFiltroEstado={setFilterEstadoSafe}
          onVerPipeline={() => navigate('/prospectos/pipeline')}
        />
        <SiguientesAcciones
          leads={leads}
          // El PANEL, no la ficha entera. Diego, 24/09: «y abra el panel, no la
          // ficha completa». Desde aquí se entra a ver qué toca con alguien y
          // se vuelve a la lista; irse a otra pantalla obliga a volver atrás
          // por cada persona.
          onAbrir={(id) => setDrawerLeadId(id)}
          // «Esto debe funcionar directamente, tuve que tocarlo para verlo.»
          // Llevaba a «Necesitan acción hoy», que es UN tramo, y los demás
          // estaban escondidos dentro del panel de Filtros. Ahora quita el
          // filtro --se ven todos, los vencidos arriba-- y baja a la lista,
          // que ya lleva los tramos a la vista.
          onVerTodos={() => {
            setQuickFilter('');
            document.getElementById('lista-de-prospectos')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        />
        <AccesosClave
          accesos={[
            { label: 'Pipeline', detail: 'Arrastrar por estados', icon: Kanban, to: '/prospectos/pipeline' },
            { label: 'Audiencias', detail: 'Exportar a Meta y Google', icon: Export, to: '/prospectos/audiencias' },
            { label: 'Duplicados', detail: 'Repetidos por webhook', icon: GitMerge, to: '/prospectos/revision-duplicados' },
            { label: 'Reportes', detail: 'Numeros descargables', icon: ChartLineUp, to: '/informes' },
          ]}
        />
      </section>
      </BloquePlegable>

      {/* Arriba solo el buscador. Estado, canal y orden se han ido DENTRO del
          desplegable «Filtros» —Diego, 23/09: «mete esos filtros allí»—, con
          los otros siete. Un solo sitio donde mirar; lo que haya puesto lo
          canta el número del botón y las píldoras de al lado. */}
      <BarraFiltros
        busqueda={search}
        onBusqueda={setSearch}
        placeholder="Buscar por nombre, email o teléfono"
        desplegables={[]}
        hayFiltros={!!(search || filterEstado || filterOrigen || filterResponsable || filterProducto || dateFrom || dateTo || filterDup || filterReincidente || quickFilter)}
        onLimpiar={() => {
          setSearch('');
          setFilterEstado('');
          setFilterOrigen('');
          setFilterResponsable('');
          setFilterProducto('');
          setDateRange('', '');
          setFilterDup(false);
          setFilterReincidente(false);
          setQuickFilter('');
        }}
        nuevos={newCount}
        onActualizar={() => { setNewCount(0); refetch(); }}
        actualizando={loading}
      />

      {/* Lo que no cabe arriba: el resto de filtros, las píldoras de lo que está
          puesto ahora mismo, y «Asignar pendientes». */}
      <LeadsFiltersBar
        activeProject={activeProject}
        projects={projects}
        selectedProjectIds={selectedProjectIds}
        setSelectedProjectIds={setSelectedProjectIds}
        gestores={gestores}
        products={products}
        user={user}
        search={search} setSearch={setSearch}
        filterEstado={filterEstado} setFilterEstado={setFilterEstadoSafe}
        filterSeguimiento={filterSeguimiento} setFilterSeguimiento={setFilterSeguimiento}
        filterPaso={filterPaso} setFilterPaso={setFilterPaso}
        pasosDelProceso={pasosDelProceso}
        filterOrigen={filterOrigen} setFilterOrigen={setFilterOrigen}
        filterResponsable={filterResponsable} setFilterResponsable={setFilterResponsable}
        filterProducto={filterProducto} setFilterProducto={setFilterProducto}
        dateFrom={dateFrom} dateTo={dateTo} setDateRange={setDateRange}
        sortMode={sortMode} setSortMode={setSortMode}
        sortDir={sortDir} setSortDir={setSortDir}
        quickFilter={quickFilter} setQuickFilter={setQuickFilter}
        quickCounts={quickCounts}
        filterDup={filterDup} setFilterDup={setFilterDup}
        filterReincidente={filterReincidente} setFilterReincidente={setFilterReincidente}
        stats={stats}
        leadsCount={leads.length}
        filteredCount={filteredLeads.length}
        onAssignPending={async () => {
          if (!activeProject?.id || activeProject.id < 0) return;
          try {
            const res = await client.post(`/leads/reassign-pending?projectId=${activeProject.id}`);
            if (res.success) {
              const d = res.data as { reassigned: number; reason?: string };
              if (d.reason === 'NO_ACTIVE_GESTORES') {
                toast({ title: 'No hay gestores activos en este proyecto', description: 'Crea usuarios con rol "gestor" o "admin" y asígnalos al proyecto.', variant: 'destructive' });
              } else {
                toast({ title: `${d.reassigned} prospecto${d.reassigned !== 1 ? 's' : ''} asignado${d.reassigned !== 1 ? 's' : ''} equitativamente` });
                refetch?.();
              }
            }
          } catch (err: any) {
            toast({ title: 'Error', description: err?.message, variant: 'destructive' });
          }
        }}
      />

      {/* Error state */}
      {error && (
        <div className="bg-destructive-soft border border-destructive/30 rounded-lg p-6 text-center">
          <WarningCircle size={32} className="text-destructive mx-auto mb-2" weight="regular" />
          <p className="text-sm text-destructive font-medium">{error}</p>
        </div>
      )}

      {/* LOS TRAMOS, A LA VISTA.
          Estos cuatro botones existían, pero vivían dentro del panel «Filtros»,
          plegado. Diego, 24/09: «esto debe funcionar directamente, tuve que
          tocarlo para verlo [...] sí o sí mostrar todos y atrasados, con
          filtros hoy, mañana, vencidos». Un filtro que hay que descubrir no lo
          usa nadie, y este es el que ordena la mañana. Siguen estando también
          dentro del panel, con el resto: aquí se sacan los que se pulsan a
          diario, no se mudan. */}
      <div id="lista-de-prospectos" className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">
          Cuándo toca
        </span>
        {([
          ['', 'Todos', undefined],
          ['overdue', 'Vencidos', quickCounts?.overdue],
          ['today', 'Hoy', quickCounts?.today],
          ['tomorrow', 'Mañana', quickCounts?.tomorrow],
        ] as Array<[string, string, number | undefined]>).map(([valor, texto, cuantos]) => (
          <button
            key={valor || 'todos'}
            type="button"
            onClick={() => setQuickFilter(valor)}
            aria-pressed={quickFilter === valor}
            className={'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors '
              + (quickFilter === valor
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card hover:bg-muted')}
          >
            {texto}
            {typeof cuantos === 'number' && cuantos > 0 && (
              <span className={'tabular-nums text-[11px] ' + (quickFilter === valor ? 'opacity-80' : 'text-muted-foreground')}>
                {cuantos}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-card rounded-lg border border-border">
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/60 border-b sticky top-0 z-10">
              <tr>
                <th className="px-5 py-2.5 text-left text-xs text-muted-foreground">Nombre</th>
                <th className="px-5 py-2.5 text-left text-xs text-muted-foreground">Teléfono</th>
                <th className="px-5 py-2.5 text-left text-xs text-muted-foreground">Programa</th>
                <th className="px-5 py-2.5 text-left text-xs text-muted-foreground">Valor</th>
                {showProjectColumn && (
                  <th className="px-5 py-2.5 text-left text-xs text-muted-foreground">Proyecto</th>
                )}
                <th className="px-5 py-2.5 text-left text-xs text-muted-foreground">Origen</th>
                <th className="px-5 py-2.5 text-left text-xs text-muted-foreground">Estado</th>
                <th className="px-5 py-2.5 text-left text-xs text-muted-foreground">Recibido</th>
                <th className="px-5 py-2.5 text-left text-xs text-muted-foreground">Último contacto</th>
                <th className="px-5 py-2.5 text-left text-xs text-muted-foreground">Próximo</th>
                <th className="px-5 py-2.5 text-left text-xs text-muted-foreground">Gestor</th>
                <th className="px-5 py-2.5 text-right text-xs text-muted-foreground pr-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && leads.length === 0 && (
                <>
                  {[1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)}
                </>
              )}
              {filteredLeads.map((lead) => {
                const priority = getLeadPriority(lead);
                const pStyle = getPriorityStyle(priority);
                // Resaltado para leads pendientes de primer contacto (default tras webhook
                // o cuando un seguimiento se vence sin contactar). Hace que la fila
                // "salte a la vista" en la tabla sin tapar el color de prioridad.
                const isPorContactar = lead.estado === 'por_contactar' || lead.status === 'por_contactar';
                return (
                <tr
                  key={lead.id}
                  onClick={() => setDrawerLeadId(lead.id)}
                  title={isPorContactar ? 'Por contactar — pendiente de primer contacto' : `Prioridad: ${pStyle.label}`}
                  className={`border-b last:border-0 border-l-4 ${pStyle.borderClass} ${pStyle.rowBgClass} hover:bg-muted/50 transition-colors cursor-pointer ${isPorContactar ? 'bg-warning-soft ring-1 ring-warning/40 dark:ring-warning/40' : ''}`}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold ${getAvatarColor(lead.id)}`}>
                        {getInitials(lead.nombre)}
                      </div>
                      <span className="font-semibold">{lead.nombre}</span>
                      {lead.reincidente && <LeadFlagBadge kind="reincidente" />}
                      {lead.es_propuesto && <LeadFlagBadge kind="propuesto" />}
                      {lead.has_pending_spam_report && user?.role === 'superadmin' && <LeadFlagBadge kind="spam_pending" />}
                      {!lead.reincidente && lead.lead_duplicado_de && <LeadFlagBadge kind="duplicado" />}
                      {lead.estado === 'contactado' && !lead.last_interaction_at && <LeadFlagBadge kind="sin_interaccion" />}
                      {lead.dias_inactivo != null &&
                       lead.dias_alerta_inactividad != null &&
                       lead.dias_inactivo > lead.dias_alerta_inactividad &&
                       !['convertido', 'no_interesado'].includes(lead.estado) && (
                        <LeadFlagBadge kind="inactivo" daysInactive={lead.dias_inactivo} />
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground whitespace-nowrap">{lead.telefono || <span className="text-muted-foreground/50">—</span>}</td>
                  <td className="px-5 py-3.5 text-xs">
                    {lead.producto_interes ? (
                      <span className="inline-block px-2 py-1 bg-primary/10 text-primary rounded font-medium max-w-[260px] whitespace-normal leading-snug" title={lead.producto_interes}>
                        {lead.producto_interes.length > 90 ? lead.producto_interes.slice(0, 88) + '…' : lead.producto_interes}
                      </span>
                    ) : lead.landing_url ? (
                      (() => {
                        // Mostrar el último segmento legible de la URL como "origen"
                        // ej: https://psikoaprende.com/contacto/ → "página de contacto"
                        let label = 'origen web';
                        try {
                          const path = new URL(lead.landing_url).pathname.replace(/\/$/, '').split('/').filter(Boolean);
                          const last = path[path.length - 1] || 'home';
                          // Limpiar: convertir guiones a espacios + capitalizar primera letra
                          label = `Desde: ${last.replace(/-/g, ' ').replace(/^(.)/, (c) => c.toUpperCase())}`;
                        } catch { /* mantener fallback */ }

  return (
                          <span className="inline-block px-2 py-0.5 bg-muted text-muted-foreground rounded font-medium italic" title={lead.landing_url}>
                            {label.length > 40 ? label.slice(0, 38) + '…' : label}
                          </span>
                        );
                      })()
                    ) : (
                      <span className="text-muted-foreground italic">Por definir</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-xs">
                    {lead.valor_oportunidad === 'alto' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-semibold bg-success-soft text-success-soft-foreground" title="Producto de valor alto">
                        <span className="w-1.5 h-1.5 rounded-full bg-success" />Alto
                      </span>
                    )}
                    {lead.valor_oportunidad === 'medio' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded font-medium bg-warning-soft text-warning-soft-foreground" title="Producto de valor medio">
                        <span className="w-1.5 h-1.5 rounded-full bg-warning" />Medio
                      </span>
                    )}
                    {lead.valor_oportunidad === 'bajo' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-muted-foreground bg-muted" title="Producto de valor bajo">
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" />Bajo
                      </span>
                    )}
                    {!lead.valor_oportunidad && <span className="text-muted-foreground/60">—</span>}
                  </td>
                  {showProjectColumn && (
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">{lead.proyecto_nombre || '—'}</td>
                  )}
                  <td className="px-5 py-3.5">
                    <ChannelBadge channel={lead.origen} />
                  </td>
                  <td className="px-5 py-3.5">
                    <QuickStatusChange
                      leadId={lead.id}
                      currentStatus={lead.estado}
                      responsableId={lead.responsable_id}
                      onChanged={() => refetch?.()}
                    />
                  </td>
                  <td className="px-5 py-3.5 text-xs">
                    {lead.created_at ? (
                      <div className="flex flex-col leading-tight">
                        <span className="text-foreground">{new Date(lead.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                        <span className="text-muted-foreground text-[11px]">{new Date(lead.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ) : <span className="text-muted-foreground/60">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground text-xs">
                    {lead.last_interaction_at ? formatFecha(lead.last_interaction_at) : <span className="text-muted-foreground/60">Sin contacto</span>}
                  </td>
                  <td className="px-5 py-3.5 text-xs">
                    {lead.next_reminder_at ? (
                      <span className={(new Date(lead.next_reminder_at) < new Date()) ? 'text-destructive font-medium' : 'text-foreground'}>
                        {formatRelative(lead.next_reminder_at, { future: true })}
                      </span>
                    ) : <span className="text-muted-foreground/60">—</span>}
                  </td>
                  <td className="px-5 py-3.5 text-muted-foreground">{lead.responsable_nombre || lead.gestor || 'Sin asignar'}</td>
                  <td className="px-5 py-3.5 text-right pr-3">
                    <QuickActions lead={lead} onMarkContacted={handleMarkContacted} onConvert={handleConvert} onLogInteraction={handleLogInteraction} onCreateReminder={handleCreateReminder} onEnrollSequence={(l) => setEnrollLeadId(l.id)} onSoftDelete={puedeEliminar(lead) ? (l) => setDeletingLead(l) : undefined} onReportSpam={(user?.role === 'superadmin' || user?.role === 'admin') ? (l) => setReportingSpamLead(l) : undefined} templates={waTemplates} projectName={activeProject?.nombre} onEditTemplates={() => navigate('/whatsapp/plantillas')} />
                  </td>
                </tr>
                );
              })}
              {!loading && filteredLeads.length === 0 && !error && (
                <tr>
                  <td colSpan={showProjectColumn ? 13 : 12} className="px-5">
                    <EmptyState
                      icon={Users}
                      title={
                        leads.length === 0
                          ? 'No se encontraron prospectos'
                          : `Sin resultados en esta página para el filtro "${quickFilter || ''}"`
                      }
                      description={
                        leads.length === 0
                          ? 'Ajusta los filtros o crea un nuevo prospecto manualmente.'
                          : `Hay ${leads.length} leads cargados pero ninguno coincide con el filtro. Cambia el filtro o pasa a la siguiente página de resultados.`
                      }
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden divide-y">
          {loading && leads.length === 0 && (
            <div className="p-8 text-center">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
            </div>
          )}
          {filteredLeads.map((lead) => (
            <div
              key={lead.id}
              onClick={() => setDrawerLeadId(lead.id)}
              className="p-4 space-y-2.5 cursor-pointer active:bg-muted/50 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${getAvatarColor(lead.id)}`}>
                    {getInitials(lead.nombre)}
                  </div>
                  <span className="text-[13px] font-semibold truncate">{lead.nombre}</span>
                </div>
                <StatusBadge status={lead.estado} />
              </div>
              <p className="text-[13px] text-muted-foreground truncate">{lead.email}</p>
              <div className="flex items-center gap-2 flex-wrap text-[11px]">
                <ChannelBadge channel={lead.origen} />
                {lead.last_interaction_at && (
                  <span className="text-muted-foreground">Último: <span className="text-foreground">{formatFecha(lead.last_interaction_at)}</span></span>
                )}
                {lead.next_reminder_at && (
                  <span className={(new Date(lead.next_reminder_at) < new Date()) ? 'text-destructive font-semibold' : 'text-muted-foreground'}>
                    Próximo: <span className="font-medium">{formatRelative(lead.next_reminder_at, { future: true })}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border/60">
                <span className="text-[11px] text-muted-foreground">{lead.responsable_nombre || 'Sin asignar'}</span>
                <QuickActions lead={lead} onMarkContacted={handleMarkContacted} onConvert={handleConvert} onLogInteraction={handleLogInteraction} onCreateReminder={handleCreateReminder} onEnrollSequence={(l) => setEnrollLeadId(l.id)} onSoftDelete={puedeEliminar(lead) ? (l) => setDeletingLead(l) : undefined} onReportSpam={(user?.role === 'superadmin' || user?.role === 'admin') ? (l) => setReportingSpamLead(l) : undefined} templates={waTemplates} projectName={activeProject?.nombre} onEditTemplates={() => navigate('/whatsapp/plantillas')} />
              </div>
            </div>
          ))}
          {!loading && leads.length === 0 && filteredLeads.length === 0 && !error && (
            <EmptyState
              icon={Users}
              title="No se encontraron prospectos"
              description="Ajusta los filtros o crea un nuevo prospecto manualmente."
            />
          )}
        </div>

        {/* Pagination */}
        {total > 0 && (
          <div className="px-5 py-3 border-t flex items-center justify-between text-[13px] text-muted-foreground">
            <span>
              Mostrando <strong className="text-foreground">{Math.min((page - 1) * 20 + 1, total)}&ndash;{Math.min(page * 20, total)}</strong> de {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <CaretLeft size={12} weight="bold" /> Anterior
              </button>
              {getVisiblePages().map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    p === page
                      ? 'bg-primary text-white shadow-sm'
                      : 'border border-border bg-card hover:bg-muted'
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-card text-xs font-medium hover:bg-muted transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                Siguiente <CaretRight size={12} weight="bold" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Convertir prospecto — dialog inline.
          Importante: en modo "Todos los proyectos" activeProject.id es -1 (sentinel),
          asi que tomamos el project_id del propio lead para no enviar -1 al backend. */}
      <Suspense fallback={null}>
        <ConversionDialog
          open={!!convertingLead}
          onClose={() => setConvertingLead(null)}
          lead={convertingLead}
          projectId={convertingLead?.project_id || activeProject?.id}
          onCreated={handleConversionCreated}
        />
      </Suspense>

      {/* Marcar contactado — registra nota + opcional próximo contacto */}
      <Suspense fallback={null}>
        <ContactedDialog
          open={!!confirmingContact}
          lead={confirmingContact}
          onClose={() => setConfirmingContact(null)}
          onSaved={() => { setConfirmingContact(null); refetch(); }}
        />
      </Suspense>

      {/* Bulk action bar — sticky abajo cuando hay seleccion */}
      {selectedIds.length > 0 && (
        <BulkActionBar
          count={selectedIds.length}
          onClear={clearSelection}
          onChangeStatus={can('leads.edit') ? (status => handleBulkStatusChange(status)) : undefined}
          onReassign={can('leads.assign') ? (gestorId => handleBulkReassign(gestorId)) : undefined}
          onExport={can('leads.export') ? handleBulkExportCsv : undefined}
          onMarcarContactado={can('leads.edit') ? marcarContactadosEnBloque : undefined}
          onCopiarContactos={copiarContactosEnBloque}
          gestores={gestores}
          isAdmin={can('leads.assign')}
          loading={bulkLoading}
        />
      )}

      {/* Crear recordatorio inline */}
      <ReminderQuickDialog
        open={!!reminderLead}
        lead={reminderLead}
        onClose={() => setReminderLead(null)}
        onSaved={() => { setReminderLead(null); refetch(); }}
      />

      {/* Import CSV */}
      <Suspense fallback={null}>
        <CsvImportDialog
          open={csvImportOpen}
          onClose={() => setCsvImportOpen(false)}
          projectId={activeProject?.id}
          onImported={({ ok }) => { if (ok > 0) refetch(); }}
        />
      </Suspense>

      {/* Drawer detalle rapido */}
      <Suspense fallback={null}>
        <LeadDrawer
          leadId={drawerLeadId}
          open={drawerLeadId !== null}
          onClose={() => setDrawerLeadId(null)}
        />
      </Suspense>

      {/* Soft delete (superadmin) */}
      <Suspense fallback={null}>
        <SoftDeleteDialog
          open={!!deletingLead}
          lead={deletingLead}
          onClose={() => setDeletingLead(null)}
          onDeleted={() => { setDeletingLead(null); refetch(); }}
        />
      </Suspense>

      {/* Reportar como spam (gestor/admin) */}
      <Suspense fallback={null}>
        {/* `leadId` y `leadNombre`, no el prospecto entero: es lo que declara
            el dialogo. Le llegaba `lead`, asi que `leadId` venia vacio, y con
            el vacio su `canSubmit` es falso — el boton de enviar estaba
            apagado siempre. Reportar un spam no ha funcionado nunca. */}
        <SpamReportDialog
          open={!!reportingSpamLead}
          leadId={reportingSpamLead?.id}
          leadNombre={reportingSpamLead?.nombre}
          onClose={() => setReportingSpamLead(null)}
          onReported={() => setReportingSpamLead(null)}
        />
      </Suspense>

      {/* Enrolar en secuencia */}
      <Suspense fallback={null}>
        <EnrollSequenceModal
          leadId={enrollLeadId}
          open={enrollLeadId !== null}
          onClose={() => setEnrollLeadId(null)}
          onEnrolled={() => setEnrollLeadId(null)}
        />
      </Suspense>

      {/* Plantillas WhatsApp por proyecto */}
      

      {/* Export universal (CRM-196) */}
      <Suspense fallback={null}>
        <ExportDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          context="leads"
          title="Exportar prospectos"
          filename={`prospectos-${activeProject?.slug || activeProject?.nombre || 'crm'}-${new Date().toISOString().slice(0, 10)}`}
          columns={getLeadExportColumns()}
          rows={exportRows}
          scope={
            <section className="rounded-md border border-border bg-muted/20 p-3 space-y-3">
              <div>
                <p className="text-xs font-semibold text-foreground mb-1.5">¿Qué prospectos exportar?</p>
                <div className="flex rounded-md border border-border overflow-hidden text-xs font-semibold">
                  <button type="button" onClick={() => setExportScope('filtros')}
                    className={`flex-1 h-8 ${expScope === 'filtros' ? 'bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}>
                    Con los filtros activos
                  </button>
                  <button type="button" onClick={() => setExportScope('todos')}
                    className={`flex-1 h-8 border-l border-border ${expScope === 'todos' ? 'bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}>
                    Todos (sin filtros)
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {expScope === 'filtros'
                    ? 'Exporta exactamente lo que ves ahora (estado, fechas, búsqueda…).'
                    : 'Exporta todos los leads de los proyectos elegidos, ignorando los filtros.'}
                </p>
              </div>

              {exportableProjects.length > 1 && (
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1.5">Proyectos a incluir</p>
                  <div className="flex flex-wrap gap-1.5">
                    {exportableProjects.map((p) => {
                      const on = expProjectIds.includes(p.id);
                      return (
                        <button key={p.id} type="button" onClick={() => toggleExportProject(p.id)}
                          className={`h-7 px-2.5 rounded-full border text-xs font-medium ${
                            on ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted'}`}>
                          {on ? '✓ ' : ''}{p.nombre}
                        </button>
                      );
                    })}
                  </div>
                  {expProjectIds.length === 0 && (
                    <p className="text-[11px] text-warning mt-1">Elige al menos un proyecto.</p>
                  )}
                </div>
              )}
            </section>
          }
        />
      </Suspense>

      <Suspense fallback={null}>
        {wasapiOpen && activeProject?.id && (
          <WasapiExportDialog
            open={wasapiOpen}
            projectId={activeProject.id}
            onClose={() => setWasapiOpen(false)}
          />
        )}
      </Suspense>

    </div>
  );
}

