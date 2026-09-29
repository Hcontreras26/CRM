import { cssDeEstado } from '../lib/estadoTono';
import { useState } from 'react';
import { useProjectContext } from '@/contexts/ProjectContext';
import PageHeader from '@/shared/components/ui/PageHeader';
import EmptyState from '@/shared/components/ui/EmptyState';
import Select from '@/shared/components/ui/Select';
import { toast } from '@/shared/hooks/useToast';
import { useAudienceWizard } from '../hooks/useAudienceWizard';
import { useMetaUpload } from '../hooks/useMetaUpload';
import { useProducts } from '@/modules/products/hooks/useProducts';
import { Funnel, Users, X } from '@phosphor-icons/react';
import { FilterSection, CheckList } from '../components/AudienceFilters';
import { ResultsHeader, BreakdownCard, SampleTable } from '../components/AudienceResults';
import { UploadStatusCard, MetaHistorySection } from '../components/AudienceMetaUpload';

const STATUS_OPTIONS = [
  { v: 'nuevo', label: 'Nuevo' },
  { v: 'por_contactar', label: 'Por contactar' },
  { v: 'contactado', label: 'Contactado' },
  { v: 'en_seguimiento', label: 'En seguimiento' },
  { v: 'convertido', label: 'Convertido' },
  { v: 'no_interesado', label: 'No interesado' },
];

const CANAL_OPTIONS = [
  { v: 'meta_ads', label: 'Meta Ads' },
  { v: 'google_ads', label: 'Google Ads' },
  { v: 'tiktok_ads', label: 'TikTok Ads' },
  { v: 'organico', label: 'Orgánico' },
  { v: 'directo', label: 'Directo' },
  { v: 'referido', label: 'Referido' },
];

// El color sale de lib/estadoTono.ts, como en el resto del modulo. Aqui habia
// una cuarta copia en hexadecimal, y no coincidia con ninguna de las otras.
const STATUS_COLORS = Object.fromEntries(
  ['nuevo', 'por_contactar', 'contactado', 'en_seguimiento', 'convertido', 'no_interesado']
    .map((e) => [e, cssDeEstado(e)]),
);

const PRESETS = [
  { id: 'no-convertidos', label: 'No convertidos', desc: 'Ideal para retargeting', filter: { statuses: ['nuevo', 'por_contactar', 'contactado', 'en_seguimiento'] } },
  { id: 'convertidos', label: 'Convertidos', desc: 'Excluir o upsell', filter: { statuses: ['convertido'] } },
  { id: 'paid', label: 'Solo pagado', desc: 'Meta + Google', filter: { canales: ['meta_ads', 'google_ads', 'tiktok_ads'] } },
  { id: 'organico', label: 'Orgánico', desc: 'SEO + directo', filter: { canales: ['organico', 'directo'] } },
];

function fmtNum(n) { return new Intl.NumberFormat('es-ES').format(Number(n || 0)); }

export default function AudienceExportPage() {
  const { activeProject } = useProjectContext();
  const wizard = useAudienceWizard(activeProject?.id, activeProject?.slug);
  const meta = useMetaUpload(activeProject?.id);
  const { products } = useProducts(activeProject?.id);
  const [filtersOpen, setFiltersOpen] = useState(false); // mobile drawer

  if (!activeProject) {
    return (
      <div className="space-y-6">
        <PageHeader title="Crear audiencia" subtitle="Selecciona un proyecto" />
        <EmptyState icon={Users} title="Sin proyecto" description="Elige un proyecto del selector lateral" />
      </div>
    );
  }

  const inFlight = meta.upload && meta.upload.status !== 'completed' && meta.upload.status !== 'error';

  async function handleDownload() {
    const r = await wizard.downloadCsv();
    if (r?.success) toast({ title: 'CSV descargado', description: `${fmtNum(wizard.totalCount)} prospectos exportados` });
    else if (r?.error) toast({ title: 'Error', description: r.error, variant: 'destructive' });
  }

  async function handleMetaUpload() {
    try {
      await meta.startUpload({ filters: wizard.filters });
      toast({ title: 'Upload iniciado', description: 'La audiencia se está procesando en Meta' });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }

  function applyPreset(p) {
    wizard.resetFilters();
    if (p.filter.statuses) p.filter.statuses.forEach(s => wizard.toggleStatus(s));
    if (p.filter.canales) p.filter.canales.forEach(c => wizard.toggleCanal(c));
  }

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Crear audiencia"
        subtitle={`${activeProject.nombre} — Filtra prospectos y exporta a Meta o CSV`}
        actions={
          <button
            onClick={() => setFiltersOpen(true)}
            className="lg:hidden inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <Funnel size={14} weight="bold" /> Filtros
            {(wizard.filters.statuses.length + wizard.filters.canales.length) > 0 && (
              <span className="text-[10px] font-semibold bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                {wizard.filters.statuses.length + wizard.filters.canales.length}
              </span>
            )}
          </button>
        }
      />

      {/* Layout 2 cols desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">

        {/* SIDEBAR FILTROS — desktop fijo, mobile drawer */}
        <aside className={`
          lg:block lg:relative lg:bg-transparent lg:p-0 lg:inset-auto lg:z-auto
          ${filtersOpen ? 'fixed inset-0 !m-0 z-50 bg-black/40' : 'hidden'}
        `}>
          <div className={`
            bg-card border border-border rounded-lg lg:rounded-lg
            ${filtersOpen ? 'fixed right-0 top-0 bottom-0 w-[320px] max-w-[85vw] rounded-none border-l overflow-y-auto' : ''}
            lg:sticky lg:top-4
          `}>
            {/* Header drawer mobile */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border lg:hidden">
              <span className="font-semibold text-sm">Filtros</span>
              <button
                onClick={() => setFiltersOpen(false)}
                aria-label="Cerrar filtros"
                className="p-1.5 rounded-md hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-5">
              {/* Presets rapidos */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">Atajos</p>
                <div className="grid grid-cols-2 gap-2">
                  {PRESETS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p)}
                      className="text-left p-2 rounded-md border border-border bg-muted/30 hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <div className="text-xs font-semibold">{p.label}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Estado */}
              <FilterSection title="Estado" count={wizard.filters.statuses.length}>
                <CheckList options={STATUS_OPTIONS} selected={wizard.filters.statuses} onToggle={wizard.toggleStatus} />
              </FilterSection>

              {/* Canal */}
              <FilterSection title="Canal" count={wizard.filters.canales.length}>
                <CheckList options={CANAL_OPTIONS} selected={wizard.filters.canales} onToggle={wizard.toggleCanal} />
              </FilterSection>

              {/* Fechas */}
              <FilterSection title="Fechas">
                <div className="space-y-2">
                  <input type="date" value={wizard.filters.fechaDesde}
                    onChange={e => wizard.setFilter({ fechaDesde: e.target.value })}
                    aria-label="Fecha desde"
                    className="w-full h-9 px-2 rounded-md border border-border bg-card text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
                  <input type="date" value={wizard.filters.fechaHasta}
                    onChange={e => wizard.setFilter({ fechaHasta: e.target.value })}
                    aria-label="Fecha hasta"
                    className="w-full h-9 px-2 rounded-md border border-border bg-card text-xs focus:outline-none focus:ring-2 focus:ring-primary/40" />
                </div>
              </FilterSection>

              {/* Producto */}
              <FilterSection title="Producto">
                <Select<number | null>
                  value={wizard.filters.productoId || null}
                  onChange={(v) => wizard.setFilter({ productoId: v })}
                  options={[
                    { value: null, label: 'Cualquier producto' },
                    ...(products || []).map(p => ({ value: p.id as number, label: p.nombre })),
                  ]}
                  ariaLabel="Filtrar por producto"
                  size="sm"
                />
              </FilterSection>

              {/* Importe */}
              <FilterSection title="Importe mínimo">
                <input
                  type="number" min="0" step="50"
                  value={wizard.filters.importeMinimo || ''}
                  onChange={e => wizard.setFilter({ importeMinimo: e.target.value ? Number(e.target.value) : null })}
                  placeholder="EUR"
                  aria-label="Importe mínimo en euros"
                  className="w-full h-9 px-2 rounded-md border border-border bg-card text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </FilterSection>

              {(wizard.filters.statuses.length + wizard.filters.canales.length > 0 ||
                wizard.filters.fechaDesde || wizard.filters.fechaHasta ||
                wizard.filters.productoId || wizard.filters.importeMinimo) && (
                <button
                  onClick={wizard.resetFilters}
                  className="w-full text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1 py-2 rounded-md border border-border hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <X size={12} /> Limpiar todos
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* CONTENT */}
        <div className="space-y-4 min-w-0">

          {/* Resultado + acciones */}
          <ResultsHeader
            totalCount={wizard.totalCount}
            loading={wizard.previewLoading}
            meetsMinimum={wizard.meetsMinimum}
            filename={wizard.filename}
            onDownload={handleDownload}
            onMetaUpload={handleMetaUpload}
            downloadLoading={wizard.downloadLoading}
            metaInFlight={inFlight}
          />

          {/* Estado upload Meta en curso */}
          {meta.upload && (
            <UploadStatusCard upload={meta.upload} onReset={meta.reset} />
          )}

          {/* Breakdowns + sample */}
          {wizard.preview && wizard.totalCount > 0 ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <BreakdownCard title="Por estado" data={wizard.preview.breakdown.status} colors={STATUS_COLORS} />
                <BreakdownCard title="Por canal" data={wizard.preview.breakdown.canal} colors={null} />
              </div>

              <SampleTable sample={wizard.preview.sample} totalCount={wizard.totalCount} />
            </>
          ) : !wizard.previewLoading ? (
            <div className="bg-card border border-border rounded-lg">
              <EmptyState icon={Funnel} title="Sin resultados" description="No hay leads que cumplan los filtros actuales. Prueba a relajar los criterios." />
            </div>
          ) : null}

          {/* Historial uploads Meta */}
          <MetaHistorySection history={meta.history} loading={meta.historyLoading} />
        </div>
      </div>
    </div>
  );
}
