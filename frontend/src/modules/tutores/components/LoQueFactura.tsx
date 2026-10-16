/*
  Lo que el profesional tiene que facturar.

  Diego, 14/09/2026: «necesito el cálculo que el profesional me tiene que enviar,
  que sería la cantidad de 17,82 € + 21 % de 17,82 € (3,74 €) − retención del
  15 % (2,67 €) = 18,89 €».

  La base es el TOTAL DEL MES de ese tutor, no una línea suelta.

  Se redondea CADA LÍNEA a dos decimales, no el resultado: con 17,82 € el IVA es
  3,7422 y la retención 2,673, y redondear al final da un céntimo distinto del
  que el tutor va a escribir en su factura. Un céntimo de diferencia es una
  factura que no cuadra y una conversación.

  Vive aquí, y no dentro de la pantalla de Comisiones, porque lo ven dos: quien
  paga —en la fila del cobro— y el propio tutor en «Mis cursos». Diego: «el
  tutor debe ver ese cuadro de él y sus recaudos». Y es lo que hay que meter en
  el correo de «Avisar tutor» cuando se haga.
*/

import { CheckCircle } from '@phosphor-icons/react';

const IVA = 0.21;
const IRPF = 0.15;
const dos = (n: number) => Math.round(n * 100) / 100;

export function loQueFactura(base: number) {
  const iva = dos(base * IVA);
  const retencion = dos(base * IRPF);
  return { base: dos(base), iva, retencion, total: dos(dos(base) + iva - retencion) };
}

const euros = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const enCastellano = (f: string) => {
  const [a, m, d] = String(f).slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : String(f);
};

/** Lo minimo de una comision del mes para saber si ya esta todo pagado. */
export interface ComisionDelMes {
  estado: string;
  importe: string | number;
  fecha_liquidacion: string | null;
}

/*
  «Pagado, no hay nada que facturar» (Diego, 13/10).

  El cuadro solo salia con algo pendiente. Con el mes ya pagado no salia NADA,
  y eso parece un fallo: le paso a Sara en septiembre, que estaba pagada y
  creyo que el CRM no le calculaba la comision. Si hay comisiones ese mes y no
  queda nada por facturar, se dice, con cuanto y cuando se pago.

  Devuelve null si queda algo pendiente o si no hay comisiones: lo primero lo
  pinta el desglose de siempre y lo segundo se queda como estaba, sin cuadro.
*/
export function todoPagadoDelMes(comisiones: ComisionDelMes[] | null | undefined) {
  const lista = comisiones || [];
  if (!lista.length) return null;
  if (lista.some((c) => c.estado !== 'pagada' && c.estado !== 'revertida')) return null;
  const pagadas = lista.filter((c) => c.estado === 'pagada');
  const revertidas = lista.filter((c) => c.estado === 'revertida');
  const fechas = [...new Set(pagadas
    .map((c) => (c.fecha_liquidacion ? String(c.fecha_liquidacion).slice(0, 10) : ''))
    .filter(Boolean))].sort();
  return {
    pagado: dos(pagadas.reduce((s, c) => s + Number(c.importe || 0), 0)),
    pagadas: pagadas.length,
    /** La ultima liquidacion. Si hubo varias, cuantas fechas distintas. */
    fecha: fechas.length ? fechas[fechas.length - 1] : null,
    fechasDistintas: fechas.length,
    revertidas: revertidas.length,
    revertido: dos(revertidas.reduce((s, c) => s + Number(c.importe || 0), 0)),
  };
}

/** La frase del cuadro de «todo pagado». Aparte para poder probarla. */
export function textoTodoPagado(r: NonNullable<ReturnType<typeof todoPagadoDelMes>>): string {
  const rev = r.revertidas
    ? `${r.revertidas === 1 ? 'Una comisión revertida' : `${r.revertidas} comisiones revertidas`}`
      + ` (${euros(r.revertido)}), que no se ${r.revertidas === 1 ? 'paga' : 'pagan'}.`
    : '';
  if (!r.pagadas) {
    // Solo revertidas: tampoco hay nada que facturar, y tambien hay que decirlo.
    return `${rev} No hay nada pendiente de facturar.`;
  }
  const cuando = !r.fecha ? ''
    : r.fechasDistintas > 1 ? ` en ${r.fechasDistintas} pagos, el último el ${enCastellano(r.fecha)}`
      : ` el ${enCastellano(r.fecha)}`;
  return [`Todo pagado este mes: ${euros(r.pagado)}${cuando}. No hay nada pendiente de facturar.`, rev]
    .filter(Boolean).join(' ');
}

export default function LoQueFactura({
  base, titulo = 'Lo que tiene que facturar', className = '', comisiones,
}: {
  base: number;
  titulo?: string;
  className?: string;
  /** Las comisiones del mes. Con ellas, un mes ya pagado lo dice en vez de
   *  quedarse en blanco. Sin ellas, el comportamiento de siempre. */
  comisiones?: ComisionDelMes[];
}) {
  if (!(base > 0)) {
    const pagado = todoPagadoDelMes(comisiones);
    if (!pagado) return null;
    return (
      <div role="status" className={`rounded-md border border-border bg-muted/30 p-3 ${className}`}>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{titulo}</p>
        <p className="text-xs flex items-start gap-1.5">
          {pagado.pagadas > 0 && (
            <CheckCircle size={14} weight="fill" className="text-success shrink-0 mt-px" aria-hidden="true" />
          )}
          <span>{textoTodoPagado(pagado)}</span>
        </p>
      </div>
    );
  }
  const f = loQueFactura(base);
  return (
    <div className={`rounded-md border border-border bg-muted/30 p-3 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{titulo}</p>
      <dl className="space-y-1 text-xs max-w-xs">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Comisión</dt>
          <dd className="tabular-nums font-semibold">{euros(f.base)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">+ IVA (21 %)</dt>
          <dd className="tabular-nums">{euros(f.iva)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">− retención IRPF (15 %)</dt>
          <dd className="tabular-nums">−{euros(f.retencion)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-border pt-1 mt-1">
          <dt className="font-semibold">Total a facturar</dt>
          <dd className="tabular-nums font-bold text-sm">{euros(f.total)}</dd>
        </div>
      </dl>
      <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
        <li>— Comisión sujeta a IVA (21 %).</li>
        <li>— Retención de IRPF orientativa: cada profesional aplica la suya; el 15 % es la más común.</li>
      </ul>
    </div>
  );
}
