// Componentes y helpers compartidos entre las paginas de campanas (CRM-101 + CRM-104)
import KpiCard from '@/shared/components/ui/KpiCard';
import MetricLabel from '@/shared/components/ui/MetricLabel';
import EmptyState from '@/shared/components/ui/EmptyState';
import { PRESET_PERIODS, type Preset } from '../hooks/useCampaigns';
import type { useCampaigns, CampaignTotals } from '../hooks/useCampaigns';
import type { MetaCampaign, MetaStatus } from '../api/meta.api';
import type { GoogleCampaign, GoogleKeyword, GoogleStatus, GoogleType } from '../api/google.api';
import {
  CurrencyEur, MouseSimple, Users, TrendUp, FacebookLogo, GoogleLogo, ChartBar, WarningCircle,
  type Icon,
} from '@phosphor-icons/react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

export const STATUS_STYLES_META: Record<MetaStatus, string> = {
  ACTIVE: 'bg-success-soft text-success-soft-foreground',
  PAUSED: 'bg-warning-soft text-warning-soft-foreground',
  COMPLETED: 'bg-muted text-muted-foreground',
};
export const STATUS_LABEL_META: Record<MetaStatus, string> = { ACTIVE: 'Activa', PAUSED: 'Pausada', COMPLETED: 'Finalizada' };

export const STATUS_STYLES_GOOGLE: Record<GoogleStatus, string> = {
  ENABLED: 'bg-success-soft text-success-soft-foreground',
  PAUSED: 'bg-warning-soft text-warning-soft-foreground',
  REMOVED: 'bg-muted text-muted-foreground',
};
export const STATUS_LABEL_GOOGLE: Record<GoogleStatus, string> = { ENABLED: 'Activa', PAUSED: 'Pausada', REMOVED: 'Eliminada' };
export const TYPE_LABEL_GOOGLE: Record<GoogleType, string> = { SEARCH: 'Search', DISPLAY: 'Display', VIDEO: 'Video', SHOPPING: 'Shopping', PERFORMANCE_MAX: 'Performance Max' };

export const CPA_ALERT_THRESHOLD = 100;

export function fmtMoney(n: number | null | undefined): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n || 0));
}
export function fmtNum(n: number | null | undefined): string {
  return new Intl.NumberFormat('es-ES').format(Number(n || 0));
}
export function fmtCpa(n: number | null | undefined): string {
  if (!n || n === Infinity) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
}

type CampaignsHook = ReturnType<typeof useCampaigns>;

// ---------- Period Selector compartido ----------
export function PeriodSelector({ all }: { all: CampaignsHook }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <span className="text-xs text-muted-foreground flex-shrink-0">Periodo</span>
      {Object.entries(PRESET_PERIODS).map(([k, v]) => (
        <button
          key={k}
          onClick={() => { all.setCustomRange(null); all.setPreset(k as Preset); }}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
            all.preset === k && !all.customRange ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {v.label}
        </button>
      ))}
      <div className="flex items-center gap-1 ml-auto flex-shrink-0">
        <input type="date" value={all.range.fechaDesde}
          onChange={(e) => all.setCustomRange({ ...all.range, fechaDesde: e.target.value })}
          className="h-8 px-2 rounded-md border border-border bg-card text-xs" />
        <span className="text-xs text-muted-foreground">→</span>
        <input type="date" value={all.range.fechaHasta}
          onChange={(e) => all.setCustomRange({ ...all.range, fechaHasta: e.target.value })}
          className="h-8 px-2 rounded-md border border-border bg-card text-xs" />
      </div>
    </div>
  );
}

// ---------- Consolidado ----------
interface ConsolidatedData {
  totals: CampaignTotals;
  breakdown: { meta: CampaignTotals; google: CampaignTotals };
}

interface ProjectLite { nombre?: string; id?: number | string }

export function ConsolidatedView({ data, project }: { data: ConsolidatedData; project: ProjectLite | null | undefined }) {
  const { totals, breakdown } = data;

  const chartData = [
    { plataforma: 'Meta Ads', spend: breakdown.meta.spend, leads: breakdown.meta.crmLeads },
    { plataforma: 'Google Ads', spend: breakdown.google.spend, leads: breakdown.google.crmLeads },
  ];

  if (totals.spend === 0) {
    return (
      <div className="bg-card border border-border rounded-lg">
        <EmptyState icon={ChartBar} title="Sin inversion publicitaria"
          description={project ? `No hay datos de Meta ni Google para ${project.nombre} en este periodo` : 'Selecciona un proyecto'} />
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard icon={CurrencyEur} label="Inversion total" value={fmtMoney(totals.spend)} />
        <KpiCard icon={MouseSimple} label="Clicks" value={fmtNum(totals.clicks)} />
        <KpiCard icon={Users} label="Prospectos CRM" value={fmtNum(totals.crmLeads)} tone="success" />
        <KpiCard icon={TrendUp} label="CPA real" value={fmtCpa(totals.cpaReal)}
          tone={totals.cpaReal > CPA_ALERT_THRESHOLD ? 'destructive' : 'default'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PlatformBarChart title="Inversion por plataforma" subtitle="Comparativa Meta vs Google en el periodo"
          chartData={chartData} dataKey="spend" name="Inversion" valueFormatter={fmtMoney} />
        <PlatformBarChart title="Prospectos CRM por plataforma" subtitle="Atribucion via UTM matching"
          chartData={chartData} dataKey="leads" name="Prospectos" />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold">Resumen por plataforma</h3>
        </div>
        <div className="divide-y divide-border">
          <PlatformRow icon={FacebookLogo} color="#3b82f6" label="Meta Ads" data={breakdown.meta} />
          <PlatformRow icon={GoogleLogo} color="#f59e0b" label="Google Ads" data={breakdown.google} />
        </div>
      </div>
    </>
  );
}

interface PlatformBarChartProps {
  title: string;
  subtitle: string;
  chartData: Array<Record<string, unknown>>;
  dataKey: string;
  name: string;
  valueFormatter?: (v: number) => string;
}

function PlatformBarChart({ title, subtitle, chartData, dataKey, name, valueFormatter }: PlatformBarChartProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>
      <ResponsiveContainer width="100%" height={200} minHeight={180}>
        <BarChart data={chartData} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="#f3f4f6" />
          <XAxis dataKey="plataforma" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} axisLine={false}
            tickFormatter={v => v >= 1000 ? `${v/1000}k` : v} />
          <Tooltip cursor={{ fill: '#f9fafb' }}
            formatter={(v) => valueFormatter ? valueFormatter(Number(v)) : fmtNum(Number(v))}
            contentStyle={{ borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12 }} />
          <Bar dataKey={dataKey} name={name} radius={[4, 4, 0, 0]} maxBarSize={64}>
            <Cell fill="#3b82f6" />
            <Cell fill="#f59e0b" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PlatformRow({ icon: Icon, color, label, data }: { icon: Icon; color: string; label: string; data: CampaignTotals }) {
  return (
    <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-5 gap-3 items-center">
      <div className="flex items-center gap-2 col-span-2 md:col-span-1">
        <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ backgroundColor: color + '20', color }}>
          <Icon size={16} weight="bold" />
        </div>
        <span className="font-semibold text-sm">{label}</span>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Inversion</div>
        <div className="text-sm tabular-nums font-semibold">{fmtMoney(data.spend)}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Clicks</div>
        <div className="text-sm tabular-nums">{fmtNum(data.clicks)}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">Prospectos CRM</div>
        <div className="text-sm tabular-nums">{fmtNum(data.crmLeads)}</div>
      </div>
      <div>
        <div className="text-xs text-muted-foreground">CPA real</div>
        <div className={`text-sm tabular-nums font-semibold ${data.cpaReal > CPA_ALERT_THRESHOLD ? 'text-destructive' : ''}`}>{fmtCpa(data.cpaReal)}</div>
      </div>
    </div>
  );
}

// ---------- Tabla campañas reutilizable ----------
type AnyCampaign = MetaCampaign | GoogleCampaign;

interface CampaignTableProps {
  campaigns: AnyCampaign[];
  statusStyles: Record<string, string>;
  statusLabel: Record<string, string>;
  getSubLabel: (c: AnyCampaign) => string;
}

export function CampaignTable({ campaigns, statusStyles, statusLabel, getSubLabel }: CampaignTableProps) {
  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-[11px] text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5 font-bold">Campaña</th>
              <th className="text-left px-4 py-2.5 font-bold">Estado</th>
              <th className="text-right px-4 py-2.5 font-bold">Gasto</th>
              <th className="text-right px-4 py-2.5 font-bold">Clicks</th>
              <th className="text-right px-4 py-2.5 font-bold"><MetricLabel term="CPC">CPC</MetricLabel></th>
              <th className="text-right px-4 py-2.5 font-bold">Prospectos CRM</th>
              <th className="text-right px-4 py-2.5 font-bold">Conv.</th>
              <th className="text-right px-4 py-2.5 font-bold"><MetricLabel term="CPA">CPA real</MetricLabel></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => {
              const cpaAlert = c.costPerCrmConversion > CPA_ALERT_THRESHOLD;
              return (
                <tr key={c.campaignId} className={`border-b last:border-0 hover:bg-muted/30 ${cpaAlert ? 'bg-destructive-soft/40' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-semibold truncate max-w-[280px]">{c.campaignName}</div>
                    <div className="text-[10px] text-muted-foreground">{getSubLabel(c)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${statusStyles[c.status] || ''}`}>
                      {statusLabel[c.status] || c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(c.metrics.spend)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtNum(c.metrics.clicks)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{fmtCpa(c.metrics.cpc)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.crmLeadCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{c.crmConversionCount}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-semibold ${cpaAlert ? 'text-destructive' : ''}`}>
                    {cpaAlert && <WarningCircle size={12} weight="fill" className="inline mr-1" />}
                    {fmtCpa(c.costPerCrmConversion)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden divide-y divide-border">
        {campaigns.map(c => {
          const cpaAlert = c.costPerCrmConversion > CPA_ALERT_THRESHOLD;
          return (
            <div key={c.campaignId} className={`p-4 space-y-2.5 ${cpaAlert ? 'bg-destructive-soft/40' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{c.campaignName}</div>
                  <div className="text-[10px] text-muted-foreground">{getSubLabel(c)}</div>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${statusStyles[c.status]}`}>
                  {statusLabel[c.status] || c.status}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Gasto</div>
                  <div className="tabular-nums">{fmtMoney(c.metrics.spend)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Prospectos CRM</div>
                  <div className="tabular-nums">{c.crmLeadCount}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">CPA real</div>
                  <div className={`tabular-nums font-semibold ${cpaAlert ? 'text-destructive' : ''}`}>
                    {cpaAlert && <WarningCircle size={11} weight="fill" className="inline mr-0.5" />}
                    {fmtCpa(c.costPerCrmConversion)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{fmtNum(c.metrics.clicks)} clicks</span>
                <span>·</span>
                <span>CPC {fmtCpa(c.metrics.cpc)}</span>
                <span>·</span>
                <span>{c.crmConversionCount} conv.</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="p-8 text-center text-sm">
      <WarningCircle size={28} className="text-destructive mx-auto mb-2" weight="regular" />
      <p className="text-destructive font-semibold mb-1">No se pudieron cargar las campanas</p>
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

// ---------- KeywordsTable (Google) ----------
export function KeywordsTable({ keywords }: { keywords?: GoogleKeyword[] | null }) {
  if (!keywords?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold">Top keywords</h3>
        <span className="text-xs text-muted-foreground">{keywords.length} keywords</span>
      </div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-[11px] text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-2.5 font-bold">Keyword</th>
              <th className="text-left px-4 py-2.5 font-bold">Match</th>
              <th className="text-right px-4 py-2.5 font-bold">Impressions</th>
              <th className="text-right px-4 py-2.5 font-bold">Clicks</th>
              <th className="text-right px-4 py-2.5 font-bold"><MetricLabel term="CPC">CPC</MetricLabel></th>
              <th className="text-right px-4 py-2.5 font-bold">Quality</th>
            </tr>
          </thead>
          <tbody>
            {keywords.slice(0, 20).map((k, i) => (
              <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3 font-medium truncate max-w-[260px]">{k.keyword}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 rounded text-[10px] font-medium bg-muted">{k.matchType}</span></td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(k.impressions)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(k.clicks)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtCpa(k.cpc)}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    k.qualityScore >= 8 ? 'bg-success-soft text-success-soft-foreground' :
                    k.qualityScore >= 5 ? 'bg-warning-soft text-warning-soft-foreground' :
                    'bg-destructive-soft text-destructive-soft-foreground'
                  }`}>{k.qualityScore}/10</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="md:hidden divide-y divide-border">
        {keywords.slice(0, 20).map((k, i) => (
          <div key={i} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium text-sm truncate">{k.keyword}</div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${
                k.qualityScore >= 8 ? 'bg-success-soft text-success-soft-foreground' :
                k.qualityScore >= 5 ? 'bg-warning-soft text-warning-soft-foreground' : 'bg-destructive-soft text-destructive-soft-foreground'
              }`}>QS {k.qualityScore}/10</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{k.matchType}</span>
              <span>·</span>
              <span>{fmtNum(k.clicks)} clicks</span>
              <span>·</span>
              <span>CPC {fmtCpa(k.cpc)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
