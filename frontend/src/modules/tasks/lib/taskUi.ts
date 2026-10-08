import type { Task, TaskPriority, TaskStatus, TagColor } from '../types';

/** Las cuatro columnas del sistema por defecto, en orden. */
export const DEFAULT_COLUMNS: ReadonlyArray<{ key: TaskStatus; label: string; dot: string; head: string }> = [
  { key: 'por_hacer', label: 'Por hacer', dot: 'bg-slate-400', head: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200' },
  { key: 'en_curso', label: 'En curso', dot: 'bg-blue-500', head: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' },
  { key: 'en_revision', label: 'En revisión', dot: 'bg-amber-500', head: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300' },
  { key: 'hecha', label: 'Hecha', dot: 'bg-emerald-500', head: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' },
];

export const STATUS_LABEL: Record<string, string> = {
  por_hacer: 'Por hacer',
  en_curso: 'En curso',
  en_revision: 'En revisión',
  hecha: 'Hecha',
};

export const PRIORITY: Record<TaskPriority, { label: string; border: string; chip: string }> = {
  alta: {
    label: 'Alta',
    border: 'border-l-rose-500 dark:border-l-rose-600',
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50',
  },
  media: {
    label: 'Media',
    border: 'border-l-amber-500 dark:border-l-amber-600',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50',
  },
  baja: {
    label: 'Baja',
    border: 'border-l-slate-400 dark:border-l-slate-600',
    chip: 'bg-slate-100 text-slate-700 dark:bg-slate-800/80 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
  },
};

export const TAG_COLORS: Record<TagColor, { label: string; chip: string }> = {
  sky: { label: 'Azul', chip: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border border-sky-200 dark:border-sky-800' },
  rose: { label: 'Rojo', chip: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800' },
  amber: { label: 'Ámbar', chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800' },
  emerald: { label: 'Verde', chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' },
  violet: { label: 'Violeta', chip: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 border border-violet-200 dark:border-violet-800' },
  slate: { label: 'Gris', chip: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700' },
};

/**
 * Los colores del tablero (columnas, áreas y proyectos propios). Son los mismos
 * que acepta el servidor (COLORES_TABLERO en tasks.validation.js): un color que
 * no esté aquí no se puede guardar. Como la paleta de avatares, es identidad y
 * no significado, y por eso lleva escrita su variante oscura.
 */
export const BOARD_COLORS: Record<string, { label: string; dot: string; head: string; chip: string }> = {
  gray: {
    label: 'Gris', dot: 'bg-slate-400',
    head: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200',
    chip: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
  blue: {
    label: 'Azul', dot: 'bg-blue-500',
    head: 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300',
    chip: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  },
  yellow: {
    label: 'Ámbar', dot: 'bg-amber-500',
    head: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300',
    chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  },
  green: {
    label: 'Verde', dot: 'bg-emerald-500',
    head: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300',
    chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  },
  purple: {
    label: 'Violeta', dot: 'bg-purple-500',
    head: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300',
    chip: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  },
  rose: {
    label: 'Rojo', dot: 'bg-rose-500',
    head: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300',
    chip: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800',
  },
};

export const boardColor = (color: string | null | undefined) => BOARD_COLORS[color || 'gray'] || BOARD_COLORS.gray;

export const tagChip = (color: string): string =>
  (TAG_COLORS[color as TagColor] || TAG_COLORS.sky).chip;

/** «Vence hoy», «Vencida · 3 oct», «Mañana», «31 oct»… con su tono. */
export function dueInfo(
  task: Pick<Task, 'due_date' | 'status'>,
  ahora: Date = new Date()
): { label: string; classes: string } | null {
  if (!task.due_date) return null;
  const due = new Date(task.due_date);
  const dia = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const diff = Math.round((dia.getTime() - hoy.getTime()) / 86400000);
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

/** Del `<input type="date">` a ISO: vence al final de ese día, en hora local. */
export function fromDateInput(value: string): string | null {
  if (!value) return null;
  return new Date(`${value}T23:59:00`).toISOString();
}

/**
 * Entre qué dos tarjetas cae una que se suelta en la posición `index` de una
 * columna ya pintada. Devuelve `null` si se suelta donde ya estaba.
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
