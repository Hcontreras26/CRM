import { useEffect, useState } from 'react';
import { Receipt, X, MagnifyingGlass, UserCheck, UserPlus, UserMinus } from '@phosphor-icons/react';
import usePermission from '@/shared/hooks/usePermission';
import { lazy, Suspense, useRef } from 'react';
import { invoicesApi } from '@/modules/invoices/api/invoices.api';
const FiscalDataDialog = lazy(() => import('@/modules/invoices/components/FiscalDataDialog'));
import { useProyectosDelAmbito } from '@/shared/hooks/useAmbito';
import client from '@/shared/api/client';
import { toast } from '@/shared/hooks/useToast';
import Portal from '@/shared/components/ui/portal';

import FilaCampos from '@/shared/components/ui/FilaCampos';

interface Product { id: number; nombre: string; precio?: number | string; moneda?: string }
interface Project { id: number; nombre?: string }
interface LeadLite {
  id: number; nombre?: string; email?: string; telefono?: string; status?: string;
  /** Quien lleva el prospecto: es de quien sera la venta en «de otra gestora». */
  responsable_id?: number | null; responsable_nombre?: string | null;
}
interface Props {
  open: boolean;
  onClose: () => void;
  project: Project | null;
  onSaved?: (result: { sale_id: number; lead_id: number; retroactiva: boolean }) => void;
  /**
   * Con que modo se abre.
   *
   * Lo elige el desplegable del boton «Nueva venta» (Diego, 25/09): venta
   * propia, de otra gestora, o automatica sin gestora. Quien no lo pasa abre
   * como siempre, que es lo que hacen Clientes e Ingresos.
   */
  modoInicial?: Mode;
}

const PAYMENT_METHODS = [
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'fraccionado', label: 'Fraccionado' },
];

/**
 * De quien es la venta que se esta registrando.
 *
 * `sin_gestora` es de Diego (25/09): una venta que se crea de cero y **no es de
 * nadie**. Hoy, quien la registra se la queda --si es gestor-- o el round-robin
 * se la encaja a la gestora que toque --si es admin--, y en los dos casos el
 * informe acaba diciendo que vendio quien solo la apunto. Lo piden las
 * contables de CEDIA e ICTESS, que registran ventas que no cerraron ellas.
 */
type Mode = 'existing' | 'new' | 'sin_gestora' | 'otra_gestora';

/** Para comparar lo que se escribe con lo que hay: sin tildes y en minusculas. */
function sinTildes(s: string) {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export default function RegisterSaleDialog({ open, onClose, project, onSaved, modoInicial }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const { can } = usePermission();
  // Quien puede registrar una venta que no es de nadie. De serie admin y
  // superadmin; a las contables de CEDIA e ICTESS se les da por persona desde
  // el panel de permisos, que es lo que permite quitarlas o anadir a otra sin
  // un despliegue de por medio.
  const puedeSinGestora = can('conversions.sin_gestora');
  // EL CAMPUS, CUANDO SE ENTRA CON UNA EMPRESA PUESTA.
  //
  // Diego, 25/09: «como voy a registrar una venta de una empresa y me sale
  // esto, no puede pasar». Con CEDIA elegida `activeProject.id` es -1, y antes
  // el boton salia apagado con un «selecciona un proyecto concreto»: te
  // mandaba a cambiar el selector de la barra lateral y volver.
  //
  // Una venta ES de un campus --la matricula, la factura y la serie son suyas--
  // asi que hay que saber cual. Pero eso se pregunta AQUI, en una linea, no
  // cerrando la puerta.
  const campusDelAmbito = useProyectosDelAmbito<{ id: number; nombre: string }>();
  const [campus, setCampus] = useState<number | null>(null);
  const pid = project?.id && project.id !== -1 ? project.id : campus;
  const hayQueElegirCampus = !(project?.id && project.id !== -1);

  // EL NUMERO DE FACTURA, AQUI MISMO.
  //
  // Diego, 25/09: «falta anadir que se puedan poner el numero de factura como
  // en los demas». «Los demas» es el dialogo de convertir un prospecto, que
  // desde el 15/09 pregunta el numero y emite. Registrar la venta desde
  // Finanzas te dejaba sin esa opcion: la venta caia en la cola y habia que ir
  // a Facturacion a buscarla.
  //
  // Se reusa la MISMA cadena --el siguiente numero del servidor y
  // FiscalDataDialog para emitir-- y no se escribe otra numeracion. Una segunda
  // via de numerar es una segunda via de dejar huecos en la serie.
  const [numeraAqui, setNumeraAqui] = useState(false);
  const numeraAquiRef = useRef(false);
  const [numero, setNumero] = useState('');
  const [sugerido, setSugerido] = useState('');
  // La venta recien creada, mientras se decide si se le pone documento.
  const [creada, setCreada] = useState<{ sale_id: number; lead_id: number } | null>(null);
  const [emitir, setEmitir] = useState<'factura' | 'proforma' | null>(null);

  const [mode, setMode] = useState<Mode>(modoInicial || 'existing');

  // Cliente nuevo
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');

  // Cliente existente (búsqueda)
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<LeadLite[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedClient, setSelectedClient] = useState<LeadLite | null>(null);

  // Documento fiscal para factura (NIF/CIF/NIE/cédula/RFC) — opcional
  const [identificacionFiscal, setIdentificacionFiscal] = useState('');
  const [direccionFiscal, setDireccionFiscal] = useState('');

  // Venta
  const [productoId, setProductoId] = useState<number | ''>('');
  const [productSearch, setProductSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [importeTotal, setImporteTotal] = useState<string>('');
  const [importePagado, setImportePagado] = useState<string>('');
  const [metodo, setMetodo] = useState('transferencia');
  const [fecha, setFecha] = useState(today);
  const [notas, setNotas] = useState('');

  // Pagos fraccionados (cuotas). Se activan al seleccionar metodo='fraccionado'.
  // Por defecto generamos N cuotas mensuales desde la fecha de pago, distribuyendo
  // el total a partes iguales (la última absorbe la diferencia para que sumen
  // exactamente el importe_total — contablemente correcto).
  const [numCuotas, setNumCuotas] = useState(3);
  const [fechaPrimeraCuota, setFechaPrimeraCuota] = useState(today);
  const [installments, setInstallments] = useState<Array<{ importe_previsto: string; fecha_vencimiento: string }>>([]);
  const [installmentsDirty, setInstallmentsDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(modoInicial || 'existing');
    setNombre(''); setEmail(''); setTelefono('');
    setClientSearch(''); setClientResults([]); setSelectedClient(null);
    setIdentificacionFiscal('');
    setDireccionFiscal('');
    setProductoId(''); setProductSearch('');
    setImporteTotal(''); setImportePagado(''); setMetodo('transferencia');
    setFecha(today); setNotas('');
  }, [open, today]);

  // Si esta empresa numera al registrar, y cual seria el siguiente libre. Se
  // pregunta con el campus ya sabido: sin campus no hay serie.
  useEffect(() => {
    if (!open || !pid) { setNumeraAqui(false); return; }
    let vivo = true;
    invoicesApi.getConfig(pid)
      .then((r: any) => {
        if (!vivo) return;
        const numera = Boolean(r?.success && r.data?.numera_al_convertir);
        setNumeraAqui(numera);
        numeraAquiRef.current = numera;
        // Solo se rellena solo a quien numera al registrar. A los demas se les
        // deja vacio: vacio = a la cola, que es como funcionan hoy.
        if (numera) {
          setNumero((n) => n || '');
        }
      })
      .catch(() => { if (vivo) setNumeraAqui(false); });
    client.get<{ siguiente: number }>('/invoices/siguiente-numero?projectId=' + pid)
      .then((r: any) => {
        if (!vivo || !r?.success) return;
        setSugerido(String(r.data.siguiente));
        // Con numeracion al registrar se deja puesto el siguiente libre; si no,
        // solo se ensena como pista.
        setNumero((n) => (n ? n : (numeraAquiRef.current ? String(r.data.siguiente) : '')));
      })
      .catch(() => { /* se escribe a mano */ });
    return () => { vivo = false; };
  }, [open, pid]);

  // SI LA BUSQUEDA DEJA UNA SOLA, SE ELIGE SOLA.
  //
  // Es lo que la gente espera al escribir el nombre entero: Ana escribio
  // «Curso de Escritura Terapéutica y Narrativa», que solo casa con una, y aun
  // asi el desplegable seguia en «— Selecciona —» y la venta no se dejaba
  // registrar.
  useEffect(() => {
    if (!productSearch.trim()) return;
    const hay = products.filter((p) => sinTildes(p.nombre).includes(sinTildes(productSearch)));
    if (hay.length === 1 && productoId !== hay[0].id) setProductoId(hay[0].id);
  }, [productSearch, products]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Productos del proyecto
  useEffect(() => {
    if (!open || !pid) return;
    client.get<Product[]>('/products', { params: { projectId: pid, limit: 500 } })
      .then((r) => setProducts(Array.isArray(r?.data) ? r.data : []))
      .catch(() => setProducts([]));
  }, [open, pid]);

  // Búsqueda debounced de clientes existentes (leads convertidos del proyecto)
  useEffect(() => {
    if ((mode !== 'existing' && mode !== 'otra_gestora') || !open || !pid) return;
    if (clientSearch.trim().length < 2) { setClientResults([]); return; }
    const handle = setTimeout(() => {
      setSearching(true);
      client.get<LeadLite[]>('/leads', {
        params: {
          projectId: pid,
          // En «de otra gestora» se busca entre TODOS: es un prospecto al que
          // se le registra la venta, no un cliente que ya compro.
          ...(mode === 'existing' ? { status: 'convertido' } : {}),
          search: clientSearch.trim(), limit: 20,
        },
      })
        .then((r) => setClientResults(Array.isArray(r?.data) ? r.data : []))
        .catch(() => setClientResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [mode, open, pid, clientSearch]);

  const productoSel = products.find((p) => p.id === productoId);
  useEffect(() => {
    if (productoSel && !importeTotal && productoSel.precio) setImporteTotal(String(productoSel.precio));
  }, [productoSel?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helpers para pagos fraccionados (cuotas)
  function addMonths(isoDate: string, months: number): string {
    const d = new Date(isoDate);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().slice(0, 10);
  }
  function distributeInstallments(total: number, n: number, fechaInicio: string): Array<{ importe_previsto: string; fecha_vencimiento: string }> {
    if (!isFinite(total) || total <= 0 || n < 2) return [];
    const cuotaBase = Math.round((total / n) * 100) / 100;
    const result = [];
    for (let i = 0; i < n; i++) {
      const importe = i === n - 1
        ? Math.round((total - cuotaBase * (n - 1)) * 100) / 100
        : cuotaBase;
      result.push({ importe_previsto: String(importe), fecha_vencimiento: addMonths(fechaInicio, i) });
    }
    return result;
  }
  // Regenerar cuotas cuando cambien total / N / fecha inicio (si el user no las
  // ha editado a mano).
  useEffect(() => {
    if (metodo !== 'fraccionado') return;
    if (installmentsDirty) return;
    const totalNum = parseFloat(importeTotal);
    if (!totalNum || totalNum <= 0 || numCuotas < 2) { setInstallments([]); return; }
    setInstallments(distributeInstallments(totalNum, numCuotas, fechaPrimeraCuota));
  }, [metodo, importeTotal, numCuotas, fechaPrimeraCuota, installmentsDirty]);
  // Si cambia metodo a fraccionado, inicializa la fecha de primera cuota con la fecha del pago.
  useEffect(() => {
    if (metodo === 'fraccionado') {
      setFechaPrimeraCuota(fecha);
      setInstallmentsDirty(false);
    }
  }, [metodo]); // eslint-disable-line react-hooks/exhaustive-deps

  const installmentsSum = installments.reduce((acc, it) => acc + (parseFloat(it.importe_previsto) || 0), 0);
  const installmentsMismatch = metodo === 'fraccionado' && installments.length > 0
    && Math.abs(installmentsSum - parseFloat(importeTotal || '0')) > 0.01;

  if (!open) return null;

  // Sin tildes y sin mayusculas: «terapeutica» tiene que encontrar
  // «Terapéutica». Nadie escribe las tildes en un buscador.
  const productosFiltrados = productSearch.trim()
    ? products.filter((p) => sinTildes(p.nombre).includes(sinTildes(productSearch)))
    : products;
  const isRetroactiva = fecha < today;

  function selectClient(c: LeadLite) {
    setSelectedClient(c);
    setNombre(c.nombre || '');
    setEmail(c.email || '');
    setTelefono(c.telefono || '');
    setClientSearch('');
    setClientResults([]);
  }
  function clearSelectedClient() {
    setSelectedClient(null);
    setNombre(''); setEmail(''); setTelefono('');
  }

  async function handleSave() {
    if (!pid) { toast({ title: 'Elige el campus', description: 'Una venta es de un campus concreto.', variant: 'destructive' }); return; }
    if ((mode === 'existing' || mode === 'otra_gestora') && !selectedClient) {
      toast({ title: 'Selecciona un cliente', description: 'Búscalo por nombre, email o teléfono.', variant: 'destructive' }); return;
    }
    if (mode === 'new') {
      if (!nombre.trim()) { toast({ title: 'Nombre requerido', variant: 'destructive' }); return; }
      if (!email.trim() && !telefono.trim()) {
        toast({ title: 'Email o teléfono requerido', variant: 'destructive' }); return;
      }
    }
    // Sin gestora basta el nombre: esta venta se registra justo cuando no hay
    // nada mas, y pedir un correo inventado es peor que no pedir nada.
    if (mode === 'sin_gestora' && !nombre.trim()) {
      toast({ title: 'Nombre requerido', variant: 'destructive' }); return;
    }
    if (!productoId) { toast({ title: 'Producto requerido', variant: 'destructive' }); return; }
    const totalNum = parseFloat(importeTotal);
    if (!totalNum || totalNum <= 0) { toast({ title: 'Importe inválido', variant: 'destructive' }); return; }
    const pagadoNum = importePagado === '' ? totalNum : parseFloat(importePagado);
    if (pagadoNum < 0 || pagadoNum > totalNum) {
      toast({ title: 'Importe pagado inválido', description: 'Entre 0 y el total', variant: 'destructive' }); return;
    }
    // Validación específica de cuotas
    if (metodo === 'fraccionado') {
      if (installments.length < 2) {
        toast({ title: 'Cuotas requeridas', description: 'Configura al menos 2 cuotas o cambia el método.', variant: 'destructive' });
        return;
      }
      if (installmentsMismatch) {
        toast({ title: 'Las cuotas no suman el total', description: `Suma actual: ${installmentsSum.toFixed(2)} · Total: ${totalNum.toFixed(2)}`, variant: 'destructive' });
        return;
      }
      for (const it of installments) {
        const imp = parseFloat(it.importe_previsto);
        if (!isFinite(imp) || imp <= 0) {
          toast({ title: 'Cuota inválida', description: 'Todas las cuotas necesitan importe > 0', variant: 'destructive' });
          return;
        }
        if (!it.fecha_vencimiento) {
          toast({ title: 'Fecha de cuota faltante', variant: 'destructive' });
          return;
        }
      }
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        project_id: pid,
        producto_interes_id: productoId,
        importe_total: totalNum,
        importe_pagado: pagadoNum,
        metodo_pago: metodo,
        fecha_pago: fecha,
        notas: notas.trim() || null,
      };
      if (metodo === 'fraccionado' && installments.length >= 2) {
        body.installments = installments.map(it => ({
          importe_previsto: parseFloat(it.importe_previsto),
          fecha_vencimiento: it.fecha_vencimiento,
        }));
      }
      if (mode === 'sin_gestora') body.sin_gestora = true;
      // De otra gestora: el prospecto elegido y, fijada en la venta, la
      // persona que lo lleva. Fijarla importa: si manana reasignan el
      // prospecto, la venta tiene que seguir siendo de quien la hizo.
      if (mode === 'otra_gestora' && selectedClient) {
        body.lead_id = selectedClient.id;
        if (selectedClient.responsable_id) body.vendedora_id = selectedClient.responsable_id;
      }
      if (mode === 'existing' && selectedClient) {
        body.lead_id = selectedClient.id;
      } else {
        body.nombre = nombre.trim();
        body.email = email.trim() || null;
        body.telefono = telefono.trim() || null;
      }
      if (identificacionFiscal.trim()) {
        body.identificacion_fiscal = identificacionFiscal.trim();
      }
      if (direccionFiscal.trim()) {
        body.direccion_fiscal = direccionFiscal.trim();
      }
      const res = await client.post<{ sale_id: number; lead_id: number; retroactiva: boolean; duplicado: boolean }>('/ventas', body);
      const data = res.data;
      const desc = mode === 'existing'
        ? `Venta añadida al cliente existente${data.retroactiva ? ' (histórica)' : ''}`
        : (data.retroactiva ? `Venta histórica registrada (${fecha})${data.duplicado ? ' — sobre cliente existente' : ''}` : `Venta registrada${data.duplicado ? ' — sobre cliente existente' : ''}`);
      toast({ title: 'Venta creada', description: desc });
      onSaved?.(data);
      // Con numeracion al registrar, la venta no se cierra todavia: se ofrece
      // ponerle el numero y emitir. Sin ella, como siempre — el cobro se queda
      // en la cola de facturacion, que es el freno del 14/09.
      // Con numero escrito se emite ya, sin preguntar otra vez: el numero se
      // puso arriba a proposito. Vacio = se deja en la cola de facturacion.
      if (numero.trim()) {
        const sinCobro = Number(pagadoNum) <= 0;
        setCreada({ sale_id: data.sale_id, lead_id: data.lead_id });
        setEmitir(sinCobro ? 'proforma' : 'factura');
      } else {
        onClose();
      }
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      toast({ title: 'Error', description: e?.data?.error || e?.message || 'No se pudo registrar', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  // Emitiendo: el mismo dialogo fiscal que usa la conversion, con su numero.
  if (emitir && creada && pid) {
    return (
      <Suspense fallback={null}>
        <FiscalDataDialog
          projectId={pid}
          leadId={creada.lead_id}
          conversionId={creada.sale_id}
          docTipo={emitir}
          numero={numero ? Number(numero) : null}
          defaultItems={[{
            descripcion: products.find((p) => p.id === productoId)?.nombre || 'Servicio',
            cantidad: 1,
            precio_unitario: Number(importeTotal) || 0,
          }]}
          defaultNotas={notas.trim() || undefined}
          onClose={() => { setEmitir(null); setCreada(null); onClose(); }}
          onCreated={(id: number) => {
            invoicesApi.openPdf(id).catch(() => {});
            setEmitir(null); setCreada(null); onClose();
          }}
        />
      </Suspense>
    );
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div role="dialog" aria-modal="true" className="relative bg-card rounded-lg border border-border w-full max-w-lg flex flex-col max-h-[90vh]">
          <div className="px-5 py-4 border-b border-border flex items-start gap-3">
            <div className="w-9 h-9 rounded-md bg-success-soft text-success-soft-foreground flex items-center justify-center flex-shrink-0">
              <Receipt size={18} weight="regular" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-base">Registrar venta</h3>
              <p className="text-xs text-muted-foreground">
                Por la fecha que pongas se considera <strong>histórica</strong> (anterior a hoy) o <strong>del día</strong>.
              </p>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground"><X size={18} /></button>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto">
            {/* DE QUE CAMPUS. Solo sale cuando hace falta: con un campus ya
                elegido en la barra lateral, preguntarlo otra vez sobra. */}
            {hayQueElegirCampus && (
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">
                  Campus de la venta *
                </label>
                <select
                  value={campus ?? ''}
                  onChange={(e) => setCampus(e.target.value ? Number(e.target.value) : null)}
                  className="h-10 w-full rounded-md border border-border bg-card px-2 text-sm"
                >
                  <option value="">Elige el campus…</option>
                  {campusDelAmbito.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  La venta es de un campus: de ahí salen su matrícula y su factura.
                </p>
              </div>
            )}

            {/* Cliente existente o nuevo. Solo en la venta propia: en los
                otros modos ya lo dijo el desplegable del boton. */}
            {(mode === 'existing' || mode === 'new') && (
            <div className="bg-muted/40 p-1 rounded-lg grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => { setMode('existing'); clearSelectedClient(); }}
                className={`h-9 rounded-md text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${mode === 'existing' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <UserCheck size={14} weight="bold" /> Cliente existente
              </button>
              <button
                type="button"
                onClick={() => { setMode('new'); clearSelectedClient(); }}
                className={`h-9 rounded-md text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors ${mode === 'new' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <UserPlus size={14} weight="bold" /> Cliente nuevo
              </button>
            </div>
            )}
            {/* MODO: cliente existente */}
            {mode === 'existing' && (
              <div className="space-y-3">
                {!selectedClient ? (
                  <div>
                    <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Buscar cliente *</label>
                    <div className="relative">
                      <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        autoFocus
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        placeholder="Nombre, email o teléfono…"
                        className="w-full h-10 pl-9 pr-3 rounded-md border border-border bg-card text-sm"
                      />
                    </div>
                    {clientSearch.trim().length > 0 && clientSearch.trim().length < 2 && (
                      <p className="text-[11px] text-muted-foreground mt-1">Escribe al menos 2 caracteres…</p>
                    )}
                    {searching && <p className="text-[11px] text-muted-foreground mt-1">Buscando…</p>}
                    {!searching && clientSearch.trim().length >= 2 && clientResults.length === 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        No se encontraron clientes. ¿Quizás es <button type="button" onClick={() => setMode('new')} className="text-primary font-semibold hover:underline">un cliente nuevo</button>?
                      </p>
                    )}
                    {clientResults.length > 0 && (
                      <div className="mt-1.5 border border-border rounded-md max-h-48 overflow-y-auto">
                        {clientResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => selectClient(c)}
                            className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-0 border-border"
                          >
                            <p className="font-medium truncate">{c.nombre || '— sin nombre —'}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{c.email || '—'} {c.telefono ? `· ${c.telefono}` : ''}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-success-soft border border-success/30 rounded-md p-3 flex items-start gap-3">
                    <UserCheck size={20} weight="duotone" className="text-success flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{selectedClient.nombre || '— sin nombre —'}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{selectedClient.email || '—'} {selectedClient.telefono ? `· ${selectedClient.telefono}` : ''}</p>
                      <p className="text-[11px] text-success-soft-foreground mt-0.5">Cliente seleccionado — se le añadirá una nueva venta.</p>
                    </div>
                    <button type="button" onClick={clearSelectedClient} className="text-[11px] text-muted-foreground hover:text-foreground underline flex-shrink-0">
                      Cambiar
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* MODO: venta de otra gestora. Diego, 25/09: «que en este caso
                seleccione el prospecto y haga ese proceso».

                Se busca entre TODOS los prospectos, no solo los convertidos: el
                caso es justo ese, alguien que todavía no ha comprado. Y la
                venta queda de quien lo lleva, no de quien la está tecleando. */}
            {mode === 'otra_gestora' && (
              <div className="space-y-3">
                {!selectedClient ? (
                  <div>
                    <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Buscar el prospecto *</label>
                    <div className="relative">
                      <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        autoFocus
                        value={clientSearch}
                        onChange={(e) => setClientSearch(e.target.value)}
                        placeholder="Nombre, correo o teléfono…"
                        className="w-full h-10 pl-9 pr-3 rounded-md border border-border bg-card text-sm"
                      />
                    </div>
                    {searching && <p className="mt-1.5 text-[11px] text-muted-foreground">Buscando…</p>}
                    {!searching && clientSearch.trim().length >= 2 && clientResults.length === 0 && (
                      <p className="mt-1.5 text-[11px] text-muted-foreground">No se encontró ningún prospecto con eso.</p>
                    )}
                    {clientResults.length > 0 && (
                      <div className="mt-1.5 border border-border rounded-md max-h-48 overflow-y-auto">
                        {clientResults.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => selectClient(c)}
                            className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-0 border-border"
                          >
                            <p className="font-medium truncate">{c.nombre || '— sin nombre —'}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {c.email || '—'} {c.telefono ? `· ${c.telefono}` : ''}
                              {' · '}{c.responsable_nombre || 'sin gestora'}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-info-soft border border-info/30 rounded-md p-3 flex items-start gap-3">
                    <UserCheck size={20} weight="duotone" className="text-info flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{selectedClient.nombre || '— sin nombre —'}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{selectedClient.email || '—'} {selectedClient.telefono ? `· ${selectedClient.telefono}` : ''}</p>
                      {selectedClient.responsable_nombre ? (
                        <p className="text-[11px] text-info-soft-foreground mt-0.5">
                          Esta venta será de <strong>{selectedClient.responsable_nombre}</strong>, que es quien lleva el prospecto.
                        </p>
                      ) : (
                        <p className="text-[11px] text-warning-soft-foreground mt-0.5">
                          Este prospecto no tiene gestora, así que la venta no será de nadie.
                        </p>
                      )}
                    </div>
                    <button type="button" onClick={clearSelectedClient} className="text-[11px] text-muted-foreground hover:text-foreground underline flex-shrink-0">
                      Cambiar
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* MODO: venta sin gestora. Pide lo mismo que «cliente nuevo» pero
                con el nombre solo basta, y avisa de en que se nota. */}
            {mode === 'sin_gestora' && (
              <div className="space-y-3">
                <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-[12px] text-warning-soft-foreground">
                  Esta venta <strong>no se le asigna a nadie</strong>: no cuenta en los
                  números de ninguna gestora ni avanza el reparto de prospectos. Con el
                  nombre basta.
                </p>
                <div>
                  <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Nombre del cliente *</label>
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm" />
                </div>
                <FilaCampos>
                  <div>
                    <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Email</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="opcional"
                      className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm" />
                  </div>
                  <div>
                    <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Teléfono</label>
                    <input value={telefono} onChange={(e) => setTelefono(e.target.value)}
                      placeholder="opcional"
                      className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm" />
                  </div>
                </FilaCampos>
              </div>
            )}

            {/* MODO: cliente nuevo */}
            {mode === 'new' && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Nombre del cliente *</label>
                  <input value={nombre} onChange={(e) => setNombre(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm" />
                </div>
                <FilaCampos>
                  <div>
                    <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Email</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm" />
                  </div>
                  <div>
                    <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Teléfono</label>
                    <input value={telefono} onChange={(e) => setTelefono(e.target.value)}
                      placeholder="+34..."
                      className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm" />
                  </div>
                </FilaCampos>
                <p className="text-[11px] text-muted-foreground -mt-1">Requerido al menos uno de los dos.</p>
              </div>
            )}

            {/* Datos fiscales (opcionales, común a ambos modos) */}
            <div className="space-y-2">
              <div>
                <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">
                  Identificación fiscal <span className="text-muted-foreground/70">(opcional)</span>
                </label>
                <input
                  value={identificacionFiscal}
                  onChange={(e) => setIdentificacionFiscal(e.target.value)}
                  placeholder="NIF / CIF / NIE / Cédula / RFC…"
                  maxLength={50}
                  className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">
                  Dirección fiscal <span className="text-muted-foreground/70">(opcional)</span>
                </label>
                <textarea
                  value={direccionFiscal}
                  onChange={(e) => setDireccionFiscal(e.target.value)}
                  placeholder="Calle, número, piso · Código postal · Ciudad · Provincia · País"
                  maxLength={500}
                  rows={2}
                  className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm resize-none"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Para emitir factura. Si no los tienes, déjalos vacíos.</p>

              {/* EL NUMERO DE FACTURA, AQUI.
                  Diego, 25/09: «no veo donde poner la factura aqui la
                  enumeracion al registrar la venta». Solo sale si la empresa
                  numera al registrar --CEDIA e ICTESS lo tienen puesto--; el
                  resto sigue con el cobro en la cola, que es el freno del
                  14/09. */}
              {(
                <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
                  {/* Etiqueta y campo por separado, como el resto de formularios (#106). */}
                  <label htmlFor="venta-numero-factura" className="mb-1.5 block px-1 text-secundario text-muted-foreground">Número de factura</label>
                  <input
                    id="venta-numero-factura"
                    type="number" min="1" value={numero}
                    disabled={!pid}
                    onChange={(e) => setNumero(e.target.value)}
                    placeholder={pid ? (sugerido || 'automático') : 'elige antes el campus'}
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm tabular-nums disabled:opacity-60"
                  />
                  {!pid ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      La serie y el número son del campus, así que hace falta elegirlo antes.
                    </p>
                  ) : sugerido ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      El siguiente libre es el <b className="tabular-nums">{sugerido}</b>. Puedes poner ese u otro.
                      Si lo dejas vacío, la venta se queda en la cola de facturación.
                    </p>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Si lo dejas vacío, la venta se queda en la cola de facturación.
                    </p>
                  )}
                  <p className="mt-1.5 text-[11px] text-warning-soft-foreground">
                    Comprueba la numeración en el Excel de facturación antes de emitir.
                  </p>
                </div>
              )}
            </div>

            {/* Producto + importes (común a ambos modos) */}
            <div className="border-t border-border pt-3 space-y-3">
              <div>
                <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Producto *</label>
                <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar producto…"
                  className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm mb-1.5" />
                <select value={productoId} onChange={(e) => setProductoId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm">
                  <option value="">— Selecciona —</option>
                  {productosFiltrados.map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}{p.precio ? ` (${p.precio} ${p.moneda || ''})` : ''}</option>
                  ))}
                </select>
                {/* Que se sepa siempre en que punto esta: la caja de arriba
                    solo filtra, y sin esto un desplegable vacio no dice si no
                    hay formaciones, si no casa la busqueda, o si falta elegir
                    el campus. */}
                <p className="mt-1 px-1 text-[11px] text-muted-foreground">
                  {!pid
                    ? 'Elige antes el campus: las formaciones son suyas.'
                    : products.length === 0
                      ? 'Cargando las formaciones…'
                      : productosFiltrados.length === 0
                        ? <span className="text-warning-soft-foreground">No hay ninguna formación con ese texto. Prueba con menos palabras.</span>
                        : productoId
                          ? 'Formación elegida.'
                          : `${productosFiltrados.length} formación${productosFiltrados.length === 1 ? '' : 'es'} — elige una en la lista de arriba.`}
                </p>
              </div>

              <FilaCampos>
                <div>
                  <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Importe total *</label>
                  <input type="number" min="0" step="0.01" value={importeTotal}
                    onChange={(e) => setImporteTotal(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm" />
                </div>
                <div>
                  <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Importe pagado</label>
                  <input type="number" min="0" step="0.01" value={importePagado}
                    onChange={(e) => setImportePagado(e.target.value)}
                    placeholder={`Por defecto: ${importeTotal || 'igual al total'}`}
                    className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm" />
                </div>
              </FilaCampos>

              <FilaCampos>
                <div>
                  <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Método de pago</label>
                  <select value={metodo} onChange={(e) => setMetodo(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm">
                    {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">
                    Fecha de pago *
                    {isRetroactiva && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-warning-soft text-warning-soft-foreground">Histórica</span>}
                  </label>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} max={today}
                    className="w-full h-10 px-3 rounded-md border border-border bg-card text-sm" />
                </div>
              </FilaCampos>

              {/* Cuotas — solo cuando método es fraccionado */}
              {metodo === 'fraccionado' && (
                <div className="space-y-3 p-3 rounded-md border border-border bg-muted/20">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plan de cuotas</span>
                    <button type="button"
                      onClick={() => { setInstallmentsDirty(false); }}
                      className="text-[10px] text-primary hover:underline">
                      Auto-distribuir
                    </button>
                  </div>
                  <FilaCampos>
                    <div>
                      <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">N° de cuotas</label>
                      <input type="number" min={2} max={36} value={numCuotas}
                        onChange={(e) => { setNumCuotas(parseInt(e.target.value) || 2); setInstallmentsDirty(false); }}
                        className="w-full h-9 px-3 rounded-md border border-border bg-card text-sm" />
                    </div>
                    <div>
                      <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">1ª fecha de vencimiento</label>
                      <input type="date" value={fechaPrimeraCuota}
                        onChange={(e) => { setFechaPrimeraCuota(e.target.value); setInstallmentsDirty(false); }}
                        className="w-full h-9 px-3 rounded-md border border-border bg-card text-sm" />
                    </div>
                  </FilaCampos>
                  {installments.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[40px_1fr_1fr] gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                        <span>#</span><span>Vencimiento</span><span className="text-right">Importe €</span>
                      </div>
                      {installments.map((it, idx) => (
                        <div key={idx} className="grid grid-cols-[40px_1fr_1fr] gap-2 items-center">
                          <span className="text-xs text-muted-foreground px-1">{idx + 1}</span>
                          <input type="date" value={it.fecha_vencimiento}
                            onChange={(e) => {
                              const next = [...installments];
                              next[idx] = { ...next[idx], fecha_vencimiento: e.target.value };
                              setInstallments(next); setInstallmentsDirty(true);
                            }}
                            className="h-8 px-2 rounded border border-border bg-card text-xs" />
                          <input type="number" min="0" step="0.01" value={it.importe_previsto}
                            onChange={(e) => {
                              const next = [...installments];
                              next[idx] = { ...next[idx], importe_previsto: e.target.value };
                              setInstallments(next); setInstallmentsDirty(true);
                            }}
                            className="h-8 px-2 rounded border border-border bg-card text-xs text-right" />
                        </div>
                      ))}
                      <div className={`text-[11px] text-right pt-1 ${installmentsMismatch ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                        Suma: {installmentsSum.toFixed(2)} € · Total: {(parseFloat(importeTotal) || 0).toFixed(2)} €
                        {installmentsMismatch && ' ⚠ no coinciden'}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Notas (opcional)</label>
                <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2}
                  placeholder="Comentarios sobre la venta…"
                  className="w-full px-3 py-2 rounded-md border border-border bg-card text-sm resize-none" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 p-4 border-t border-border bg-muted/20">
            <button onClick={onClose} disabled={saving}
              className="h-9 px-4 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted disabled:opacity-50">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {saving ? 'Guardando…' : 'Registrar venta'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
