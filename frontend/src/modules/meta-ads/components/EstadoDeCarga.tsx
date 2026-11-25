import { ArrowsClockwise, Warning } from '@phosphor-icons/react';

/**
 * «No se ha podido cargar» en Meta Ads (#1155).
 *
 * Antes cada llamada terminaba en `.catch(() => setX([]))`: si el servidor
 * fallaba, la pantalla decía «Sin campañas en este rango», igual que si no
 * hubiera datos, y nadie se enteraba de la avería. Ahora un fallo se dice, con
 * el motivo y un «Reintentar», y se distingue de «no hay datos» y de «este
 * campus no tiene cuenta», como en Google Ads (#54).
 */

/** El motivo que dio el servidor, o uno que se entienda. */
export function mensajeDe(err: unknown): string {
  const e = err as { data?: { error?: string }; error?: string; message?: string; status?: number } | null;
  return e?.data?.error || e?.error || e?.message || 'Error desconocido';
}

/**
 * La respuesta de la API, o lanza si vino con `success: false`: eso también es
 * un fallo, aunque llegue con un 200.
 */
export function datosDe<T>(r: unknown, vacio: T): T {
  const x = r as { success?: boolean; error?: string; data?: T } | null;
  if (x && x.success === false) throw new Error(x.error || 'El servidor no devolvió los datos');
  return (x?.data ?? vacio) as T;
}

export function ErrorDeCarga({ que, motivo, onReintentar, compacto = false }: {
  /** Lo que no se cargó: «las campañas», «los anuncios»… */
  que: string;
  motivo?: string | null;
  onReintentar: () => void;
  /** Dentro de una fila de la tabla (conjuntos y anuncios). */
  compacto?: boolean;
}) {
  return (
    <div role="alert"
      className={compacto
        ? 'flex flex-wrap items-center gap-2 text-xs text-destructive'
        : 'flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm'}>
      <span className="flex items-start gap-1.5">
        <Warning size={compacto ? 12 : 16} weight="bold" className="mt-0.5 shrink-0 text-destructive" />
        <span>No se han podido cargar {que}{motivo ? `: ${motivo}` : '.'}</span>
      </span>
      <button type="button" onClick={onReintentar}
        className={`${compacto ? 'h-6 px-2 text-[11px]' : 'h-8 px-3 text-xs'} rounded-md border border-border bg-card font-semibold text-foreground hover:bg-muted flex items-center gap-1`}>
        <ArrowsClockwise size={compacto ? 11 : 13} weight="bold" /> Reintentar
      </button>
    </div>
  );
}
