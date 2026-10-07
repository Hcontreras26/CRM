import { cssDeEstado } from '../lib/estadoTono';
// LeadsFiltersBar — v2 UI Prospectos.
// Reemplaza las 4 franjas (filtros, stats, quick-filters, leyenda) del LeadsPage v1
// por una sola fila compacta con:
//   - Botón "Filtros" que abre popover con TODO dentro (search, dropdowns, fechas,
//     orden, quick filters, duplicados/reincidentes, stats)
//   - Pildoras de filtros activos (clic en × las quita)
//   - Botón "Asignar pendientes" cuando aplica
//
// Cualquier modificación de filtros se notifica al padre via los setters; este
// componente NO mantiene estado propio (salvo `open` del popover).

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Funnel, MagnifyingGlass, X, CaretDown, Lightning, WarningCircle,
} from '@phosphor-icons/react';
import SearchableSelect from '@/shared/components/ui/SearchableSelect';
import DateRangeFilter from './DateRangeFilter';
import MultiProjectPicker from '@/shared/components/ui/MultiProjectPicker';

const STATUS_LABELS: Record<string, string> = {
  nuevo: 'Nuevo',
  por_contactar: 'Por contactar',
  contactado: 'Contactado',
  en_seguimiento: 'En seguimiento',
  convertido: 'Convertido',
  no_interesado: 'No interesado',
  proxima_convocatoria: 'Próxima convocatoria',
};

const ORIGEN_LABELS: Record<string, string> = {
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  tiktok_ads: 'TikTok Ads',
  whatsapp: 'WhatsApp',
  organico: 'Orgánico',
  chatgpt_ia: 'ChatGPT IA',
  referido: 'Referido',
  directo: 'Directo',
};

const QUICK_LABELS: Record<string, string> = {
  urgent: 'Necesitan acción hoy',
  overdue: 'Vencidos',
  today: 'Hoy',
  tomorrow: 'Mañana',
  week: '7 días',
  'no-reminder': 'Sin programar',
  'no-contact': 'Sin contacto',
  'sin-revisar': 'Por validar',
};

const SORT_LABELS: Record<string, string> = {
  recent: '🕒 Fecha — cronológico (default)',
  recent_value: '📅 Día · más valor dentro del día',
  urgency: '⚡ Urgencia (valor × frescura)',
  value: '💰 Más valor primero',
};

interface Props {
  activeProject: { id?: number | null; nombre?: string };
  projects: Array<{ id: number; nombre?: string }>;
  selectedProjectIds: number[];
  setSelectedProjectIds: (ids: number[]) => void;
  gestores: Array<{ id: number; nombre: string; project_ids?: number[] }>;
  products: Array<{ id: number; nombre: string }>;
  user: { role?: string } | null;
  search: string; setSearch: (v: string) => void;
  filterEstado: string; setFilterEstado: (v: string) => void;
  filterSeguimiento: string; setFilterSeguimiento: (v: string) => void;
  /** En qué paso del proceso comercial va. Vacío = cualquiera. */
  filterPaso: string; setFilterPaso: (v: string) => void;
  /** Los pasos del proyecto o de la empresa, para poder nombrarlos. */
  pasosDelProceso: Array<{ clave: string; nombre: string; orden: number }>;
  filterOrigen: string; setFilterOrigen: (v: string) => void;
  filterResponsable: string; setFilterResponsable: (v: string) => void;
  filterProducto: string; setFilterProducto: (v: string) => void;
  dateFrom: string; dateTo: string; setDateRange: (from: string, to: string) => void;
  sortMode: string; setSortMode: (v: 'value' | 'recent' | 'urgency' | 'recent_value') => void;
  sortDir: 'asc' | 'desc'; setSortDir: (d: 'asc' | 'desc') => void;
  quickFilter: string; setQuickFilter: (v: string) => void;
  quickCounts: { overdue: number; today: number; tomorrow: number; week: number; noReminder: number; noContact: number; urgent: number; sinRevisar?: number | null };
  filterDup: boolean; setFilterDup: (v: boolean) => void;
  filterReincidente: boolean; setFilterReincidente: (v: boolean) => void;
  stats: Record<string, number> | null | undefined;
  leadsCount: number;
  filteredCount: number;
  onAssignPending: () => Promise<void> | void;
}

export default function LeadsFiltersBar(props: Props) {
  const {
    activeProject, projects, selectedProjectIds, setSelectedProjectIds,
    gestores, products, user, filterPaso, setFilterPaso, pasosDelProceso,
    search, setSearch, filterEstado, setFilterEstado,
    filterSeguimiento, setFilterSeguimiento,
    filterOrigen, setFilterOrigen, filterResponsable, setFilterResponsable,
    filterProducto, setFilterProducto, dateFrom, dateTo, setDateRange,
    sortMode, setSortMode, sortDir, setSortDir, quickFilter, setQuickFilter, quickCounts,
    filterDup, setFilterDup, filterReincidente, setFilterReincidente,
    stats, leadsCount, filteredCount, onAssignPending,
  } = props;

  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';

  // Cruce Gestor ↔ Proyecto:
  // - Con proyectos seleccionados en el picker → solo gestores de esos proyectos.
  // - Con una gestora filtrada → el picker solo muestra SUS proyectos.
  const gestoresFiltrados = selectedProjectIds.length > 0
    ? gestores.filter((g) => !Array.isArray(g.project_ids) || g.project_ids.some((pid) => selectedProjectIds.includes(pid)))
    : gestores;
  const gestorSeleccionado = filterResponsable && filterResponsable !== 'unassigned'
    ? gestores.find((g) => String(g.id) === filterResponsable)
    : null;
  const projectsDelGestor = gestorSeleccionado && Array.isArray(gestorSeleccionado.project_ids) && gestorSeleccionado.project_ids.length > 0
    ? projects.filter((p) => gestorSeleccionado.project_ids!.includes(p.id))
    : projects;
  // Programa: solo hay catálogo con proyecto concreto activo o con UN proyecto elegido en el picker.
  const programasDisponibles = (activeProject?.id && activeProject.id > 0) || selectedProjectIds.length === 1;
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null); // wrapper del botón (ancla de posición)
  const panelRef = useRef<HTMLDivElement>(null);   // panel renderizado en el portal
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);

  // El panel se renderiza en un Portal (a <body>) con posición fija calculada desde
  // el botón, para que NINGÚN contenedor con overflow/transform lo recorte (era el bug
  // de "se parte la pantalla / se oculta abajo").
  const updatePos = useCallback(() => {
    const el = popoverRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(560, window.innerWidth - 32);
    let left = r.left;
    if (left + width > window.innerWidth - 16) left = window.innerWidth - 16 - width;
    if (left < 16) left = 16;
    const top = r.bottom + 8;
    // Reserva ~56px para el footer (botón Aplicar) para que NO quede cortado abajo:
    // el maxH es solo del área scrollable, el footer va aparte.
    const maxH = Math.max(200, window.innerHeight - top - 16 - 56);
    setPos({ top, left, width, maxH });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
    const on = () => updatePos();
    window.addEventListener('scroll', on, true);
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('scroll', on, true);
      window.removeEventListener('resize', on);
    };
  }, [open, updatePos]);

  // Click fuera (contando el panel del portal) cierra el popover
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Conteo de filtros activos para el badge
  const activePills: Array<{ key: string; label: string; onClear: () => void }> = [];
  if (search.trim()) activePills.push({ key: 'search', label: `🔎 "${search.slice(0, 20)}${search.length > 20 ? '…' : ''}"`, onClear: () => setSearch('') });
  if (filterEstado) activePills.push({ key: 'estado', label: STATUS_LABELS[filterEstado] || filterEstado, onClear: () => setFilterEstado('') });
  if (filterSeguimiento) activePills.push({
    key: 'seg',
    label: filterSeguimiento === '5' ? 'Seguimiento 5 o más' : `Seguimiento ${filterSeguimiento}`,
    onClear: () => setFilterSeguimiento(''),
  });
  if (filterOrigen) activePills.push({ key: 'origen', label: ORIGEN_LABELS[filterOrigen] || filterOrigen, onClear: () => setFilterOrigen('') });
  if (filterResponsable) {
    const label = filterResponsable === 'unassigned'
      ? 'Sin asignar'
      : gestores.find((g) => String(g.id) === filterResponsable)?.nombre || filterResponsable;
    activePills.push({ key: 'resp', label, onClear: () => setFilterResponsable('') });
  }
  if (filterProducto) {
    const label = products.find((p) => String(p.id) === filterProducto)?.nombre || filterProducto;
    activePills.push({ key: 'prod', label: label.length > 20 ? label.slice(0, 20) + '…' : label, onClear: () => setFilterProducto('') });
  }
  if (dateFrom || dateTo) activePills.push({ key: 'date', label: `${dateFrom || '...'} → ${dateTo || 'hoy'}`, onClear: () => setDateRange('', '') });
  if (quickFilter) activePills.push({ key: 'quick', label: QUICK_LABELS[quickFilter] || quickFilter, onClear: () => setQuickFilter('') });
  if (filterDup) activePills.push({ key: 'dup', label: 'Duplicados', onClear: () => setFilterDup(false) });
  if (filterReincidente) activePills.push({ key: 'rein', label: 'Reincidentes', onClear: () => setFilterReincidente(false) });

  function clearAll() {
    setSearch('');
    setFilterEstado('');
    setFilterOrigen('');
    setFilterResponsable('');
    setFilterProducto('');
    setDateRange('', '');
    setQuickFilter('');
    setFilterDup(false);
    setFilterReincidente(false);
  }

  const showAssignBtn = isAdmin
    && ((stats?.sin_asignar ?? 0) > 0 || filterResponsable === 'unassigned')
    && activeProject?.id && activeProject.id > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 relative">
      {/* Botón Filtros con popover */}
      <div className="relative" ref={popoverRef}>
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className={`h-9 inline-flex items-center gap-1.5 px-3 rounded-md border text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
            activePills.length > 0
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border bg-card hover:bg-muted'
          }`}
        >
          <Funnel size={14} weight={activePills.length > 0 ? 'fill' : 'bold'} />
          Filtros
          {activePills.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold leading-none">
              {activePills.length}
            </span>
          )}
          <CaretDown size={11} weight="bold" className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>

        {open && pos && createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 1000 }}
            className="bg-card border border-border rounded-lg shadow-dialog overflow-hidden"
          >
            <div style={{ maxHeight: pos.maxH }} className="overflow-y-auto">
              {/* Búsqueda */}
              {/* Aqui habia otro buscador, otro «Estado» y otro «Orden». Los
                  tres estan en la fila de arriba, a la vista (#125): tenerlos
                  dos veces obliga a mirar en dos sitios para saber que hay
                  puesto, y a acordarse de limpiarlos en los dos.

                  Detras del boton se queda lo que NO cabe en la fila: gestor,
                  programa, proyecto, fechas, direccion y lo de admin. */}

              {/* Filtros principales */}
              <Section title="Filtros principales">
                {/* ESTADO, CANAL Y ORDEN VUELVEN AQUÍ DENTRO. Diego, 23/09:
                    «mete esos filtros allí».

                    Estuvieron un tiempo en la fila de arriba (#125) para que se
                    vieran sin abrir nada. El problema era otro: la fila se
                    llenaba de desplegables y el botón «Filtros» parecía llevar
                    a otro sitio distinto. Con todo dentro hay UN solo sitio
                    donde mirar, y lo que haya puesto lo canta el número del
                    botón y las píldoras de al lado — que es lo que de verdad
                    evita el filtro puesto sin querer. */}
                <Row label="Estado">
                  <select
                    value={filterEstado}
                    onChange={(e) => setFilterEstado(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-border bg-muted/40 text-sm"
                    aria-label="Estado"
                  >
                    <option value="">Todos los estados</option>
                    {Object.entries(STATUS_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </Row>
                {/* EN QUÉ PASO DEL PROCESO VA. Diego, 23/09: «en filtros que
                    diga proceso de ventas y puedas elegir cuál».

                    Los pasos se leen del proceso de verdad —no una lista fija—
                    porque cada campus puede renombrarlos, y un filtro que diga
                    «Día 2» cuando la pantalla de pasos dice «Prueba social» no
                    se entiende. */}
                {pasosDelProceso.length > 0 && (
                  <Row label="Proceso de ventas">
                    <select
                      value={filterPaso}
                      onChange={(e) => setFilterPaso(e.target.value)}
                      className="w-full h-9 px-3 rounded-md border border-border bg-muted/40 text-sm"
                      aria-label="Paso del proceso comercial"
                    >
                      <option value="">Cualquier paso</option>
                      {pasosDelProceso.map((p) => (
                        <option key={p.clave} value={p.clave}>
                          {p.orden}. {p.nombre}
                        </option>
                      ))}
                    </select>
                  </Row>
                )}
                <Row label="Canal">
                  <select
                    value={filterOrigen}
                    onChange={(e) => setFilterOrigen(e.target.value)}
                    className="w-full h-9 px-3 rounded-md border border-border bg-muted/40 text-sm"
                    aria-label="Canal de entrada"
                  >
                    <option value="">Todos los orígenes</option>
                    {Object.entries(ORIGEN_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </Row>
                <Row label="Orden">
                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as 'value' | 'recent' | 'urgency' | 'recent_value')}
                    className="w-full h-9 px-3 rounded-md border border-border bg-muted/40 text-sm"
                    aria-label="Orden de la lista"
                  >
                    {Object.entries(SORT_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </Row>
                {/* El «por que seguimiento va» cuelga del estado «En
                    seguimiento» porque solo ahi significa algo: preguntar por el
                    seguimiento 3 de un «no interesado» no dice nada. El «por que
                    seguimiento va» no esta arriba ni en ningun otro sitio, y
                    cuelga del estado «En seguimiento» porque solo ahi significa
                    algo: preguntar por el seguimiento 3 de un «no interesado» no
                    dice nada. Diego: «seria seguimiento 1, 2, y eso en el estado
                    de seguimiento, como un submenu». */}
                {filterEstado === 'en_seguimiento' && (
                  <Row label="Por qué seguimiento va">
                    <select
                      value={filterSeguimiento}
                      onChange={(e) => setFilterSeguimiento(e.target.value)}
                      className="w-full h-9 px-3 rounded-md border border-border bg-muted/40 text-sm"
                    >
                      <option value="">Cualquiera</option>
                      <option value="1">Seguimiento 1 — un contacto</option>
                      <option value="2">Seguimiento 2 — dos contactos</option>
                      <option value="3">Seguimiento 3</option>
                      <option value="4">Seguimiento 4</option>
                      <option value="5">Seguimiento 5 o más</option>
                    </select>
                  </Row>
                )}
                {isAdmin && (
                  <Row label="Gestor">
                    <SearchableSelect
                      value={filterResponsable}
                      onChange={(v) => setFilterResponsable(v)}
                      options={[
                        { value: 'unassigned', label: '— Sin asignar —' },
                        ...gestoresFiltrados.map((g) => ({ value: String(g.id), label: g.nombre })),
                      ]}
                      placeholder="Buscar gestor…"
                      allLabel="Todos los gestores"
                      ariaLabel="Gestor"
                      maxWidth="100%"
                    />
                  </Row>
                )}
                <Row label="Programa">
                  {programasDisponibles ? (
                    <SearchableSelect
                      value={filterProducto}
                      onChange={(v) => setFilterProducto(v)}
                      options={(products || []).map((p) => ({ value: String(p.id), label: p.nombre }))}
                      placeholder="Buscar programa…"
                      allLabel="Todos los programas"
                      ariaLabel="Programa"
                      maxWidth="100%"
                    />
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic px-1 py-2">
                      Selecciona <strong>un</strong> proyecto (en el filtro Proyecto) para ver sus programas.
                    </p>
                  )}
                </Row>
                {projects && projects.length > 1 && (
                  <Row label="Proyecto">
                    <MultiProjectPicker
                      projects={projectsDelGestor}
                      selected={selectedProjectIds}
                      onChange={(ids) => setSelectedProjectIds(ids)}
                      activeProjectId={activeProject?.id}
                    />
                  </Row>
                )}
                <Row label="Fechas">
                  <DateRangeFilter from={dateFrom} to={dateTo} onChange={(f, t) => setDateRange(f, t)} />
                </Row>
                {/* Dirección del orden cronológico: descendente (más reciente
                    primero, default) o ascendente (más antiguo primero). */}
                <Row label="Dirección">
                  <div className="flex rounded-md border border-border overflow-hidden text-xs font-semibold">
                    <button type="button" onClick={() => setSortDir('desc')}
                      className={`flex-1 h-9 ${sortDir === 'desc' ? 'bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}>
                      ↓ Más reciente
                    </button>
                    <button type="button" onClick={() => setSortDir('asc')}
                      className={`flex-1 h-9 border-l border-border ${sortDir === 'asc' ? 'bg-primary/10 text-primary' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}>
                      ↑ Más antiguo
                    </button>
                  </div>
                </Row>
              </Section>

              {/* Filtros rápidos */}
              <Section title="Filtros rápidos">
                <div className="flex flex-wrap gap-1.5">
                  <QuickChip active={!quickFilter} onClick={() => setQuickFilter('')} label="Todos" />
                  <QuickChip active={quickFilter === 'urgent'} onClick={() => setQuickFilter('urgent')}
                    label="Necesitan acción hoy" count={quickCounts.urgent} tone="danger" />
                  <QuickChip active={quickFilter === 'overdue'} onClick={() => setQuickFilter('overdue')}
                    label="Vencidos" count={quickCounts.overdue} tone="danger" />
                  <QuickChip active={quickFilter === 'today'} onClick={() => setQuickFilter('today')}
                    label="Hoy" count={quickCounts.today} tone="warning" />
                  <QuickChip active={quickFilter === 'tomorrow'} onClick={() => setQuickFilter('tomorrow')}
                    label="Mañana" count={quickCounts.tomorrow} tone="default" />
                  <QuickChip active={quickFilter === 'week'} onClick={() => setQuickFilter('week')}
                    label="7 días" count={quickCounts.week} tone="default" />
                  <QuickChip active={quickFilter === 'no-reminder'} onClick={() => setQuickFilter('no-reminder')}
                    label="Sin programar" count={quickCounts.noReminder} tone="default" />
                  <QuickChip active={quickFilter === 'no-contact'} onClick={() => setQuickFilter('no-contact')}
                    label="Sin contacto" count={quickCounts.noContact} tone="default" />
                  {/* El repaso de fin de mes (#132). Solo aparece si se puede
                      marcar de verdad: un filtro que lleva a una lista donde no
                      se puede hacer nada es peor que no tenerlo. */}
                  {quickCounts.sinRevisar != null && (
                    <QuickChip active={quickFilter === 'sin-revisar'} onClick={() => setQuickFilter('sin-revisar')}
                      label="Por validar" count={quickCounts.sinRevisar} tone="default" />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 px-0.5">
                  {/* Decia «se aplican sobre los resultados ya cargados», y desde
                      el #132 eso es falso: los resuelve el servidor sobre TODA la
                      base, no sobre la pagina. */}
                  Se aplican sobre toda la base, no sobre la página que ves. «Necesitan acción hoy» y «Sin contacto» no se combinan con el filtro «Estado».
                </p>
                {(quickFilter === 'urgent' || quickFilter === 'no-contact') && filterEstado && (
                  <div className="mt-1.5 text-[11px] rounded-md border border-warning/30 bg-warning-soft text-warning px-2.5 py-1.5">
                    ⚠️ «{QUICK_LABELS[quickFilter] || quickFilter}» y «Estado» están activos a la vez y se contradicen — quita uno de los dos.
                  </div>
                )}
              </Section>

              {isAdmin && (
                <Section title="Avanzado (admin)">
                  <div className="flex flex-wrap gap-1.5">
                    <QuickChip active={filterDup} onClick={() => setFilterDup(!filterDup)}
                      label="Duplicados" tone="warning" />
                    <QuickChip active={filterReincidente} onClick={() => setFilterReincidente(!filterReincidente)}
                      label="Reincidentes" tone="danger" />
                  </div>
                </Section>
              )}

              {/* Stats compactos */}
              {stats && (
                <Section title="Resumen">
                  <div className="flex flex-wrap gap-1.5">
                    <StatPill label="Total" value={stats.total || 0} />
                    <StatPill label="Nuevos" value={stats.nuevo || 0} dot={cssDeEstado('nuevo')} />
                    <StatPill label="Por contactar" value={stats.por_contactar || 0} dot={cssDeEstado('por_contactar')} />
                    <StatPill label="Contactados" value={stats.contactado || 0} dot={cssDeEstado('contactado')} />
                    <StatPill label="En seguimiento" value={stats.en_seguimiento || 0} dot={cssDeEstado('en_seguimiento')} />
                    <StatPill label="Convertidos" value={stats.convertido || 0} dot={cssDeEstado('convertido')} />
                    <StatPill label="No interesado" value={stats.no_interesado || 0} dot={cssDeEstado('no_interesado')} />
                  </div>
                  {quickFilter && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      <strong className="text-foreground">{filteredCount}</strong> filtrados
                      de <strong className="text-foreground">{leadsCount}</strong> cargados
                    </p>
                  )}
                </Section>
              )}
            </div>
            {/* Footer del popover */}
            <div className="border-t border-border bg-muted/30 px-3 py-2 flex items-center justify-between gap-2">
              <button
                onClick={clearAll}
                disabled={activePills.length === 0}
                className="h-8 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                Limpiar todo
              </button>
              <button
                onClick={() => setOpen(false)}
                className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
              >
                Aplicar
              </button>
            </div>
          </div>,
          document.body,
        )}
      </div>

      {/* Pildoras de filtros activos */}
      {activePills.map((pill) => (
        <span
          key={pill.key}
          className="inline-flex items-center gap-1 h-9 pl-2.5 pr-1.5 rounded-md bg-primary/10 text-primary text-xs font-semibold border border-primary/20"
        >
          {pill.label}
          <button
            onClick={pill.onClear}
            aria-label={`Quitar filtro ${pill.label}`}
            className="ml-0.5 w-5 h-5 inline-flex items-center justify-center rounded hover:bg-primary/20"
          >
            <X size={10} weight="bold" />
          </button>
        </span>
      ))}

      {/* Asignar pendientes (cuando aplica) */}
      {showAssignBtn && (
        <button
          onClick={onAssignPending}
          className="ml-auto h-9 px-3 rounded-md bg-warning hover:bg-warning text-warning-foreground text-xs font-bold whitespace-nowrap inline-flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-warning/40"
          title="Aplica round-robin a todos los prospectos sin responsable"
        >
          <WarningCircle size={13} weight="fill" />
          Asignar pendientes
          {(stats?.sin_asignar ?? 0) > 0 && (
            <span className="bg-white text-warning text-[10px] font-black px-1.5 py-0.5 rounded">
              {stats?.sin_asignar}
            </span>
          )}
        </button>
      )}

      {/* Indicador inline de "filtrados de cargados" cuando hay filtros */}
      {activePills.length > 0 && (
        <span className={`inline-flex items-center gap-1 text-[11px] text-muted-foreground ${showAssignBtn ? '' : 'ml-auto'}`}>
          <Lightning size={11} weight="fill" className="text-primary" />
          <strong className="text-foreground">{filteredCount}</strong> filtrados
        </span>
      )}
    </div>
  );
}

// ─── Subcomponentes ────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5 border-b border-border last:border-b-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[90px_1fr] items-center gap-2">
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// Duplicados de LeadsPage para no acoplarnos a internal helpers. Si LeadsPage v1
// muere, estos quedan vivos aquí.
type ChipTone = 'default' | 'danger' | 'warning';
function QuickChip({ active, onClick, label, count, tone = 'default' }: { active: boolean; onClick: () => void; label: string; count?: number; tone?: ChipTone }) {
  const toneActive: string = ({
    default: 'bg-primary text-primary-foreground',
    danger: 'bg-destructive text-destructive-foreground',
    warning: 'bg-warning text-warning-foreground',
  } as Record<ChipTone, string>)[tone];
  const toneIdleCount: string = ({
    default: 'bg-primary/15 text-primary',
    danger: 'bg-destructive-soft text-destructive-soft-foreground',
    warning: 'bg-warning-soft text-warning-soft-foreground',
  } as Record<ChipTone, string>)[tone];
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
function StatPill({ label, value, dot }: { label: string; value: number; dot?: string }) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-muted/40 flex-shrink-0">
      {dot && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />}
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );
}
