import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import EmptyState from '@/shared/components/ui/EmptyState';
import { toast } from '@/shared/hooks/useToast';
import {
  Sparkle, FileText, ClockCounterClockwise, FilePdf, CircleNotch, WarningCircle,
} from '@phosphor-icons/react';
import { useReportsIA } from '../hooks/useReportsIA';
import { exportReportPdf } from '../api/reports-ia.api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import usePermission from '@/shared/hooks/usePermission';

interface Project {
  id: string | number;
  slug?: string;
  nombre?: string;
}

interface ReportsIAViewProps {
  project: Project | null | undefined;
  showGenerateButton?: boolean;
}

function fmtPeriodo(p: string | null | undefined): string {
  if (!p) return '';
  const [y, m] = p.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

function fmtDateIA(s: string | null | undefined): string {
  if (!s) return '';
  return new Date(s).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Vista del módulo reports-ia. Reusable desde ReportsPage (tab "Análisis IA")
 * y desde ReportsIAPage (ruta dedicada /reports/ia).
 *
 * Responsive: grid se colapsa a 1 columna en <lg, max-h del historial se
 * adapta al viewport.
 */
export default function ReportsIAView({ project, showGenerateButton = true }: ReportsIAViewProps) {
  const { user } = useAuth();
  const reportsIA = useReportsIA(project?.id);
  const [pdfLoading, setPdfLoading] = useState(false);
  // Lo que dice el servidor (#423): sale si salía antes Y tiene el permiso.
  const { can } = usePermission();
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';

  async function handleGenerate() {
    try {
      await reportsIA.generate();
      toast({ title: 'Reporte generado', description: 'Claude AI analizó los datos del periodo' });
    } catch (err: unknown) {
      toast({ title: 'Error generando reporte', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  }

  async function handleExportPdf() {
    if (!reportsIA.selected) return;
    setPdfLoading(true);
    try {
      const slug = (project?.slug || 'proyecto').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      const filename = `reporte-${slug}-${reportsIA.selected.periodo}.pdf`;
      await exportReportPdf(reportsIA.selected.id, { filename });
      toast({ title: 'PDF descargado', description: filename });
    } catch (err: unknown) {
      toast({ title: 'Error generando PDF', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {showGenerateButton && isAdmin && can('reports_ia.generar') && (
        <div className="flex justify-end">
          <button
            onClick={handleGenerate}
            disabled={reportsIA.generating}
            aria-label="Generar reporte con Claude AI"
            className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {reportsIA.generating ? <CircleNotch size={14} className="animate-spin" weight="bold" /> : <Sparkle size={14} weight="bold" />}
            <span className="hidden sm:inline">{reportsIA.generating ? 'Generando…' : 'Generar ahora'}</span>
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-3 lg:gap-4">
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
            <ClockCounterClockwise size={16} className="text-muted-foreground" />
            <h3 className="font-semibold text-sm">Historial</h3>
            <span className="ml-auto text-xs text-muted-foreground">{reportsIA.reports.length}</span>
          </div>
          {reportsIA.loading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-2 animate-pulse">
                  <div className="w-8 h-8 rounded bg-muted flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-muted rounded w-3/4" />
                    <div className="h-2.5 bg-muted/60 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : reportsIA.reports.length === 0 ? (
            <div className="p-5 text-center">
              <FileText size={28} weight="regular" className="text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Sin reportes aún</p>
              {isAdmin && can('reports_ia.generar') && (
                <button onClick={handleGenerate} className="mt-3 text-xs text-primary font-semibold hover:underline focus:outline-none focus:ring-2 focus:ring-primary/40 rounded">
                  Generar el primero
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border max-h-[60vh] lg:max-h-[calc(100vh-300px)] overflow-y-auto">
              {reportsIA.reports.map((r) => {
                const active = reportsIA.selected?.id === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => reportsIA.selectReport(r.id)}
                    aria-label={`Ver reporte ${fmtPeriodo(r.periodo)}`}
                    className={`w-full text-left p-3 hover:bg-muted/40 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${active ? 'bg-primary/5 border-l-2 border-primary' : 'border-l-2 border-transparent'}`}
                  >
                    <div className="text-sm font-semibold capitalize">{fmtPeriodo(r.periodo)}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{fmtDateIA(r.createdAt)} · por {r.generadoPor?.nombre}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg min-w-0">
          {reportsIA.error ? (
            <div className="p-6 text-center" role="alert">
              <WarningCircle size={28} className="text-red-500 dark:text-red-400 mx-auto mb-2" weight="regular" />
              <p className="text-red-600 dark:text-red-400 font-semibold">Error</p>
              <p className="text-xs text-muted-foreground mt-1">{reportsIA.error}</p>
            </div>
          ) : !reportsIA.selected ? (
            reportsIA.generating ? (
              <div className="p-10 text-center">
                <CircleNotch size={32} className="animate-spin text-primary mx-auto mb-3" />
                <p className="font-semibold">Claude AI está analizando los datos</p>
                <p className="text-xs text-muted-foreground mt-1">Esto puede tardar 10-30 segundos</p>
              </div>
            ) : (
              <EmptyState
                icon={Sparkle}
                title="Sin reporte seleccionado"
                description={isAdmin ? 'Genera el primer reporte mensual con Claude AI o selecciona uno del historial.' : 'Aún no se ha generado ningún reporte para este periodo.'}
              />
            )
          ) : (
            <>
              <div className="px-4 lg:px-5 py-3 border-b border-border flex items-start gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold capitalize truncate">{fmtPeriodo(reportsIA.selected.periodo)}</h2>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span>Generado {fmtDateIA(reportsIA.selected.createdAt)}</span>
                    <span>· por {reportsIA.selected.generadoPor?.nombre}</span>
                    {reportsIA.selected.metadata && (
                      <>
                        <span>· {reportsIA.selected.metadata.leadsAnalizados} leads</span>
                        <span>· {reportsIA.selected.metadata.conversionesAnalizadas} conv</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleExportPdf}
                  disabled={pdfLoading}
                  aria-label="Exportar reporte a PDF"
                  className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted disabled:opacity-50 whitespace-nowrap flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
                >
                  {pdfLoading ? <CircleNotch size={14} weight="bold" className="animate-spin" /> : <FilePdf size={14} weight="bold" />}
                  <span className="hidden sm:inline">{pdfLoading ? 'Generando…' : 'Exportar PDF'}</span>
                </button>
              </div>
              <div className="p-4 lg:p-6 overflow-x-auto">
                <article className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{reportsIA.selected.content}</ReactMarkdown>
                </article>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
