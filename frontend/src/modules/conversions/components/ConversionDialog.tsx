
import { inputClass } from '@/shared/lib/ui';import { useState, useEffect, useMemo, useRef, lazy, Suspense, type FormEvent } from 'react';
import Portal from '@/shared/components/ui/portal';
import Select from '@/shared/components/ui/Select';
import { X, Link as LinkIcon, Copy, CheckCircle, Receipt, FileText } from '@phosphor-icons/react';
import { conversionsApi, type Conversion, type MetodoPago } from '../api/conversions.api';
import { useProducts } from '@/modules/products/hooks/useProducts';
import { invoicesApi, invoiceFaltantes, type Invoice, type InvoiceItem } from '@/modules/invoices/api/invoices.api';
import client from '@/shared/api/client';
import { toast } from '@/shared/hooks/useToast';
import { useEscapeKey } from '@/shared/hooks/useDialogA11y';

const FiscalDataDialog = lazy(() => import('@/modules/invoices/components/FiscalDataDialog'));
const EmitirBorradorDialog = lazy(() => import('@/modules/invoices/components/EmitirBorradorDialog'));

// La ventana de documento tras registrar la venta sale SIEMPRE, en los dos
// entornos. Estuvo detrás de `VITE_FACTURACION_V2` --solo encendido en staging--
// y por eso en producción no se vio nunca: ni el aviso de que la factura no se
// emite sola, ni el número al convertir. Ver el porqué en `handleSubmit`.

// Construye los conceptos del documento a partir de la conversión creada.
function buildDocItems(c: Conversion): InvoiceItem[] {
  if (c.items && c.items.length > 0) {
    return c.items.map(it => ({ descripcion: it.descripcion, cantidad: it.cantidad, precio_unitario: Number(it.precio_unitario) }));
  }
  return [{ descripcion: c.producto_contratado || 'Servicio', cantidad: 1, precio_unitario: Number(c.importe_total) }];
}
interface PaymentLink {
  label: string;
  url: string;
  tipo: string;
}

interface ConversionForm {
  producto_contratado: string;
  importe_total: string;
  importe_pagado: string;
  metodo_pago: MetodoPago;
  fecha_compromiso_pago: string;
  fecha_conversion: string;
  notas_pago: string;
  iva_pct: string;
  iva_incluido: boolean;
  iva_exento: boolean;
  descuento_tipo: 'none' | 'pct' | 'monto';
  descuento_valor: string;
}

interface SaleItem {
  product_id: number | null;
  descripcion: string;
  cantidad: number;
  precio_unitario: string;
}

interface Installment {
  importe_previsto: string;
  fecha_vencimiento: string;
}

function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function distributeInstallments(total: number, n: number, fechaInicio: string): Installment[] {
  if (!isFinite(total) || total <= 0 || n < 1) return [];
  const cuotaBase = Math.round((total / n) * 100) / 100;
  const result: Installment[] = [];
  for (let i = 0; i < n; i++) {
    const importe = i === n - 1
      ? Math.round((total - cuotaBase * (n - 1)) * 100) / 100
      : cuotaBase;
    result.push({
      importe_previsto: String(importe),
      fecha_vencimiento: addMonths(fechaInicio, i),
    });
  }
  return result;
}

// Acepta tanto Lead como Client; solo necesita id, nombre y opcional producto_nombre
interface ConversionDialogTarget {
  id: number;
  nombre?: string;
  producto_nombre?: string;
}

interface ConversionDialogProps {
  open: boolean;
  onClose: () => void;
  lead: ConversionDialogTarget | null | undefined;
  projectId: number;
  onCreated?: (data: Conversion) => void;
}

const METODOS: ReadonlyArray<{ value: MetodoPago; label: string }> = [
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'tarjeta_stripe', label: 'Tarjeta (Stripe)' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'bizum', label: 'Bizum' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'fraccionado', label: 'Fraccionado' },
  { value: 'otro', label: 'Otro' },
];

export default function ConversionDialog({ open, onClose, lead, projectId, onCreated }: ConversionDialogProps) {
  const { products } = useProducts(projectId);
  const [saving, setSaving] = useState(false);
  // Paso post-venta: tras registrar la conversión, ofrecer generar Presupuesto/Factura + PDF.
  const [created, setCreated] = useState<Conversion | null>(null);
  const [docPhase, setDocPhase] = useState<'idle' | 'choose' | 'factura' | 'proforma'>('idle');
  // Factura ya emitida automáticamente por el pago → diálogo de completar datos.
  const [emitInv, setEmitInv] = useState<Invoice | null>(null);
  const notifiedRef = useRef(false);
  /*
    Quien puede numerar aqui mismo, y el numero.

    Diego, 15/09: «que salga al convertir, puedas colocar el numero de factura;
    solo es para unos y para otros. CEDIA y ICTESS SI lo pueden hacer, porque
    esas gestoras llevan facturacion aun».

    Por defecto NO sale: la venta va a la cola y se factura desde alli, que es el
    freno del 14/09. El interruptor vive en la empresa emisora.
  */
  const [numeraAqui, setNumeraAqui] = useState(false);
  const [numero, setNumero] = useState('');
  const [sugerido, setSugerido] = useState('');
  // Notifica al padre (refresca su lista) UNA sola vez y cierra. Se usa en X, backdrop, Esc y "Ahora no".
  const finishAndClose = () => {
    if (created && !notifiedRef.current) { notifiedRef.current = true; onCreated?.(created); }
    onClose();
  };
  useEscapeKey(finishAndClose, open);
  const [selectedLinkIdx, setSelectedLinkIdx] = useState<string>('-1'); // '-1' = sin link, 'X' = índice, 'custom' = personalizado
  const [customLink, setCustomLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const [aplicaDescuento, setAplicaDescuento] = useState(false);
  // Estado del pago: 'total' SIEMPRE manda calc.total al registrar (no se queda
  // con un valor viejo si cambias el precio después), 'parcial' usa el input, 'none' = 0.
  const [pagoMode, setPagoMode] = useState<'none' | 'parcial' | 'total'>('none');
  // Método REAL del pago inicial cuando el plan es "Fraccionado" (fraccionado es
  // el plan, no un método de pago). Para pago único se usa el método simple.
  const [metodoInicial, setMetodoInicial] = useState<MetodoPago>('tarjeta');
  const [numCuotas, setNumCuotas] = useState(3);
  const [fechaPrimeraCuota, setFechaPrimeraCuota] = useState<string>(new Date().toISOString().slice(0, 10));
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [installmentsDirty, setInstallmentsDirty] = useState(false);

  /*
    QUE DOCUMENTO TOCA, Y DE QUE. Lo decide como se registro la venta.

    Diego, 15/09: «que me salga el cuadro diciendome: registrar numero de factura
    del pago 1, o del pago completo, y asi; si es sin pago, el numero de la
    proforma».

    Son tres casos y cada uno se llama distinto, porque son cosas distintas:

      sin cobro           -> PROFORMA. Reserva el numero y pasa a factura al pagar.
      cobro por el total  -> FACTURA del pago completo.
      cobro parcial       -> FACTURA DEL PAGO 1. Cada cuota lleva la suya despues:
                             esa es la regla de «una factura por cada abono».

    Se mira lo GUARDADO, no el modo del formulario, que puede haberse tocado.
  */
  const pagadoVenta = Number(created?.importe_pagado) || 0;
  const totalVenta = Number(created?.importe_total) || 0;
  const sinPagoVenta = !created || pagadoVenta <= 0;
  const pagoCompleto = !sinPagoVenta && pagadoVenta >= totalVenta - 0.01;
  const nCuotas = installments.length;
  const queSeEmite = sinPagoVenta
    ? 'la proforma'
    : pagoCompleto
      ? 'la factura del pago completo'
      : (nCuotas > 0 ? `la factura del pago 1 (de ${nCuotas + 1})` : 'la factura del pago 1');
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
  }, []);
  // Al cerrar, resetea el paso de documento para que una próxima apertura arranque limpia.
  useEffect(() => {
    if (!open) { setDocPhase('idle'); setCreated(null); setEmitInv(null); notifiedRef.current = false; }
  }, [open]);
  const [form, setForm] = useState<ConversionForm>({
    producto_contratado: '',
    importe_total: '',
    importe_pagado: '0',
    metodo_pago: 'tarjeta',
    fecha_compromiso_pago: '',
    fecha_conversion: new Date().toISOString().slice(0, 10),
    notas_pago: '',
    iva_pct: '21',
    iva_incluido: true,   // el precio del curso ya es el precio final (IVA incluido)
    iva_exento: false,
    descuento_tipo: 'none',
    descuento_valor: '',
  });
  // Multi-item: si tiene >0 items se usan para calcular importe_total.
  // Si la lista está vacía → comportamiento legacy (1 producto, importe manual).
  const [items, setItems] = useState<SaleItem[]>([]);
  const useMultiItem = items.length > 0;

  // Desglose central: subtotal bruto → descuento → base → IVA → total.
  // En modo simple el bruto es form.importe_total (lo que ingresa el usuario);
  // en multi-item es la suma de los items.
  const calc = useMemo(() => {
    const bruto = useMultiItem
      ? items.reduce((s, it) => s + Number(it.cantidad || 1) * Number(it.precio_unitario || 0), 0)
      : Number(form.importe_total || 0);
    let desc = 0;
    if (form.descuento_tipo === 'pct') desc = bruto * Number(form.descuento_valor || 0) / 100;
    else if (form.descuento_tipo === 'monto') desc = Math.min(Number(form.descuento_valor || 0), bruto);
    const neto = Math.max(0, bruto - desc);
    const ivaPct = Number(form.iva_pct || 0);
    let base: number, iva: number, total: number;
    if (form.iva_exento) { base = neto; iva = 0; total = neto; }
    else if (form.iva_incluido) { total = neto; base = neto / (1 + ivaPct / 100); iva = total - base; }
    else { base = neto; iva = base * ivaPct / 100; total = base + iva; }
    return {
      bruto: Number(bruto.toFixed(2)), desc: Number(desc.toFixed(2)), neto: Number(neto.toFixed(2)),
      base: Number(base.toFixed(2)), iva: Number(iva.toFixed(2)), total: Number(total.toFixed(2)),
    };
  }, [useMultiItem, items, form.importe_total, form.descuento_tipo, form.descuento_valor, form.iva_pct, form.iva_incluido, form.iva_exento]);

  // Producto seleccionado por nombre exacto (CRM-140) — para mostrar sus enlaces de pago
  const selectedProduct = useMemo(
    () => products.find((p: { nombre?: string }) => p.nombre === form.producto_contratado),
    [products, form.producto_contratado]
  );
  const productLinks = useMemo<PaymentLink[]>(() => {
    if (!selectedProduct) return [];
    if (Array.isArray(selectedProduct.payment_links) && selectedProduct.payment_links.length > 0) {
      return selectedProduct.payment_links as PaymentLink[];
    }
    if (selectedProduct.stripe_link) {
      return [{ label: 'Pago completo', url: selectedProduct.stripe_link, tipo: 'completo' }];
    }
    return [];
  }, [selectedProduct]);

  useEffect(() => {
    setSelectedLinkIdx('-1');
    setCustomLink('');
  }, [form.producto_contratado]);

  // Al elegir un producto del catálogo, autorrellena el importe con su precio.
  // Si el usuario marca "Aplicar descuento", deja editar libremente sin pisar.
  useEffect(() => {
    if (!selectedProduct || aplicaDescuento) return;
    const precio = selectedProduct.precio != null ? String(selectedProduct.precio) : '';
    if (precio && form.importe_total !== precio) {
      setForm(f => ({ ...f, importe_total: precio }));
    }
  }, [selectedProduct, aplicaDescuento]);

  // Reset dirty flag when fraccionado switches off
  useEffect(() => {
    if (form.metodo_pago !== 'fraccionado') {
      setInstallmentsDirty(false);
      setInstallments([]);
    }
  }, [form.metodo_pago]);

  // Pago recibido HOY (parcial o total). El plan de cuotas reparte el PENDIENTE
  // (total − pago inicial), NO el total: si pagas 500 de 1500, las cuotas suman
  // 1000, no 1500. Así el inicial + cuotas = total del programa.
  const pagadoInicial = pagoMode === 'total' ? calc.total : pagoMode === 'parcial' ? Number(form.importe_pagado || 0) : 0;
  const pendienteFrac = Math.max(0, Number((calc.total - pagadoInicial).toFixed(2)));

  // Recalcular cuotas si: estoy en fraccionado, las cuotas NO han sido editadas a mano.
  // Se reparte el PENDIENTE neto (total − pago inicial). Las cuotas deben sumar el
  // pendiente, no el total del programa.
  useEffect(() => {
    if (form.metodo_pago !== 'fraccionado' || installmentsDirty) return;
    setInstallments(distributeInstallments(pendienteFrac, numCuotas, fechaPrimeraCuota));
  }, [form.metodo_pago, pendienteFrac, numCuotas, fechaPrimeraCuota, installmentsDirty]);

  const activeLink = selectedLinkIdx === 'custom'
    ? customLink
    : selectedLinkIdx !== '-1' ? productLinks[Number(selectedLinkIdx)]?.url : '';

  async function copyActiveLink() {
    if (!activeLink) return;
    const { copyToClipboard } = await import('@/shared/lib/clipboard');
    const ok = await copyToClipboard(activeLink);
    if (ok) {
      setLinkCopied(true);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setLinkCopied(false), 2000);
      toast({ title: 'Enlace copiado', description: 'Pégalo en WhatsApp/Email del cliente' });
    } else {
      toast({ title: 'No se pudo copiar', variant: 'destructive' });
    }
  }

  useEffect(() => {
    if (open && lead?.producto_nombre) {
      setForm(f => ({ ...f, producto_contratado: lead.producto_nombre }));
    }
  }, [open, lead]);

  // El interruptor de la empresa y el siguiente numero libre. Se piden al llegar
  // al paso del documento, no antes: si la venta no llega a registrarse, no se
  // ha preguntado nada.
  useEffect(() => {
    if (docPhase !== 'choose' || !projectId) return;
    invoicesApi.getConfig(projectId)
      .then((r) => setNumeraAqui(Boolean(r?.success && r.data?.numera_al_convertir)))
      .catch(() => setNumeraAqui(false));
    client.get<{ siguiente: number }>(`/invoices/siguiente-numero?projectId=${projectId}`)
      .then((r) => {
        if (!r?.success) return;
        setSugerido(String(r.data.siguiente));
        setNumero(String(r.data.siguiente));
      })
      .catch(() => { /* se escribe a mano */ });
  }, [docPhase, projectId]);

  if (!open) return null;

  // Elegir "Factura" en el paso post-venta: si el pago YA generó la factura
  // automática (con número), no se crea otra — se completa/descarga esa.
  async function handleFacturaChoice() {
    if (!created) { setDocPhase('factura'); return; }
    try {
      let inv = (await invoicesApi.byConversion(created.id)).data || null;
      if (!inv && pagoMode !== 'none') {
        // la auto-emisión corre asíncrona en el server: pequeño reintento
        await new Promise((r) => setTimeout(r, 900));
        inv = (await invoicesApi.byConversion(created.id)).data || null;
      }
      if (inv) {
        if (inv.estado === 'borrador' || invoiceFaltantes(inv).length > 0) { setEmitInv(inv); return; }
        toast({ title: `✓ Factura ${inv.codigo}`, description: 'Esta venta ya tenía factura emitida.' });
        invoicesApi.openPdf(inv.id).catch((e: unknown) => toast({ title: 'No se pudo abrir el PDF', description: (e as { message?: string })?.message, variant: 'destructive' }));
        finishAndClose();
        return;
      }
    } catch { /* si falla la consulta, seguimos al modal normal */ }
    setDocPhase('factura');
  }

  // Paso 2c: la factura ya existe (auto-emitida al pagar) pero le faltan datos →
  // alerta para completarlos (desbloquea descargar/enviar).
  if (emitInv) {
    return (
      <Suspense fallback={null}>
        <EmitirBorradorDialog
          invoice={emitInv}
          onClose={() => { setEmitInv(null); finishAndClose(); }}
          onEmitted={(_codigo, id) => { invoicesApi.openPdf(id).catch((e: unknown) => toast({ title: 'No se pudo abrir el PDF', description: (e as { message?: string })?.message, variant: 'destructive' })); setEmitInv(null); finishAndClose(); }}
        />
      </Suspense>
    );
  }

  // Paso 2b: documento fiscal (Factura o Presupuesto) — reemplaza por completo el modal de conversión.
  if ((docPhase === 'factura' || docPhase === 'proforma') && created) {
    return (
      <Suspense fallback={null}>
        <FiscalDataDialog
          projectId={projectId}
          leadId={lead?.id ?? created.lead_id ?? 0}
          conversionId={created.id}
          docTipo={docPhase}
          // El numero que se eligio en el paso anterior. Solo sale cuando la
          // empresa numera al convertir; si no, va sin numero y lo pone el
          // contador al emitir desde la cola.
          numero={numeraAqui && numero ? Number(numero) : null}
          defaultItems={buildDocItems(created)}
          defaultNotas={created.notas_pago || undefined}
          defaultIvaExento={created.iva_exento}
          defaultIvaPct={created.iva_pct != null ? Number(created.iva_pct) : undefined}
          defaultIvaIncluido={created.iva_incluido}
          onClose={finishAndClose}
          onCreated={(id) => { invoicesApi.openPdf(id).catch((e: unknown) => toast({ title: 'No se pudo abrir el PDF', description: (e as { message?: string })?.message, variant: 'destructive' })); finishAndClose(); }}
        />
      </Suspense>
    );
  }

  const update = <K extends keyof ConversionForm>(k: K, v: ConversionForm[K]): void =>
    setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!lead?.id) {
      toast({ title: 'Lead inválido', description: 'No se pudo identificar el lead asociado.', variant: 'destructive' });
      return;
    }
    const importe = calc.total;  // total final con descuento + IVA
    // Pago según el modo elegido (evita el bug de "Pagó el total" con valor viejo).
    const pagado = pagoMode === 'total' ? calc.total : pagoMode === 'parcial' ? Number(form.importe_pagado || 0) : 0;
    const prodOk = useMultiItem ? items.some(it => it.descripcion?.trim()) : form.producto_contratado?.trim();
    if (!prodOk) {
      toast({ title: 'Producto requerido', variant: 'destructive' });
      return;
    }
    if (isNaN(importe) || importe <= 0) {
      toast({ title: 'Importe invalido', description: 'El total debe ser mayor que 0', variant: 'destructive' });
      return;
    }
    if (pagado > importe) {
      toast({ title: 'Importe pagado invalido', description: 'No puede superar el total', variant: 'destructive' });
      return;
    }
    // Validar cuotas si es fraccionado
    if (form.metodo_pago === 'fraccionado') {
      if (installments.length < 1) {
        toast({ title: 'Al menos 1 cuota requerida', variant: 'destructive' });
        return;
      }
      const sumaCuotas = installments.reduce((s, c) => s + Number(c.importe_previsto || 0), 0);
      // Las cuotas deben cubrir el PENDIENTE (total − pago inicial), no el total.
      const objetivo = Number((importe - pagado).toFixed(2));
      const diff = Math.abs(sumaCuotas - objetivo);
      if (diff > 0.05) {
        toast({ title: 'La suma de cuotas no coincide con el pendiente', description: `Cuotas: ${sumaCuotas.toFixed(2)} € — Pendiente a fraccionar: ${objetivo.toFixed(2)} € (total ${importe.toFixed(2)} − ${pagado.toFixed(2)} pagado hoy)`, variant: 'destructive' });
        return;
      }
      if (installments.some(c => !c.fecha_vencimiento || Number(c.importe_previsto) <= 0)) {
        toast({ title: 'Revisa importe y fecha de cada cuota', variant: 'destructive' });
        return;
      }
    }
    setSaving(true);
    try {
      const res = await conversionsApi.create({
        lead_id: lead.id,
        project_id: projectId,
        producto_contratado: useMultiItem
          ? items.map(it => `${it.cantidad}x ${it.descripcion}`).join(' + ')
          : form.producto_contratado,
        // FK al programa del catálogo (bug: antes solo se guardaba el nombre en
        // texto y el vínculo quedaba NULL → el reporting no cruzaba la venta).
        producto_contratado_id: useMultiItem ? null : (selectedProduct?.id ?? null),
        importe_total: calc.total,
        importe_pagado: pagado,
        metodo_pago: form.metodo_pago,
        // método real del pago inicial (para la factura de ese pago)
        metodo_pago_inicial: form.metodo_pago === 'fraccionado' ? metodoInicial : form.metodo_pago,
        fecha_compromiso_pago: form.fecha_compromiso_pago || null,
        fecha_conversion: form.fecha_conversion,
        notas_pago: form.notas_pago || null,
        items: useMultiItem ? items.map(it => ({
          product_id: it.product_id,
          descripcion: it.descripcion,
          cantidad: it.cantidad,
          precio_unitario: Number(it.precio_unitario || 0),
        })) : undefined,
        iva_pct: form.iva_exento ? 0 : Number(form.iva_pct || 21),
        iva_incluido: form.iva_incluido && !form.iva_exento,
        iva_exento: form.iva_exento,
        descuento_tipo: form.descuento_tipo,
        descuento_valor: form.descuento_tipo === 'none' ? 0 : Number(form.descuento_valor || 0),
        subtotal_bruto: calc.bruto,
      } as any);
      if (res.success && res.data) {
        // Si es fraccionado, genera las cuotas custom
        if (form.metodo_pago === 'fraccionado' && installments.length >= 1) {
          try {
            await conversionsApi.generateInstallments(res.data.id, {
              installments: installments.map(c => ({
                importe_previsto: Number(c.importe_previsto),
                fecha_vencimiento: c.fecha_vencimiento,
              })),
            });
          } catch (instErr: any) {
            toast({ title: 'Conversión creada, pero falló generar cuotas', description: instErr?.data?.error || instErr?.message, variant: 'destructive' });
          }
        }
        toast({ title: 'Conversion registrada', description: `${form.producto_contratado} - ${form.importe_total}EUR` });
        /*
          EL PASO DEL DOCUMENTO SALE SIEMPRE.

          Estaba detras de `VITE_FACTURACION_V2`, que solo se enciende en
          staging. O sea que en PRODUCCION esta ventana no se ha visto nunca:
          se registraba la venta y se cerraba, con un aviso que se va solo.

          Eso dejaba invisibles en produccion dos cosas que si se pidieron para
          alli: el aviso grande de que la factura NO se emite sola y va a la
          cola (Diego, 14/09: «le di a convertir y no me salio en grande»), y el
          numero de factura al convertir (15/09). Diego, probando en produccion
          con «Sin pago»: «no me salio nada, solo lo de abajo».

          El interruptor se queda para lo otro que gatea --el borrador de
          `InvoiceButton`--, que eso si sigue siendo distinto entre entornos.
        */
        toast({
          title: '✓ Conversión creada',
          description: pagoMode !== 'none'
            ? 'El cobro está en la cola de facturación. Entra en Facturación para emitir la factura y ponerle número.'
            : 'Sin cobro registrado, así que no hay nada que facturar todavía.',
        });
        setCreated(res.data);
        setDocPhase('choose');
      }
    } catch (err: any) {
      toast({
        title: 'Error al registrar conversion',
        description: err?.data?.error || err?.message || 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }


  return (
    <Portal>
      <div role="dialog" className="fixed inset-0 !m-0 z-[70] flex items-center justify-center sm:p-4">
        <div className="fixed inset-0 !m-0 bg-black/50 backdrop-blur-sm" onClick={finishAndClose} />
        <div className="relative bg-card rounded-lg border border-border w-full max-w-lg mx-4 p-6 overflow-y-auto max-h-[90vh]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">{docPhase === 'choose' ? 'Documento de la venta' : 'Registrar Conversion'}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Lead: {lead?.nombre}</p>
            </div>
            <button onClick={finishAndClose} className="p-1.5 rounded-lg hover:bg-muted">
              <X size={18} weight="bold" />
            </button>
          </div>

          {docPhase === 'choose' && created ? (
            <div className="py-4 text-center space-y-5">
              <div className="mx-auto w-12 h-12 rounded-full bg-success-soft flex items-center justify-center">
                <CheckCircle size={28} weight="fill" className="text-success" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Venta registrada</h3>
                {/* EL AVISO DE LA COLA, AQUI Y EN GRANDE.

                    Iba en un toast que se va solo y Diego no lo vio: «le di a
                    convertir y no me salio en grande». Con el freno del 14/09 la
                    factura ya NO sale sola, asi que si esto no se lee, la gestora
                    se queda esperando una factura que nadie va a emitir.

                    No sale para quien numera aqui mismo --CEDIA e ICTESS--:
                    esos no dependen de la cola, le ponen el numero y emiten. */}
                {pagoMode !== 'none' && !numeraAqui && (
                  <div className="mt-3 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-left">
                    <p className="text-sm font-semibold text-warning-soft-foreground">
                      La factura no se emite sola
                    </p>
                    <p className="mt-0.5 text-[13px] leading-snug text-warning-soft-foreground">
                      El cobro está en la <b>cola de facturación</b>. Para emitir la factura y
                      {' '}ponerle número, entra en <b>Finanzas → Facturación</b>.
                    </p>
                  </div>
                )}
                <p className="text-sm text-muted-foreground mt-3">
                  {numeraAqui
                    ? '¿Le pones ya el número de factura, o la dejas en la cola de facturación?'
                    : '¿Generar un documento para el cliente y descargar el PDF?'}
                </p>
              </div>

              {/* El numero, aqui mismo, para quien lo lleva asi. El resto ve el
                  aviso de la cola y nada mas: ese es el freno del 14/09. */}
              {numeraAqui ? (
                <div className="text-left rounded-lg border border-border bg-muted/30 p-3">
                  <label className="mb-1.5 block px-1 text-secundario">
                    <span className="font-medium">Número de {queSeEmite}</span>
                    <input type="number" min="1" value={numero}
                      onChange={(e) => setNumero(e.target.value)}
                      className="mt-1 w-full h-9 px-3 rounded-md border border-border bg-background text-sm tabular-nums" />
                  </label>
                  {sugerido && (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      El siguiente libre es el <b>{sugerido}</b>. Puedes poner ese u otro.
                    </p>
                  )}
                  <p className="text-[11px] text-warning-soft-foreground mt-1.5">
                    ⚠ Comprueba la numeración en el Excel de facturación primero. Si hay discrepancia,
                    contacta con soporte; y si hace falta, genera la factura manualmente y avisa.
                  </p>
                </div>
              ) : null}

              {/* EL TIPO LO DECIDE COMO SE REGISTRO LA VENTA, no quien pulsa.

                  Diego, 15/09: «que al dar conversion aparezca el cuadro de
                  dialogo, si es proforma o factura SEGUN COMO FUE REGISTRADO».

                  La regla es la misma que usa el boton de Facturacion: sin ningun
                  cobro no hay factura fiscal que emitir --se emite PROFORMA, que
                  reserva el numero y se convierte en factura cuando entre el
                  pago--; con cobro, factura. Antes salian los dos botones iguales
                  y elegir mal era facil. */}
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-left">
                <p className="text-xs text-muted-foreground">
                  {sinPagoVenta
                    ? <>Esta venta se registró <b>sin ningún cobro</b>, así que lo que toca es una <b>proforma</b>: reserva el número y se convierte en factura cuando entre el pago.</>
                    : pagoCompleto
                      ? <>Esta venta se registró <b>pagada entera</b> ({totalVenta.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €), así que lo que toca es la <b>factura del pago completo</b>.</>
                      : <>Esta venta se registró con un <b>pago parcial</b> de {pagadoVenta.toLocaleString('es-ES', { minimumFractionDigits: 2 })} € de {totalVenta.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €, así que este número es el de <b>la factura del pago 1</b>{nCuotas > 0 ? ` de ${nCuotas + 1}` : ''}. Cada cuota llevará la suya cuando se cobre.</>}
                </p>
                <button type="button"
                  onClick={() => (sinPagoVenta ? setDocPhase('proforma') : handleFacturaChoice())}
                  className="mt-2.5 w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 inline-flex items-center justify-center gap-2">
                  {sinPagoVenta ? <FileText size={16} weight="duotone" /> : <Receipt size={16} weight="duotone" />}
                  {sinPagoVenta ? 'Emitir proforma' : 'Emitir factura'}
                  {numeraAqui && numero ? ` nº ${numero}` : ''}
                </button>
              </div>

              {/* En columna y con hueco: son dos botones en linea y sin esto
                  salian pegados, leyendose como una sola frase. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* El otro tipo sigue estando: hay casos sueltos y no es cuestion
                    de tapiarlos. Con borde y fondo, que como texto subrayado no
                    se leian como botones. */}
                <button type="button"
                  onClick={() => (sinPagoVenta ? handleFacturaChoice() : setDocPhase('proforma'))}
                  className="h-10 px-3 rounded-md border border-border bg-card text-xs font-semibold
                             hover:border-primary hover:bg-muted/50 transition-colors">
                  {sinPagoVenta ? 'Emitir factura igualmente' : 'Prefiero un presupuesto'}
                </button>
                <button type="button" onClick={finishAndClose}
                  className="h-10 px-3 rounded-md border border-border bg-card text-xs font-semibold
                             hover:border-primary hover:bg-muted/50 transition-colors">
                  {numeraAqui ? 'Ahora no: dejar en la cola' : 'Cerrar'}
                </button>
              </div>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* MODO 1: Producto único (legacy) */}
            {!useMultiItem && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Producto contratado *</label>
                  <button type="button"
                    onClick={() => setItems([{ product_id: null, descripcion: form.producto_contratado || '', cantidad: 1, precio_unitario: form.importe_total || '0' }])}
                    className="text-[10px] text-primary hover:underline">
                    + Añadir más productos
                  </button>
                </div>
                {products.length > 0 ? (
                  <Select<string>
                    value={form.producto_contratado}
                    onChange={(v) => update('producto_contratado', v)}
                    options={[
                      { value: '', label: 'Seleccionar o escribir abajo' },
                      ...products.map(p => ({ value: p.nombre, label: p.nombre })),
                    ]}
                    ariaLabel="Producto contratado"
                  />
                ) : null}
                <input
                  list={products.length > 0 ? 'conversion-products-list' : undefined}
                  value={form.producto_contratado}
                  onChange={e => update('producto_contratado', e.target.value)}
                  placeholder={products.length > 0 ? 'Escribe o selecciona del listado' : 'Nombre del producto/curso'}
                  className={inputClass}
                  required={!useMultiItem}
                  autoComplete="off"
                />
                {products.length > 0 && (
                  <datalist id="conversion-products-list">
                    {products.map(p => <option key={p.id} value={p.nombre} />)}
                  </datalist>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">
                  Puedes elegir uno del catálogo o escribir un nombre nuevo.
                </p>
              </div>
            )}

            {/* MODO 2: Multi-item */}
            {useMultiItem && (
              <div className="border border-border rounded-md p-3 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between">
                  <p className="mb-1.5 px-1 text-tabla uppercase text-muted-foreground">Productos contratados ({items.length})</p>
                  <button type="button"
                    onClick={() => { setItems([]); }}
                    className="text-[10px] text-muted-foreground hover:text-foreground">Volver a producto único</button>
                </div>
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input list="conversion-products-list-multi" value={it.descripcion}
                      onChange={e => {
                        const v = e.target.value;
                        const matched = products.find((p: any) => p.nombre === v);
                        setItems(items.map((x, i) => i === idx ? { ...x, descripcion: v, product_id: matched?.id || null, precio_unitario: matched?.precio ? String(matched.precio) : x.precio_unitario } : x));
                      }}
                      placeholder="Descripción / nombre del curso"
                      className="col-span-6 h-9 px-2 rounded border border-border bg-background text-sm" />
                    <input type="number" min="1" value={it.cantidad}
                      onChange={e => setItems(items.map((x, i) => i === idx ? { ...x, cantidad: Number(e.target.value || 1) } : x))}
                      title="Cantidad" placeholder="Cant"
                      className="col-span-2 h-9 px-2 rounded border border-border bg-background text-sm" />
                    <input type="number" step="0.01" min="0" value={it.precio_unitario}
                      onChange={e => setItems(items.map((x, i) => i === idx ? { ...x, precio_unitario: e.target.value } : x))}
                      title="Precio unitario" placeholder="€/u"
                      className="col-span-3 h-9 px-2 rounded border border-border bg-background text-sm" />
                    <button type="button" onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      className="col-span-1 text-muted-foreground hover:text-destructive text-base">×</button>
                  </div>
                ))}
                <datalist id="conversion-products-list-multi">
                  {products.map((p: any) => <option key={p.id} value={p.nombre} />)}
                </datalist>
                <button type="button"
                  onClick={() => setItems([...items, { product_id: null, descripcion: '', cantidad: 1, precio_unitario: '0' }])}
                  className="text-xs text-primary hover:underline">+ añadir otro producto</button>
                <div className="text-[10px] text-muted-foreground italic">
                  Subtotal: {items.reduce((s, it) => s + Number(it.cantidad || 1) * Number(it.precio_unitario || 0), 0).toFixed(2)} €
                </div>
              </div>
            )}

            {/* DESCUENTO */}
            <div className="border border-border rounded-md p-3 space-y-2 bg-muted/10">
              <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Descuento</label>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <select value={form.descuento_tipo} onChange={e => update('descuento_tipo', e.target.value as any)}
                  className="h-7 px-2 rounded border border-border bg-background text-sm">
                  <option value="none">Sin descuento</option>
                  <option value="pct">Porcentaje (%)</option>
                  <option value="monto">Monto fijo (€)</option>
                </select>
                {form.descuento_tipo !== 'none' && (
                  <div className="inline-flex items-center gap-1">
                    <input type="number" min="0" step="0.01" value={form.descuento_valor}
                      onChange={e => update('descuento_valor', e.target.value)}
                      placeholder={form.descuento_tipo === 'pct' ? '10' : '50'}
                      className="w-20 h-7 px-2 rounded border border-border bg-background text-sm" />
                    <span>{form.descuento_tipo === 'pct' ? '%' : '€'}</span>
                    {calc.desc > 0 && <span className="text-success font-semibold ml-1">−{calc.desc.toFixed(2)} €</span>}
                  </div>
                )}
              </div>
            </div>

            {/* IVA */}
            <div className="border border-border rounded-md p-3 space-y-2 bg-muted/10">
              <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">IVA</label>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={form.iva_exento} onChange={e => update('iva_exento', e.target.checked as any)} />
                  Exento (sin IVA)
                </label>
                {!form.iva_exento && (
                  <>
                    <div className="inline-flex items-center gap-1">
                      <span>%:</span>
                      <input type="number" min="0" max="100" step="0.01" value={form.iva_pct}
                        onChange={e => update('iva_pct', e.target.value)}
                        className="w-16 h-7 px-2 rounded border border-border bg-background text-sm" />
                    </div>
                    <label className="inline-flex items-center gap-1.5">
                      <input type="checkbox" checked={form.iva_incluido} onChange={e => update('iva_incluido', e.target.checked as any)} />
                      Precio ya incluye IVA (desglosar)
                    </label>
                  </>
                )}
              </div>
              {form.iva_exento && <p className="text-[10px] text-muted-foreground italic">Operación exenta — art. 20 LIVA (servicios educativos)</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">
                  {useMultiItem ? 'Subtotal items (auto)' : 'Precio base (EUR) *'}
                </label>
                <input
                  type="number" step="0.01" min="0"
                  value={useMultiItem ? calc.bruto.toFixed(2) : form.importe_total}
                  onChange={e => update('importe_total', e.target.value)}
                  readOnly={useMultiItem}
                  className={inputClass + (useMultiItem ? ' bg-muted text-muted-foreground cursor-not-allowed' : '')}
                  required={!useMultiItem}
                />
              </div>
              <div>
                <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Pago recibido hoy</label>
                <div className="flex rounded-lg border border-border overflow-hidden text-xs font-semibold">
                  <button type="button" onClick={() => setPagoMode('none')}
                    className={`flex-1 h-9 ${pagoMode === 'none' ? 'bg-muted text-foreground' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}>Sin pago</button>
                  <button type="button" onClick={() => {
                      setPagoMode('parcial');
                      // Pago parcial ⇒ el resto se cobra a plazos: método = fraccionado
                      // (muestra el plan de cuotas). El método real de cada abono se
                      // indica al registrar cada cuota.
                      update('metodo_pago', 'fraccionado');
                    }}
                    className={`flex-1 h-9 border-x border-border ${pagoMode === 'parcial' ? 'bg-warning-soft text-warning-soft-foreground' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}>Parcial</button>
                  <button type="button" onClick={() => {
                      setPagoMode('total');
                      // Venia de «Parcial», que deja el metodo en fraccionado y un
                      // plan montado. Si no se limpia aqui, se registra una venta
                      // pagada entera CON plan de cuotas, que es imposible.
                      if (form.metodo_pago === 'fraccionado') {
                        update('metodo_pago', metodoInicial);
                        setInstallments([]);
                        setInstallmentsDirty(false);
                      }
                    }}
                    className={`flex-1 h-9 ${pagoMode === 'total' ? 'bg-success-soft text-success-soft-foreground' : 'bg-card text-muted-foreground hover:bg-muted/50'}`}>Pagó TODO</button>
                </div>
                {pagoMode === 'parcial' && (
                  <input type="number" step="0.01" min="0" value={form.importe_pagado} onChange={e => update('importe_pagado', e.target.value)}
                    placeholder="¿Cuánto pagó?" className={inputClass + ' mt-1.5'} autoFocus />
                )}
                {pagoMode === 'total' && (
                  <p className="text-[10px] text-success-soft-foreground mt-1 font-medium">Se registrará el pago completo: {calc.total.toFixed(2)} €</p>
                )}
                {/* Con plan fraccionado, el pago inicial necesita su método real
                    (la factura de ese pago lo usará; 'fraccionado' es el plan). */}
                {pagoMode !== 'none' && form.metodo_pago === 'fraccionado' && (
                  <div className="mt-1.5">
                    <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Método del pago inicial</label>
                    <select value={metodoInicial} onChange={(e) => setMetodoInicial(e.target.value as MetodoPago)}
                      className={inputClass}>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="tarjeta_stripe">Tarjeta (Stripe)</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="bizum">Bizum</option>
                      <option value="paypal">PayPal</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* DESGLOSE */}
            <div className="border border-primary/30 rounded-md p-3 bg-primary/5 space-y-1 text-sm">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Subtotal</span><span className="tabular-nums">{calc.bruto.toFixed(2)} €</span>
              </div>
              {calc.desc > 0 && (
                <div className="flex justify-between text-xs text-success">
                  <span>Descuento {form.descuento_tipo === 'pct' ? `(${form.descuento_valor}%)` : ''}</span>
                  <span className="tabular-nums">−{calc.desc.toFixed(2)} €</span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Base imponible</span><span className="tabular-nums">{calc.base.toFixed(2)} €</span>
              </div>
              {!form.iva_exento && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>IVA ({form.iva_pct}%){form.iva_incluido ? ' incl.' : ''}</span><span className="tabular-nums">{calc.iva.toFixed(2)} €</span>
                </div>
              )}
              {form.iva_exento && <div className="text-[10px] text-muted-foreground italic">Operación exenta de IVA</div>}
              <div className="flex justify-between font-bold text-base border-t border-border pt-1 mt-1">
                <span>TOTAL</span><span className="tabular-nums text-primary">{calc.total.toFixed(2)} €</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Metodo de pago</label>
                <Select<MetodoPago>
                  value={form.metodo_pago}
                  onChange={(v) => update('metodo_pago', v)}
                  // Si pagó TODO no queda nada que fraccionar, asi que el metodo
                  // «Fraccionado» ni se ofrece. Diego, 15/09: «si le doy a pago
                  // todo no tiene sentido que me deje poner fraccionado».
                  options={METODOS
                    .filter(m => !(pagoMode === 'total' && m.value === 'fraccionado'))
                    .map(m => ({ value: m.value, label: m.label }))}
                  ariaLabel="Método de pago"
                />
              </div>
              <div>
                {/* Diego, 14/09: «en conversion la fecha de conversion seria fecha de
                    pago». Es la fecha en la que entro el dinero, que es la que
                    usan los informes y la que decide de que mes es la venta. */}
                <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Fecha de pago</label>
                <input type="date" value={form.fecha_conversion} onChange={e => update('fecha_conversion', e.target.value)} className={inputClass} />
              </div>
            </div>

            {form.metodo_pago === 'fraccionado' && (
              <div className="space-y-3 p-3 rounded-lg bg-warning-soft border border-warning/30">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-xs font-bold text-warning-soft-foreground uppercase tracking-wider">
                    Plan de cuotas
                  </div>
                  {installmentsDirty && (
                    <button
                      type="button"
                      onClick={() => { setInstallmentsDirty(false); }}
                      className="text-[10px] text-warning-soft-foreground underline"
                    >
                      Recalcular automáticamente
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Número de cuotas</label>
                    <input
                      type="number" min="1" max="60"
                      value={numCuotas}
                      onChange={e => { setNumCuotas(Math.max(1, Number(e.target.value) || 1)); setInstallmentsDirty(false); }}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Fecha primera cuota</label>
                    <input
                      type="date"
                      value={fechaPrimeraCuota}
                      onChange={e => { setFechaPrimeraCuota(e.target.value); setInstallmentsDirty(false); }}
                      className={inputClass}
                    />
                  </div>
                </div>

                {installments.length > 0 && (
                  <div className="space-y-1">
                    <div className="grid grid-cols-[40px_1fr_140px] gap-2 text-[10px] font-bold uppercase text-muted-foreground px-1">
                      <span>#</span>
                      <span>Importe (EUR)</span>
                      <span>Vencimiento</span>
                    </div>
                    {installments.map((c, i) => (
                      <div key={i} className="grid grid-cols-[40px_1fr_140px] gap-2 items-center">
                        <span className="text-xs font-mono text-muted-foreground">{i + 1}</span>
                        <input
                          type="number" step="0.01" min="0.01"
                          value={c.importe_previsto}
                          onChange={e => {
                            const next = [...installments];
                            next[i] = { ...next[i], importe_previsto: e.target.value };
                            setInstallments(next);
                            setInstallmentsDirty(true);
                          }}
                          className={inputClass}
                        />
                        <input
                          type="date"
                          value={c.fecha_vencimiento}
                          onChange={e => {
                            const next = [...installments];
                            next[i] = { ...next[i], fecha_vencimiento: e.target.value };
                            setInstallments(next);
                            setInstallmentsDirty(true);
                          }}
                          className={inputClass}
                        />
                      </div>
                    ))}
                    {(() => {
                      const suma = installments.reduce((s, c) => s + Number(c.importe_previsto || 0), 0);
                      const diff = Math.round((pendienteFrac - suma) * 100) / 100;
                      const ok = Math.abs(diff) <= 0.05;
                      return (
                        <div className={`text-[11px] font-medium pt-1 ${ok ? 'text-success-soft-foreground' : 'text-destructive'}`}>
                          Suma cuotas: {suma.toFixed(2)} € — Pendiente a fraccionar: {pendienteFrac.toFixed(2)} €
                          {pagadoInicial > 0 && <span className="text-muted-foreground"> (total {calc.total.toFixed(2)} € − {pagadoInicial.toFixed(2)} € pagado hoy)</span>}
                          {!ok && ` — Diferencia: ${diff.toFixed(2)} €`}
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div>
                  <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Fecha compromiso de pago pendiente (opcional)</label>
                  <input type="date" value={form.fecha_compromiso_pago} onChange={e => update('fecha_compromiso_pago', e.target.value)} className={inputClass} />
                </div>
              </div>
            )}

            {/* Selector de enlace de pago Stripe (CRM-140) */}
            {(productLinks.length > 0 || form.producto_contratado) && (
              <div className="p-3 rounded-lg bg-info-soft border border-info/30 space-y-2">
                <div className="flex items-center gap-2 text-[11px] font-bold text-info-soft-foreground">
                  <LinkIcon size={12} weight="bold" /> Enlace de pago para compartir
                </div>
                <Select<string>
                  value={selectedLinkIdx}
                  onChange={setSelectedLinkIdx}
                  options={[
                    { value: '-1', label: 'Sin enlace' },
                    ...productLinks.map((l, i) => ({
                      value: String(i),
                      label: l.tipo !== 'completo' ? `${l.label} (${l.tipo})` : l.label,
                    })),
                    { value: 'custom', label: 'Personalizado…' },
                  ]}
                  ariaLabel="Enlace de pago"
                />
                {selectedLinkIdx === 'custom' && (
                  <input
                    type="url"
                    value={customLink}
                    onChange={(e) => setCustomLink(e.target.value)}
                    placeholder="https://buy.stripe.com/..."
                    className={inputClass + ' font-mono text-xs'}
                  />
                )}
                {activeLink && (
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate text-[11px] font-mono text-info-soft-foreground bg-white/60 dark:bg-black/20 px-2 py-1.5 rounded">
                      {activeLink}
                    </code>
                    <button
                      type="button"
                      onClick={copyActiveLink}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-info text-info-foreground text-xs font-semibold hover:bg-info/90 flex-shrink-0"
                    >
                      {linkCopied ? <CheckCircle size={12} weight="bold" /> : <Copy size={12} weight="bold" />}
                      {linkCopied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                )}
                {productLinks.length === 0 && form.producto_contratado && (
                  <p className="text-[10px] text-info-soft-foreground/70 italic">
                    Este producto no tiene enlaces configurados. Añádelos editando el producto.
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Notas</label>
              <textarea value={form.notas_pago} onChange={e => update('notas_pago', e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-border bg-muted/50 text-sm outline-none resize-none focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder="Notas sobre el acuerdo..." />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-border bg-card text-sm font-semibold hover:bg-muted">Cancelar</button>
              <button type="submit" disabled={saving} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                {saving ? 'Guardando...' : 'Registrar conversion'}
              </button>
            </div>
          </form>
          )}
        </div>
      </div>
    </Portal>
  );
}
