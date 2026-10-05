import React, { useState } from 'react';
import { TaskCard } from './TaskCard';
import { cn } from '@/shared/lib/utils';
import { Plus } from '@phosphor-icons/react';

export function TaskColumn({
  column,
  tasks = [],
  onDragStart,
  onDropTask,
  onCardClick,
  onQuickAdd,
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e) => {
    // Solo si salimos del contenedor principal de la columna
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const taskIdStr = e.dataTransfer.getData('text/plain');
    if (!taskIdStr) return;
    const taskId = Number(taskIdStr);
    onDropTask?.(taskId, column.key);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'flex flex-col flex-1 min-w-[280px] max-w-[340px] rounded-xl border bg-muted/40 p-3 transition-colors duration-200',
        isDragOver ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border'
      )}
    >
      {/* Cabecera de Columna */}
      <div className="flex items-center justify-between pb-3 px-1">
        <div className="flex items-center gap-2">
          <span className={cn('w-2.5 h-2.5 rounded-full', column.dotClass)} />
          <h3 className="font-semibold text-sm text-foreground">{column.label}</h3>
          <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-background border text-[11px] font-medium text-muted-foreground tabular-nums">
            {tasks.length}
          </span>
        </div>

        {onQuickAdd && (
          <button
            type="button"
            onClick={() => onQuickAdd(column.key)}
            className="p-1 rounded hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
            title="Añadir tarea rápida"
          >
            <Plus size={15} />
          </button>
        )}
      </div>

      {/* Lista de Tarjetas */}
      <div className="flex flex-col gap-2.5 flex-1 overflow-y-auto pr-0.5 min-h-[150px]">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onDragStart={onDragStart}
            onClick={onCardClick}
          />
        ))}

        {tasks.length === 0 && (
          <div className="flex flex-1 items-center justify-center p-4 border border-dashed rounded-lg border-border/60 text-xs text-muted-foreground/60 text-center select-none">
            Sin tareas en esta columna
          </div>
        )}
      </div>
    </div>
  );
}
