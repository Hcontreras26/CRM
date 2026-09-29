import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight, Users, WarningCircle, ArrowsClockwise,
} from '@phosphor-icons/react';
import client from '@/shared/api/client';
import { lista } from '@/shared/lib/lista';
import { toast } from '@/shared/hooks/useToast';
import usePermission from '@/shared/hooks/usePermission';

/**
 * A quién le toca el siguiente lead (#11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE
 *
 * El reparto automático funciona desde siempre, pero por dentro: el equipo no
 * ve a quién le toca hasta que el lead ya está asignado. Preguntar «¿me va a
 * caer a mí el siguiente?» hoy solo se contesta esperando.
 *
 * LO QUE ENSEÑA TIENE QUE SER LO QUE VA A PASAR
 *
 * El endpoint que alimenta esto tenía su propia consulta de gestores y no
 * miraba ni las ausencias, ni `is_available`, ni lo de las colaboraciones. O
 * sea que podía decir «el próximo es Laura» con Laura de vacaciones. Ahora la
 * lista sale de `reparto.js`, la misma que usa el alta, y hay una prueba contra
 * la base que se cae si vuelven a separarse.
 *
 * Es el punto entero del panel: si nombra a alguien y se equivoca, es peor que
 * no estar, porque el equipo se organiza con lo que lee.
 * ─────────────────────────────────────────────────────────────────────────────
 */

interface Gestor {
  id: number;
  nombre: string;
  email?: string;
  avatar_url?: string | null;
  orden_cola?: number;
  /** Solo en el último: recibió un lead y hoy ya no está en el reparto. */
  fuera_del_reparto?: boolean;
}

interface EstadoCola {
  gestores: Gestor[];
  last_assigned_at: string | null;
  last_gestor: Gestor | null;
  next_gestor: Gestor | null;
  /** Prospectos del proyecto que ahora mismo no tienen dueño. */
  sin_responsable: number;
}

/** «hace 5 min», «hace 2 h», «hace 3 días». */
function hace(iso: string | null): string {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d > 1 ? 's' : ''}`;
}

const iniciales = (nombre: string) => nombre
  .trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

function Avatar({ g, destacado = false }: { g: Gestor; destacado?: boolean }) {
  if (g.avatar_url) {
    return (
      <img
        src={g.avatar_url}
        alt=""
        className={`w-6 h-6 rounded-full object-cover shrink-0 ${destacado ? 'ring-2 ring-primary' : ''}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold
        ${destacado ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
    >
      {iniciales(g.nombre)}
    </span>
  );
}

export default function ProximoGestor({
  projectId, recargarSenal = 0, onReasignado,
}: {
  projectId: number | null | undefined;
  /** Cambia este número para releer (por ejemplo al crear un lead). */
  recargarSenal?: number;
  /** Se llama tras repartir, para que el listado de al lado se entere. */
  onReasignado?: () => void;
}) {
  const [estado, setEstado] = useState<EstadoCola | null>(null);
  const [fallo, setFallo] = useState(false);
  const [repartiendo, setRepartiendo] = useState(false);
  const { can } = usePermission();

  // En modo «Todos los proyectos» el id vale -1, que es truthy: con un
  // `if (!projectId)` esto pedia /projects/-1/queue-state y pintaba «sin
  // gestores en el reparto» en una vista donde la pregunta ni siquiera aplica
  // —cada proyecto tiene su propia cola—.
  const hayProyecto = typeof projectId === 'number' && projectId > 0;

  const cargar = useCallback(async () => {
    if (!hayProyecto) return;
    try {
      const r = await client.get(`/projects/${projectId}/queue-state`);
      if (r.success) { setEstado(r.data); setFallo(false); }
      else setFallo(true);
    } catch { setFallo(true); }
  }, [hayProyecto, projectId]);

  useEffect(() => { cargar(); }, [cargar, recargarSenal]);

  // Cada 30 s. El reparto pasa por detrás —lo mueve un webhook, no esta
  // pantalla—, así que sin releer el panel envejece sin avisar y sigue
  // enseñando con confianza a quien ya no le toca.
  useEffect(() => {
    if (!hayProyecto) return undefined;
    const id = setInterval(cargar, 30000);
    return () => clearInterval(id);
  }, [cargar, hayProyecto]);

  /**
   * Reparte los prospectos que se quedaron sin dueño.
   *
   * Pasa cuando entra un lead sin nadie en el reparto —todos de ausencia, o
   * el proyecto sin gestores— y esos se quedan ahí sin que nada vuelva a
   * mirarlos. El endpoint ya existía y solo lo llamaba la baja de un usuario;
   * aquí es lo que el issue pide poder hacer a mano.
   */
  async function repartirLosSueltos() {
    if (!estado || !hayProyecto) return;
    const cuantos = estado.sin_responsable;
    // Toca la propiedad de fichas de otras personas. Se pregunta con el número
    // y entre cuántos van a repartirse, que es lo que decide si es lo que
    // querías o no.
    if (!window.confirm(
      `Se van a repartir ${cuantos} prospecto${cuantos > 1 ? 's' : ''} sin responsable `
      + `entre ${estado.gestores.length} del reparto.\n\n`
      + 'Se asignan por turno, igual que los nuevos. ¿Seguir?'
    )) return;

    setRepartiendo(true);
    try {
      const r = await client.post(`/leads/reassign-pending?projectId=${projectId}`, {});
      if (!r.success) throw new Error((r as { error?: string }).error || 'no se pudo');
      if (r.data?.reason === 'NO_ACTIVE_GESTORES') {
        // No es un fallo: es que hoy no hay a quién dárselos. Decirlo así evita
        // que se lea como que el botón está roto.
        toast({
          title: 'No hay nadie en el reparto',
          description: 'Los prospectos siguen sin responsable hasta que haya alguien disponible.',
          variant: 'destructive',
        });
      } else if (!r.data?.reassigned) {
        // El contador se lee cada 30 s: entre que sale el número y se pulsa,
        // otra persona pudo repartirlos. «0 repartidos · se han asignado por
        // turno» se contradice a sí mismo y hace dudar de si funcionó.
        toast({
          title: 'Ya no quedaba ninguno',
          description: 'Alguien los repartió antes, o entraron a un responsable por su cuenta.',
        });
      } else {
        toast({
          title: `${r.data.reassigned} repartidos`,
          description: 'Se han asignado por turno entre los gestores del reparto.',
        });
      }
      await cargar();
      onReasignado?.();
    } catch (e: any) {
      toast({ title: 'No se pudo repartir', description: e?.message, variant: 'destructive' });
    } finally { setRepartiendo(false); }
  }

  if (!hayProyecto) return null;

  // Si no se pudo leer, no se pinta nada. Enseñar el panel vacío se leería
  // como «no hay gestores», que es una respuesta distinta y falsa.
  if (fallo && !estado) return null;
  if (!estado) return null;

  const gestores = lista<Gestor>(estado.gestores);

  if (!gestores.length) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-200/60 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs">
        <WarningCircle size={15} weight="fill" className="text-amber-600 shrink-0 mt-px" />
        <span>
          <strong>Sin gestores en el reparto.</strong> Los prospectos que entren se
          quedarán sin responsable hasta que haya alguien. Puede ser que nadie
          tenga el proyecto asignado, o que hoy estén todos de ausencia o marcados
          como no disponibles.
          {estado.sin_responsable > 0 && (
            // El dato que convierte el aviso en algo accionable: ya hay fichas
            // paradas, no es un riesgo futuro.
            <> Ya hay <strong>{estado.sin_responsable}</strong> esperando.</>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-card shadow-sm px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 min-w-0">
          <Users size={15} weight="duotone" className="text-muted-foreground shrink-0" />
          <span className="text-[11px] font-medium text-muted-foreground shrink-0">
            Próximo prospecto
          </span>
          <ArrowRight size={13} className="text-muted-foreground shrink-0" />
          {estado.next_gestor ? (
            <span className="flex items-center gap-1.5 min-w-0">
              <Avatar g={estado.next_gestor} destacado />
              <span className="text-sm font-bold truncate">{estado.next_gestor.nombre}</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">nadie</span>
          )}
        </div>

        {estado.last_gestor && (
          <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-muted-foreground">
            <span className="shrink-0">Último:</span>
            <Avatar g={estado.last_gestor} />
            <span className="truncate">{estado.last_gestor.nombre}</span>
            {estado.last_assigned_at && <span className="shrink-0">· {hace(estado.last_assigned_at)}</span>}
            {estado.last_gestor.fuera_del_reparto && (
              // Recibió el último y hoy ya no está: de vacaciones, o se fue del
              // proyecto. Decirlo evita la lectura de «entonces le vuelve a tocar».
              <span className="shrink-0 italic">· ya no está en el reparto</span>
            )}
          </div>
        )}

        {/* Solo si hay algo que repartir y quien pueda hacerlo. Un botón que no
            actúa sobre nada solo sirve para dudar de si hizo algo. */}
        {estado.sin_responsable > 0 && can('leads.assign') && (
          <button
            type="button"
            onClick={repartirLosSueltos}
            disabled={repartiendo}
            title="Asigna por turno los prospectos que se quedaron sin responsable"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[11px] font-bold hover:bg-muted disabled:opacity-50 shrink-0"
          >
            <ArrowsClockwise size={12} className={repartiendo ? 'animate-spin' : ''} />
            {repartiendo
              ? 'Repartiendo…'
              : `Reasignar ${estado.sin_responsable} sin responsable`}
          </button>
        )}

        <div className="flex items-center gap-1 ml-auto flex-wrap">
          {gestores.map((g) => {
            const esElProximo = g.id === estado.next_gestor?.id;
            return (
              <span
                key={g.id}
                title={esElProximo ? `${g.nombre} — le toca el siguiente` : g.nombre}
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]
                  ${esElProximo
                    ? 'bg-primary/10 text-primary font-bold'
                    : 'text-muted-foreground'}`}
              >
                <Avatar g={g} destacado={esElProximo} />
                <span className="hidden lg:inline">{g.nombre.split(/\s+/)[0]}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
