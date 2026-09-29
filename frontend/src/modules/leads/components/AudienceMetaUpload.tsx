import { Check, X, FacebookLogo, CircleNotch, ClockCounterClockwise } from '@phosphor-icons/react';
import type { MetaUpload, MetaUploadHistoryItem } from '../api/audiences.api';

const fmtNum = (n: number | string | null | undefined) => new Intl.NumberFormat('es-ES').format(Number(n || 0));

const UPLOAD_STAGES = [
  { id: 'preparing', label: 'Preparando' },
  { id: 'uploading', label: 'Subiendo a Meta' },
  { id: 'processing', label: 'Procesando en Meta' },
  { id: 'completed', label: 'Completado' },
];

export function UploadStatusCard({ upload, onReset }: { upload: MetaUpload; onReset: () => void }) {
  const currentIdx = UPLOAD_STAGES.findIndex(s => s.id === upload.status);
  const isDone = upload.status === 'completed';

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-9 h-9 rounded-md bg-info-soft text-info-soft-foreground flex items-center justify-center flex-shrink-0">
          <FacebookLogo size={18} weight="bold" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{upload.audienceName}</p>
          <p className="text-xs text-muted-foreground">
            ID Meta: <span className="font-mono">{upload.audienceId}</span> · {fmtNum(upload.recordsUploaded)} registros
          </p>
        </div>
        {isDone && (
          <button
            onClick={onReset}
            aria-label="Cerrar tarjeta de upload"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/40 rounded"
          >
            <X size={12} /> Cerrar
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-2">
        {UPLOAD_STAGES.map((stage, i) => {
          const completed = i < currentIdx || (i === currentIdx && stage.id === 'completed');
          const active = i === currentIdx && !completed;
          return (
            <div key={stage.id} className="flex items-center flex-1 sm:flex-initial">
              <div className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-medium ${
                completed ? 'text-success' :
                active ? 'text-info' :
                'text-muted-foreground'
              }`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  completed ? 'bg-success-soft text-success-soft-foreground' :
                  active ? 'bg-info-soft text-info-soft-foreground' :
                  'bg-muted'
                }`}>
                  {completed ? <Check size={10} weight="bold" /> :
                   active ? <CircleNotch size={10} weight="bold" className="animate-spin" /> :
                   i + 1}
                </div>
                <span className="hidden sm:inline">{stage.label}</span>
              </div>
              {i < UPLOAD_STAGES.length - 1 && (
                <div className={`flex-1 h-px mx-1 ${completed ? 'bg-success dark:bg-success' : 'bg-border'}`} />
              )}
            </div>
          );
        })}
      </div>

      {isDone && upload.matchRate && (
        <div className="mt-3 flex items-center gap-2 text-sm bg-success-soft border border-success/30 rounded-md px-3 py-2">
          <Check size={14} weight="bold" className="text-success" />
          <span>Match rate: <span className="font-semibold tabular-nums">{upload.matchRate}%</span></span>
        </div>
      )}
    </div>
  );
}

export function MetaHistorySection({ history, loading }: { history: MetaUploadHistoryItem[]; loading: boolean }) {
  if (loading || !history || history.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <ClockCounterClockwise size={16} className="text-muted-foreground" />
        <h3 className="font-semibold text-sm">Historial uploads Meta</h3>
        <span className="text-xs text-muted-foreground">({history.length})</span>
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-[11px] text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-bold">Audiencia</th>
              <th className="text-left px-4 py-2 font-bold">Fecha</th>
              <th className="text-right px-4 py-2 font-bold">Prospectos</th>
              <th className="text-right px-4 py-2 font-bold">Match rate</th>
              <th className="text-left px-4 py-2 font-bold">Estado</th>
            </tr>
          </thead>
          <tbody>
            {history.map(h => (
              <tr key={h.audienceId} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2.5">
                  <div className="font-semibold truncate max-w-[280px]">{h.audienceName}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{h.audienceId}</div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {new Date(h.uploadedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtNum(h.recordsUploaded)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">
                  {h.matchRate != null ? <span className="font-semibold">{h.matchRate}%</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    h.status === 'completed' ? 'bg-success-soft text-success-soft-foreground' :
                    h.status === 'error' ? 'bg-destructive-soft text-destructive-soft-foreground' :
                    'bg-info-soft text-info-soft-foreground'
                  }`}>{h.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden divide-y divide-border">
        {history.map(h => (
          <div key={h.audienceId} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">{h.audienceName}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{h.audienceId}</div>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                h.status === 'completed' ? 'bg-success-soft text-success-soft-foreground' :
                h.status === 'error' ? 'bg-destructive-soft text-destructive-soft-foreground' :
                'bg-info-soft text-info-soft-foreground'
              }`}>{h.status}</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted-foreground">{new Date(h.uploadedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</span>
              <span className="tabular-nums">{fmtNum(h.recordsUploaded)} leads</span>
              {h.matchRate != null && <span className="tabular-nums font-semibold">{h.matchRate}% match</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
