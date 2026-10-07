import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  X, Trash, CheckSquare, ChatCircle, ClockCounterClockwise, Plus, PaperPlaneRight, Tag, LinkSimple, ArrowSquareOut,
} from '@phosphor-icons/react';
import Portal from '@/shared/components/ui/portal';
import Field from '@/shared/components/ui/Field';
import Select from '@/shared/components/ui/Select';
import ConfirmDialog from '@/shared/components/ui/ConfirmDialog';
import { Button } from '@/shared/components/ui/button';
import { useEscapeKey } from '@/shared/hooks/useDialogA11y';
import { toast } from '@/shared/hooks/useToast';
import { inputClass } from '@/shared/lib/ui';
import * as tasksApi from '../api/tasks.api';
import {
  COLUMNS, PRIORITY, STATUS_LABEL, TAG_COLORS, fromDateInput, tagChip, toDateInput,
} from '../lib/taskUi';
import type {
  Assignee, TagColor, TaskDetail, TaskEvent, TaskPriority, TaskStatus,
} from '../types';

interface TaskModalProps {
  open: boolean;
  /** La tarea que se abre; `null` para crear una nueva. */
  taskId: number | null;
  /** Para una nueva: en que columna y con que proyecto empieza. */
  initialStatus?: TaskStatus;
  initialProjectId?: number | null;
  onClose: () => void;
  /** Algo cambio: el tablero se vuelve a pedir. */
  onChanged: () => void;
  currentUserId: number;
  isAdmin: boolean;
  canAssign: boolean;
  canArchiveAny: boolean;
  assignees: Assignee[];
  projects: Array<{ id: number; nombre: string }>;
}

const errorDe = (err: unknown, porDefecto: string) =>
  (err instanceof Error && err.message) ? err.message : porDefecto;

const fallo = (titulo: string, err: unknown) =>
  toast({ title: titulo, description: errorDe(err, 'Inténtalo de nuevo.'), variant: 'destructive' });

const textareaClass = inputClass.replace('h-9', 'min-h-[72px] py-2') + ' resize-y';

/** Una linea del historial, en castellano. */
function describir(ev: TaskEvent): string {
  const d = ev.details || {};
  const estado = (k: unknown) => STATUS_LABEL[k as TaskStatus] || String(k ?? '');
  switch (ev.event_type) {
    case 'created': return 'creó la tarea';
    case 'status_changed': return `la movió de «${estado(d.old_status)}» a «${estado(d.new_status)}»`;
    case 'reordered': return 'la cambió de sitio en la columna';
    case 'assigned': return 'cambió el responsable';
    case 'updated': return `editó ${Object.keys(d).join(', ') || 'la tarea'}`;
    case 'archived': return 'la archivó';
    case 'comment': return 'comentó';
    case 'checklist': {
      const que = { item_added: 'añadió', item_checked: 'marcó', item_unchecked: 'desmarcó', item_removed: 'quitó' }[String(d.action)] || 'cambió';
      return `${que} «${String(d.title ?? '')}» en la lista`;
    }
    case 'tag': return `${d.action === 'removed' ? 'quitó' : 'añadió'} la etiqueta «${String(d.name ?? '')}»`;
    case 'link': return `${d.action === 'removed' ? 'quitó' : 'añadió'} un enlace`;
    default: return ev.event_type;
  }
}

export function TaskModal({
  open, taskId, initialStatus = 'por_hacer', initialProjectId = null, onClose, onChanged,
  currentUserId, isAdmin, canAssign, canArchiveAny, assignees, projects,
}: TaskModalProps) {
  useEscapeKey(onClose, open);
  const editando = taskId != null;

  const [tab, setTab] = useState<'detalles' | 'historial'>('detalles');
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [confirmarArchivo, setConfirmarArchivo] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('por_hacer');
  const [priority, setPriority] = useState<TaskPriority>('media');
  const [dueDate, setDueDate] = useState('');
  const [projectId, setProjectId] = useState<number | ''>('');
  const [assignedTo, setAssignedTo] = useState<number>(currentUserId);

  const [nuevoPaso, setNuevoPaso] = useState('');
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState('');
  const [colorEtiqueta, setColorEtiqueta] = useState<TagColor>('sky');
  const [nuevoEnlace, setNuevoEnlace] = useState('');
  const [tituloEnlace, setTituloEnlace] = useState('');

  const rellenar = useCallback((t: TaskDetail) => {
    setTask(t);
    setTitle(t.title);
    setDescription(t.description || '');
    setStatus(t.status);
    setPriority(t.priority);
    setDueDate(toDateInput(t.due_date));
    setProjectId(t.project_id ?? '');
    setAssignedTo(t.assigned_to ?? currentUserId);
  }, [currentUserId]);

  const recargar = useCallback(async (id: number) => {
    try {
      rellenar(await tasksApi.getTaskById(id));
    } catch (err) {
      fallo('No se pudo abrir la tarea', err);
      onClose();
    }
  }, [rellenar, onClose]);

  useEffect(() => {
    if (!open) return;
    setTab('detalles');
    setConfirmarArchivo(false);
    if (taskId != null) {
      setCargando(true);
      recargar(taskId).finally(() => setCargando(false));
    } else {
      setTask(null);
      setTitle('');
      setDescription('');
      setStatus(initialStatus);
      setPriority('media');
      setDueDate('');
      setProjectId(initialProjectId ?? '');
      setAssignedTo(currentUserId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId]);

  if (!open) return null;

  // Decision 4: «Hecha» solo la ponen o la quitan admin y superadmin.
  const opcionesEstado = COLUMNS
    .filter((c) => isAdmin || (c.key !== 'hecha' && (!editando || task?.status !== 'hecha')))
    .map((c) => ({ value: c.key, label: c.label }));
  const estadoBloqueado = editando && task?.status === 'hecha' && !isAdmin;

  const opcionesProyecto = [
    { value: '' as number | '', label: 'Sin proyecto' },
    ...projects.map((p) => ({ value: p.id as number | '', label: p.nombre })),
  ];
  const opcionesResponsable = (assignees.length ? assignees : [{ id: currentUserId, nombre: 'Yo', email: '', role: '' }])
    .map((a) => ({ value: a.id, label: a.id === currentUserId ? `${a.nombre} (yo)` : a.nombre }));

  const puedeArchivar = editando && task != null && (canArchiveAny || task.created_by === currentUserId);

  async function guardar(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast({ title: 'El título es obligatorio', variant: 'destructive' });
      return;
    }
    const payload: tasksApi.TaskPayload = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      due_date: fromDateInput(dueDate),
      project_id: projectId === '' ? null : projectId,
    };
    // Solo quien puede asignar manda el responsable: al resto se lo pone el servidor.
    if (canAssign) payload.assigned_to = assignedTo;

    setGuardando(true);
    try {
      if (editando && task) {
        await tasksApi.updateTask(task.id, payload);
        toast({ title: 'Tarea guardada' });
      } else {
        await tasksApi.createTask({ ...payload, status });
        toast({ title: 'Tarea creada' });
      }
      onChanged();
      onClose();
    } catch (err) {
      fallo('No se pudo guardar la tarea', err);
    } finally {
      setGuardando(false);
    }
  }

  // «Mover a…»: en una tarea ya creada el estado se cambia al momento, con las
  // reglas del servidor. Es tambien la forma de moverla en el movil.
  async function moverA(nuevo: TaskStatus) {
    if (!task || nuevo === task.status) return;
    try {
      await tasksApi.moveTask(task.id, { status: nuevo });
      toast({ title: `Movida a «${STATUS_LABEL[nuevo]}»` });
      await recargar(task.id);
      onChanged();
    } catch (err) {
      fallo('No se pudo mover', err);
    }
  }

  async function archivar() {
    if (!task) return;
    try {
      await tasksApi.archiveTask(task.id);
      toast({ title: 'Tarea archivada' });
      onChanged();
      onClose();
    } catch (err) {
      fallo('No se pudo archivar', err);
    } finally {
      setConfirmarArchivo(false);
    }
  }

  /** Para lo que cuelga de la tarjeta: hace la llamada, recarga y avisa si falla. */
  async function cambio(fn: () => Promise<unknown>, siFalla: string, despues?: () => void) {
    if (!task) return;
    try {
      await fn();
      despues?.();
      await recargar(task.id);
      onChanged();
    } catch (err) {
      fallo(siFalla, err);
    }
  }

  const hechos = task?.checklist.filter((c) => c.is_completed).length ?? 0;
  const pasos = task?.checklist.length ?? 0;

  return (
    <Portal>
      <div className="fixed inset-0 !m-0 z-[70] flex items-center justify-center sm:p-4">
        <div className="fixed inset-0 !m-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-modal-title"
          className="relative bg-card sm:rounded-lg border border-border w-full max-w-2xl h-full sm:h-auto sm:max-h-[90vh] flex flex-col"
        >
          {/* Cabecera */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
            <div className="flex items-center gap-3 min-w-0">
              <h2 id="task-modal-title" className="text-base font-semibold truncate">
                {editando ? 'Tarea' : 'Nueva tarea'}
              </h2>
              {editando && (
                <div className="flex bg-muted p-0.5 rounded-md text-xs" role="tablist">
                  {(['detalles', 'historial'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={tab === t}
                      onClick={() => setTab(t)}
                      className={`px-3 py-1 rounded font-medium inline-flex items-center gap-1.5 ${
                        tab === t ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {t === 'historial' && <ClockCounterClockwise size={13} />}
                      {t === 'detalles' ? 'Detalles' : 'Historial'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          {/* Contenido */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {cargando ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Cargando la tarea…</p>
            ) : tab === 'historial' && task ? (
              <ol className="relative border-l border-border ml-1 space-y-4">
                {task.events.map((ev) => (
                  <li key={ev.id} className="ml-4">
                    <span className="absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full bg-primary ring-4 ring-card" />
                    <p className="text-sm">
                      <span className="font-semibold">{ev.user_name || 'El sistema'}</span>{' '}
                      <span className="text-muted-foreground">{describir(ev)}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {new Date(ev.created_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <form id="task-form" onSubmit={guardar} className="space-y-4">
                <Field label="Título" required htmlFor="task-title">
                  <input
                    id="task-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={255}
                    placeholder="Ej.: Revisar la ficha del máster en la web"
                    className={inputClass}
                    autoFocus={!editando}
                    required
                  />
                </Field>

                <Field label="Descripción" htmlFor="task-desc">
                  <textarea
                    id="task-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Qué hay que hacer, para cuándo y cualquier detalle útil"
                    className={textareaClass}
                  />
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label={editando ? 'Mover a…' : 'Columna'} hint={estadoBloqueado ? 'Cerrada: solo administración la reabre.' : undefined}>
                    <Select<TaskStatus>
                      value={status}
                      onChange={(v) => (editando ? moverA(v) : setStatus(v))}
                      options={estadoBloqueado ? [{ value: 'hecha', label: 'Hecha' }] : opcionesEstado}
                      disabled={estadoBloqueado}
                      ariaLabel="Columna"
                    />
                  </Field>

                  <Field label="Prioridad">
                    <Select<TaskPriority>
                      value={priority}
                      onChange={setPriority}
                      options={(['alta', 'media', 'baja'] as const).map((p) => ({ value: p, label: PRIORITY[p].label }))}
                      ariaLabel="Prioridad"
                    />
                  </Field>

                  <Field label="Fecha límite" htmlFor="task-due">
                    <input
                      id="task-due"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Proyecto o web">
                    <Select<number | ''>
                      value={projectId}
                      onChange={setProjectId}
                      options={opcionesProyecto}
                      ariaLabel="Proyecto"
                    />
                  </Field>

                  <Field
                    label="Responsable"
                    className="sm:col-span-2"
                    hint={canAssign ? undefined : 'Tus tareas son para ti. Asignar a otra persona lo hace administración.'}
                  >
                    {canAssign ? (
                      <Select<number>
                        value={assignedTo}
                        onChange={setAssignedTo}
                        options={opcionesResponsable}
                        ariaLabel="Responsable"
                      />
                    ) : (
                      <p className={`${inputClass} flex items-center text-muted-foreground`}>
                        {task?.assigned_to_name || 'Yo'}
                      </p>
                    )}
                  </Field>
                </div>

                {editando && task && (
                  <>
                    {/* Lista de comprobación */}
                    <section className="pt-4 border-t border-border space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <CheckSquare size={14} /> Lista de comprobación
                        {pasos > 0 && <span className="tabular-nums normal-case">· {hechos}/{pasos}</span>}
                      </h3>
                      {pasos > 0 && (
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary transition-all" style={{ width: `${(hechos / pasos) * 100}%` }} />
                        </div>
                      )}
                      <ul className="space-y-1">
                        {task.checklist.map((item) => (
                          <li key={item.id} className="flex items-center gap-2 group rounded-md px-1 py-1 hover:bg-muted/50">
                            <input
                              type="checkbox"
                              checked={item.is_completed}
                              onChange={() => cambio(
                                () => tasksApi.updateChecklistItem(task.id, item.id, { is_completed: !item.is_completed }),
                                'No se pudo marcar'
                              )}
                              className="h-4 w-4 rounded border-border accent-primary"
                              aria-label={item.title}
                            />
                            <span className={`flex-1 text-sm ${item.is_completed ? 'line-through text-muted-foreground' : ''}`}>
                              {item.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => cambio(() => tasksApi.deleteChecklistItem(task.id, item.id), 'No se pudo quitar')}
                              aria-label={`Quitar ${item.title}`}
                              className="p-1 text-muted-foreground hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                            >
                              <Trash size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="flex gap-2">
                        <input
                          value={nuevoPaso}
                          onChange={(e) => setNuevoPaso(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (nuevoPaso.trim()) cambio(() => tasksApi.addChecklistItem(task.id, { title: nuevoPaso.trim() }), 'No se pudo añadir', () => setNuevoPaso(''));
                            }
                          }}
                          placeholder="Añadir un paso…"
                          maxLength={255}
                          className={inputClass}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-9"
                          disabled={!nuevoPaso.trim()}
                          onClick={() => cambio(() => tasksApi.addChecklistItem(task.id, { title: nuevoPaso.trim() }), 'No se pudo añadir', () => setNuevoPaso(''))}
                        >
                          <Plus size={14} className="mr-1" /> Añadir
                        </Button>
                      </div>
                    </section>

                    {/* Etiquetas */}
                    <section className="pt-4 border-t border-border space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <Tag size={14} /> Etiquetas
                      </h3>
                      {task.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {task.tags.map((t) => (
                            <span key={t.id} className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded ${tagChip(t.color)}`}>
                              {t.name}
                              <button
                                type="button"
                                onClick={() => cambio(() => tasksApi.deleteTag(task.id, t.id), 'No se pudo quitar la etiqueta')}
                                aria-label={`Quitar etiqueta ${t.name}`}
                                className="opacity-70 hover:opacity-100"
                              >
                                <X size={11} weight="bold" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          value={nuevaEtiqueta}
                          onChange={(e) => setNuevaEtiqueta(e.target.value)}
                          placeholder="Nueva etiqueta…"
                          maxLength={50}
                          className={inputClass}
                        />
                        <Select<TagColor>
                          value={colorEtiqueta}
                          onChange={setColorEtiqueta}
                          options={(Object.keys(TAG_COLORS) as TagColor[]).map((c) => ({ value: c, label: TAG_COLORS[c].label }))}
                          ariaLabel="Color de la etiqueta"
                          className="w-32 flex-shrink-0"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-9"
                          disabled={!nuevaEtiqueta.trim()}
                          onClick={() => cambio(
                            () => tasksApi.addTag(task.id, { name: nuevaEtiqueta.trim(), color: colorEtiqueta }),
                            'No se pudo añadir la etiqueta',
                            () => setNuevaEtiqueta('')
                          )}
                        >
                          Añadir
                        </Button>
                      </div>
                    </section>

                    {/* Enlaces */}
                    <section className="pt-4 border-t border-border space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <LinkSimple size={14} /> Enlaces
                      </h3>
                      <ul className="space-y-1">
                        {task.links.map((l) => (
                          <li key={l.id} className="flex items-center gap-2 group rounded-md px-1 py-1 hover:bg-muted/50">
                            <ArrowSquareOut size={14} className="text-muted-foreground flex-shrink-0" />
                            <a
                              href={l.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 min-w-0 text-sm text-primary hover:underline truncate"
                            >
                              {l.title || l.url}
                            </a>
                            <button
                              type="button"
                              onClick={() => cambio(() => tasksApi.deleteLink(task.id, l.id), 'No se pudo quitar el enlace')}
                              aria-label={`Quitar enlace ${l.title || l.url}`}
                              className="p-1 text-muted-foreground hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                            >
                              <Trash size={14} />
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem_auto] gap-2">
                        <input
                          type="url"
                          value={nuevoEnlace}
                          onChange={(e) => setNuevoEnlace(e.target.value)}
                          placeholder="https://… (web, Drive, issue de GitHub)"
                          className={inputClass}
                        />
                        <input
                          value={tituloEnlace}
                          onChange={(e) => setTituloEnlace(e.target.value)}
                          placeholder="Nombre (opcional)"
                          maxLength={255}
                          className={inputClass}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-9"
                          disabled={!nuevoEnlace.trim()}
                          onClick={() => cambio(
                            () => tasksApi.addLink(task.id, { url: nuevoEnlace.trim(), title: tituloEnlace.trim() || null }),
                            'No se pudo añadir el enlace',
                            () => { setNuevoEnlace(''); setTituloEnlace(''); }
                          )}
                        >
                          Añadir
                        </Button>
                      </div>
                    </section>

                    {/* Comentarios */}
                    <section className="pt-4 border-t border-border space-y-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        <ChatCircle size={14} /> Comentarios
                        {task.comments.length > 0 && <span className="tabular-nums normal-case">· {task.comments.length}</span>}
                      </h3>
                      {task.comments.length === 0 && <p className="text-sm text-muted-foreground">Todavía no hay comentarios.</p>}
                      <ul className="space-y-2">
                        {task.comments.map((c) => (
                          <li key={c.id} className="rounded-md bg-muted/50 border border-border px-3 py-2 group">
                            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span className="font-semibold text-foreground">{c.user_name}</span>
                              <span className="flex items-center gap-2 tabular-nums">
                                {new Date(c.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                                {(isAdmin || c.user_id === currentUserId) && (
                                  <button
                                    type="button"
                                    onClick={() => cambio(() => tasksApi.deleteComment(task.id, c.id), 'No se pudo borrar el comentario')}
                                    aria-label="Borrar comentario"
                                    className="hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                                  >
                                    <Trash size={12} />
                                  </button>
                                )}
                              </span>
                            </div>
                            <p className="text-sm whitespace-pre-wrap break-words mt-0.5">{c.content}</p>
                          </li>
                        ))}
                      </ul>
                      <div className="flex gap-2 items-end">
                        <textarea
                          value={nuevoComentario}
                          onChange={(e) => setNuevoComentario(e.target.value)}
                          rows={2}
                          maxLength={5000}
                          placeholder="Escribe un comentario…"
                          className={textareaClass}
                        />
                        <Button
                          type="button"
                          size="sm"
                          className="h-9"
                          disabled={!nuevoComentario.trim()}
                          onClick={() => cambio(
                            () => tasksApi.addComment(task.id, { content: nuevoComentario.trim() }),
                            'No se pudo publicar el comentario',
                            () => setNuevoComentario('')
                          )}
                        >
                          <PaperPlaneRight size={14} className="mr-1" /> Enviar
                        </Button>
                      </div>
                    </section>
                  </>
                )}
              </form>
            )}
          </div>

          {/* Pie */}
          <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border bg-muted/20">
            <div>
              {puedeArchivar && (
                <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmarArchivo(true)}>
                  <Trash size={15} className="mr-1.5" /> Archivar
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                {editando ? 'Cerrar' : 'Cancelar'}
              </Button>
              {tab === 'detalles' && !cargando && (
                <Button type="submit" form="task-form" size="sm" disabled={guardando}>
                  {guardando ? 'Guardando…' : editando ? 'Guardar' : 'Crear tarea'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmarArchivo}
        title="¿Archivar esta tarea?"
        message="Sale del tablero, pero no se borra: sigue contando en «Todo el equipo»."
        confirmLabel="Archivar"
        tone="destructive"
        onConfirm={archivar}
        onCancel={() => setConfirmarArchivo(false)}
      />
    </Portal>
  );
}
