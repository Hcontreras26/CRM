import React from 'react';
import { UsersThree, WarningCircle, CheckCircle, Clock } from '@phosphor-icons/react';
import type { TeamMemberMetric } from '../types';

interface TeamTasksMetricsProps {
  metrics: TeamMemberMetric[];
  selectedUserId?: number | null;
  onSelectUser?: (userId: number | null) => void;
}

export const TeamTasksMetrics: React.FC<TeamTasksMetricsProps> = ({
  metrics,
  selectedUserId,
  onSelectUser,
}) => {
  if (!metrics || metrics.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm mb-6">
      <div className="flex items-center gap-2 mb-3">
        <UsersThree className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">
          Rendimiento y Carga del Equipo
        </h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((m) => {
          const isSelected = selectedUserId === m.user_id;

          return (
            <div
              key={m.user_id}
              onClick={() => onSelectUser && onSelectUser(isSelected ? null : m.user_id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20'
                  : 'border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate">
                  {m.user_name}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 bg-slate-200/60 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                  {m.user_role}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                <div className="bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-400 flex items-center justify-center gap-0.5">
                    <Clock className="w-3 h-3" />
                    Activas
                  </div>
                  <div className="font-bold text-slate-700 dark:text-slate-200 mt-0.5">
                    {m.open_tasks}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-rose-500 flex items-center justify-center gap-0.5">
                    <WarningCircle className="w-3 h-3" />
                    Vencidas
                  </div>
                  <div className="font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                    {m.overdue_tasks}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-emerald-500 flex items-center justify-center gap-0.5">
                    <CheckCircle className="w-3 h-3" />
                    Mes
                  </div>
                  <div className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {m.completed_this_month}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
