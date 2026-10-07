// Cola de facturación.
//
// Todo cobro que aún no tiene factura sale aquí, en orden de fecha, venga de
// Stripe o lo haya registrado una gestora a mano. Nada se adelanta: la factura
// del 30 espera a que salgan las del 29, porque la numeración es correlativa
// por fecha y una vez emitida no se puede recolocar.
//
// "Ya facturado hasta" marca hasta dónde está hecho el trabajo: lo anterior no
// aparece en la cola ni suma en los totales.
import { useEffect, useState, useCallback } from 'react';
import client from '@/shared/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/shared/hooks/useToast';
import { CreditCard, User, Receipt, CheckCircle } from '@phosphor-icons/react';

type ColaItem = {
  payment_id: number; conversion_id: number; fecha: string; importe: number;
  cliente: string | null; producto: string | null; gestora: string | null;
  origen: 'stripe' | 'manual'; es_el_siguiente: boolean;
};
type PorDia = { dia: string; cobros: number; importe: number };
type Proforma = {
  id: number; total: number | string; created_at: string;
  conversion_id: number | null; cliente_nombre: string | null; creada_por: string | null;
};
type Estado = {
  al_dia_hasta: string | null;
  updated_at: string | null;
  updated_by_nombre?: string | null;
  pagos_sin_factura: number;
  importe_sin_factura: number;
  cola?: ColaItem[];
  por_dia?: PorDia[];
  proformas_pendientes?: Proforma[];
};

function fmt(n: unknown) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(n || 0));
}
function fecha(d: unknown) {
  return d ? new Date(String(d)).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}

export default function FacturacionAlDiaCard({ projectId }: { projectId?: number | null }) {
  const { user } = useAuth() as { user?: { role?: string; factura_manager?: boolean } };
  const puedeFacturar = !!user?.factura_manager || user?.role === 'superadmin';
  const [estado, setEstado] = useState<Estado | null>(null);
  const [generando, setGenerando] = useState<number | null>(null);
  const [aprobando, setAprobando] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    if (!projectId) return;
    try {
      const r = await client.get<Estado>(`/invoices/facturacion-al-dia?projectId=${projectId}`);
      if (r.success) {
        setEstado(r.data);
      }
    } catch { /* si falla, la tarjeta simplemente no se muestra */ }
  }, [projectId]);

  useEffect(() => { cargar(); }, [cargar]);


  /*
    ANTES DE EMITIR, PREGUNTAR EL NUMERO.

    Diego, 14/09: «le doy a generar factura y me debe indicar el numero que voy
    a generar, para cambiarlo o ponerlo manualmente».

    Antes este boton emitia en el acto y te enterabas del numero por el aviso,
    cuando ya estaba gastado. Ahora primero se pide cual toca, se enseña, y se
    puede cambiar. Cancelar no consume numero.
  */
  const [pidiendoNumero, setPidiendoNumero] = useState<{ paymentId: number; forzar: boolean; sugerido: string; texto: string } | null>(null);

  async function pedirNumero(paymentId: number, forzar = false) {
    if (!projectId) return;
    setGenerando(paymentId);
    try {
      const r = await client.get<{ codigo: string; siguiente: number; serie: string }>(
        `/invoices/siguiente-numero?projectId=${projectId}`);
      const sug = r?.success ? String(r.data.siguiente) : '';
      setPidiendoNumero({ paymentId, forzar, sugerido: sug, texto: sug });
    } catch {
      // Si no se puede consultar, se deja escribirlo a mano igualmente.
      setPidiendoNumero({ paymentId, forzar, sugerido: '', texto: '' });
    } finally { setGenerando(null); }
  }

  async function generar(paymentId: number, forzar = false, numero?: string) {
    if (!projectId) return;
    setGenerando(paymentId);
    try {
      const r = await client.post<{ codigo?: string }>('/invoices/cola/generar',
        { projectId, paymentId, ...(forzar ? { forzar: true } : {}), ...(numero ? { numero: Number(numero) } : {}) });
      if (r.success) {
        toast({ title: 'Factura generada', description: r.data?.codigo || '' });
        cargar();
      }
    } catch (err) {
      const e = err as { data?: { error?: string; code?: string } };
      // Hay cobros anteriores sin facturar: se pregunta antes de saltarse el orden.
      if (e?.data?.code === 'HAY_ANTERIORES' && !forzar) {
        if (window.confirm(`${e.data.error}\n\n¿Emitirla igualmente, fuera de orden?`)) {
          setGenerando(null);
          return generar(paymentId, true, pidiendoNumero?.texto);
        }
      } else {
        toast({
          title: 'No se pudo generar',
          description: e?.data?.error || 'Error desconocido',
          variant: 'destructive',
        });
      }
    } finally { setGenerando(null); }
  }

  async function aprobar(id: number) {
    setAprobando(id);
    try {
      const r = await client.post(`/invoices/${id}/emitir`, {});
      if (r.success) {
        toast({ title: 'Proforma aprobada', description: 'Ya tiene su número y aparece en el listado.' });
        cargar();
      }
    } catch (err) {
      toast({
        title: 'No se pudo aprobar',
        description: (err as { data?: { error?: string } })?.data?.error || 'Error desconocido',
        variant: 'destructive',
      });
    } finally { setAprobando(null); }
  }

  if (!estado) return null;
  const cola = estado.cola || [];

  // El cuadro que pide el numero. Va antes que nada: mientras esta abierto,

  // no se ha emitido nada y cancelar no gasta numero.

  const cuadroNumero = pidiendoNumero && (

    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">

      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-xl">

        <h3 className="text-sm font-semibold">Número de la factura</h3>

        <p className="mt-1 text-xs text-muted-foreground">

          {pidiendoNumero.sugerido

            ? <>El siguiente disponible es el <b className="text-foreground tabular-nums">{pidiendoNumero.sugerido}</b>. Puedes dejarlo o poner otro.</>

            : 'Escribe el número que quieres darle.'}

        </p>

        {/* Diego, 14/09: que antes de emitir se recuerde mirar el Excel. El CRM
            sabe cual es el siguiente de SU serie, pero el orden bueno esta en la
            hoja --y cuando los dos no coinciden, manda la hoja--. */}
        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-warning/30 bg-warning-soft px-2.5 py-2 text-[11px] font-medium text-warning-soft-foreground">
          <span aria-hidden="true">⚠</span>
          <span>
            Comprueba la numeración en el Excel de facturación primero.
            {' '}Si hay discrepancia, contacta con soporte; y si hace falta, genera la
            {' '}factura manualmente y avisa.
          </span>
        </p>
        <input

          autoFocus

          value={pidiendoNumero.texto}

          onChange={(e) => setPidiendoNumero({ ...pidiendoNumero, texto: e.target.value.replace(/[^0-9]/g, '') })}

          onKeyDown={(e) => { if (e.key === 'Enter' && pidiendoNumero.texto) { const p = pidiendoNumero; setPidiendoNumero(null); generar(p.paymentId, p.forzar, p.texto); } }}

          inputMode="numeric"

          className="mt-3 h-10 w-full rounded-md border border-border bg-background px-3 text-lg tabular-nums"

        />

        <div className="mt-4 flex justify-end gap-2">

          <button type="button" onClick={() => setPidiendoNumero(null)}

            className="h-9 px-3 rounded-md border border-border text-sm">Cancelar</button>

          <button type="button" disabled={!pidiendoNumero.texto}

            onClick={() => { const p = pidiendoNumero; setPidiendoNumero(null); generar(p.paymentId, p.forzar, p.texto); }}

            className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-40">

            Emitir la factura

          </button>

        </div>

      </div>

    </div>

  );


  return (
    <>
      {cuadroNumero}
      <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Receipt size={16} weight="bold" /> Cola de facturación
          </h3>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-[52ch]">
            Todo cobro sin factura sale aquí por orden de fecha, venga de Stripe o
            lo registre una gestora. Se emiten en orden para que la numeración no
            se descoloque.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
        <div className="bg-muted/40 rounded-md p-3">
          <p className="text-[11px] text-muted-foreground">Por generar factura</p>
          <p className="font-bold tabular-nums mt-0.5">{estado.pagos_sin_factura}</p>
        </div>
        <div className="bg-muted/40 rounded-md p-3">
          <p className="text-[11px] text-muted-foreground">Importe en cola</p>
          <p className="font-bold tabular-nums mt-0.5">{fmt(estado.importe_sin_factura)}</p>
        </div>
      </div>

      {estado.pagos_sin_factura === 0 && (estado.proformas_pendientes?.length || 0) === 0 && (
        <div className="mt-4 flex items-center gap-2 text-[12px] text-success">
          <CheckCircle size={16} weight="fill" />
          Todo facturado: no queda ningún cobro por generar.
        </div>
      )}

      {(estado.por_dia?.length || 0) > 0 && (
        <div className="mt-4">
          <h4 className="text-[11px] font-bold text-muted-foreground mb-2">Por día</h4>
          <div className="flex gap-1.5 flex-wrap">
            {estado.por_dia!.map((d, i) => (
              <span
                key={d.dia}
                title={`${d.cobros} cobro${d.cobros === 1 ? '' : 's'} · ${fmt(d.importe)}`}
                className={`text-[11px] px-2 py-1 rounded font-semibold tabular-nums ${
                  i === 0
                    ? 'bg-success-soft text-success-soft-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {d.dia.slice(8)}/{d.dia.slice(5, 7)} · {d.cobros}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            En verde el día más antiguo, que es por donde toca seguir.
          </p>
        </div>
      )}

      {cola.length > 0 && (
        <div className="mt-3">
          <div className="max-h-72 overflow-auto border border-border rounded-md">
            <table className="tabla-cifras w-full text-[11px]">
              <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1.5 font-bold">Fecha del pago</th>
                  <th className="text-left px-2 py-1.5 font-bold">Cliente</th>
                  <th className="text-left px-2 py-1.5 font-bold">Gestora</th>
                  <th className="text-left px-2 py-1.5 font-bold">Origen</th>
                  <th className="text-right px-2 py-1.5 font-bold">Importe</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {cola.map((c) => (
                  <tr
                    key={c.payment_id}
                    className={`border-b border-border/50 last:border-0 ${
                      c.es_el_siguiente ? 'bg-success-soft/60' : ''
                    }`}
                  >
                    <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{fecha(c.fecha)}</td>
                    <td className="px-2 py-1.5 truncate max-w-[170px]">{c.cliente || '—'}</td>
                    <td className="px-2 py-1.5 truncate max-w-[130px] text-muted-foreground">{c.gestora || '—'}</td>
                    <td className="px-2 py-1.5">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        {c.origen === 'stripe'
                          ? <><CreditCard size={11} weight="bold" /> Stripe</>
                          : <><User size={11} weight="bold" /> Manual</>}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{fmt(c.importe)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {puedeFacturar ? (
                        <button
                          type="button"
                          onClick={() => pedirNumero(c.payment_id)}
                          disabled={generando === c.payment_id}
                          className={`h-6 px-2 rounded font-semibold whitespace-nowrap disabled:opacity-40 ${
                            c.es_el_siguiente
                              ? 'bg-primary text-primary-foreground'
                              : 'border border-border hover:bg-muted'
                          }`}
                        >
                          {generando === c.payment_id ? 'Generando…' : 'Generar factura'}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">por generar</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {estado.pagos_sin_factura > cola.length && (
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Mostrando los {cola.length} más antiguos de {estado.pagos_sin_factura}.
            </p>
          )}
        </div>
      )}

      {(estado.proformas_pendientes?.length || 0) > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <h4 className="text-[11px] font-bold text-warning mb-2">
            Proformas esperando visto bueno ({estado.proformas_pendientes!.length})
          </h4>
          <div className="space-y-1.5">
            {estado.proformas_pendientes!.map((pf) => (
              <div key={pf.id} className="flex items-center justify-between gap-3 bg-warning-soft/60 rounded-md px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold truncate">{pf.cliente_nombre || 'Sin nombre'}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {pf.creada_por ? `${pf.creada_por} · ` : ''}{fecha(pf.created_at)}
                  </p>
                </div>
                <span className="text-[12px] font-bold tabular-nums">{fmt(pf.total)}</span>
                {puedeFacturar && (
                  <button
                    type="button"
                    onClick={() => aprobar(pf.id)}
                    disabled={aprobando === pf.id}
                    className="h-7 px-2.5 rounded-md bg-primary text-primary-foreground text-[11px] font-semibold disabled:opacity-40 whitespace-nowrap"
                  >
                    {aprobando === pf.id ? 'Aprobando…' : 'Aprobar y emitir'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
    </>
  );
}
