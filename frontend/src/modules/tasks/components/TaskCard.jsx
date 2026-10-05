import React from 'react';
import { CalendarBlank, DotsSixVertical, CheckCircle, Clock } from '@phosphor-icons/react';
import { cn } from '@/shared/lib/utils';

export function TaskCard({ task, onDragStart, onClick }) {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'hecha';

  const priorityStyles = {
    alta: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900/50',
    media: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900/50',
    baja: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900/50 dark:text-slate-400 dark:border-slate-800',
  };

  const getInitials = (name) => {
    if (!name) return '??';
    return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart?.(e, task)}
      onClick={() => onClick?.(task)}
      className={cn(
        'group relative flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-sm transition-all hover:shadow-md cursor-grab active:cursor-grabbing select-none',
        task.status === 'hecha' ? 'border-emerald-200/80 bg-emerald-50/20 dark:border-emerald-900/40 dark:bg-emerald-950/10' : 'border-border'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <DotsSixVertical size={16} className="text-muted-foreground/40 group-hover:text-muted-foreground/80 shrink-0" />
          <h4 className="font-medium text-sm text-foreground leading-snug line-clamp-2">
            {task.title}
          </h4>
        </div>
        <span
          className={cn(
            'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border shrink-0 uppercase tracking-wider',
            priorityStyles[task.priority] || priorityStyles.media
          )}
        >
          {task.priority}
        </span>
      </div>

      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-2 pl-5">
          {task.description}
        </p>
      )}

      <div className="flex items-center justify-between pt-1 border-t border-border/50 text-xs text-muted-foreground pl-1">
        <div className="flex items-center gap-2">
          {task.due_date && (
            <span
              className={cn(
                'inline-flex items-center gap-1 tabular-nums',
                isOverdue ? 'text-rose-600 dark:text-rose-400 font-medium' : ''
              )}
              title={isOverdue ? 'Tarea vencida' : 'Fecha límite'}
            >
              <CalendarBlank size={13} />
              {formatDate(task.due_date)}
            </span>
          )}

          {task.project_name && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-secondary text-[11px] text-secondary-foreground max-w-[110px] truncate">
              {task.project_name}
            </span>
          )}
        </div>

        {task.assigned_to_name && (
          <div
            className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary font-semibold text-[10px] shrink-0"
            title={`Asignado a: ${task.assigned_to_name}`}
          >
            {getInitials(task.assigned_to_name)}
          </div>
        )}
      </div>
    </div>
  );
}
