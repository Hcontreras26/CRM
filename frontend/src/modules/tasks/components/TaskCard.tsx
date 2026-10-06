import type { DragEvent } from 'react';
import { CalendarBlank, ChatCircle, CheckSquare, DotsSixVertical, LinkSimple } from '@phosphor-icons/react';
import { avatarColorFor, getInitials } from '@/shared/lib/ui';
import { PRIORITY, dueInfo, tagChip } from '../lib/taskUi';
import type { Task } from '../types';

interface TaskCardProps {
  task: Task;
  draggable: boolean;
  showAssignee: boolean;
  onOpen: (task: Task) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, task: Task) => void;
  onDragEnd: () => void;
  onDragOverCard: (e: DragEvent<HTMLDivElement>, task: Task) => void;
}

export function TaskCard({
  task, draggable, showAssignee, onOpen, onDragStart, onDragEnd, onDragOverCard,
}: TaskCardProps) {
  const prioridad = PRIORITY[task.priority] || PRIORITY.media;
  const vence = dueInfo(task);
  const total = task.checklist_total || 0;
  const hechos = task.checklist_completed || 0;

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => onDragStart(e, task)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOverCard(e, task)}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(task); }}
      tabIndex={0}
      role="button"
      aria-label={`Abrir tarea ${task.title}`}
      className={`bg-card border border-border border-l-4 ${prioridad.border} rounded-lg p-3 space-y-2 ${
        draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } hover:shadow-sm hover:border-primary/30 transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold leading-snug break-words min-w-0">{task.title}</p>
        {draggable && (
          <DotsSixVertical size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
        )}
      </div>

      {task.tags && task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.tags.map((t) => (
            <span key={t.id} className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${tagChip(t.color)}`}>
              {t.name}
            </span>
          ))}
        </div>
      )}

      {task.project_name && (
        <p className="text-[11px] text-muted-foreground bg-muted rounded-md px-2 py-0.5 truncate">{task.project_name}</p>
      )}

      <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
        {vence && (
          <span className={`inline-flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded ${vence.classes}`}>
            <CalendarBlank size={10} weight="bold" />
            {vence.label}
          </span>
        )}
        {total > 0 && (
          <span className={`inline-flex items-center gap-1 tabular-nums ${hechos === total ? 'text-success' : ''}`}>
            <CheckSquare size={12} />
            {hechos}/{total}
          </span>
        )}
        {(task.comments_count || 0) > 0 && (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <ChatCircle size={12} />
            {task.comments_count}
          </span>
        )}
        {(task.links_count || 0) > 0 && (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <LinkSimple size={12} />
            {task.links_count}
          </span>
        )}
        {showAssignee && task.assigned_to && (
          <span
            className={`ml-auto w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold ${avatarColorFor(task.assigned_to)}`}
            title={task.assigned_to_name || ''}
          >
            {getInitials(task.assigned_to_name)}
          </span>
        )}
      </div>
    </div>
  );
}
