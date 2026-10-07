import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, MagnifyingGlass, ArrowsClockwise, Warning, X, SlidersHorizontal, ArrowClockwise } from '@phosphor-icons/react';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectContext } from '@/contexts/ProjectContext';
import usePermission from '@/shared/hooks/usePermission';
import { toast } from '@/shared/hooks/useToast';
import PageHeader from '@/shared/components/ui/PageHeader';
import Select from '@/shared/components/ui/Select';
import { Button } from '@/shared/components/ui/button';
import { avatarColorFor, getInitials, inputClass } from '@/shared/lib/ui';
import * as tasksApi from '../api/tasks.api';
import { TaskColumn } from '../components/TaskColumn';
import { TaskModal } from '../components/TaskModal';
import { TeamTasksMetrics } from '../components/TeamTasksMetrics';
import { TasksReviewView } from '../components/TasksReviewView';
import { TaskBoardConfigModal } from '../components/TaskBoardConfigModal';
import { DEFAULT_COLUMNS, COLUMN_COLORS, PRIORITY, STATUS_LABEL, neighboursAt } from '../lib/taskUi';
import type {
  Assignee,
  TagName,
  Task,
  TaskArea,
  TaskColumn as TaskColumnType,
  TaskExternalProject,
  TaskPriority,
  TaskStatus,
  TeamMemberMetric,
} from '../types';

// «Mi tablero» por defecto. Quien tiene permiso puede elegir «Por revisar»,
// «Todo el equipo» o a una persona concreta (#210 y 07/10).
type Vista = 'mio' | 'review' | 'equipo' | number;

type Filtros = {
  search: string;
  projectId: number | '';
  externalProjectId: number | '';
  areaId: number | '';
  priority: TaskPriority | '';
  tag: string;
  vencidas: boolean;
  desde: string;
  hasta: string;
};

const SIN_FILTROS: Filtros = {
  search: '',
  projectId: '',
  externalProjectId: '',
  areaId: '',
  priority: '',
  tag: '',
  vencidas: false,
  desde: '',
  hasta: '',
};

type Carril = { userId: number | null; nombre: string; tasks: Task[] };

export default function TasksPage() {
  const { user } = useAuth();
  const { projects } = useProjectContext();
  const { can, isAdmin } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();

  const yo: number = user?.id ?? 0;
  const canViewAll = isAdmin || can('tasks.view_all');
  const canAssign = isAdmin || can('tasks.assign');
  const canArchiveAny = isAdmin || can('tasks.delete');
  const canCreate = isAdmin || can('tasks.create');
  const canClose = isAdmin || can('tasks.close');
  const canManage = isAdmin || can('tasks.manage');

  const [vista, setVista] = useState<Vista>('mio');
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [busqueda, setBusqueda] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reviewTasks, setReviewTasks] = useState<Task[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [etiquetas, setEtiquetas] = useState<TagName[]>([]);
  const [areas, setAreas] = useState<TaskArea[]>([]);
  const [proyectosExt, setProyectosExt] = useState<TaskExternalProject[]>([]);
  const [columnasConfig, setColumnasConfig] = useState<TaskColumnType[]>([]);

  const [metricas, setMetricas] = useState<TeamMemberMetric[]>([]);
  const [cargandoMetricas, setCargandoMetricas] = useState(false);
  const [arrastrando, setArrastrando] = useState<Task | null>(null);
  const [nueva, setNueva] = useState<{ status: TaskStatus } | null>(null);
  const [porRevisar, setPorRevisar] = useState(0);
  const [configAbierta, setConfigAbierta] = useState(false);

  const misProyectos = useMemo(
    () => (projects || []).filter((p: { id: number; isAll?: boolean }) => p.id > 0 && !p.isAll)
      .map((p: { id: number; nombre: string }) => ({ id: p.id, nombre: p.nombre })),
    [projects]
  );

  // La tarea abierta va en la URL (?id=): asi los avisos de la campana y del
  // correo abren justo esa tarjeta.
  const abiertaId = Number(searchParams.get('id')) || null;
  const abrir = (id: number) => setSearchParams((p) => { p.set('id', String(id)); return p; });
  const cerrar = useCallback(() => {
    setNueva(null);
    setSearchParams((p) => { p.delete('id'); return p; });
  }, [setSearchParams]);

  // La busqueda espera a que se deje de teclear.
  useEffect(() => {
    const t = setTimeout(() => setFiltros((f) => (f.search === busqueda ? f : { ...f, search: busqueda })), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const cargarTareas = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      if (vista === 'review') {
        const rev = await tasksApi.getReviewTasks();
        setReviewTasks(rev);
        setTasks(rev);
      } else {
        const assigned_to = vista === 'mio' ? yo : vista === 'equipo' ? undefined : vista;
        const data = await tasksApi.getTasks({
          assigned_to: assigned_to || undefined,
          search: filtros.search.trim() || undefined,
          project_id: filtros.projectId || undefined,
          external_project_id: filtros.externalProjectId || undefined,
          area_id: filtros.areaId || undefined,
          priority: filtros.priority || undefined,
          tag: filtros.tag || undefined,
          vencidas: filtros.vencidas || undefined,
          desde: filtros.desde || undefined,
          hasta: filtros.hasta || undefined,
        });
        setTasks(data);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      setErrorCarga(msg);
      toast({ title: 'No se pudieron cargar las tareas', description: msg, variant: 'destructive' });
    } finally {
      setCargando(false);
    }
  }, [vista, yo, filtros]);

  const cargarExtras = useCallback(async () => {
    tasksApi.getTagNames().then(setEtiquetas).catch(() => setEtiquetas([]));
    tasksApi.getAreas().then(setAreas).catch(() => setAreas([]));
    tasksApi.getExternalProjects().then(setProyectosExt).catch(() => setProyectosExt([]));
    tasksApi.getColumns().then(setColumnasConfig).catch(() => setColumnasConfig([]));
    if (canViewAll || canAssign) {
      tasksApi.getAssignees().then(setAssignees).catch(() => setAssignees([]));
    }
  }, [canViewAll, canAssign]);

  const cargarMetricas = useCallback(async () => {
    if (vista !== 'equipo' || !canViewAll) return;
    setCargandoMetricas(true);
    try {
      setMetricas(await tasksApi.getTeamMetrics(filtros.projectId || undefined));
    } catch (err) {
      toast({ title: 'No se pudieron cargar las métricas del equipo', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setCargandoMetricas(false);
    }
  }, [vista, canViewAll, filtros.projectId]);

  const cargarPorRevisar = useCallback(async () => {
    if (!canClose) return;
    try {
      const res = await tasksApi.getReviewCount();
      setPorRevisar(res.count);
    } catch {
      setPorRevisar(0);
    }
  }, [canClose]);

  useEffect(() => { cargarTareas(); }, [cargarTareas]);
  useEffect(() => { cargarExtras(); }, [cargarExtras]);
  useEffect(() => { cargarMetricas(); }, [cargarMetricas]);
  useEffect(() => { cargarPorRevisar(); }, [cargarPorRevisar]);

  const refrescar = useCallback(() => {
    cargarTareas();
    cargarMetricas();
    cargarPorRevisar();
    cargarExtras();
  }, [cargarTareas, cargarMetricas, cargarPorRevisar, cargarExtras]);

  // Columnas activas: si vienen de la base de datos se usan esas; si no, las 4 por defecto.
  const columnasActivas = useMemo(() => {
    if (columnasConfig && columnasConfig.length > 0) {
      return columnasConfig
        .filter((c) => c.is_active)
        .sort((a, b) => a.position - b.position)
        .map((c) => {
          const colorStyles = COLUMN_COLORS[c.color] || COLUMN_COLORS.gray;
          return {
            key: c.key as TaskStatus,
            label: c.name,
            dot: colorStyles.dot,
            head: colorStyles.head,
          };
        });
    }
    return DEFAULT_COLUMNS;
  }, [columnasConfig]);

  // Los carriles: uno solo, o uno por persona en «Todo el equipo».
  const carriles: Carril[] = useMemo(() => {
    if (vista === 'review') return [];
    if (vista !== 'equipo') {
      const nombre = vista === 'mio' ? 'Mi tablero' : assignees.find((a) => a.id === vista)?.nombre || '';
      return [{ userId: vista === 'mio' ? yo : vista, nombre, tasks }];
    }
    const porPersona = new Map<number | null, Carril>();
    for (const t of tasks) {
      const k = t.assigned_to;
      if (!porPersona.has(k)) porPersona.set(k, { userId: k, nombre: t.assigned_to_name || 'Sin responsable', tasks: [] });
      porPersona.get(k)!.tasks.push(t);
    }
    return [...porPersona.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [vista, tasks, assignees, yo]);

  const puedeArrastrar = (t: Task) => canClose || t.status !== 'hecha';

  function empezarArrastre(e: DragEvent<HTMLDivElement>, t: Task) {
    setArrastrando(t);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(t.id));
  }

  async function soltar(columna: Task[], status: TaskStatus, index: number) {
    const t = arrastrando;
    setArrastrando(null);
    if (!t) return;

    // Solo administración o quien tenga tasks.close cierra una tarea.
    if (status === 'hecha' && t.status !== 'hecha' && !canClose) {
      toast({ title: 'Solo administración cierra una tarea', description: 'Llévala a «En revisión» y la cerrarán.', variant: 'destructive' });
      return;
    }
    const vecinas = neighboursAt(columna, index, t.id);
    if (!vecinas && status === t.status) return; // se solto donde estaba

    // Se pinta ya en su sitio y luego se confirma con el servidor.
    const pos = (id: number | null | undefined) => tasks.find((x) => x.id === id)?.position;
    const prev = pos(vecinas?.prev_id);
    const next = pos(vecinas?.next_id);
    const provisional = prev != null && next != null ? (prev + next) / 2
      : prev != null ? prev + 1000 : next != null ? next / 2 : Number.MAX_SAFE_INTEGER;
    const antes = tasks;
    setTasks((ts) => ts
      .map((x) => (x.id === t.id ? { ...x, status, position: provisional } : x))
      .sort((a, b) => a.position - b.position));

    try {
      await tasksApi.moveTask(t.id, { status, prev_id: vecinas?.prev_id ?? null, next_id: vecinas?.next_id ?? null });
      if (status !== t.status) toast({ title: `Movida a «${STATUS_LABEL[status] || status}»` });
      refrescar();
    } catch (err) {
      setTasks(antes);
      toast({ title: 'No se pudo mover la tarea', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    }
  }

  const hayFiltros = JSON.stringify(filtros) !== JSON.stringify(SIN_FILTROS);
  const opcionesVista: Array<{ value: Vista; label: string }> = [
    { value: 'mio', label: 'Mi tablero' },
    ...(canClose ? [{ value: 'review' as Vista, label: porRevisar > 0 ? `Por revisar (${porRevisar})` : 'Por revisar' }] : []),
    ...(canViewAll ? [{ value: 'equipo' as Vista, label: 'Todo el equipo' }] : []),
    ...(canViewAll ? assignees.filter((a) => a.id !== yo).map((a) => ({ value: a.id as Vista, label: a.nombre })) : []),
  ];

  // Si se crea una tarea viendo el tablero de otra persona, asignarle por defecto a esa persona.
  const defaultAssigneeId = typeof vista === 'number' ? vista : yo;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tareas"
        subtitle={
          vista === 'review'
            ? 'Tareas esperando revisión de todo el equipo'
            : vista === 'equipo'
            ? 'Todo el equipo, por persona'
            : 'Arrastra las tarjetas para avanzar o reordenarlas'
        }
        actions={(
          <div className="flex items-center gap-2">
            {opcionesVista.length > 1 && (
              <Select<Vista>
                value={vista}
                onChange={setVista}
                options={opcionesVista}
                ariaLabel="Tablero de"
                size="sm"
                className="w-48"
              />
            )}
            {canManage && (
              <Button
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => setConfigAbierta(true)}
                title="Configurar columnas, áreas y proyectos propios"
              >
                <SlidersHorizontal size={15} className="mr-1.5" />
                Configurar tablero
              </Button>
            )}
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={refrescar} aria-label="Recargar">
              <ArrowsClockwise size={16} />
            </Button>
            {canCreate && (
              <Button size="sm" className="h-9" onClick={() => setNueva({ status: 'por_hacer' })}>
                <Plus size={15} weight="bold" className="mr-1.5" /> Nueva tarea
              </Button>
            )}
          </div>
        )}
      />

      {/* Filtros (solo para tableros, no en la vista Por revisar) */}
      {vista !== 'review' && (
        <div className="bg-card border border-border rounded-lg p-3 flex flex-wrap items-end gap-2">
          <div className="relative flex-1 min-w-[12rem]">
            <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar en título o descripción…"
              aria-label="Buscar"
              className={`${inputClass} pl-9`}
            />
          </div>
          <Select<number | ''>
            value={filtros.projectId}
            onChange={(v) => setFiltros((f) => ({ ...f, projectId: v }))}
            options={[{ value: '', label: 'Todos los proyectos' }, ...misProyectos.map((p) => ({ value: p.id as number | '', label: p.nombre }))]}
            ariaLabel="Proyecto"
            size="sm"
            className="w-44"
          />
          {proyectosExt.length > 0 && (
            <Select<number | ''>
              value={filtros.externalProjectId}
              onChange={(v) => setFiltros((f) => ({ ...f, externalProjectId: v }))}
              options={[{ value: '', label: 'Cualquier proy. propio' }, ...proyectosExt.map((p) => ({ value: p.id as number | '', label: p.name }))]}
              ariaLabel="Proyecto propio"
              size="sm"
              className="w-44"
            />
          )}
          {areas.length > 0 && (
            <Select<number | ''>
              value={filtros.areaId}
              onChange={(v) => setFiltros((f) => ({ ...f, areaId: v }))}
              options={[{ value: '', label: 'Todas las áreas' }, ...areas.map((a) => ({ value: a.id as number | '', label: a.name }))]}
              ariaLabel="Área"
              size="sm"
              className="w-40"
            />
          )}
          <Select<TaskPriority | ''>
            value={filtros.priority}
            onChange={(v) => setFiltros((f) => ({ ...f, priority: v }))}
            options={[{ value: '', label: 'Cualquier prioridad' }, ...(['alta', 'media', 'baja'] as const).map((p) => ({ value: p as TaskPriority | '', label: PRIORITY[p].label }))]}
            ariaLabel="Prioridad"
            size="sm"
            className="w-40"
          />
          <Select<string>
            value={filtros.tag}
            onChange={(v) => setFiltros((f) => ({ ...f, tag: v }))}
            options={[{ value: '', label: 'Cualquier etiqueta' }, ...etiquetas.map((t) => ({ value: t.name, label: `${t.name} (${t.total})` }))]}
            ariaLabel="Etiqueta"
            size="sm"
            className="w-40"
          />
          <label className="flex flex-col text-[11px] text-muted-foreground">
            Vence desde
            <input type="date" value={filtros.desde} onChange={(e) => setFiltros((f) => ({ ...f, desde: e.target.value }))} className={`${inputClass} w-36`} />
          </label>
          <label className="flex flex-col text-[11px] text-muted-foreground">
            hasta
            <input type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => setFiltros((f) => ({ ...f, hasta: e.target.value }))} className={`${inputClass} w-36`} />
          </label>
          <Button
            type="button"
            variant={filtros.vencidas ? 'default' : 'outline'}
            size="sm"
            className="h-9"
            aria-pressed={filtros.vencidas}
            onClick={() => setFiltros((f) => ({ ...f, vencidas: !f.vencidas }))}
          >
            <Warning size={14} className="mr-1.5" /> Solo vencidas
          </Button>
          {hayFiltros && (
            <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => { setFiltros(SIN_FILTROS); setBusqueda(''); }}>
              <X size={14} className="mr-1" /> Quitar filtros
            </Button>
          )}
        </div>
      )}

      {/* Error state with Reintentar */}
      {errorCarga && !cargando && (
        <div className="rounded-lg border border-destructive/30 bg-destructive-soft text-destructive-soft-foreground p-6 text-center space-y-3">
          <p className="font-semibold text-sm">Ocurrió un problema al cargar las tareas</p>
          <p className="text-xs text-muted-foreground">{errorCarga}</p>
          <Button size="sm" variant="outline" onClick={cargarTareas}>
            <ArrowClockwise size={14} className="mr-1.5" /> Reintentar
          </Button>
        </div>
      )}

      {/* Vista Por Revisar */}
      {vista === 'review' ? (
        <TasksReviewView
          tasks={reviewTasks}
          loading={cargando}
          onOpenTask={(t) => abrir(t.id)}
          onRefresh={refrescar}
        />
      ) : (
        <>
          {vista === 'equipo' && (
            <TeamTasksMetrics metrics={metricas} loading={cargandoMetricas} onSelectUser={(id) => setVista(id === yo ? 'mio' : id)} />
          )}

          {cargando && tasks.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Cargando el tablero…</p>
          ) : vista === 'equipo' && carriles.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {hayFiltros ? 'Ninguna tarea cumple esos filtros.' : 'Nadie tiene tareas abiertas.'}
            </p>
          ) : (
            carriles.map((carril) => {
              const mismoCarril = arrastrando && (vista !== 'equipo' || arrastrando.assigned_to === carril.userId);
              return (
                <section key={String(carril.userId)} className="space-y-2">
                  {vista === 'equipo' && (
                    <button
                      type="button"
                      onClick={() => carril.userId && setVista(carril.userId === yo ? 'mio' : carril.userId)}
                      className="flex items-center gap-2 text-sm font-semibold hover:underline"
                    >
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${avatarColorFor(carril.userId || 0)}`}>
                        {getInitials(carril.nombre)}
                      </span>
                      {carril.nombre}
                      <span className="text-xs font-normal text-muted-foreground tabular-nums">· {carril.tasks.length}</span>
                    </button>
                  )}
                  <div className="flex gap-3 overflow-x-auto pb-3 snap-x snap-mandatory sm:snap-none -mx-4 px-4 lg:mx-0 lg:px-0">
                    {columnasActivas.map((col) => {
                      const columna = carril.tasks.filter((t) => t.status === col.key);
                      return (
                        <TaskColumn
                          key={col.key}
                          status={col.key}
                          label={col.label}
                          dot={col.dot}
                          head={col.head}
                          tasks={columna}
                          dragging={mismoCarril ? arrastrando : null}
                          canCreate={canCreate && vista !== 'equipo' && (vista === 'mio' || canAssign)}
                          canDragTask={puedeArrastrar}
                          showAssignee={vista === 'equipo'}
                          onOpen={(t) => abrir(t.id)}
                          onAdd={(status) => setNueva({ status })}
                          onDragStart={empezarArrastre}
                          onDragEnd={() => setArrastrando(null)}
                          onDropAt={(status, index) => soltar(columna, status, index)}
                        />
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </>
      )}

      {/* Modal de Tarea */}
      <TaskModal
        open={abiertaId != null || nueva != null}
        taskId={abiertaId}
        initialStatus={nueva?.status}
        initialProjectId={filtros.projectId || null}
        defaultAssigneeId={defaultAssigneeId}
        onClose={cerrar}
        onChanged={refrescar}
        currentUserId={yo}
        isAdmin={isAdmin}
        canAssign={canAssign}
        canArchiveAny={canArchiveAny}
        canClose={canClose}
        assignees={assignees}
        projects={misProyectos}
      />

      {/* Modal de Configuración del Tablero */}
      <TaskBoardConfigModal
        open={configAbierta}
        onClose={() => setConfigAbierta(false)}
        onChanged={refrescar}
        assignees={assignees}
      />
    </div>
  );
}
