import { useState } from 'react';
import {
  ArrowClockwise, ArrowUUpLeft, Buildings, CalendarBlank, ChatCircle, Check, CheckSquare, Rocket, X,
} from '@phosphor-icons/react';
import { Button } from '@/shared/components/ui/button';
import Portal from '@/shared/components/ui/portal';
import { useEscapeKey } from '@/shared/hooks/useDialogA11y';
import { avatarColorFor, getInitials } from '@/shared/lib/ui';
import { toast } from '@/shared/hooks/useToast';
import * as tasksApi from '../api/tasks.api';
import { boardColor, dueInfo } from '../lib/taskUi';
import type { Task } from '../types';

interface TasksReviewViewProps {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenTask: (task: Task) => void;
  onChanged: () => void;
}

const errorDe = (err: unknown, porDefecto: string) =>
  (err instanceof Error && err.message) ? err.message : porDefecto;

/**
 * «Por revisar»: las tareas «En revisión» de todo el equipo, por fecha límite.
 * Una lista, no un tablero: lo que se hace aquí es aprobar o devolver.
 *
 * El título abre la tarjeta y los dos botones actúan; la fila no es un botón,
 * para que Enter sobre «Aprobar» apruebe y no abra la tarea.
 */
export function TasksReviewView({ tasks, loading, error, onRetry, onOpenTask, onChanged }: TasksReviewViewProps) {
  const [devolviendo, setDevolviendo] = useState<Task | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupada, setOcupada] = useState<number | null>(null);

  const cerrarDevolver = () => { setDevolviendo(null); setMotivo(''); };
  useEscapeKey(cerrarDevolver, devolviendo != null);

  async function aprobar(task: Task) {
    setOcupada(task.id);
    try {
      await tasksApi.approveTask(task.id);
      toast({ title: 'Aprobada', description: `«${task.title}» pasa a «Hecha».` });
      onChanged();
    } catch (err) {
      toast({ title: 'No se pudo aprobar', description: errorDe(err, 'Inténtalo de nuevo.'), variant: 'destructive' });
    } finally {
      setOcupada(null);
    }
  }

  async function devolver() {
    if (!devolviendo || !motivo.trim()) return;
    setOcupada(devolviendo.id);
    try {
      await tasksApi.returnTask(devolviendo.id, motivo.trim());
      toast({ title: 'Devuelta', description: `«${devolviendo.title}» vuelve a «En curso» con tu comentario.` });
      cerrarDevolver();
      onChanged();
    } catch (err) {
      toast({ title: 'No se pudo devolver', description: errorDe(err, 'Inténtalo de nuevo.'), variant: 'destructive' });
    } finally {
      setOcupada(null);
    }
  }

  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive-soft text-destructive-soft-foreground p-6 text-center space-y-3">
        <p className="font-semibold text-sm">No se pudieron cargar las tareas por revisar</p>
        <p className="text-xs">{error}</p>
        <Button size="sm" variant="outline" onClick={onRetry}>
          <ArrowClockwise size={14} className="mr-1.5" /> Reintentar
        </Button>
      </div>
    );
  }

  if (loading && tasks.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Cargando lo que hay por revisar…</p>;
  }

  if (tasks.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-10 text-center space-y-2">
        <div className="w-11 h-11 rounded-full bg-success-soft text-success-soft-foreground flex items-center justify-center mx-auto">
          <Check size={22} weight="bold" />
        </div>
        <p className="text-sm font-semibold">No hay nada por revisar</p>
        <p className="text-sm text-muted-foreground">Cuando alguien lleve una tarjeta a «En revisión», saldrá aquí.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <ul className="divide-y divide-border">
        {tasks.map((task) => {
          const vence = dueInfo(task);
          const total = task.checklist_total || 0;
          const hechos = task.checklist_completed || 0;
          const enCurso = ocupada === task.id;
          return (
            <li key={task.id} className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <button
                  type="button"
                  onClick={() => onOpenTask(task)}
                  className="text-left text-sm font-semibold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                >
                  {task.title}
                </button>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold ${avatarColorFor(task.assigned_to || 0)}`}>
                      {getInitials(task.assigned_to_name)}
                    </span>
                    {task.assigned_to_name || 'Sin responsable'}
                  </span>
                  {task.area_name && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${boardColor(task.area_color).chip}`}>
                      {task.area_name}
                    </span>
                  )}
                  {task.project_name && (
                    <span className="inline-flex items-center gap-1"><Buildings size={11} aria-hidden /> {task.project_name}</span>
                  )}
                  {task.external_project_name && (
                    <span className="inline-flex items-center gap-1"><Rocket size={11} aria-hidden /> {task.external_project_name}</span>
                  )}
                  {vence ? (
                    <span className={`inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded ${vence.classes}`}>
                      <CalendarBlank size={11} weight="bold" /> {vence.label}
                    </span>
                  ) : (
                    <span>Sin fecha límite</span>
                  )}
                  {total > 0 && (
                    <span className={`inline-flex items-center gap-1 tabular-nums ${hechos === total ? 'text-success font-semibold' : ''}`}>
                      <CheckSquare size={12} aria-hidden /> {hechos}/{total}
                    </span>
                  )}
                </div>
                {task.last_comment && (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <ChatCircle size={13} className="shrink-0 mt-0.5" aria-hidden />
                    <span className="line-clamp-2">{task.last_comment}</span>
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 lg:flex-shrink-0">
                <Button type="button" size="sm" variant="outline" className="h-8" disabled={enCurso}
                  onClick={() => { setDevolviendo(task); setMotivo(''); }}>
                  <ArrowUUpLeft size={14} className="mr-1" /> Devolver
                </Button>
                <Button type="button" size="sm" className="h-8" disabled={enCurso} onClick={() => aprobar(task)}>
                  <Check size={14} className="mr-1" /> {enCurso ? 'Aprobando…' : 'Aprobar'}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      {devolviendo && (
        <Portal>
          <div className="fixed inset-0 !m-0 z-[80] flex items-center justify-center sm:p-4">
            <div className="fixed inset-0 !m-0 bg-black/50 backdrop-blur-sm" onClick={cerrarDevolver} />
            <div role="dialog" aria-modal="true" aria-labelledby="devolver-titulo"
              className="relative bg-card sm:rounded-lg border border-border w-full max-w-md p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 id="devolver-titulo" className="text-base font-semibold">Devolver a «En curso»</h2>
                <button type="button" onClick={cerrarDevolver} aria-label="Cerrar"
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground">
                  <X size={16} />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{devolviendo.title}</span>
                {' · '}{devolviendo.assigned_to_name || 'Sin responsable'}
              </p>
              <label className="block text-sm">
                <span className="mb-1.5 block text-muted-foreground">Qué falta (obligatorio)</span>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  autoFocus
                  placeholder="Se guarda en la tarjeta y le llega a la persona en la campana."
                  className="w-full px-3 py-2 rounded-md border border-border bg-muted/50 text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card resize-y"
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={cerrarDevolver}>Cancelar</Button>
                <Button type="button" size="sm" disabled={!motivo.trim() || ocupada === devolviendo.id} onClick={devolver}>
                  {ocupada === devolviendo.id ? 'Devolviendo…' : 'Devolver'}
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
