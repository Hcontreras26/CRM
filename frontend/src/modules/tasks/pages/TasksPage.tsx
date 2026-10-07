import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, MagnifyingGlass, ArrowsClockwise, Warning, X, Eye } from '@phosphor-icons/react';
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
import { COLUMNS, PRIORITY, STATUS_LABEL, neighboursAt } from '../lib/taskUi';
import type { Assignee, TagName, Task, TaskPriority, TaskStatus, TeamMemberMetric } from '../types';

// «Mi tablero» por defecto. Quien ve todo puede elegir a otra persona o
// «Todo el equipo», que agrupa por persona (#210).
type Vista = 'mio' | 'equipo' | number;

type Filtros = {
  search: string;
  projectId: number | '';
  priority: TaskPriority | '';
  tag: string;
  vencidas: boolean;
  desde: string;
  hasta: string;
};

const SIN_FILTROS: Filtros = { search: '', projectId: '', priority: '', tag: '', vencidas: false, desde: '', hasta: '' };

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

  const [vista, setVista] = useState<Vista>('mio');
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [busqueda, setBusqueda] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cargando, setCargando] = useState(true);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [etiquetas, setEtiquetas] = useState<TagName[]>([]);
  const [metricas, setMetricas] = useState<TeamMemberMetric[]>([]);
  const [cargandoMetricas, setCargandoMetricas] = useState(false);
  const [arrastrando, setArrastrando] = useState<Task | null>(null);
  const [nueva, setNueva] = useState<{ status: TaskStatus } | null>(null);
  const [porRevisar, setPorRevisar] = useState(0);

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
    try {
      const assigned_to = vista === 'mio' ? yo : vista === 'equipo' ? undefined : vista;
      const data = await tasksApi.getTasks({
        assigned_to: assigned_to || undefined,
        search: filtros.search.trim() || undefined,
        project_id: filtros.projectId || undefined,
        priority: filtros.priority || undefined,
        tag: filtros.tag || undefined,
        vencidas: filtros.vencidas || undefined,
        desde: filtros.desde || undefined,
        hasta: filtros.hasta || undefined,
      });
      setTasks(data);
    } catch (err) {
      toast({ title: 'No se pudieron cargar las tareas', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setCargando(false);
    }
  }, [vista, yo, filtros]);

  const cargarExtras = useCallback(async () => {
    tasksApi.getTagNames().then(setEtiquetas).catch(() => setEtiquetas([]));
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

  useEffect(() => { cargarTareas(); }, [cargarTareas]);
  useEffect(() => { cargarExtras(); }, [cargarExtras]);
  useEffect(() => { cargarMetricas(); }, [cargarMetricas]);

  // Quien cierra tareas (decision 4) tiene que enterarse de lo que espera su
  // revision aunque este en «Mi tablero»: esas tareas son de otras personas y
  // en su tablero no salen.
  const cargarPorRevisar = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const enRevision = await tasksApi.getTasks({ status: 'en_revision' });
      setPorRevisar(enRevision.filter((t) => t.assigned_to !== yo).length);
    } catch {
      setPorRevisar(0);
    }
  }, [isAdmin, yo]);
  useEffect(() => { cargarPorRevisar(); }, [cargarPorRevisar]);

  const refrescar = useCallback(() => {
    cargarTareas();
    cargarMetricas();
    cargarPorRevisar();
    tasksApi.getTagNames().then(setEtiquetas).catch(() => undefined);
  }, [cargarTareas, cargarMetricas, cargarPorRevisar]);

  // Los carriles: uno solo, o uno por persona en «Todo el equipo».
  const carriles: Carril[] = useMemo(() => {
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

  const puedeArrastrar = (t: Task) => isAdmin || t.status !== 'hecha';

  function empezarArrastre(e: DragEvent<HTMLDivElement>, t: Task) {
    setArrastrando(t);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(t.id));
  }

  async function soltar(columna: Task[], status: TaskStatus, index: number) {
    const t = arrastrando;
    setArrastrando(null);
    if (!t) return;

    // Decision 4, tambien aqui para no hacer un viaje que el servidor rechazaria.
    if (status === 'hecha' && t.status !== 'hecha' && !isAdmin) {
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
      if (status !== t.status) toast({ title: `Movida a «${STATUS_LABEL[status]}»` });
      refrescar();
    } catch (err) {
      setTasks(antes);
      toast({ title: 'No se pudo mover la tarea', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    }
  }

  const hayFiltros = JSON.stringify(filtros) !== JSON.stringify(SIN_FILTROS);
  const opcionesVista = [
    { value: 'mio' as Vista, label: 'Mi tablero' },
    { value: 'equipo' as Vista, label: 'Todo el equipo' },
    ...assignees.filter((a) => a.id !== yo).map((a) => ({ value: a.id as Vista, label: a.nombre })),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tareas"
        subtitle={vista === 'equipo' ? 'Todo el equipo, por persona' : 'Arrastra las tarjetas para avanzar o reordenarlas'}
        actions={(
          <div className="flex items-center gap-2">
            {canViewAll && (
              <Select<Vista>
                value={vista}
                onChange={setVista}
                options={opcionesVista}
                ariaLabel="Tablero de"
                size="sm"
                className="w-44"
              />
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

      {/* Filtros */}
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

      {isAdmin && vista !== 'equipo' && porRevisar > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning-soft text-warning-soft-foreground px-4 py-2.5 text-sm">
          <span className="flex items-center gap-2">
            <Eye size={16} />
            {porRevisar === 1
              ? '1 tarea del equipo espera tu revisión.'
              : `${porRevisar} tareas del equipo esperan tu revisión.`}
          </span>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setVista('equipo')}>
            Ver en «Todo el equipo»
          </Button>
        </div>
      )}

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
          // Se arrastra dentro de un mismo carril: mover una tarjeta no la cambia de persona.
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
                {COLUMNS.map((col) => {
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

      <TaskModal
        open={abiertaId != null || nueva != null}
        taskId={abiertaId}
        initialStatus={nueva?.status}
        initialProjectId={filtros.projectId || null}
        onClose={cerrar}
        onChanged={refrescar}
        currentUserId={yo}
        isAdmin={isAdmin}
        canAssign={canAssign}
        canArchiveAny={canArchiveAny}
        assignees={assignees}
        projects={misProyectos}
      />
    </div>
  );
}
