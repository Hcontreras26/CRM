import React from 'react';
import { Calendar, ChatTeardrop, CheckSquare, WarningCircle, User } from '@phosphor-icons/react';
import type { Task } from '../types';

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
  onDragStart: (e: React.DragEvent, task: Task) => void;
}

const PRIORITY_STYLES = {
  baja: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  media: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  alta: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
};

const PRIORITY_LABELS = {
  baja: 'Baja',
  media: 'Media',
  alta: 'Alta',
};

const TAG_COLOR_MAP: Record<string, string> = {
  sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
};

export const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, onDragStart }) => {
  const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'hecha';

  const formattedDueDate = task.due_date
    ? new Date(task.due_date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
    : null;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={() => onClick(task)}
      className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200 cursor-grab active:cursor-grabbing hover:border-indigo-400 dark:hover:border-indigo-500"
    >
      {/* Etiquetas / Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2.5">
          {task.tags.map((t) => (
            <span
              key={t.id}
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                TAG_COLOR_MAP[t.color] || TAG_COLOR_MAP.sky
              }`}
            >
              {t.name}
            </span>
          ))}
        </div>
      )}

      {/* Título */}
      <h4 className="font-medium text-sm text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">
        {task.title}
      </h4>

      {/* Descripción corta */}
      {task.description && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
          {task.description}
        </p>
      )}

      {/* Proyecto */}
      {task.project_name && (
        <div className="mt-2.5">
          <span className="inline-block text-[11px] font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
            {task.project_name}
          </span>
        </div>
      )}

      {/* Badges de estado, checklist, comentarios y fecha */}
      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-2">
          {/* Prioridad */}
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
              PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.media
            }`}
          >
            {PRIORITY_LABELS[task.priority] || 'Media'}
          </span>

          {/* Fecha límite */}
          {formattedDueDate && (
            <span
              className={`flex items-center gap-1 text-[11px] font-medium ${
                isOverdue
                  ? 'text-rose-600 dark:text-rose-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
              title={isOverdue ? 'Tarea vencida' : 'Fecha límite'}
            >
              {isOverdue ? (
                <WarningCircle className="w-3.5 h-3.5 text-rose-500" weight="fill" />
              ) : (
                <Calendar className="w-3.5 h-3.5" />
              )}
              {formattedDueDate}
            </span>
          )}

          {/* Checklist */}
          {task.checklist_total !== undefined && task.checklist_total > 0 && (
            <span
              className={`flex items-center gap-1 text-[11px] ${
                task.checklist_completed === task.checklist_total
                  ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                  : ''
              }`}
              title="Elementos de checklist completados"
            >
              <CheckSquare className="w-3.5 h-3.5" weight={task.checklist_completed === task.checklist_total ? 'fill' : 'regular'} />
              {task.checklist_completed}/{task.checklist_total}
            </span>
          )}

          {/* Comentarios */}
          {task.comments_count !== undefined && task.comments_count > 0 && (
            <span className="flex items-center gap-1 text-[11px]" title="Comentarios">
              <ChatTeardrop className="w-3.5 h-3.5" />
              {task.comments_count}
            </span>
          )}
        </div>

        {/* Asignado */}
        {task.assigned_to_name ? (
          <div
            className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-medium flex items-center justify-center text-[10px] ring-2 ring-white dark:ring-slate-900"
            title={`Asignado a: ${task.assigned_to_name}`}
          >
            {task.assigned_to_name
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </div>
        ) : (
          <div
            className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center text-[10px]"
            title="Sin asignar"
          >
            <User className="w-3.5 h-3.5" />
          </div>
        )}
      </div>
    </div>
  );
};
