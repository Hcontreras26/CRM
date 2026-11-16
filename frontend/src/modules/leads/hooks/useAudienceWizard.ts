import { useEffect, useMemo, useState } from 'react';
import {
  previewAudience,
  exportAudienceCsv,
  type AudienceFilters,
  type AudiencePreview,
} from '../api/audiences.api';

export const MIN_AUDIENCE_SIZE = 20;

const DEFAULT_FILTERS: AudienceFilters = {
  statuses: [],
  canales: [],
  paises: [],
  fechaDesde: '',
  fechaHasta: '',
  productoId: null,
  importeMinimo: null,
};

export interface DownloadResult {
  success: boolean;
  error?: string;
}

export interface UseAudienceWizardResult {
  step: number;
  next: () => void;
  prev: () => void;
  goTo: (i: number) => void;
  filters: AudienceFilters;
  setFilter: (patch: Partial<AudienceFilters>) => void;
  toggleStatus: (status: string) => void;
  toggleCanal: (canal: string) => void;
  togglePais: (pais: string) => void;
  resetFilters: () => void;
  preview: AudiencePreview | null;
  previewLoading: boolean;
  previewError: string | null;
  totalCount: number;
  meetsMinimum: boolean;
  filename: string;
  downloadCsv: () => Promise<DownloadResult | undefined>;
  downloadLoading: boolean;
}

/**
 * Wizard 3 pasos: 0 = Filtros, 1 = Preview, 2 = Descarga.
 */
export function useAudienceWizard(
  projectId: number | null | undefined,
  projectSlug: string | null | undefined,
): UseAudienceWizardResult {
  const [step, setStep] = useState(0);
  const [filters, setFilters] = useState<AudienceFilters>(DEFAULT_FILTERS);
  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [downloadLoading, setDownloadLoading] = useState(false);

  // Reset al cambiar de proyecto
  useEffect(() => {
    setStep(0);
    setFilters(DEFAULT_FILTERS);
    setPreview(null);
  }, [projectId]);

  // Preview en tiempo real con debounce + AbortController.
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      setPreviewLoading(true);
      setPreviewError(null);
      previewAudience({ projectId, filters, signal: controller.signal })
        .then(r => {
          if (controller.signal.aborted) return;
          if (r.success && r.data) setPreview(r.data);
          else setPreviewError(r.error || null);
        })
        .catch((err: any) => {
          if (err?.name === 'AbortError' || controller.signal.aborted) return;
          setPreviewError(err?.message || String(err));
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, JSON.stringify(filters)]);

  function setFilter(patch: Partial<AudienceFilters>): void {
    setFilters(prev => ({ ...prev, ...patch }));
  }

  function toggleStatus(status: string): void {
    setFilters(prev => ({
      ...prev,
      statuses: prev.statuses?.includes(status)
        ? prev.statuses.filter(s => s !== status)
        : [...(prev.statuses || []), status],
    }));
  }

  function toggleCanal(canal: string): void {
    setFilters(prev => ({
      ...prev,
      canales: prev.canales?.includes(canal)
        ? prev.canales.filter(c => c !== canal)
        : [...(prev.canales || []), canal],
    }));
  }

  // País de entrada (#221): una audiencia por país para el retargeting de Meta.
  function togglePais(pais: string): void {
    setFilters(prev => ({
      ...prev,
      paises: prev.paises?.includes(pais)
        ? prev.paises.filter(p => p !== pais)
        : [...(prev.paises || []), pais],
    }));
  }

  function resetFilters(): void {
    setFilters(DEFAULT_FILTERS);
  }

  const totalCount = preview?.totalCount ?? 0;
  const meetsMinimum = totalCount >= MIN_AUDIENCE_SIZE;

  const filename = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const slugSafe = (projectSlug || 'proyecto').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    return `audiencia_${slugSafe}_${today}.csv`;
  }, [projectSlug]);

  async function downloadCsv(): Promise<DownloadResult | undefined> {
    if (!projectId || !meetsMinimum) return;
    setDownloadLoading(true);
    try {
      const blob = await exportAudienceCsv({ projectId, filters });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Error generando CSV' };
    } finally {
      setDownloadLoading(false);
    }
  }

  function next(): void { setStep(s => Math.min(2, s + 1)); }
  function prev(): void { setStep(s => Math.max(0, s - 1)); }
  function goTo(i: number): void { setStep(Math.max(0, Math.min(2, i))); }

  return {
    step, next, prev, goTo,
    filters, setFilter, toggleStatus, toggleCanal, togglePais, resetFilters,
    preview, previewLoading, previewError,
    totalCount, meetsMinimum,
    filename, downloadCsv, downloadLoading,
  };
}
