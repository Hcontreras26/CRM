import { useRef, useState } from 'react';
import { CheckCircle, Copy, FilePdf, Plus, Trash, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { toast } from '@/shared/hooks/useToast';
import { Button } from '@/shared/components/ui/button';
import Field from '@/shared/components/ui/Field';
import FilaCampos from '@/shared/components/ui/FilaCampos';
import Select from '@/shared/components/ui/Select';
import { inputClass } from '@/shared/lib/ui';
import {
  calcularDesglose, euros, normalizarImporte,
  type DesgloseEnvio, type FacturaDelColaborador, type LineaForm,
} from '../api/facturasColaborador.api';

/*
  La factura de un mes, tal como la ve el colaborador (#202): por su enlace
  personal o desde «Mi factura». Lo de la «Definición acordada · Diego, 01/10»
  → «Página del enlace»: quién, mes y empresa; lo acordado; «Factura a nombre
  de» con un botón para copiar los datos; el archivo, el importe (con lo
  acordado ya puesto) y el número de factura. Si el importe no coincide con lo
  acordado, se hace notar y se deja enviar. Con desglose (segunda parte), el
  importe viene con su total y lo acordado se compara con la base.
*/

const TOPE = 10 * 1024 * 1024;
const TIPOS = ['application/pdf', 'image/jpeg', 'image/png'];

function datosFiscales(f: FacturaDelColaborador) {
  const e = f.empresa;
  return [e.razon_social, e.nif ? `NIF ${e.nif}` : null, e.direccion, [e.cp, e.ciudad].filter(Boolean).join(' ') || null, e.pais]
    .filter(Boolean).join('\n');
}

const cuando = (iso: string) => {
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `el ${dos(d.getDate())}/${dos(d.getMonth() + 1)} a las ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

export default function SubirFactura({ factura, alSubir }: {
  factura: FacturaDelColaborador;
  /** Manda el formulario; devuelve la factura ya recibida o lanza el error del servidor. */
  alSubir: (archivo: File, importe: string, numero: string, desglose: DesgloseEnvio) => Promise<void>;
}) {
  const f = factura;
  // El desglose (segunda parte): las horas del mes, o una línea por encargo.
  const [horas, setHoras] = useState('');
  const [lineas, setLineas] = useState<LineaForm[]>([{ concepto: '', project_id: '', horas: '' }]);
  const cambiarLinea = (i: number, campo: keyof LineaForm, valor: string) =>
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  const calculo = f.cobro ? calcularDesglose(f.cobro, horas, lineas) : null;
  const [archivo, setArchivo] = useState<File | null>(null);
  // El importe sugerido: sin desglose, lo acordado (primera parte, «con el acordado ya
  // sugerido»); con desglose, su total, que sigue a las horas hasta que lo cambie a mano.
  // Lo acordado es la base (el ejemplo de Diego: 600 acordados, 636 de total con IVA e IRPF):
  // sugerirlo y compararlo con el total avisaba siempre, aunque la factura estuviera bien.
  const [escrito, setEscrito] = useState(!f.cobro && f.importe_acordado !== null ? String(f.importe_acordado).replace('.', ',') : '');
  const [tocado, setTocado] = useState(false);
  const sugerido = calculo && calculo.total > 0 ? calculo.total.toFixed(2).replace('.', ',') : '';
  const importe = calculo && !tocado ? sugerido : escrito;
  const [numero, setNumero] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const importeNum = Number(normalizarImporte(importe));
  // Con desglose, lo acordado se compara con la base; sin él, con el importe (como en la primera parte).
  const comparado = calculo ? calculo.base : (importe.trim() !== '' ? importeNum : NaN);
  const noCoincide = f.importe_acordado !== null && Number.isFinite(comparado) && (!calculo || calculo.base > 0)
    && Math.abs(comparado - f.importe_acordado) > 0.005;
  // «Si no cuadra, se avisa y se deja enviar»: queda marcada «No cuadra».
  const noCuadra = calculo !== null && importe.trim() !== ''
    && Number.isFinite(importeNum) && Math.abs(importeNum - calculo.total) > 0.005;

  function elegir(a: File | null | undefined) {
    setError(null);
    if (!a) return;
    if (!TIPOS.includes(a.type)) { setError('Tiene que ser un PDF o una foto JPG o PNG.'); return; }
    if (a.size > TOPE) { setError('El archivo pasa de 10 MB.'); return; }
    setArchivo(a);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(datosFiscales(f));
      toast({ title: 'Datos copiados' });
    } catch {
      toast({ title: 'No se pudieron copiar', description: 'Selecciónalos y cópialos a mano.', variant: 'destructive' });
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!archivo) { setError('Elige el archivo de tu factura.'); return; }
    if (!importe.trim()) { setError('Escribe el importe de tu factura.'); return; }
    if (!numero.trim()) { setError('Escribe el número de tu factura.'); return; }
    const desglose: DesgloseEnvio = {};
    if (f.cobro?.modalidad === 'hora') {
      if (!horas.trim()) { setError('Escribe las horas del mes.'); return; }
      desglose.horas = horas.trim();
    }
    if (f.cobro?.modalidad === 'proyecto') {
      const mal = lineas.findIndex((l) => !l.concepto.trim() || !l.horas.trim());
      if (mal >= 0) { setError(`Escribe el encargo y las horas en la línea ${mal + 1}.`); return; }
      desglose.lineas = JSON.stringify(lineas.map((l) => ({
        concepto: l.concepto.trim(), project_id: l.project_id ? Number(l.project_id) : null, horas: l.horas.trim(),
      })));
    }
    setEnviando(true);
    setError(null);
    try {
      // Tal cual: lo normaliza el servidor (hacerlo dos veces convertía «12,500» en 12500).
      await alSubir(archivo, importe.trim(), numero.trim(), desglose);
    } catch (err: any) {
      setError(err?.data?.error || err?.message || 'No se pudo enviar la factura.');
    } finally {
      setEnviando(false);
    }
  }

  const cabecera = (
    <div className="flex flex-wrap items-center gap-3">
      {f.empresa.logo_url && <img src={f.empresa.logo_url} alt="" className="h-9 w-auto max-w-[120px] object-contain" />}
      <div className="min-w-0">
        <h2 className="text-seccion font-semibold">{f.colaborador} · {f.mes} · {f.empresa.razon_social}</h2>
        {f.importe_acordado !== null && (
          <p className="text-secundario text-muted-foreground">Importe acordado: <strong className="text-foreground">{euros(f.importe_acordado)}</strong></p>
        )}
      </div>
    </div>
  );

  // ── Estados en los que ya no se sube nada ──
  if (f.estado === 'recibida' && f.recibida) {
    return (
      <div className="space-y-4">
        {cabecera}
        <div className="rounded-lg bg-success-soft text-success-soft-foreground p-4 flex gap-3">
          <CheckCircle size={22} weight="fill" className="shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">Factura recibida {cuando(f.recibida.subida_at)} · {f.recibida.numero_recepcion}</p>
            <p className="text-secundario">
              {f.recibida.archivo} · {euros(f.recibida.importe)} · n.º {f.recibida.numero_factura}
            </p>
            {f.recibida.cuadra === false && (
              <p className="text-secundario">No cuadra con el desglose ({euros(f.recibida.total)}): administración lo revisará.</p>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (f.estado === 'anulada') {
    return (
      <div className="space-y-4">
        {cabecera}
        <Aviso>Esta factura se anuló. Te llegará un enlace nuevo para subirla otra vez.</Aviso>
      </div>
    );
  }
  if (f.estado === 'caducado') {
    return (
      <div className="space-y-4">
        {cabecera}
        <Aviso>Este enlace ha caducado. Pide uno nuevo a administración.</Aviso>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className="space-y-5" noValidate>
      {cabecera}

      <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <p className="text-secundario text-muted-foreground">Factura a nombre de</p>
          <Button type="button" variant="outline" size="sm" onClick={copiar}>
            <Copy size={13} className="mr-1.5" /> Copiar datos
          </Button>
        </div>
        <p className="whitespace-pre-line text-sm">{datosFiscales(f)}</p>
      </div>

      <Field label="Archivo de tu factura" hint="PDF o foto (JPG, PNG), hasta 10 MB" required>
        <div
          role="button"
          tabIndex={0}
          aria-label="Elegir el archivo de la factura"
          onClick={() => entrada.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); elegir(e.dataTransfer.files?.[0]); }}
          className={`flex items-center gap-3 rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors ${
            arrastrando ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'
          }`}
        >
          {archivo ? <FilePdf size={22} className="text-primary shrink-0" /> : <UploadSimple size={22} className="text-muted-foreground shrink-0" />}
          <span className="text-sm min-w-0 truncate">
            {archivo ? `${archivo.name} · ${Math.ceil(archivo.size / 1024)} KB` : 'Arrástralo aquí o pulsa para elegirlo'}
          </span>
          <input
            ref={entrada}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => elegir(e.target.files?.[0])}
          />
        </div>
      </Field>

      {f.cobro && calculo && (
        // El desglose («Añadido 01/10 (tarde)»): fijo, ya relleno; por hora, sus
        // horas; por proyecto, una línea por encargo. La tarifa es la de su ficha.
        <div className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-sm font-semibold">Tu desglose</p>

          {f.cobro.modalidad === 'fijo' && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0">{f.cobro.concepto}</span>
              <span className="tabular-nums font-medium">{euros(f.cobro.importe_fijo)}</span>
            </div>
          )}

          {f.cobro.modalidad === 'hora' && (
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <div className="w-32">
                <label htmlFor="factura-horas" className="text-xs text-muted-foreground">Horas del mes</label>
                <input id="factura-horas" inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} className={inputClass} />
              </div>
              <span className="pb-2 text-muted-foreground">× {euros(f.cobro.tarifa_hora)}/h = <strong className="text-foreground tabular-nums">{euros(calculo.base)}</strong></span>
            </div>
          )}

          {f.cobro.modalidad === 'proyecto' && (
            <div className="space-y-2">
              {lineas.map((l, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_11rem_6rem_auto] gap-2 items-end">
                  <div>
                    <label htmlFor={`linea-${i}`} className="text-xs text-muted-foreground">Encargo {i + 1}</label>
                    <input id={`linea-${i}`} value={l.concepto} maxLength={200} onChange={(e) => cambiarLinea(i, 'concepto', e.target.value)}
                      className={inputClass} />
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Proyecto o campus</span>
                    <Select<string> value={l.project_id} onChange={(v) => cambiarLinea(i, 'project_id', v)} ariaLabel={`Proyecto de la línea ${i + 1}`}
                      options={[{ value: '', label: 'Toda la empresa' }, ...(f.campus ?? []).map((p) => ({ value: String(p.id), label: p.nombre }))]} />
                  </div>
                  <div>
                    <label htmlFor={`horas-${i}`} className="text-xs text-muted-foreground">Horas</label>
                    <input id={`horas-${i}`} inputMode="decimal" value={l.horas} onChange={(e) => cambiarLinea(i, 'horas', e.target.value)}
                      className={inputClass} />
                  </div>
                  <Button type="button" variant="ghost" size="sm" title="Quitar la línea" aria-label={`Quitar la línea ${i + 1}`}
                    disabled={lineas.length === 1} onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}>
                    <Trash size={15} />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setLineas((ls) => [...ls, { concepto: '', project_id: '', horas: '' }])}>
                  <Plus size={13} className="mr-1.5" /> Añadir encargo
                </Button>
                <span className="text-secundario text-muted-foreground">A {euros(f.cobro.tarifa_hora)}/h, tu tarifa</span>
              </div>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 border-t border-border pt-3 text-sm tabular-nums">
            <dt className="text-muted-foreground">Base</dt><dd className="text-right">{euros(calculo.base)}</dd>
            <dt className="text-muted-foreground">IVA ({f.cobro.iva_pct} %)</dt><dd className="text-right">{euros(calculo.iva)}</dd>
            <dt className="text-muted-foreground">IRPF ({f.cobro.irpf_pct ? '−' : ''}{f.cobro.irpf_pct} %)</dt>
            <dd className="text-right">{calculo.irpf ? '−' : ''}{euros(calculo.irpf)}</dd>
            <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{euros(calculo.total)}</dd>
          </dl>
        </div>
      )}

      <FilaCampos>
        <Field label="Importe de tu factura (€)" htmlFor="factura-importe" required
          hint={calculo ? (tocado ? undefined : 'Ya puesto el total de tu desglose: cámbialo si tu factura dice otro')
            : noCoincide ? undefined : (f.importe_acordado !== null ? 'Ya puesto el acordado: cámbialo si tu factura dice otro' : undefined)}>
          <input id="factura-importe" inputMode="decimal" value={importe}
            onChange={(e) => { setTocado(true); setEscrito(e.target.value); }}
            placeholder="600,00" className={inputClass} />
        </Field>
        <Field label="Número de tu factura" htmlFor="factura-numero" required>
          <input id="factura-numero" value={numero} onChange={(e) => setNumero(e.target.value)}
            placeholder="F-2026-09" maxLength={60} className={inputClass} />
        </Field>
      </FilaCampos>

      {noCoincide && (
        <p className="rounded-md bg-warning-soft text-warning-soft-foreground px-3 py-2 text-secundario">
          {calculo
            ? <>La base de tu desglose ({euros(calculo.base)}) no coincide con lo acordado ({euros(f.importe_acordado)}). Puedes enviarla igual.</>
            : <>El importe no coincide con lo acordado ({euros(f.importe_acordado)}). Puedes enviarla igual.</>}
        </p>
      )}
      {noCuadra && calculo && (
        <p className="rounded-md bg-warning-soft text-warning-soft-foreground px-3 py-2 text-secundario">
          El total de tu factura no cuadra con el desglose ({euros(calculo.total)}). Puedes enviarla igual: quedará marcada «No cuadra».
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-destructive-soft text-destructive-soft-foreground px-3 py-2 text-secundario">{error}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {f.caduca_at && (
          <p className="text-secundario text-muted-foreground">
            El enlace es solo tuyo y caduca el {new Date(f.caduca_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}.
          </p>
        )}
        <Button type="submit" disabled={enviando} className="ml-auto">
          {enviando ? 'Enviando…' : 'Enviar factura'}
        </Button>
      </div>
    </form>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-warning-soft text-warning-soft-foreground p-4 flex gap-3">
      <WarningCircle size={22} weight="fill" className="shrink-0" />
      <p>{children}</p>
    </div>
  );
}
