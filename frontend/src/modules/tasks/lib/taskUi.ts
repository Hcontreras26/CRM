import type { Task, TaskPriority, TaskStatus, TagColor } from '../types';

/** Las cuatro columnas fijas (decision 2 de la #210), en orden. */
export const COLUMNS: ReadonlyArray<{ key: TaskStatus; label: string; dot: string; head: string }> = [
  { key: 'por_hacer', label: 'Por hacer', dot: 'bg-muted-foreground', head: 'bg-muted' },
  { key: 'en_curso', label: 'En curso', dot: 'bg-info', head: 'bg-info-soft text-info-soft-foreground' },
  { key: 'en_revision', label: 'En revisión', dot: 'bg-warning', head: 'bg-warning-soft text-warning-soft-foreground' },
  { key: 'hecha', label: 'Hecha', dot: 'bg-success', head: 'bg-success-soft text-success-soft-foreground' },
];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  por_hacer: 'Por hacer',
  en_curso: 'En curso',
  en_revision: 'En revisión',
  hecha: 'Hecha',
};

export const PRIORITY: Record<TaskPriority, { label: string; border: string; chip: string }> = {
  alta: { label: 'Alta', border: 'border-l-destructive', chip: 'bg-destructive-soft text-destructive-soft-foreground' },
  media: { label: 'Media', border: 'border-l-warning', chip: 'bg-warning-soft text-warning-soft-foreground' },
  baja: { label: 'Baja', border: 'border-l-border', chip: 'bg-muted text-muted-foreground' },
};

/**
 * Los colores de las etiquetas. Como la paleta de avatares (shared/lib/ui.ts),
 * es identidad y no significado: hacen falta matices que se distingan, y por
 * eso llevan su variante oscura escrita. Son los mismos que acepta el backend.
 */
export const TAG_COLORS: Record<TagColor, { label: string; chip: string }> = {
  sky: { label: 'Azul', chip: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300' },
  rose: { label: 'Rojo', chip: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' },
  amber: { label: 'Ámbar', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  emerald: { label: 'Verde', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  violet: { label: 'Violeta', chip: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300' },
  slate: { label: 'Gris', chip: 'bg-muted text-muted-foreground' },
};

export const tagChip = (color: string): string =>
  (TAG_COLORS[color as TagColor] || TAG_COLORS.sky).chip;

const inicioDeHoy = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

/** «vence hoy», «vencida hace 3 días», «31 oct»… con su tono. */
export function dueInfo(task: Pick<Task, 'due_date' | 'status'>): { label: string; classes: string } | null {
  if (!task.due_date) return null;
  const due = new Date(task.due_date);
  const dia = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const diff = Math.round((dia.getTime() - inicioDeHoy().getTime()) / 86400000);
  const fecha = due.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  if (task.status === 'hecha') return { label: fecha, classes: 'bg-muted text-muted-foreground' };
  if (diff < 0) return { label: `Vencida · ${fecha}`, classes: 'bg-destructive-soft text-destructive-soft-foreground' };
  if (diff === 0) return { label: 'Vence hoy', classes: 'bg-warning-soft text-warning-soft-foreground' };
  if (diff === 1) return { label: 'Mañana', classes: 'bg-info-soft text-info-soft-foreground' };
  return { label: fecha, classes: 'bg-muted text-muted-foreground' };
}

/** La fecha guardada (ISO) como la quiere un `<input type="date">`, en hora local. */
export function toDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Del `<input type="date">` a ISO: vence al final de ese dia, en hora local. */
export function fromDateInput(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}T23:59:00`).toISOString();
}

/**
 * Entre que dos tarjetas cae una que se suelta en la posicion `index` de una
 * columna ya pintada (que puede incluir la propia tarjeta, si se reordena).
 * Devuelve `null` si se suelta donde ya estaba.
 */
export function neighboursAt(
  column: ReadonlyArray<Pick<Task, 'id'>>,
  index: number,
  draggedId: number
): { prev_id: number | null; next_id: number | null } | null {
  const before = column[index - 1];
  const after = column[index];
  if (before?.id === draggedId || after?.id === draggedId) return null;
  const sin = column.filter((t) => t.id !== draggedId);
  const at = column.slice(0, index).filter((t) => t.id !== draggedId).length;
  return { prev_id: sin[at - 1]?.id ?? null, next_id: sin[at]?.id ?? null };
}
