import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Coins, ArrowsClockwise, Warning, Info, CheckCircle, ArrowCounterClockwise, CaretRight, Envelope, Bank, Copy, PaperPlaneTilt, X, PencilSimple, ArrowUUpLeft } from '@phosphor-icons/react';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectContext } from '@/contexts/ProjectContext';
import { toast } from '@/shared/hooks/useToast';
import PageHeader from '@/shared/components/ui/PageHeader';
import KpiCard from '@/shared/components/ui/KpiCard';
import EmptyState from '@/shared/components/ui/EmptyState';
import { Button } from '@/shared/components/ui/button';
import Entregables from '../components/Entregables';
import LoQueFactura from '../components/LoQueFactura';
import { useProyectosDelAmbito } from '@/shared/hooks/useAmbito';
import {
  tutoresApi,
  type ComisionReal, type ResumenComision, type AjustesTutores, type PagoSinFormacion, type AvisoAlTutor,
} from '../api/tutores.api';

// Lo que hay que pagarle a cada tutor este mes, y el botón de darlo por pagado.
//
// Esto YA es dinero: cada línea es una comisión escrita en la base, atada a un
// cobro concreto. No se recalcula sola cambiando un porcentaje — lo devengado,
// devengado está.
//
// Se paga POR PERSONA y no por curso: al final es una transferencia por tutor,
// aunque dé cuatro formaciones. Por eso la fila principal es el tutor y el
// desglose por curso vive dentro.

const euros = (n: number | string) =>
  Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const soloFecha = (f: string | null) => (f ? String(f).slice(0, 10) : null);

/** Los tres que se ponen a mano. Pagada y revertida no: mueven dinero. */
type EstadoDelTramite = 'pendiente' | 'notificada' | 'falta_factura';

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  notificada: 'Notificada',
  falta_factura: 'Falta factura',
  pagada: 'Pagada',
  revertida: 'Revertida',
};


function mesActual() {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
}

function mesLegible(p: string) {
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const [a, m] = p.split('-');
  return `${meses[Number(m) - 1] || m} de ${a}`;
}

export default function ComisionesTutoresPage() {
  const { user } = useAuth() as { user: { role?: string; gestor_colaboraciones?: boolean } | null };
  const { activeProject, activeIssuer, activeIssuerId } = useProjectContext() as {
    activeProject: { id: number; nombre?: string } | null;
    activeIssuer: { id?: number; nombre?: string } | null;
    activeIssuerId: number | null;
  };
  // Los campus de la empresa elegida, para poder bajar a uno sin cambiar el
  // selector de arriba. Diego, 14/09: «puse empresa y tuve que entrar a un
  // campus si o si; tenemos que poder generar y filtrar por campus».
  const campus = useProyectosDelAmbito<{ id: number; nombre: string }>();
  const [soloCampus, setSoloCampus] = useState<number | null>(null);
  useEffect(() => { setSoloCampus(null); }, [activeIssuerId, activeProject?.id]);
  const esAdmin = ['admin', 'superadmin'].includes(user?.role || '');
  const puede = esAdmin || user?.gestor_colaboraciones === true;
  const elegido = activeProject?.id && activeProject.id !== -1 ? activeProject.id : null;
  const projectId = elegido ?? soloCampus;
  // Con la empresa puesta y sin campus concreto, el servidor traduce `issuerId`
  // a sus campus. Si hay uno elegido manda el proyecto y la empresa sobra.
  const issuerId = !projectId ? activeIssuerId : null;

  const [periodo, setPeriodo] = useState(mesActual());
  // «Avisar tutor»: primero se mira lo que sale, y solo entonces se manda.
  const [aviso, setAviso] = useState<AvisoAlTutor | null>(null);
  const [preparando, setPreparando] = useState<number | null>(null);
  const [enviando, setEnviando] = useState(false);
  // Retocar el correo antes de mandarlo. La plantilla no puede preverlo todo —un
  // mes con devolución, algo que explicarle— y salirse al webmail para eso deja
  // el envío sin anotar en ninguna parte.
  const [editando, setEditando] = useState(false);
  const [asuntoEd, setAsuntoEd] = useState('');
  const cuerpoRef = useRef<HTMLDivElement | null>(null);
  const [resumen, setResumen] = useState<ResumenComision[]>([]);
  const [lineas, setLineas] = useState<ComisionReal[]>([]);
  const [sinFormacion, setSinFormacion] = useState<PagoSinFormacion[]>([]);
  const [ajustes, setAjustes] = useState<AjustesTutores | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [cambiando, setCambiando] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const finDeMes = new Date(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)), 0)
        .toISOString().slice(0, 10);
      const [r, l, a, sf] = await Promise.all([
        tutoresApi.resumenComisiones({ periodo, projectId, issuerId }),
        tutoresApi.comisiones({ periodo, projectId, issuerId }),
        tutoresApi.ajustes(),
        tutoresApi.pagosSinFormacion(`${periodo}-01`, finDeMes, projectId, issuerId),
      ]);
      setResumen(r.success ? (r.data || []) : []);
      setLineas(l.success ? (l.data || []) : []);
      setAjustes(a.success ? a.data : null);
      setSinFormacion(sf.success ? (sf.data || []) : []);
    } finally { setCargando(false); }
  }, [periodo, projectId, issuerId]);

  useEffect(() => { if (puede) cargar(); }, [cargar, puede]);

  const total = useMemo(() => ({
    pendiente: resumen.reduce((s, r) => s + Number(r.pendiente), 0),
    pagada: resumen.reduce((s, r) => s + Number(r.pagada), 0),
    base: resumen.reduce((s, r) => s + Number(r.base), 0),
    sinAtribuir: sinFormacion.reduce((s, p) => s + Number(p.importe), 0),
  }), [resumen, sinFormacion]);

  async function calcular() {
    setTrabajando(true);
    try {
      const finDeMes = new Date(Number(periodo.slice(0, 4)), Number(periodo.slice(5, 7)), 0)
        .toISOString().slice(0, 10);
      // Calcular con la empresa puesta: sus campus de una vez.
      const r = await tutoresApi.calcularComisiones({
        desde: `${periodo}-01`, hasta: finDeMes, projectId,
        projectIds: !projectId && activeIssuerId ? campus.map((c) => c.id) : null,
      });
      if (!r.success) throw new Error(r.error || 'no se pudo');
      toast({
        title: r.data!.creadas > 0 ? `${r.data!.creadas} comisiones nuevas` : 'Nada nuevo que calcular',
        description: r.data!.creadas > 0
          ? `${euros(r.data!.importe)} para ${r.data!.tutores} ${r.data!.tutores === 1 ? 'tutor' : 'tutores'}.`
          : 'Todos los cobros de este mes ya tenían su comisión.',
      });
      cargar();
    } catch (e) {
      toast({ title: 'No se ha podido calcular', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    } finally { setTrabajando(false); }
  }

  /**
   * Prepara el aviso y lo enseña. No manda nada.
   *
   * Un correo que sale mal no se puede recoger, y este lleva una cifra por la
   * que el tutor va a facturar: se mira antes.
   */
  async function verElAviso(r: ResumenComision) {
    setPreparando(r.tutor_id);
    try {
      const res = await tutoresApi.previoDelAviso(r.tutor_id, r.periodo);
      if (!res.success || !res.data) throw new Error(res.error || 'no se pudo preparar');
      // Cada aviso se abre SIN retocar, aunque el anterior se retocara: lo que
      // se escribió para un tutor no puede salir hacia otro.
      setEditando(false);
      setAsuntoEd(res.data.asunto);
      setAviso(res.data);
    } catch (err) {
      toast({ title: 'No se puede avisar todavía', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    } finally { setPreparando(null); }
  }

  async function mandarElAviso() {
    if (!aviso) return;
    setEnviando(true);
    try {
      // Si se ha retocado, va lo retocado; si no, no se manda nada y el
      // servidor lo compone como siempre. El cuerpo se lee del propio recuadro
      // —es el que se ha estado editando— y no de un estado paralelo que
      // tendria que ir sincronizando a cada tecla.
      const retoque = editando && cuerpoRef.current
        ? { asunto: asuntoEd.trim(), html: cuerpoRef.current.innerHTML }
        : undefined;
      const res = await tutoresApi.avisarTutor(aviso.tutorId, aviso.periodo, retoque);
      if (!res.success) throw new Error(res.error || 'no se pudo enviar');
      toast({ title: `Avisado ${aviso.nombre}`, description: `Correo enviado a ${aviso.email}.` });
      setAviso(null);
      cargar();
    } catch (err) {
      // El motivo se enseña entero: «no se pudo enviar» a secas manda a mirar
      // el sitio equivocado, y el de Brevo suele ser el remitente sin verificar.
      toast({ title: 'No se ha enviado', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    } finally { setEnviando(false); }
  }


  async function pagar(r: ResumenComision) {
    setTrabajando(true);
    try {
      const res = await tutoresApi.liquidar({ periodo: r.periodo, tutorId: r.tutor_id });
      if (!res.success) throw new Error(res.error || 'no se pudo');
      toast({
        title: `${r.tutor}: ${euros(res.data!.importe)} marcados como pagados`,
        description: `${res.data!.liquidadas} ${res.data!.liquidadas === 1 ? 'línea' : 'líneas'} de ${mesLegible(r.periodo)}.`,
      });
      cargar();
    } catch (e) {
      toast({ title: 'No se ha podido marcar', description: e instanceof Error ? e.message : '', variant: 'destructive' });
    } finally { setTrabajando(false); }
  }

  /** Pendiente ⇄ Notificada ⇄ Falta factura. Nada mas: pagar y revertir van por
   *  su lado porque mueven dinero y dejan rastro de quien y cuando. */
  async function cambiarEstado(c: ComisionReal, estado: EstadoDelTramite) {
    setCambiando(c.id);
    try {
      const r = await tutoresApi.cambiarEstadoComision(c.id, estado);
      if (!r?.success) throw new Error('no');
      toast({ title: `Marcada como ${(ETIQUETA_ESTADO[estado] || estado).toLowerCase()}` });
      await cargar();
    } catch (err) {
      toast({
        title: 'No se ha podido cambiar',
        description: (err as { message?: string })?.message || 'Vuelve a intentarlo.',
        variant: 'destructive',
      });
    } finally { setCambiando(null); }
  }

  async function revertir(c: ComisionReal) {
    const motivo = window.prompt('¿Por qué se revierte? Queda escrito con tu nombre.');
    if (motivo === null) return;
    const r = await tutoresApi.revertirComision(c.id, motivo);
    if (r.success) { toast({ title: 'Comisión revertida' }); cargar(); }
    else toast({ title: 'No se ha podido revertir', description: r.error || '', variant: 'destructive' });
  }

  // Copiar el IBAN sin abrir nada. Se avisa de que se copio: si no, nadie sabe
  // si el clic hizo algo y acaba copiandolo a mano igualmente.
  async function copiarIban(iban: string) {
    try {
      await navigator.clipboard.writeText(iban);
      toast({ title: 'IBAN copiado', description: iban });
    } catch {
      toast({ title: 'No se pudo copiar', description: iban, variant: 'destructive' });
    }
  }

  if (!puede) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
        Esta pantalla es para administradores y gestores de colaboraciones.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="Comisiones de tutores"
        subtitle={projectId
          ? `${mesLegible(periodo)} · ${elegido ? (activeProject?.nombre || 'este proyecto') : (campus.find((c) => c.id === projectId)?.nombre || 'este campus')}`
          : activeIssuer
          ? `${mesLegible(periodo)} · los ${campus.length} campus de ${activeIssuer.nombre}`
          : `${mesLegible(periodo)} · todos los proyectos`}
        actions={(
          <>
            {/* El campus, dentro de la empresa. Sin esto habia que cambiar el
                selector de arriba para mirar uno solo. */}
            {activeIssuer && !elegido && campus.length > 1 && (
              <select
                value={soloCampus ?? ''}
                onChange={(e) => setSoloCampus(e.target.value ? Number(e.target.value) : null)}
                aria-label="Filtrar por campus"
                className="h-9 px-2 rounded-md border border-border bg-card text-sm">
                <option value="">Todos los campus</option>
                {campus.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            )}
            <input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)}
              className="h-9 px-2 rounded-md border border-border bg-card text-sm" />
            <Button variant="outline" size="sm" onClick={calcular} disabled={trabajando}>
              <ArrowsClockwise size={14} weight="bold" className="mr-1.5" />
              {trabajando ? 'Calculando…' : 'Calcular'}
            </Button>
          </>
        )}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard icon={Coins} iconBg="bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
          label="Por pagar" value={euros(total.pendiente)} />
        <KpiCard icon={CheckCircle} iconBg="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          label="Ya pagado este mes" value={euros(total.pagada)} />
        <KpiCard icon={Coins} iconBg="bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
          label="Cobrado de sus formaciones" value={euros(total.base)} />
      </div>

      {ajustes && (
        <div className="bg-card border border-border rounded-lg p-3 flex flex-wrap items-center gap-2 text-sm">
          <Info size={16} weight="fill" className="text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">
            Se paga un porcentaje de lo <strong className="text-foreground">cobrado de verdad</strong>, nunca
            de lo vendido. No se genera nada anterior al{' '}
            <strong className="text-foreground tabular-nums">{soloFecha(String(ajustes.aplica_desde))}</strong>,
            ni anterior a la fecha de inicio de cada tutor.
          </span>
        </div>
      )}

      {/* El dinero que no se puede atribuir. Se enseña a proposito: esconderlo
          haria parecer cuadrado un mes que no lo esta. */}
      {sinFormacion.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 rounded-lg p-3">
          <p className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5 text-sm">
            <Warning size={16} weight="fill" />
            {euros(total.sinAtribuir)} cobrados sin saber de qué formación son
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-1 leading-relaxed">
            {sinFormacion.length} {sinFormacion.length === 1 ? 'cobro' : 'cobros'} de ventas que no están atadas
            al catálogo. Nadie cobra comisión por ellos. Se arregla eligiendo la formación en cada venta:
            {' '}{sinFormacion.slice(0, 3).map((p) => `#${p.venta} ${p.alumno}`).join(' · ')}
            {sinFormacion.length > 3 ? ` y ${sinFormacion.length - 3} más` : ''}.
          </p>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">
            {cargando ? 'cargando…' : `${resumen.length} ${resumen.length === 1 ? 'tutor' : 'tutores'} en ${mesLegible(periodo)}`}
          </span>
          <span className="text-lg font-bold tabular-nums">{euros(total.pendiente)}</span>
        </div>

        {!cargando && resumen.length === 0 ? (
          <EmptyState icon={Coins} title="Ninguna comisión este mes"
            description="Pulsa Calcular para crearlas a partir de los cobros. Si sigue vacío: o no hay tutores con formaciones, o sus fechas de inicio son posteriores, o los cobros no están atados al catálogo." />
        ) : (
          <div className="divide-y divide-border">
            {resumen.map((r) => {
              const suyas = lineas.filter((l) => l.tutor_id === r.tutor_id);
              const desplegado = abierto === r.tutor_id;
              return (
                <div key={`${r.periodo}-${r.tutor_id}`}>
                  <div className="px-4 py-3 flex flex-wrap items-center gap-3">
                    {/* El ancho minimo importa: con `min-w-0` este hueco se
                        encogia hasta nada en cuanto la fila llevaba una cosa
                        mas —el «avisado el ...» de quien ya tiene aviso— y el
                        nombre quedaba en «Sa...» con el resto partido en
                        vertical. Con un minimo, la fila prefiere partirse
                        (`flex-wrap`) antes que aplastar al tutor. */}
                    <button type="button" onClick={() => setAbierto(desplegado ? null : r.tutor_id)}
                      className="flex items-center gap-2 min-w-[13rem] flex-1 text-left">
                      <CaretRight size={14} weight="bold"
                        className={`shrink-0 text-muted-foreground transition-transform ${desplegado ? 'rotate-90' : ''}`} />
                      <span className="min-w-0">
                        <span className="font-semibold block truncate">{r.tutor}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {r.lineas} {r.lineas === 1 ? 'cobro' : 'cobros'} · base {euros(r.base)}
                          {Number(r.pagada) > 0 && ` · ${euros(r.pagada)} ya pagados`}
                          {Number(r.revertida) > 0 && ` · ${euros(r.revertida)} revertidos`}
                        </span>
                      </span>
                    </button>

                    {/* El correo y la cuenta, en su propio hueco de la fila.
                        Van FUERA del boton que despliega: dentro, copiar el IBAN
                        abriria y cerraria el detalle de paso. */}
                    <span className="hidden md:flex items-center gap-1.5 min-w-0 basis-64 text-xs text-muted-foreground">
                      {r.tutor_email
                        ? <>
                            <Envelope size={13} weight="bold" className="shrink-0 opacity-70" />
                            <span className="truncate" title={r.tutor_email}>{r.tutor_email}</span>
                          </>
                        : <span className="italic opacity-60">sin correo</span>}
                    </span>

                    <span className="hidden md:flex items-center gap-1.5 min-w-0 basis-56 text-xs text-muted-foreground">
                      {r.tutor_iban
                        ? <button type="button" title="Copiar el IBAN"
                            onClick={(e) => { e.stopPropagation(); copiarIban(r.tutor_iban!); }}
                            className="inline-flex items-center gap-1.5 min-w-0 hover:text-foreground">
                            <Bank size={13} weight="bold" className="shrink-0 opacity-70" />
                            <span className="font-mono tabular-nums truncate">{r.tutor_iban}</span>
                            <Copy size={11} weight="bold" className="shrink-0 opacity-50" />
                          </button>
                        : <span className="italic opacity-60">sin IBAN</span>}
                    </span>

                    <span className="text-base font-bold tabular-nums shrink-0">{euros(r.pendiente)}</span>

                    {esAdmin && Number(r.pendiente) > 0 && (
                      <Button size="sm" disabled={trabajando} onClick={() => pagar(r)}>
                        <CheckCircle size={14} weight="bold" className="mr-1.5" /> Marcar pagado
                      </Button>
                    )}

                    {/* «Avisar tutor». Va junto a pagar y no dentro del
                        desplegable: es la otra cosa que se hace con una fila. */}
                    {esAdmin && Number(r.pendiente) > 0 && (
                      <Button size="sm" variant="outline" disabled={preparando === r.tutor_id}
                        title={r.tutor_email ? `Escribir a ${r.tutor_email}` : 'Este tutor no tiene correo en su ficha'}
                        onClick={() => verElAviso(r)}>
                        <PaperPlaneTilt size={14} weight="bold" className="mr-1.5" />
                        {preparando === r.tutor_id ? 'Preparando…' : 'Avisar tutor'}
                      </Button>
                    )}

                    {/* Que ya se le aviso se dice al lado, no en el estado del
                        dinero: sigue debiendosele hasta que se le pague. */}
                    {r.avisado_at && (
                      <span className="text-xs text-muted-foreground shrink-0" title={r.avisado_at}>
                        avisado el {soloFecha(r.avisado_at)}
                      </span>
                    )}
                    {Number(r.pendiente) === 0 && r.ultima_liquidacion && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
                        pagado el {soloFecha(r.ultima_liquidacion)}
                      </span>
                    )}
                  </div>

                  {desplegado && (
                    <div className="px-4 pb-3 overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left uppercase tracking-wide text-[10px] text-muted-foreground border-b border-border">
                            <th className="py-1.5 pr-3 font-semibold">Cobro</th>
                            <th className="py-1.5 px-3 font-semibold">Alumno</th>
                            <th className="py-1.5 px-3 font-semibold">Formación</th>
                            {!projectId && <th className="py-1.5 px-3 font-semibold">Proyecto</th>}
                            <th className="py-1.5 px-3 font-semibold text-right">Base</th>
                            <th className="py-1.5 px-3 font-semibold text-right">%</th>
                            <th className="py-1.5 px-3 font-semibold text-right">Comisión</th>
                            {/* Lo que ha entregado de esa formacion. Diego lo
                                pidio justo aqui: es la fila donde se pulsa
                                «Marcar pagado». */}
                            <th className="py-1.5 px-3 font-semibold">Entregado</th>
                            <th className="py-1.5 px-3 font-semibold">Estado</th>
                            <th className="py-1.5 pl-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {suyas.map((l) => (
                            <tr key={l.id} className={l.estado === 'revertida' ? 'opacity-50 line-through' : ''}>
                              <td className="py-1.5 pr-3 tabular-nums">{soloFecha(l.fecha_cobro)}</td>
                              <td className="py-1.5 px-3 truncate max-w-[10rem]">{l.alumno}</td>
                              <td className="py-1.5 px-3 truncate max-w-[16rem]">{l.formacion}</td>
                              {!projectId && <td className="py-1.5 px-3 text-muted-foreground">{l.proyecto}</td>}
                              <td className="py-1.5 px-3 text-right tabular-nums">{euros(l.base_calculo)}</td>
                              <td className="py-1.5 px-3 text-right tabular-nums">{Number(l.pct)} %</td>
                              <td className="py-1.5 px-3 text-right tabular-nums font-semibold">{euros(l.importe)}</td>
                              <td className="py-1.5 px-3">
                                <Entregables valor={l} soloLectura />
                              </td>
                              <td className="py-1.5 px-3">
                                {l.estado === 'pagada' ? (
                                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                    pagada {soloFecha(l.fecha_liquidacion)}
                                  </span>
                                ) : l.estado === 'revertida' ? (
                                  <span className="text-muted-foreground">revertida</span>
                                ) : puede ? (
                                  // Los tres estados del seguimiento, editables aqui mismo.
                                  // Pagada y revertida NO estan en la lista: esas dos mueven
                                  // dinero y tienen su propio boton, con su rastro.
                                  <select
                                    value={l.estado}
                                    disabled={cambiando === l.id}
                                    onChange={(e) => cambiarEstado(l, e.target.value as EstadoDelTramite)}
                                    aria-label={`Estado de la comisión de ${l.alumno}`}
                                    className={`h-7 px-1.5 rounded border border-border bg-background text-xs font-semibold
                                      focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 ${
                                        l.estado === 'falta_factura'
                                          ? 'text-red-600 dark:text-red-400'
                                          : l.estado === 'notificada'
                                            ? 'text-sky-600 dark:text-sky-400'
                                            : 'text-amber-600 dark:text-amber-400'
                                      }`}
                                  >
                                    <option value="pendiente">Pendiente</option>
                                    <option value="notificada">Notificada</option>
                                    <option value="falta_factura">Falta factura</option>
                                  </select>
                                ) : (
                                  <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                    {ETIQUETA_ESTADO[l.estado] || l.estado}
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 pl-3 text-right">
                                {esAdmin && l.estado !== 'revertida' && (
                                  <button type="button" onClick={() => revertir(l)}
                                    title="Revertir esta comisión"
                                    className="text-muted-foreground hover:text-red-600">
                                    <ArrowCounterClockwise size={13} weight="bold" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* Lo que el profesional tiene que facturar. Va debajo de
                          sus filas y no en un informe aparte: es la cuenta que
                          hay que mandarle, y el total del mes --no una linea--
                          es la base. El mismo cuadro lo ve el tutor en «Mis
                          cursos». */}
                      <LoQueFactura
                        className="mt-3"
                        base={suyas
                          .filter((x) => x.estado !== 'revertida' && x.estado !== 'pagada')
                          .reduce((a, x) => a + Number(x.importe), 0)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* La vista previa. Existe porque un correo no se recoge, y este lleva la
          cifra por la que el tutor va a facturar.

          `!m-0` en la capa: es hija del `space-y-3` de la pagina, que le mete
          `margin-top` a todo hijo que no sea el primero. Con `fixed inset-0`
          ese margen la baja 12 px y deja arriba una franja sin oscurecer.
          `ConfirmDialog` y `PromptDialog` ya lo llevan por lo mismo. */}
      {aviso && (
        <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => !enviando && setAviso(null)}>
          {/* Columna con el pie FIJO: antes la tarjeta entera hacía scroll y
              los botones se iban con él — había que bajar para poder enviar.
              Ahora solo se desplaza el correo, y «Enviar» está siempre. */}
          <div onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-lg shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col">
            <div className="flex items-start justify-between gap-3 p-4 border-b border-border shrink-0">
              <div className="min-w-0">
                <h2 className="font-bold truncate">Avisar a {aviso.nombre}</h2>
                <p className="text-xs text-muted-foreground truncate">
                  {aviso.email} · {aviso.mes}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Retocar el correo antes de mandarlo. A quién va NO se toca:
                    sale del tutor, en el servidor. */}
                {!editando ? (
                  <Button variant="outline" size="sm" onClick={() => setEditando(true)} disabled={enviando}>
                    <PencilSimple size={13} weight="bold" className="mr-1.5" /> Editar
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled={enviando}
                    onClick={() => {
                      // Se vuelve al texto de la plantilla, y se vuelve de
                      // verdad: el recuadro lo lleva editando el navegador, así
                      // que hay que devolvérselo a mano.
                      if (cuerpoRef.current) cuerpoRef.current.innerHTML = aviso.html;
                      setAsuntoEd(aviso.asunto);
                      setEditando(false);
                    }}>
                    <ArrowUUpLeft size={13} weight="bold" className="mr-1.5" /> Descartar cambios
                  </Button>
                )}
                <button type="button" onClick={() => setAviso(null)} disabled={enviando}
                  className="text-muted-foreground hover:text-foreground">
                  <X size={16} weight="bold" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
              {editando ? (
                <label className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground shrink-0">Asunto</span>
                  <input
                    value={asuntoEd}
                    onChange={(e) => setAsuntoEd(e.target.value)}
                    className="flex-1 min-w-0 h-8 px-2.5 rounded-md border border-border bg-background text-sm outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </label>
              ) : (
                <div className="text-xs">
                  <span className="text-muted-foreground">Asunto: </span>
                  <span className="font-medium">{aviso.asunto}</span>
                </div>
              )}

              {/* El correo tal cual va a salir, y sobre FONDO BLANCO aunque el CRM
                  esté en oscuro: así se ve en la bandeja de quien lo recibe.
                  Con el fondo del panel no era solo cuestión de gusto — los
                  grises del correo, pensados para papel blanco, quedaban
                  ilegibles sobre oscuro y media tabla no se leía. */}
              {/* Editando, se escribe SOBRE el propio correo: se ve lo que va a
                  salir mientras se cambia, y la tabla de la cuenta sigue en su
                  sitio. Lo que se mande es el contenido de este recuadro. */}
              <div
                ref={cuerpoRef}
                contentEditable={editando}
                suppressContentEditableWarning
                spellCheck={editando}
                className={`border rounded-md p-4 text-sm overflow-x-auto ${
                  editando
                    ? 'border-primary ring-2 ring-primary/30 outline-none'
                    : 'border-border'
                }`}
                style={{ background: '#ffffff', color: '#18181b', colorScheme: 'light' }}
                dangerouslySetInnerHTML={{ __html: aviso.html }}
              />

              {editando && (
                <p className="text-xs text-muted-foreground flex gap-1.5">
                  <PencilSimple size={13} weight="bold" className="shrink-0 mt-0.5" />
                  <span>
                    Escribe directamente sobre el correo. Se manda tal y como queda aquí —
                    <strong> a {aviso.email}</strong>, que eso no se cambia.
                  </span>
                </p>
              )}

              {!aviso.tieneIban && (
                <p className="text-xs flex gap-1.5 text-amber-700 dark:text-amber-400">
                  <Warning size={14} weight="fill" className="shrink-0 mt-0.5" />
                  <span>No tenemos su IBAN. El correo se lo pide — cuando conteste, hay que meterlo en su ficha.</span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 p-4 border-t border-border shrink-0">
              {editando && (
                <span className="text-xs text-muted-foreground mr-auto">Con tus cambios</span>
              )}
              <Button variant="outline" size="sm" onClick={() => setAviso(null)} disabled={enviando}>
                Cancelar
              </Button>
              <Button size="sm" onClick={mandarElAviso} disabled={enviando || (editando && !asuntoEd.trim())}>
                <PaperPlaneTilt size={14} weight="bold" className="mr-1.5" />
                {enviando ? 'Enviando…' : `Enviar a ${aviso.email}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
