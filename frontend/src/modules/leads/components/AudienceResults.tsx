import { Check, Download, WarningCircle, CloudArrowUp, CircleNotch } from '@phosphor-icons/react';
import { MIN_AUDIENCE_SIZE } from '../hooks/useAudienceWizard';
import type { AudienceLeadSample } from '../api/audiences.api';

const fmtNum = (n: number | string | null | undefined) => new Intl.NumberFormat('es-ES').format(Number(n || 0));

interface ResultsHeaderProps {
  totalCount: number;
  loading: boolean;
  meetsMinimum: boolean;
  filename: string;
  onDownload: () => void;
  onMetaUpload: () => void;
  downloadLoading: boolean;
  metaInFlight: boolean;
}

export function ResultsHeader({ totalCount, loading, meetsMinimum, filename, onDownload, onMetaUpload, downloadLoading, metaInFlight }: ResultsHeaderProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Audiencia resultante</p>
          <div className="flex items-baseline gap-3 mt-1 flex-wrap">
            <span className="text-2xl sm:text-3xl font-semibold tabular-nums">
              {loading ? <span className="text-muted-foreground">…</span> : fmtNum(totalCount)}
            </span>
            <span className="text-sm text-muted-foreground">prospectos</span>
            {!loading && totalCount > 0 && (
              meetsMinimum ? (
                <span className="text-xs px-2 py-0.5 rounded-md bg-success-soft text-success font-semibold inline-flex items-center gap-1">
                  <Check size={11} weight="bold" /> Lista para Meta
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-md bg-warning-soft text-warning font-semibold inline-flex items-center gap-1">
                  <WarningCircle size={11} weight="fill" /> &lt; {MIN_AUDIENCE_SIZE} leads mínimo
                </span>
              )
            )}
          </div>
          <p className="text-[11px] text-muted-foreground font-mono mt-1.5">{filename}</p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
          <button
            onClick={onDownload}
            disabled={!meetsMinimum || downloadLoading || loading}
            aria-label="Descargar CSV"
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted disabled:opacity-50 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {downloadLoading ? <CircleNotch size={14} weight="bold" className="animate-spin" /> : <Download size={14} weight="bold" />}
            <span className="hidden sm:inline">{downloadLoading ? 'Generando...' : 'Descargar CSV'}</span>
            <span className="sm:hidden">{downloadLoading ? '...' : 'CSV'}</span>
          </button>
          <button
            onClick={onMetaUpload}
            disabled={!meetsMinimum || metaInFlight || loading}
            aria-label="Subir audiencia a Meta"
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-info text-info-foreground text-sm font-semibold hover:bg-info/90 disabled:opacity-50 whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-info/40"
          >
            {metaInFlight ? <CircleNotch size={14} weight="bold" className="animate-spin" /> : <CloudArrowUp size={14} weight="bold" />}
            <span className="hidden sm:inline">Subir a Meta</span>
            <span className="sm:hidden">Meta</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface BreakdownCardProps {
  title: string;
  data: Record<string, number>;
  colors?: Record<string, string> | null;
}

export function BreakdownCard({ title, data, colors }: BreakdownCardProps) {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  const entries = Object.entries(data).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-semibold mb-3 text-sm">{title}</h3>
      <div className="space-y-2.5">
        {entries.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin datos</p>
        ) : entries.map(([k, v]) => {
          const pct = (v / total) * 100;
          const color = colors?.[k] || 'hsl(var(--muted-foreground))';
          return (
            <div key={k} className="flex items-center gap-3">
              <span className="text-xs w-28 truncate text-muted-foreground">{k.replace(/_/g, ' ')}</span>
              <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden">
                <div className="h-full rounded" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
              <span className="text-xs tabular-nums font-semibold w-10 text-right">{fmtNum(v)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SampleTable({ sample, totalCount }: { sample: AudienceLeadSample[]; totalCount: number }) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <h3 className="font-semibold text-sm">Muestra ({sample.length} de {fmtNum(totalCount)})</h3>
        <span className="text-[11px] text-muted-foreground">Email/teléfono se hashean SHA-256 al exportar</span>
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-[11px] text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2 font-bold">Nombre</th>
              <th className="text-left px-4 py-2 font-bold">Email</th>
              <th className="text-left px-4 py-2 font-bold">Teléfono</th>
              <th className="text-left px-4 py-2 font-bold">Estado</th>
              <th className="text-left px-4 py-2 font-bold">Canal</th>
            </tr>
          </thead>
          <tbody>
            {sample.map(l => (
              <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-2.5 font-medium">{l.nombre}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{l.email}</td>
                <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{l.telefono}</td>
                <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded text-[10px] font-medium bg-muted">{l.estado}</span></td>
                <td className="px-4 py-2.5 text-muted-foreground">{l.canal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden divide-y divide-border">
        {sample.map(l => (
          <div key={l.id} className="p-4 space-y-1">
            <div className="font-semibold">{l.nombre}</div>
            <div className="text-xs text-muted-foreground">{l.email}</div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-muted">{l.estado}</span>
              <span className="text-muted-foreground">{l.canal}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
