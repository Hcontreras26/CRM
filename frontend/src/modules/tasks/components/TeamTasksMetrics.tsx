import { avatarColorFor, getInitials } from '@/shared/lib/ui';
import type { AreaMetric, TeamMemberMetric } from '../types';
import { boardColor } from '../lib/taskUi';

interface TeamTasksMetricsProps {
  metrics: TeamMemberMetric[];
  loading: boolean;
  onSelectUser: (userId: number) => void;
}

/**
 * «Todo el equipo» (#210, fase 4): por persona, cuantas tiene abiertas, cuantas
 * vencidas y cuantas cerro esta semana y este mes. Pulsar una fila abre su
 * tablero. Soporta navegación accesible por teclado con Enter y Espacio.
 */
export function TeamTasksMetrics({ metrics, loading, onSelectUser }: TeamTasksMetricsProps) {
  if (loading) {
    return <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">Cargando el equipo…</div>;
  }
  if (metrics.length === 0) {
    return <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">Nadie del equipo tiene tablero todavía.</div>;
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-x-auto shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
            <th className="px-4 py-2.5 font-semibold">Persona</th>
            <th className="px-3 py-2.5 font-semibold text-right">Abiertas</th>
            <th className="px-3 py-2.5 font-semibold text-right">Vencidas</th>
            <th className="px-3 py-2.5 font-semibold text-right">Cerradas esta semana</th>
            <th className="px-4 py-2.5 font-semibold text-right">Este mes</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr
              key={m.user_id}
              onClick={() => onSelectUser(m.user_id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectUser(m.user_id);
                }
              }}
              tabIndex={0}
              role="button"
              aria-label={`Ver tablero de ${m.user_name}`}
              className="border-b border-border last:border-0 hover:bg-muted/50 focus:bg-muted/80 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer transition-colors"
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${avatarColorFor(m.user_id)} shadow-xs`}>
                    {getInitials(m.user_name)}
                  </span>
                  <span className="font-medium truncate">{m.user_name}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums font-medium">{m.open_tasks}</td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${m.overdue_tasks > 0 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                {m.overdue_tasks}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{m.completed_this_week}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{m.completed_this_month}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface TeamAreaMetricsProps {
  metrics: AreaMetric[];
  loading: boolean;
  onSelectArea: (areaId: number | null) => void;
}

/** «Todo el equipo» por área: abiertas, vencidas y cerradas de cada área. */
export function TeamAreaMetrics({ metrics, loading, onSelectArea }: TeamAreaMetricsProps) {
  if (loading) {
    return <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">Cargando las áreas…</div>;
  }
  if (metrics.length === 0) {
    return <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">Todavía no hay tareas en ninguna área.</div>;
  }
  return (
    <div className="bg-card border border-border rounded-lg overflow-x-auto shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground bg-muted/40">
            <th className="px-4 py-2.5 font-semibold">Área</th>
            <th className="px-3 py-2.5 font-semibold text-right">Personas</th>
            <th className="px-3 py-2.5 font-semibold text-right">Abiertas</th>
            <th className="px-3 py-2.5 font-semibold text-right">Vencidas</th>
            <th className="px-3 py-2.5 font-semibold text-right">Cerradas esta semana</th>
            <th className="px-4 py-2.5 font-semibold text-right">Este mes</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.area_id ?? 'sin-area'} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => onSelectArea(m.area_id)}
                  className="inline-flex items-center gap-2 font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                >
                  <span className={`w-2.5 h-2.5 rounded-full ${boardColor(m.area_color).dot}`} aria-hidden />
                  {m.area_name}
                </button>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{m.area_id ? m.people : '—'}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-medium">{m.open_tasks}</td>
              <td className={`px-3 py-2.5 text-right tabular-nums ${m.overdue_tasks > 0 ? 'text-destructive font-bold' : 'text-muted-foreground'}`}>
                {m.overdue_tasks}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{m.completed_this_week}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{m.completed_this_month}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
