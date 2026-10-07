import { useState } from 'react';
import {
  CalendarBlank, Check, ArrowUUpLeft, ChatCircle, CheckSquare, ListChecks, X,
} from '@phosphor-icons/react';
import { Button } from '@/shared/components/ui/button';
import Portal from '@/shared/components/ui/portal';
import { avatarColorFor, getInitials } from '@/shared/lib/ui';
import { toast } from '@/shared/hooks/useToast';
import * as tasksApi from '../api/tasks.api';
import { dueInfo, AREA_COLORS } from '../lib/taskUi';
import type { Task } from '../types';

interface TasksReviewViewProps {
  tasks: Task[];
  loading: boolean;
  onOpenTask: (task: Task) => void;
  onRefresh: () => void;
}

export function TasksReviewView({
  tasks,
  loading,
  onOpenTask,
  onRefresh,
}: TasksReviewViewProps) {
  const [taskDevolver, setTaskDevolver] = useState<Task | null>(null);
  const [motivo, setMotivo] = useState('');
  const [procesando, setProcesando] = useState(false);

  async function handleAprobar(e: React.MouseEvent, task: Task) {
    e.stopPropagation();
    try {
      await tasksApi.approveTask(task.id);
      toast({ title: `Tarea «${task.title}» aprobada y cerrada` });
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al aprobar';
      toast({ title: 'No se pudo aprobar la tarea', description: msg, tone: 'destructive' });
    }
  }

  function handleAbrirDevolver(e: React.MouseEvent, task: Task) {
    e.stopPropagation();
    setTaskDevolver(task);
    setMotivo('');
  }

  async function handleConfirmarDevolver() {
    if (!taskDevolver || !motivo.trim()) {
      toast({ title: 'Indica qué falta para completar la tarea', tone: 'destructive' });
      return;
    }
    setProcesando(true);
    try {
      await tasksApi.returnTask(taskDevolver.id, motivo.trim());
      toast({ title: `Tarea devuelta a «En curso»` });
      setTaskDevolver(null);
      setMotivo('');
      onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al devolver';
      toast({ title: 'No se pudo devolver la tarea', description: msg, tone: 'destructive' });
    } finally {
      setProcesando(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
        Cargando tareas por revisar…
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
          <Check size={24} weight="bold" />
        </div>
        <h3 className="text-base font-semibold text-foreground">¡Todo al día!</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          No hay tareas del equipo esperando revisión en este momento.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-xs overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/20 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <ListChecks size={18} className="text-primary" />
            Tareas esperando revisión ({tasks.length})
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Valida los resultados o devuélvelas con indicaciones claras de qué falta.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/30">
              <th className="px-4 py-3 font-semibold">Tarea y Persona</th>
              <th className="px-3 py-3 font-semibold">Área / Proyecto</th>
              <th className="px-3 py-3 font-semibold">Vencimiento</th>
              <th className="px-3 py-3 font-semibold text-center">Checklist</th>
              <th className="px-4 py-3 font-semibold">Último comentario</th>
              <th className="px-4 py-3 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tasks.map((task) => {
              const vence = dueInfo(task);
              const totalSteps = task.checklist_total || 0;
              const completedSteps = task.checklist_completed || 0;

              return (
                <tr
                  key={task.id}
                  onClick={() => onOpenTask(task)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenTask(task);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Abrir tarea ${task.title}`}
                  className="hover:bg-muted/40 focus:bg-muted/60 focus:outline-none cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 min-w-[220px]">
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground leading-snug">{task.title}</p>
                      <div className="flex items-center gap-2">
                        {task.assigned_to && (
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold flex-shrink-0 ${avatarColorFor(task.assigned_to)}`}>
                            {getInitials(task.assigned_to_name)}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground font-medium truncate">
                          {task.assigned_to_name || 'Sin asignar'}
                        </span>
                      </div>
                    </div>
                  </td>

                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex flex-col gap-1 items-start">
                      {task.area_name && (
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${AREA_COLORS[task.area_color || 'gray'] || AREA_COLORS.gray}`}>
                          {task.area_name}
                        </span>
                      )}
                      {(task.project_name || task.external_project_name) && (
                        <span className="text-[11px] text-muted-foreground bg-secondary/80 px-2 py-0.5 rounded border border-border/50 truncate max-w-[150px]">
                          {task.project_name || task.external_project_name}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-3 py-3 whitespace-nowrap">
                    {vence ? (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded ${vence.classes}`}>
                        <CalendarBlank size={12} weight="bold" />
                        {vence.label}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/60">Sin fecha</span>
                    )}
                  </td>

                  <td className="px-3 py-3 text-center whitespace-nowrap">
                    {totalSteps > 0 ? (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${completedSteps === totalSteps ? 'text-success font-semibold' : 'text-muted-foreground'}`}>
                        <CheckSquare size={13} />
                        {completedSteps}/{totalSteps}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </td>

                  <td className="px-4 py-3 min-w-[180px] max-w-[280px]">
                    {task.last_comment ? (
                      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <ChatCircle size={14} className="shrink-0 mt-0.5 text-primary/70" />
                        <p className="line-clamp-2 italic">"{task.last_comment}"</p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">Sin comentarios</span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleAbrirDevolver(e, task)}
                        className="text-amber-600 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs h-8 px-2.5"
                      >
                        <ArrowUUpLeft size={14} className="mr-1" /> Devolver
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={(e) => handleAprobar(e, task)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3"
                      >
                        <Check size={14} className="mr-1" /> Aprobar
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Devolver con Motivo Obligatorio */}
      {taskDevolver && (
        <Portal>
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground">Devolver tarea para corrección</h3>
                <button
                  type="button"
                  onClick={() => setTaskDevolver(null)}
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1">
                <span className="font-semibold text-foreground">{taskDevolver.title}</span>
                <p className="text-muted-foreground">Responsable: {taskDevolver.assigned_to_name || 'Sin asignar'}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-foreground">
                  Motivo de la devolución / ¿Qué falta? *
                </label>
                <textarea
                  rows={3}
                  required
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Explica qué correcciones debe realizar antes de marcarla como revisada…"
                  className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary resize-y"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setTaskDevolver(null)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!motivo.trim() || procesando}
                  onClick={handleConfirmarDevolver}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {procesando ? 'Devolviendo…' : 'Devolver tarea'}
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
