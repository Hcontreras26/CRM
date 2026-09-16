import { useEffect, useState, useCallback, lazy, Suspense, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { abrirChatCrm } from '@/shared/lib/abrirChatCrm';
import { telefonoParaWhatsapp } from '@/shared/lib/telefono';
import client from '@/shared/api/client';
import { useProjectContext } from '@/contexts/ProjectContext';
import { useIdsDelAmbito } from '@/shared/hooks/useAmbito';
import useUrlFilters from '@/shared/hooks/useUrlFilters';
// Estas dos vivían aquí dentro, copiadas de las de prospectos pero sin la
// lectura de fechas sin hora: `new Date('2026-12-01')` se interpreta en UTC y
// en España cae en el día anterior, así que las compras de más de un mes se
// anunciaban un día antes («01 dic» salía «30 nov»). El servidor manda las
// columnas DATE en crudo, así que le pasaba a toda la columna «Última compra».
import { formatRelative, formatFecha as fmtFecha } from '@/shared/lib/fechas';
import PageHeader from '@/shared/components/ui/PageHeader';
import ComoVoy from '@/modules/reports/components/ComoVoy';
import EmptyState from '@/shared/components/ui/EmptyState';
import SkeletonTable from '@/shared/components/ui/SkeletonTable';
import ClientsFiltersBar from '../components/ClientsFiltersBar';
import BarraFiltros from '@/shared/components/ui/BarraFiltros';
import CifrasClientes from '../components/CifrasClientes';
import SaludDeCobro from '../components/SaludDeCobro';
import ProximosCobros from '../components/ProximosCobros';
import AccesosClave from '@/shared/components/ui/AccesosClave';
import useCobrosClientes from '../hooks/useCobrosClientes';
import {
  UserCheck, EnvelopeSimple, WhatsappLogo, ShoppingCart, DownloadSimple, Trash, Plus,
  GraduationCap, Wallet, Receipt, ChartLineUp,
} from '@phosphor-icons/react';

const RegisterSaleDialog = lazy(() => import('@/modules/sales/components/RegisterSaleDialog'));
import type { Client } from '@/shared/types';
import { useAuth } from '@/contexts/AuthContext';
import usePermission from '@/shared/hooks/usePermission';
import { etiquetaProducto, ofreceMatriculas } from '@/shared/lib/etiquetas';

function exportCSV(clients: Client[], filename: string, etiquetaPlural: string): void {
  const fmtNum = (n: number | string) => Number(n || 0).toFixed(2);
  const rows = [
    ['Nombre', 'Email', 'Teléfono', 'Gestora', etiquetaPlural, 'Cuotas totales', 'Cuotas pagadas', 'Cuotas pendientes', 'Próximo vencimiento', 'Compras', 'Facturado (€)', 'Cobrado (€)', 'Pendiente (€)', 'Última compra', 'Último contacto'],
    ...clients.map(c => [
      c.nombre || '',
      c.email || '',
      c.telefono || '',
      c.responsable_nombre || '',
      ((c.programas && c.programas.length ? c.programas : c.cursos) || []).join(' · '),
      Number(c.total_cuotas) || 0,
      Number(c.cuotas_pagadas) || 0,
      Number(c.cuotas_pendientes) || 0,
      c.proximo_vencimiento ? String(c.proximo_vencimiento).slice(0, 10) : '',
      c.conversiones,
      fmtNum(c.total_compras),
      fmtNum(c.total_pagado),
      fmtNum(c.pendiente),
      c.ultima_compra ? new Date(c.ultima_compra).toLocaleDateString('es-ES') : '',
      c.last_interaction_at ? new Date(c.last_interaction_at).toLocaleDateString('es-ES') : '',
    ]),
  ];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
import { toast } from '@/shared/hooks/useToast';
import { idsDelAmbito } from '@/shared/lib/ambitoInforme';

const ConversionDialog = lazy(() => import('@/modules/conversions/components/ConversionDialog'));
const SoftDeleteDialog = lazy(() => import('@/modules/leads/components/SoftDeleteDialog'));

function fmt(n: number | string): string {
  // Con centimos: es lo facturado y lo pendiente de cada cliente.
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number(n || 0));
}

// El plan de cuotas de un vistazo: cuántas hay, cuántas se han cobrado y
// cuántas quedan. Es lo que se mira para saber por dónde va un cliente.
function CeldaCuotas({ client: c }: { client: Client }) {
  const total = Number(c.total_cuotas) || 0;
  const pagadas = Number(c.cuotas_pagadas) || 0;
  const pendientes = Number(c.cuotas_pendientes) || 0;
  if (total === 0) return <span className="text-xs text-muted-foreground/60">Sin plan</span>;
  return (
    <div className="min-w-[145px]">
      <span className="inline-flex px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-semibold">
        {total} {total === 1 ? 'cuota' : 'cuotas'}
      </span>
      <div className="mt-1 text-[10px] text-muted-foreground whitespace-nowrap">
        <span className="text-success-soft-foreground">{pagadas} pagadas</span>
        <span> · </span>
        <span className={pendientes > 0 ? 'text-warning-soft-foreground' : ''}>
          {pendientes} pendientes
        </span>
      </div>
    </div>
  );
}

interface QuickActionsProps {
  client: Client;
  onUpsell?: (c: Client) => void;
  onDelete?: (c: Client) => void;
}

function QuickActions({ client: c, onUpsell, onDelete }: QuickActionsProps) {
  const navigate = useNavigate();
  const wa = telefonoParaWhatsapp(c.telefono);

  // Se abre el chat DENTRO del CRM. Antes esto lanzaba wa.me en otra pestaña:
  // se salia del CRM, no quedaba registro, y con varias sesiones enlazadas
  // abria la del navegador —que puede ser la personal— en vez de la del CRM.
  async function abrirAqui() {
    const destino = await abrirChatCrm({ leadId: c.id, telefono: c.telefono });
    if (!destino) {
      toast({
        title: 'No se ha podido abrir el chat',
        description: 'Comprueba en WhatsApp / Conexion que tu numero sigue enlazado.',
        variant: 'destructive',
      });
      return;
    }
    navigate(destino);
  }

  return (
    <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
      {wa && (
        <button type="button" onClick={() => abrirAqui()} title="WhatsApp" aria-label="Abrir WhatsApp"
          className="p-1.5 rounded hover:bg-success-soft text-muted-foreground hover:text-success-soft-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40">
          <WhatsappLogo size={14} weight="regular" />
        </button>
      )}
      {c.email && (
        <a href={`mailto:${c.email}`} title="Email" aria-label="Enviar email"
          className="p-1.5 rounded hover:bg-warning-soft text-muted-foreground hover:text-warning-soft-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40">
          <EnvelopeSimple size={14} weight="regular" />
        </a>
      )}
      {onUpsell && (
        <button onClick={() => onUpsell(c)} title="Nueva venta / upsell" aria-label="Registrar nueva venta o upsell"
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40">
          <ShoppingCart size={14} weight="regular" />
        </button>
      )}
      {onDelete && (
        <button onClick={() => onDelete(c)} title="Eliminar cliente (soft delete)" aria-label="Eliminar cliente"
          className="p-1.5 rounded hover:bg-destructive-soft text-muted-foreground hover:text-destructive transition-colors focus:outline-none focus:ring-2 focus:ring-destructive/40">
          <Trash size={14} weight="regular" />
        </button>
      )}
    </div>
  );
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermission();
  const { activeProject, projects, isAllProjects, activeIssuer } = useProjectContext() as {
    activeProject: { id?: number | null; nombre?: string; isAll?: boolean };
    projects: Array<{ id: number }>;
    isAllProjects: boolean;
    activeIssuer: { id: number; nombre: string; campus: Array<{ id: number }> } | null;
  };
  const idsDelAmbito = useIdsDelAmbito();
  // Filtros persistidos en URL para deep-linking + refresh-safe.
  // Server-side: search, resp(id), prod(id), from, to, sort. Client-side (post-fetch):
  // estado_pago (depende de cálculos local de conversiones).
  const [urlFilters, setUrlFilters] = useUrlFilters({
    q: '',
    resp: '',
    prod: '',
    estado_pago: '',
    from: '',
    to: '',
    sort: 'recent',
    page: 1,
  });
  const { q: search, resp: filterResp, prod: filterProducto, estado_pago: filterEstadoPago, from: dateFrom, to: dateTo, sort: sortBy, page } = urlFilters as {
    q: string; resp: string; prod: string; estado_pago: string; from: string; to: string; sort: string; page: number;
  };
  const setSearch = useCallback((v: string) => setUrlFilters({ q: v, page: 1 }), [setUrlFilters]);
  const setFilterResp = useCallback((v: string) => setUrlFilters({ resp: v, page: 1 }), [setUrlFilters]);
  const setFilterProducto = useCallback((v: string) => setUrlFilters({ prod: v, page: 1 }), [setUrlFilters]);
  const setFilterEstadoPago = useCallback((v: string) => setUrlFilters({ estado_pago: v, page: 1 }), [setUrlFilters]);
  const setDateFrom = useCallback((v: string) => setUrlFilters({ from: v, page: 1 }), [setUrlFilters]);
  const setDateTo = useCallback((v: string) => setUrlFilters({ to: v, page: 1 }), [setUrlFilters]);
  const setSortBy = useCallback((v: string) => setUrlFilters({ sort: v, page: 1 }), [setUrlFilters]);
  const setPage = useCallback((v: number) => setUrlFilters({ page: v }), [setUrlFilters]);

  const [clients, setClients] = useState<Client[]>([]);
  const [totalBackend, setTotalBackend] = useState(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [gestores, setGestores] = useState<Array<{ id: number; nombre: string }>>([]);
  const [productos, setProductos] = useState<Array<{ id: number; nombre: string }>>([]);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [saleOpen, setSaleOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const PAGE_SIZE = 500;

  // Debounce búsqueda 350ms
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  // Cargar gestores (solo admin/superadmin)
  useEffect(() => {
    if (user?.role !== 'superadmin' && user?.role !== 'admin') return;
    const projectFilter = !isAllProjects && activeProject?.id ? `&projectId=${activeProject.id}` : '';
    client.get(`/users?active=true&role=gestor&limit=100${projectFilter}`).then((r) => {
      if (r.success) setGestores(((r.data as Array<{ id: number; nombre: string }>) || []));
    }).catch(() => setGestores([]));
  }, [user?.role, activeProject?.id, isAllProjects]);

  // Cargar productos del proyecto activo
  useEffect(() => {
    if (!activeProject?.id) { setProductos([]); return; }
    client.get(`/products?projectId=${activeProject.id}&limit=500`).then((r) => {
      if (r.success) setProductos(((r.data as Array<{ id: number; nombre: string }>) || []));
    }).catch(() => setProductos([]));
  }, [activeProject?.id]);

  // Fetch principal con filtros server-side
  const abortRef = useRef<AbortController | null>(null);
  const fetchClients = useCallback(async () => {
    if (isAllProjects && (!projects || projects.length === 0)) return;
    if (!isAllProjects && !activeProject?.id) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (isAllProjects) {
        // Con una empresa elegida, «todos» son sus campus y ninguno mas.
        params.set('projectIds', idsDelAmbito.join(','));
      } else {
        params.set('projectId', String(activeProject.id));
      }
      // Cliente = lead con al menos una venta (conversión), sin importar su status.
      // Antes usaba status='convertido', que dejaba fuera a clientes reales cuyo
      // lead está en otro estado.
      params.set('conConversion', 'true');
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));
      // Recortado antes de mandarlo: el nombre pegado desde WhatsApp trae
      // espacios y el backend buscaba "% Javier%", que no casa con nadie.
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (filterResp === 'unassigned') params.set('unassigned', 'true');
      else if (filterResp) params.set('responsableId', filterResp);
      if (filterProducto) params.set('productId', filterProducto);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await client.get(`/leads?${params.toString()}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (res.success) {
        setTotalBackend(Number((res as { pagination?: { total?: number } }).pagination?.total) || 0);
        setClients(((res.data as Array<Client>) || []));
      }
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e?.name === 'AbortError') return;
      toast({ title: 'Error', description: e?.message || 'No se pudieron cargar los clientes', variant: 'destructive' });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [activeProject?.id, isAllProjects, projects, page, debouncedSearch, filterResp, filterProducto, dateFrom, dateTo, reloadKey]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  // Filtro estado_pago se aplica client-side (depende del enrichment de conversiones)
  let filtered: Client[] = clients;
  if (filterEstadoPago) {
    filtered = filtered.filter((c) => {
      const total = Number(c.total_compras) || 0;
      const pagado = Number(c.total_pagado) || 0;
      if (filterEstadoPago === 'pagado') return total > 0 && pagado >= total;
      if (filterEstadoPago === 'parcial') return pagado > 0 && pagado < total;
      if (filterEstadoPago === 'sin_pagar') return total > 0 && pagado === 0;
      if (filterEstadoPago === 'sin_ventas') return total === 0;
      return true;
    });
  }
  filtered = [...filtered].sort((a, b) => {
    if (sortBy === 'facturado') return (Number(b.total_compras) || 0) - (Number(a.total_compras) || 0);
    if (sortBy === 'cobrado') return (Number(b.total_pagado) || 0) - (Number(a.total_pagado) || 0);
    if (sortBy === 'pendiente') return (Number(b.pendiente) || 0) - (Number(a.pendiente) || 0);
    if (sortBy === 'nombre') return (a.nombre || '').localeCompare(b.nombre || '');
    const ua = a.ultima_compra ? new Date(a.ultima_compra).getTime() : 0;
    const ub = b.ultima_compra ? new Date(b.ultima_compra).getTime() : 0;
    return ub - ua;
  });

  const hasActiveFilters = !!(search.trim() || filterResp || filterProducto || filterEstadoPago || dateFrom || dateTo);
  const clearAllFilters = useCallback(() => {
    (setUrlFilters as unknown as { reset: () => void }).reset();
  }, [setUrlFilters]);
  const totalPages = Math.max(1, Math.ceil(totalBackend / PAGE_SIZE));

  // Lo que está pendiente de cobrar. Va aparte de la lista porque el endpoint
  // que lo sabe es el de contabilidad, y trae todo sin paginar: así las
  // columnas de abajo hablan de todo el proyecto y no de la página.
  const { items: cobros, tramos } = useCobrosClientes({
    projectId: isAllProjects ? null : (activeProject?.id ?? null),
    responsableId: filterResp,
  });

  const totalFacturado = filtered.reduce((s, c) => s + Number(c.total_compras), 0);
  const totalCobrado = filtered.reduce((s, c) => s + Number(c.total_pagado), 0);
  const totalPendiente = filtered.reduce((s, c) => s + Number(c.pendiente), 0);

  // Como llama ESTE proyecto a lo que vende: «Formaciones» en Psiko,
  // «Planes» en una plataforma de IA. Con varios proyectos a la vez no hay uno
  // que valga, y entonces dice «Productos».
  const etiqueta = etiquetaProducto(activeProject);

  const [upsellLead, setUpsellLead] = useState<Client | null>(null);
  const [deleteClient, setDeleteClient] = useState<Client | null>(null);

  function handleUpsell(c: Client): void {
    setUpsellLead(c);
  }

  function handleDelete(c: Client): void {
    setDeleteClient(c);
  }

  function handleUpsellCreated() {
    setUpsellLead(null);
    toast({ title: 'Venta registrada', description: 'Se actualizó el historial del cliente' });
    setReloadKey((k) => k + 1);
  }

  return (
    <div className="space-y-5 pb-8">
      {/* La accion principal va DENTRO de la cabecera, como «Nuevo prospecto» en
          Prospectos. Estaba al lado y por fuera: desde el marco del #33 la
          cabecera sube a la barra de arriba y el boton se quedaba solo en medio
          del contenido, sin el titulo al que acompanaba. */}
      <PageHeader
        title="Clientes"
        subtitle={`Prospectos convertidos en ${activeIssuer ? `${activeIssuer.nombre} (${activeIssuer.campus.length} campus)` : (activeProject?.nombre || 'todos los proyectos')} — ${hasActiveFilters ? `${filtered.length} de ${totalBackend} (filtrados)` : `${totalBackend} ${totalBackend === 1 ? 'cliente' : 'clientes'}`}`}
        actions={activeProject?.id && !isAllProjects && can('clients.create') ? (
          <button
            type="button"
            onClick={() => setSaleOpen(true)}
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-md bg-primary text-primary-foreground text-xs sm:text-sm font-semibold hover:bg-primary/90 transition-colors whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
          >
            <Plus size={14} weight="bold" />
            <span className="hidden sm:inline">Registrar venta</span>
            <span className="sm:hidden">Vender</span>
          </button>
        ) : null}
      />

      {/* La misma tarjeta que en Prospectos: aquí se mira lo que ya se cerró,
          y el porcentaje de cierre es justo lo que explica esta lista. */}
      <ComoVoy compacto />

      <Suspense fallback={null}>
        <RegisterSaleDialog
          open={saleOpen}
          project={activeProject?.id
            ? { id: activeProject.id, nombre: activeProject.nombre }
            : null}
          onClose={() => setSaleOpen(false)}
          onSaved={() => setReloadKey((k) => k + 1)}
        />
      </Suspense>

      <CifrasClientes
        totalClientes={totalBackend}
        facturado={totalFacturado}
        cobrado={totalCobrado}
        pendiente={totalPendiente}
      />

      {/* Las tres columnas, con las proporciones de Prospectos: el reparto del
          cobro manda porque es lo que más se mira, y los accesos son la columna
          estrecha. Antes aquí se pasaba de las cifras a la tabla directamente:
          no había forma de saber qué tocaba cobrar sin irse a Contabilidad. */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)_minmax(260px,0.7fr)]">
        <SaludDeCobro
          tramos={tramos}
          onVerPorCobrar={() => navigate('/finanzas/por-cobrar')}
        />
        <ProximosCobros
          cobros={cobros}
          onAbrir={(leadId) => navigate(`/clientes/${leadId}`)}
          onVerTodos={() => navigate('/finanzas/por-cobrar')}
        />
        <AccesosClave
          accesos={[
            // Matrículas no se ofrece si el proyecto no las tiene. Dos señales:
            // que alguien haya apagado el módulo —lo que ya mira el menú— o que
            // sea una plataforma de suscripción, donde no existen. Ver
            // `ofreceMatriculas`.
            ...(ofreceMatriculas(activeProject) ? [
              { label: 'Matrículas', detail: `Altas en cada ${etiqueta.singular.toLowerCase()}`, icon: GraduationCap, to: '/clientes/matriculas' },
            ] : []),
            { label: 'Por cobrar', detail: 'Cuotas pendientes', icon: Wallet, to: '/finanzas/por-cobrar' },
            { label: 'Ventas', detail: 'Registrar y consultar', icon: Receipt, to: '/finanzas/ventas' },
            { label: 'Reportes', detail: 'Numeros descargables', icon: ChartLineUp, to: '/informes' },
          ]}
        />
      </section>

      {/* Barra de filtros FUERA del card de la tabla: el card lleva overflow-hidden
          (para recortar las esquinas de la tabla) y eso recortaba el popover de
          "Filtros". Va como fila propia encima del card, igual que en Prospectos. */}
      {/* Arriba solo el buscador, como en Prospectos desde el 23/09 (Diego: «mete
          esos filtros allí»). Gestora, estado de pago y orden salían aquí Y otra vez
          dentro de «Filtros»: dos sitios donde mirar qué había puesto (repaso del
          15/09, rescatado de la PR #153 de Fabián). Ahora van solo dentro, y lo que
          esté puesto lo cantan el número del botón y las píldoras de al lado. */}
      <BarraFiltros
        busqueda={search}
        onBusqueda={setSearch}
        placeholder="Buscar por nombre, email o teléfono"
        desplegables={[]}
        hayFiltros={hasActiveFilters}
        onLimpiar={clearAllFilters}
        onActualizar={() => setReloadKey((k) => k + 1)}
        actualizando={loading}
      />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <ClientsFiltersBar
          user={user}
          search={search} setSearch={setSearch}
          filterResp={filterResp} setFilterResp={setFilterResp}
          filterProducto={filterProducto} setFilterProducto={setFilterProducto}
          filterEstadoPago={filterEstadoPago} setFilterEstadoPago={setFilterEstadoPago}
          dateFrom={dateFrom} setDateFrom={setDateFrom}
          dateTo={dateTo} setDateTo={setDateTo}
          sortBy={sortBy} setSortBy={setSortBy}
          gestores={gestores}
          productos={productos}
          totalBackend={totalBackend}
          filteredCount={filtered.length}
        />
        {filtered.length > 0 && can('clients.export') && (
          <button
            onClick={() => exportCSV(filtered, `clientes-${activeProject?.nombre || 'crm'}-${new Date().toISOString().slice(0,10)}.csv`, etiqueta.plural)}
            title="Exportar CSV"
            className="h-9 px-3 rounded-md border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-medium"
          >
            <DownloadSimple size={14} weight="bold" /> <span className="hidden sm:inline">CSV</span>
          </button>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {loading ? (
          <SkeletonTable rows={5} columns={6} className="border-0 rounded-none" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="Sin clientes"
            description="Los prospectos marcados como 'convertido' aparecerán aquí con su historial de compras"
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-bold">Cliente</th>
                    <th className="text-left px-4 py-2.5 font-bold">Email</th>
                    <th className="text-left px-4 py-2.5 font-bold">Teléfono</th>
                    <th className="text-left px-4 py-2.5 font-bold">{etiqueta.plural}</th>
                    <th className="text-left px-4 py-2.5 font-bold">Gestora</th>
                    <th className="text-left px-4 py-2.5 font-bold">Cuotas</th>
                    <th className="text-center px-4 py-2.5 font-bold">Compras</th>
                    <th className="text-right px-4 py-2.5 font-bold">Facturado</th>
                    <th className="text-right px-4 py-2.5 font-bold">Pendiente</th>
                    <th className="text-left px-4 py-2.5 font-bold">Última compra</th>
                    <th className="text-left px-4 py-2.5 font-bold">Último contacto</th>
                    <th className="text-right px-4 py-2.5 font-bold pr-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/clientes/${c.id}`)}>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{c.nombre}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs tabular-nums whitespace-nowrap">{c.telefono || '—'}</td>
                      <td className="px-4 py-3">
                        {(() => {
                          // El programa contratado; si no hay venta todavía, el que pidió.
                          const progs = (c.programas && c.programas.length ? c.programas : c.cursos) || [];
                          return progs.length > 0 ? (
                            <div className="flex flex-col gap-0.5 max-w-[220px]">
                              <span className="text-xs font-medium text-foreground truncate" title={progs.join(' · ')}>{progs[0]}</span>
                              {progs.length > 1 && (
                                <span className="text-[10px] text-muted-foreground">+{progs.length - 1} más</span>
                              )}
                            </div>
                          ) : <span className="text-xs text-muted-foreground/60">—</span>;
                        })()}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{c.responsable_nombre || '—'}</td>
                      <td className="px-4 py-3"><CeldaCuotas client={c} /></td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-semibold">{c.conversiones}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold">{fmt(c.total_compras)}</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-semibold ${Number(c.pendiente) > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
                        {fmt(c.pendiente)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {c.ultima_compra ? formatRelative(c.ultima_compra) : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {c.last_interaction_at ? fmtFecha(c.last_interaction_at) : <span className="text-muted-foreground/60">Sin contacto</span>}
                      </td>
                      <td className="px-4 py-3 text-right pr-3">
                        <QuickActions client={c} onUpsell={can('clients.create') ? handleUpsell : undefined} onDelete={can('clients.delete') ? handleDelete : undefined} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border">
              {filtered.map((c) => (
                <div
                  key={c.id}
                  onClick={() => navigate(`/clientes/${c.id}`)}
                  className="p-4 space-y-2 cursor-pointer active:bg-muted/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{c.nombre}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.email}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-primary/10 text-primary text-xs font-semibold flex-shrink-0">
                      {c.conversiones} {c.conversiones === 1 ? 'compra' : 'compras'}
                    </span>
                  </div>
                  {c.cursos && c.cursos.length > 0 && (
                    <div className="text-xs text-foreground">
                      <span className="text-muted-foreground">{etiqueta.singular}: </span>
                      {c.cursos[0]}{c.cursos.length > 1 ? ` +${c.cursos.length - 1}` : ''}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Facturado</div>
                      <div className="tabular-nums font-semibold">{fmt(c.total_compras)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Pendiente</div>
                      <div className={`tabular-nums font-semibold ${Number(c.pendiente) > 0 ? 'text-warning' : 'text-muted-foreground'}`}>{fmt(c.pendiente)}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border/60">
                    <div className="flex flex-col gap-0.5 text-[11px]">
                      {c.ultima_compra && <span className="text-muted-foreground">Compra: <span className="text-foreground">{formatRelative(c.ultima_compra)}</span></span>}
                      {c.last_interaction_at && <span className="text-muted-foreground">Contacto: <span className="text-foreground">{fmtFecha(c.last_interaction_at)}</span></span>}
                    </div>
                    <QuickActions client={c} onUpsell={can('clients.create') ? handleUpsell : undefined} onDelete={can('clients.delete') ? handleDelete : undefined} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Paginación server-side */}
        {totalBackend > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border text-xs">
            <span className="text-muted-foreground">
              Página <strong className="text-foreground">{page}</strong> de <strong className="text-foreground">{totalPages}</strong> · {totalBackend} {totalBackend === 1 ? 'cliente' : 'clientes'} en total
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1 || loading}
                className="h-8 px-3 rounded-md border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
              >
                ← Anterior
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages || loading}
                className="h-8 px-3 rounded-md border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Nueva venta / upsell — dialog inline */}
      <Suspense fallback={null}>
        <ConversionDialog
          open={!!upsellLead}
          onClose={() => setUpsellLead(null)}
          lead={upsellLead}
          projectId={activeProject?.id}
          onCreated={handleUpsellCreated}
        />
      </Suspense>

      {/* Soft delete (solo superadmin) — reusa el mismo dialog que ficha de lead */}
      <Suspense fallback={null}>
        <SoftDeleteDialog
          open={!!deleteClient}
          lead={deleteClient}
          onClose={() => setDeleteClient(null)}
          onDeleted={() => {
            setClients((prev) => prev.filter((x) => x.id !== deleteClient?.id));
            setDeleteClient(null);
            toast({ title: 'Cliente eliminado' });
          }}
        />
      </Suspense>
    </div>
  );
}
