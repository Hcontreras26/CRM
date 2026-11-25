import { useEffect, useState } from 'react';
import {
  searchConsoleApi, type Resumen, type ConsultaGsc, type Paginas, type Indexacion,
} from '../api/searchConsole.api';

export type Preset = '7d' | '14d' | '28d' | '90d';

export const PRESET_PERIODS: Record<Preset, { label: string; days: number }> = {
  '7d': { label: 'Últimos 7 días', days: 7 },
  '14d': { label: 'Últimos 14 días', days: 14 },
  '28d': { label: 'Últimos 28 días', days: 28 },
  '90d': { label: 'Últimos 90 días', days: 90 },
};

export interface DateRange { fechaDesde: string; fechaHasta: string }

function isoDate(d: Date): string { return d.toISOString().slice(0, 10); }

/**
 * El periodo de un preset. Search Console va 2–3 días por detrás: el periodo
 * acaba hace 3 días para no comparar días a medias.
 */
export function rangeFromPreset(preset: Preset | string, now: number = Date.now()): DateRange {
  const days = PRESET_PERIODS[preset as Preset]?.days ?? 28;
  const hasta = new Date(now - 3 * 86400000);
  const desde = new Date(hasta.getTime() - days * 86400000);
  return { fechaDesde: isoDate(desde), fechaHasta: isoDate(hasta) };
}

interface Datos {
  resumen: Resumen | null;
  consultas: ConsultaGsc[];
  paginas: Paginas | null;
  indexacion: Indexacion | null;
}
const VACIO: Datos = { resumen: null, consultas: [], paginas: null, indexacion: null };

/**
 * Los datos de «Tráfico orgánico» de un campus conectado. `recarga` cambia
 * tras sincronizar, para volver a pedirlos.
 */
export function useOrganicTraffic(projectId: number | null, conectado: boolean, recarga: unknown = null) {
  const [preset, setPreset] = useState<Preset>('28d');
  const [customRange, setCustomRange] = useState<DateRange | null>(null);
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range: DateRange = customRange || rangeFromPreset(preset);

  useEffect(() => {
    if (!projectId || !conectado || range.fechaDesde > range.fechaHasta) {
      setDatos(VACIO);
      return undefined;
    }
    let vivo = true;
    setLoading(true);
    setError(null);
    const { fechaDesde: d, fechaHasta: h } = range;
    Promise.all([
      searchConsoleApi.resumen(projectId, d, h),
      searchConsoleApi.consultas(projectId, d, h),
      searchConsoleApi.paginas(projectId, d, h),
      searchConsoleApi.indexacion(projectId),
    ])
      .then(([resumen, consultas, paginas, indexacion]) => {
        if (vivo) setDatos({ resumen, consultas: consultas || [], paginas, indexacion });
      })
      .catch((err: { data?: { error?: string }; message?: string }) => {
        if (vivo) setError(err?.data?.error || err?.message || 'No se pudo cargar');
      })
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [projectId, conectado, range.fechaDesde, range.fechaHasta, recarga]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...datos, loading, error, preset, setPreset, customRange, setCustomRange, range };
}
