import React, { useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { TaskCard } from './TaskCard';
import type { Task, TaskStatus } from '../types';

interface TaskColumnProps {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onAddTask: (status: TaskStatus) => void;
  onMoveTask: (taskId: number, newStatus: TaskStatus, targetIndex?: number) => void;
  canCreate: boolean;
}

const COLUMN_CONFIG = {
  por_hacer: {
    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
  en_curso: {
    badge: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
  en_revision: {
    badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  hecha: {
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
};

export const TaskColumn: React.FC<TaskColumnProps> = ({
  status,
  title,
  tasks,
  onTaskClick,
  onAddTask,
  onMoveTask,
  canCreate,
}) => {
  const [isOver, setIsOver] = useState(false);
  const cfg = COLUMN_CONFIG[status] || COLUMN_CONFIG.por_hacer;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(true);
  };

  const handleDragLeave = () => {
    setIsOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOver(false);
    const taskIdStr = e.dataTransfer.getData('text/plain');
    if (taskIdStr) {
      const taskId = Number(taskIdStr);
      onMoveTask(taskId, status);
    }
  };

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    e.dataTransfer.setData('text/plain', String(task.id));
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col w-80 shrink-0 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border transition-colors duration-200 ${
        isOver
          ? 'border-indigo-400 bg-indigo-50/20 dark:border-indigo-500 dark:bg-indigo-950/20'
          : 'border-slate-200 dark:border-slate-800'
      } max-h-[calc(100vh-12rem)]`}
    >
      {/* Cabecera de la columna */}
      <div className="p-4 flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
          <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-100">{title}</h3>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.badge}`}>
            {tasks.length}
          </span>
        </div>

        {canCreate && (
          <button
            onClick={() => onAddTask(status)}
            className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors"
            title="Añadir tarea en esta columna"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Lista de tarjetas */}
      <div className="p-3 flex-1 overflow-y-auto space-y-3 min-h-[150px]">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onClick={onTaskClick}
            onDragStart={handleDragStart}
          />
        ))}

        {tasks.length === 0 && (
          <div className="h-28 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-800/80 rounded-xl text-xs text-slate-400">
            Sin tareas
          </div>
        )}
      </div>
    </div>
  );
};
