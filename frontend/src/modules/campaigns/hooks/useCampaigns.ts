import { useEffect, useMemo, useState } from 'react';
import { getMetaCampaigns, type MetaCampaign } from '../api/meta.api';
import { getGoogleCampaigns, type GoogleCampaign, type GoogleKeyword } from '../api/google.api';

export type Preset = '7d' | '14d' | '30d' | '90d';

/**
 * Periodos predefinidos: 7, 14, 30, 90 dias o custom.
 */
export const PRESET_PERIODS: Record<Preset, { label: string; days: number }> = {
  '7d': { label: 'Últimos 7 días', days: 7 },
  '14d': { label: 'Últimos 14 días', days: 14 },
  '30d': { label: 'Últimos 30 días', days: 30 },
  '90d': { label: 'Últimos 90 días', days: 90 },
};

export interface DateRange { fechaDesde: string; fechaHasta: string }

export interface CampaignTotals {
  spend: number;
  clicks: number;
  impressions: number;
  crmLeads: number;
  crmConversions: number;
  cplPlatform: number;
  costPerCrmLead: number;
  cpaReal: number;
}

interface CampaignLike {
  metrics?: { spend?: number; clicks?: number; impressions?: number };
  crmLeadCount?: number;
  crmConversionCount?: number;
}

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

export function rangeFromPreset(preset: Preset): DateRange {
  const days = PRESET_PERIODS[preset]?.days ?? 30;
  const hasta = new Date();
  const desde = new Date(Date.now() - days * 86400000);
  return { fechaDesde: isoDate(desde), fechaHasta: isoDate(hasta) };
}

export function computeTotals(list: CampaignLike[]): CampaignTotals {
  const t = list.reduce((acc, c) => ({
    spend: acc.spend + (c.metrics?.spend || 0),
    clicks: acc.clicks + (c.metrics?.clicks || 0),
    impressions: acc.impressions + (c.metrics?.impressions || 0),
    crmLeads: acc.crmLeads + (c.crmLeadCount || 0),
    crmConversions: acc.crmConversions + (c.crmConversionCount || 0),
  }), { spend: 0, clicks: 0, impressions: 0, crmLeads: 0, crmConversions: 0 });
  return {
    ...t,
    cplPlatform: t.clicks > 0 ? t.spend / t.clicks : 0,        // CPC promedio (Meta cpc / Google cpc)
    costPerCrmLead: t.crmLeads > 0 ? t.spend / t.crmLeads : 0,
    cpaReal: t.crmConversions > 0 ? t.spend / t.crmConversions : 0,
  };
}

interface MetaState { campaigns: MetaCampaign[]; loading: boolean; error: string | null }
interface GoogleState { campaigns: GoogleCampaign[]; keywords: GoogleKeyword[]; loading: boolean; error: string | null }

/**
 * Usa solo el periodo y comparte estado entre Meta + Google + Consolidado.
 * Carga ambas plataformas cuando hay projectId.
 */
export function useCampaigns(projectId: string | number | undefined) {
  const [preset, setPreset] = useState<Preset>('30d');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [meta, setMeta] = useState<MetaState>({ campaigns: [], loading: false, error: null });
  const [google, setGoogle] = useState<GoogleState>({ campaigns: [], keywords: [], loading: false, error: null });

  const range: DateRange = customRange || rangeFromPreset(preset);

  useEffect(() => {
    if (!projectId) {
      setMeta({ campaigns: [], loading: false, error: null });
      setGoogle({ campaigns: [], keywords: [], loading: false, error: null });
      return;
    }
    setMeta(s => ({ ...s, loading: true, error: null }));
    setGoogle(s => ({ ...s, loading: true, error: null }));
    Promise.all([
      getMetaCampaigns(projectId, range).then(r => (r.success && r.data) ? r.data : Promise.reject(r.error || 'Error meta')),
      getGoogleCampaigns(projectId, range).then(r => (r.success && r.data) ? r.data : Promise.reject(r.error || 'Error google')),
    ]).then(([metaData, googleData]) => {
      setMeta({ campaigns: metaData || [], loading: false, error: null });
      setGoogle({ campaigns: googleData?.campaigns || [], keywords: googleData?.keywords || [], loading: false, error: null });
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setMeta(s => ({ ...s, loading: false, error: msg }));
      setGoogle(s => ({ ...s, loading: false, error: msg }));
    });
  }, [projectId, range.fechaDesde, range.fechaHasta]); // eslint-disable-line

  const metaTotals = useMemo(() => computeTotals(meta.campaigns), [meta.campaigns]);
  const googleTotals = useMemo(() => computeTotals(google.campaigns), [google.campaigns]);

  const consolidatedTotals: CampaignTotals = useMemo(() => {
    const totalSpend = metaTotals.spend + googleTotals.spend;
    const totalClicks = metaTotals.clicks + googleTotals.clicks;
    const totalLeads = metaTotals.crmLeads + googleTotals.crmLeads;
    const totalConv = metaTotals.crmConversions + googleTotals.crmConversions;
    return {
      spend: totalSpend,
      clicks: totalClicks,
      impressions: metaTotals.impressions + googleTotals.impressions,
      crmLeads: totalLeads,
      crmConversions: totalConv,
      cplPlatform: totalClicks > 0 ? totalSpend / totalClicks : 0,
      costPerCrmLead: totalLeads > 0 ? totalSpend / totalLeads : 0,
      cpaReal: totalConv > 0 ? totalSpend / totalConv : 0,
    };
  }, [metaTotals, googleTotals]);

  return {
    meta: { ...meta, totals: metaTotals },
    google: { ...google, totals: googleTotals },
    consolidated: { totals: consolidatedTotals, breakdown: { meta: metaTotals, google: googleTotals } },
    preset, setPreset,
    customRange, setCustomRange,
    range,
    loading: meta.loading || google.loading,
  };
}
