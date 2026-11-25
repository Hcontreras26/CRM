import { useState } from 'react';
import { Trash, X } from '@phosphor-icons/react';
import { invoicesApi } from '../api/invoices.api';
import type { Invoice } from '../api/invoices.api';
import { toast } from '@/shared/hooks/useToast';

const fmt = (n: number | string | null | undefined) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(n || 0));

/**
 * Lo que la pantalla ya sabe para decir que NO se puede eliminar (CRM#1034).
 * Si es la última de su serie solo lo sabe el servidor: lo dice con un 409.
 * Es la misma regla que `motivoParaNoEliminarPorError` (invoices.model.js).
 */
export function porQueNoSeElimina(inv: Pick<Invoice, 'estado' | 'sent_at' | 'fecha_pago' | 'anulada_at' | 'tipo'>): string | null {
  if (inv.tipo === 'rectificativa') return 'Es un abono: deshace otra factura y no se borra.';
  if (inv.anulada_at) return 'Ya está anulada y tiene su abono: no se puede eliminar.';
  if (inv.sent_at || inv.estado === 'enviada') return 'Ya se envió al cliente: hay que anularla con su abono.';
  if (inv.estado === 'pagada' || inv.fecha_pago) return 'Tiene un cobro: hay que anularla con su abono.';
  return null;
}

/*
  ELIMINAR UNA FACTURA EMITIDA POR ERROR (CRM#1034, norma de Diego del 19/11/2026).

  Anular una factura es su abono; borrarla, solo si se emitió por error. Y solo
  si no se ha enviado, no tiene cobro y es la última de su serie, para no dejar
  un hueco en la numeración. Pide el motivo, que queda en el Registro con quién
  y cuándo. En cualquier otro caso explica que hay que anularla y lleva a ello.
*/
export default function EliminarPorErrorDialog({ invoice, onClose, onEliminada, onAnular }: {
  invoice: Invoice; onClose: () => void; onEliminada: () => void;
  /** Abre «Anular» con esta factura; sin él, no sale el botón. */
  onAnular?: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [working, setWorking] = useState(false);
  // Lo que se sabe aquí, o lo que contestó el servidor (p. ej. «no es la última»).
  const [pega, setPega] = useState<string | null>(() => porQueNoSeElimina(invoice));
  const valido = motivo.trim().length >= 3;

  async function eliminar() {
    if (!valido || pega) return;
    setWorking(true);
    try {
      const res = await invoicesApi.eliminarPorError(invoice.id, motivo.trim());
      if (res.success) {
        toast({ title: `✓ ${invoice.codigo || 'Factura'} eliminada`, description: 'Queda apuntado en el Registro.' });
        onEliminada();
      } else {
        setPega((res as { error?: string }).error || 'No se pudo eliminar.');
      }
    } catch (e: unknown) {
      const err = e as { status?: number; data?: { error?: string; code?: string }; message?: string };
      if (err?.data?.code === 'NO_SE_PUEDE_ELIMINAR' || err?.data?.code === 'FACTURA_EMITIDA') {
        setPega(err.data.error || 'No se puede eliminar: hay que anularla.');
      } else {
        toast({ title: 'No se pudo eliminar', description: err?.data?.error || err?.message, variant: 'destructive' });
      }
    } finally { setWorking(false); }
  }

  return (
    <div className="fixed inset-0 z-[85] bg-black/50 flex items-center justify-center p-4" onClick={() => !working && onClose()}>
      <div role="dialog" aria-labelledby="eliminar-error-titulo"
        className="bg-card rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-border">
          <h3 id="eliminar-error-titulo" className="font-semibold text-base flex items-center gap-2 text-destructive">
            <Trash size={18} weight="bold" /> Eliminar la factura {invoice.codigo || ''}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{invoice.cliente_nombre} · {fmt(invoice.total)}</p>
        </div>
        <div className="p-4 space-y-3 text-sm">
          {pega ? (
            <div role="alert" className="rounded-md border border-warning/40 bg-warning-soft p-3 text-xs text-warning-soft-foreground space-y-1">
              <p className="font-semibold">No se puede eliminar</p>
              <p>{pega}</p>
              <p>Al anularla sigue en la serie con su número y sale su abono, que la deja a cero.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Es una factura <strong>emitida</strong>. Bórrala solo si se emitió por error: no se ha enviado,
                no tiene cobro y es la última de su serie. Si la factura era buena, no la borres: anúlala.
                La venta se queda y podrás volver a facturarla. No se puede deshacer.
              </p>
              <label className="space-y-1 block">
                <span className="text-xs font-medium">Por qué se emitió por error</span>
                <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={500}
                  placeholder="Por ejemplo: duplicada, a quien no era, emitida antes de tiempo…"
                  className="w-full px-2 py-1.5 rounded-md border border-border bg-background text-sm resize-none" />
              </label>
              {!valido && motivo.length > 0 && (
                <p className="text-xs text-destructive">Escribe el motivo (al menos 3 letras).</p>
              )}
              <p className="text-[11px] text-muted-foreground">Queda en el Registro: quién, cuándo, el número y el motivo.</p>
            </>
          )}
        </div>
        <div className="p-3 border-t border-border flex justify-end gap-2 bg-muted/20">
          <button onClick={onClose} disabled={working} className="h-9 px-3 rounded-md border border-border bg-card text-sm">Cancelar</button>
          {pega ? (
            onAnular && invoice.tipo !== 'rectificativa' && !invoice.anulada_at && (
              <button onClick={onAnular}
                className="h-9 px-3 rounded-md bg-destructive text-white text-sm font-semibold hover:bg-destructive/90 inline-flex items-center gap-1.5">
                <X size={14} weight="bold" /> Anularla
              </button>
            )
          ) : (
            <button onClick={eliminar} disabled={working || !valido}
              title={valido ? undefined : 'Indica el motivo para poder eliminar'}
              className="h-9 px-3 rounded-md bg-destructive text-white text-sm font-semibold hover:bg-destructive/90 disabled:opacity-50 inline-flex items-center gap-1.5">
              <Trash size={14} weight="bold" /> {working ? 'Eliminando…' : 'Eliminar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
