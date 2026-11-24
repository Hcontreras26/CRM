import { useCallback, useEffect, useState } from 'react';
import {
  X, CalendarBlank, CheckCircle, XCircle, Plus, Trash, Info,
} from '@phosphor-icons/react';
import Portal from '@/shared/components/ui/portal';
import ConfirmDialog from '@/shared/components/ui/ConfirmDialog';
import { inputClass } from '@/shared/lib/ui';
import { toast } from '@/shared/hooks/useToast';
import {
  createBlock, deleteBlock, listBlocks, setAvailability,
  type AvailabilityBlock, type AvailabilityUser,
} from '../api/availability.api';
import { formatFecha, hoyISO } from '../lib/usersUi';

interface Props {
  /** Solo se necesitan id y nombre; el estado se refresca desde el servidor. */
  user: { id: number; nombre: string; role: string };
  /** Estado actual si ya se conoce; si no, se pide. */
  estadoInicial?: AvailabilityUser | null;
  onClose: () => void;
  /** Se llama tras cualquier cambio, para que la lista de detrás se entere. */
  onChange: () => void;
}

const BLOQUE_VACIO = { fecha_inicio: '', fecha_fin: '', motivo: '' };

/**
 * Ausencias de una persona, en el mismo sitio donde se la administra.
 *
 * Antes esto vivia en una pestaña aparte y usaba `window.prompt()` para el
 * motivo y `confirm()` para borrar: dos cuadros del navegador que no se pueden
 * cancelar con Escape sin perder lo escrito, no se ven en oscuro y no salen en
 * movil como el resto.
 */
export default function AvailabilityDialog({ user, estadoInicial, onClose, onChange }: Props) {
  const [disponible, setDisponible] = useState(estadoInicial?.is_available ?? true);
  const [motivoActual, setMotivoActual] = useState(estadoInicial?.unavailable_reason ?? null);
  const [bloques, setBloques] = useState<AvailabilityBlock[]>([]);
  const [cargando, setCargando] = useState(true);

  // Marcar «no disponible» pide motivo: se despliega un campo en vez de un prompt.
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [guardandoEstado, setGuardandoEstado] = useState(false);

  const [nuevo, setNuevo] = useState(BLOQUE_VACIO);
  const [guardandoBloque, setGuardandoBloque] = useState(false);
  const [porBorrar, setPorBorrar] = useState<AvailabilityBlock | null>(null);
  const [borrando, setBorrando] = useState(false);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      setBloques(await listBlocks(user.id));
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message, variant: 'destructive' });
    } finally {
      setCargando(false);
    }
  }, [user.id]);

  useEffect(() => { recargar(); }, [recargar]);

  async function aplicarEstado(nuevoDisponible: boolean, motivoTexto: string | null) {
    setGuardandoEstado(true);
    try {
      await setAvailability(user.id, nuevoDisponible, motivoTexto);
      setDisponible(nuevoDisponible);
      setMotivoActual(nuevoDisponible ? null : motivoTexto);
      setPidiendoMotivo(false);
      setMotivo('');
      toast({
        title: nuevoDisponible ? 'Marcado disponible' : 'Marcado no disponible',
        description: user.nombre,
      });
      onChange();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message, variant: 'destructive' });
    } finally {
      setGuardandoEstado(false);
    }
  }

  function alternarEstado() {
    if (disponible) setPidiendoMotivo(true);
    else aplicarEstado(true, null);
  }

  async function anadirBloque() {
    if (!nuevo.fecha_inicio || !nuevo.fecha_fin) return;
    // El servidor lo rechaza igual, pero decirlo aqui evita el viaje y el susto.
    if (nuevo.fecha_fin < nuevo.fecha_inicio) {
      toast({
        title: 'Las fechas están al revés',
        description: 'La fecha de fin no puede ser anterior a la de inicio.',
        variant: 'destructive',
      });
      return;
    }
    setGuardandoBloque(true);
    try {
      await createBlock(user.id, nuevo);
      toast({ title: 'Ausencia programada', description: `${formatFecha(nuevo.fecha_inicio)} → ${formatFecha(nuevo.fecha_fin)}` });
      setNuevo(BLOQUE_VACIO);
      await recargar();
      onChange();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message, variant: 'destructive' });
    } finally {
      setGuardandoBloque(false);
    }
  }

  async function confirmarBorrado() {
    if (!porBorrar) return;
    setBorrando(true);
    try {
      await deleteBlock(porBorrar.id);
      setBloques((prev) => prev.filter((b) => b.id !== porBorrar.id));
      toast({ title: 'Ausencia eliminada' });
      setPorBorrar(null);
      onChange();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message, variant: 'destructive' });
    } finally {
      setBorrando(false);
    }
  }

  // El reparto solo mira a gestores y a admins con el flag puesto.
  const entraEnReparto = user.role === 'gestor' || user.role === 'admin' || user.role === 'superadmin';

  return (
    <>
      <Portal>
        <div className="fixed inset-0 !m-0 z-[70] flex items-center justify-center sm:p-4">
          <div className="fixed inset-0 !m-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Ausencias de ${user.nombre}`}
            className="relative bg-card rounded-lg border border-border shadow-dialog w-full max-w-xl mx-4 p-4 sm:p-6 overflow-y-auto max-h-[90vh] animate-in"
          >
            <div className="flex items-start justify-between mb-5 gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold truncate">Ausencias · {user.nombre}</h2>
                <p className="text-muted-foreground text-sm mt-0.5">
                  Quien no está disponible se salta en el reparto de prospectos.
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted flex-shrink-0"
              >
                <X size={18} weight="bold" />
              </button>
            </div>

            {!entraEnReparto && (
              <div className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-xs flex items-start gap-2">
                <Info size={14} className="flex-shrink-0 mt-px text-muted-foreground" />
                <p className="text-muted-foreground">
                  Este rol no entra en el reparto de prospectos, así que marcarlo ausente no cambia a quién le llegan.
                  Sirve como registro.
                </p>
              </div>
            )}

            {/* Estado actual */}
            <section className="rounded-lg border border-border p-3 mb-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Estado ahora mismo</p>
                  {!disponible && motivoActual && (
                    <p className="text-secundario text-warning mt-0.5">Motivo: {motivoActual}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={alternarEstado}
                  disabled={guardandoEstado || pidiendoMotivo}
                  className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-semibold border transition-colors disabled:opacity-50 ${
                    disponible
                      ? 'bg-success-soft text-success-soft-foreground border-success/30 hover:bg-success-soft/80'
                      : 'bg-destructive-soft text-destructive-soft-foreground border-destructive/30 hover:bg-destructive-soft/80'
                  }`}
                >
                  {disponible
                    ? <><CheckCircle size={14} weight="duotone" /> Disponible</>
                    : <><XCircle size={14} weight="duotone" /> No disponible</>}
                </button>
              </div>

              {pidiendoMotivo && (
                <div className="mt-3 pt-3 border-t border-border">
                  <label htmlFor="motivo-ausencia" className="text-xs text-muted-foreground mb-1.5 block">
                    Motivo (opcional)
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="motivo-ausencia"
                      autoFocus
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); aplicarEstado(false, motivo.trim() || null); }
                        if (e.key === 'Escape') { setPidiendoMotivo(false); setMotivo(''); }
                      }}
                      maxLength={500}
                      placeholder="Baja, vacaciones, formación…"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => aplicarEstado(false, motivo.trim() || null)}
                      disabled={guardandoEstado}
                      className="h-9 px-3 rounded-md bg-destructive text-destructive-foreground text-xs font-semibold hover:bg-destructive/90 disabled:opacity-50 whitespace-nowrap"
                    >
                      {guardandoEstado ? '…' : 'Marcar ausente'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPidiendoMotivo(false); setMotivo(''); }}
                      className="h-9 px-3 rounded-md border border-border text-xs font-medium hover:bg-muted"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Ausencias programadas */}
            <section>
              <h3 className="text-sm font-semibold mb-2">Ausencias programadas</h3>

              <div className="rounded-md border border-border bg-muted/20 p-3 mb-3">
                {/* Las fechas van en su propia fila. Repartidas en cuatro
                    columnas iguales les tocaban ~126px, y un
                    <input type="date"> de Chrome necesita unos 136 para
                    «dd/mm/aaaa» más el icono del calendario: se comía la
                    última «a». */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label htmlFor="f-inicio" className="text-secundario text-muted-foreground block mb-1">Desde</label>
                    <input
                      id="f-inicio"
                      type="date"
                      min={hoyISO()}
                      value={nuevo.fecha_inicio}
                      onChange={(e) => setNuevo({ ...nuevo, fecha_inicio: e.target.value })}
                      className="h-9 w-full px-2 rounded-md border border-border bg-card text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="f-fin" className="text-secundario text-muted-foreground block mb-1">Hasta</label>
                    <input
                      id="f-fin"
                      type="date"
                      min={nuevo.fecha_inicio || hoyISO()}
                      value={nuevo.fecha_fin}
                      onChange={(e) => setNuevo({ ...nuevo, fecha_fin: e.target.value })}
                      className="h-9 w-full px-2 rounded-md border border-border bg-card text-sm"
                    />
                  </div>
                </div>

                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1 min-w-0">
                    <label htmlFor="f-motivo" className="text-secundario text-muted-foreground block mb-1">Motivo</label>
                    <input
                      id="f-motivo"
                      type="text"
                      maxLength={500}
                      placeholder="Opcional"
                      value={nuevo.motivo}
                      onChange={(e) => setNuevo({ ...nuevo, motivo: e.target.value })}
                      className="h-9 w-full px-2 rounded-md border border-border bg-card text-sm"
                    />
                  </div>
                  <div className="sm:w-32">
                    <button
                      type="button"
                      onClick={anadirBloque}
                      disabled={guardandoBloque || !nuevo.fecha_inicio || !nuevo.fecha_fin}
                      className="h-9 w-full px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-50 whitespace-nowrap"
                    >
                      <Plus size={12} weight="bold" /> Añadir
                    </button>
                  </div>
                </div>
              </div>

              {cargando ? (
                <p className="text-xs text-muted-foreground py-4 text-center">Cargando ausencias…</p>
              ) : bloques.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-4 text-center">Sin ausencias programadas</p>
              ) : (
                <div className="space-y-1.5">
                  {bloques.map((b) => (
                    <div
                      key={b.id}
                      className={`flex items-center gap-3 p-2 rounded-md text-xs ${
                        b.activo
                          ? 'bg-warning-soft border border-warning/30'
                          : 'bg-card border border-border'
                      }`}
                    >
                      <CalendarBlank size={13} className="text-muted-foreground flex-shrink-0" />
                      <span className="font-medium whitespace-nowrap">
                        {formatFecha(b.fecha_inicio)} → {formatFecha(b.fecha_fin)}
                      </span>
                      {b.activo && (
                        <span className="text-secundario px-1.5 py-0.5 rounded bg-warning-soft text-warning-soft-foreground font-bold whitespace-nowrap">
                          ACTIVO HOY
                        </span>
                      )}
                      <span className="flex-1 text-muted-foreground truncate">{b.motivo || '—'}</span>
                      <button
                        onClick={() => setPorBorrar(b)}
                        aria-label="Eliminar ausencia"
                        className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0"
                      >
                        <Trash size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-secundario text-muted-foreground mt-3">
                Se listan las ausencias que sigan vigentes y las de los últimos 30 días.
              </p>
            </section>
          </div>
        </div>
      </Portal>

      <ConfirmDialog
        open={!!porBorrar}
        tone="destructive"
        title="¿Eliminar esta ausencia?"
        message={porBorrar
          ? `${formatFecha(porBorrar.fecha_inicio)} → ${formatFecha(porBorrar.fecha_fin)}${porBorrar.activo ? '. Está activa hoy: al eliminarla volverá a recibir prospectos.' : ''}`
          : ''}
        confirmLabel="Eliminar"
        loading={borrando}
        onConfirm={confirmarBorrado}
        onCancel={() => setPorBorrar(null)}
      />
    </>
  );
}
