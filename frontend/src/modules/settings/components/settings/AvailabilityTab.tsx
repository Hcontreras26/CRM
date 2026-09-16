import { useState } from 'react';
import { CalendarBlank, CheckCircle, XCircle, Clock, WarningCircle } from '@phosphor-icons/react';
import { avatarColorFor, getInitials } from '@/shared/lib/ui';
import useAvailabilityMap from '@/modules/users/hooks/useAvailabilityMap';
import AvailabilityDialog from '@/modules/users/components/AvailabilityDialog';
import { formatFecha, ROLE_LABELS } from '@/modules/users/lib/usersUi';
import type { AvailabilityUser } from '@/modules/users/api/availability.api';

/**
 * Vista de conjunto: quién está fuera hoy, de un vistazo.
 *
 * Gestionar a una persona concreta se hace desde el mismo diálogo que se abre
 * en la lista de Usuarios — antes eran dos sitios con dos comportamientos.
 */
export default function AvailabilityTab() {
  const { porUsuario, error, recargar } = useAvailabilityMap();
  const [seleccionado, setSeleccionado] = useState<AvailabilityUser | null>(null);

  const usuarios = [...porUsuario.values()];

  return (
    <div className="space-y-4">
      <div className="bg-info-soft border border-info/30 rounded-md p-3 text-xs flex items-start gap-2">
        <CalendarBlank size={16} className="text-primary flex-shrink-0 mt-0.5" weight="duotone" />
        <div>
          <p className="font-semibold text-foreground">Disponibilidad para el reparto</p>
          <p className="text-muted-foreground">
            Quien esté marcado <strong>no disponible</strong> o tenga una <strong>ausencia activa hoy</strong> se
            salta al asignar prospectos nuevos. El reparto sigue funcionando con el resto del equipo.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive-soft p-3 text-xs flex items-start gap-2">
          <WarningCircle size={15} weight="duotone" className="text-destructive flex-shrink-0 mt-px" />
          <div className="flex-1">
            <p className="text-destructive-soft-foreground">{error}</p>
            <button onClick={recargar} className="mt-1 font-semibold text-destructive-soft-foreground underline">
              Reintentar
            </button>
          </div>
        </div>
      )}

      {usuarios.length === 0 && !error ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Cargando…</div>
      ) : (
        <div className="bg-card border border-border rounded-lg divide-y">
          {usuarios.map((u) => {
            const bloqueado = !!u.bloque_activo;
            return (
              <div key={u.id} className={`p-4 flex items-center gap-3 flex-wrap ${!u.active ? 'opacity-60' : ''}`}>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${avatarColorFor(u.id)}`}>
                  {getInitials(u.nombre)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{u.nombre}</span>
                    <span className="text-secundario px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {ROLE_LABELS[u.role] || u.role}
                    </span>
                    {!u.active && (
                      <span className="text-secundario px-1.5 py-0.5 rounded bg-destructive-soft text-destructive-soft-foreground">
                        Inactivo
                      </span>
                    )}
                    {bloqueado && (
                      <span className="text-secundario px-1.5 py-0.5 rounded bg-warning-soft text-warning-soft-foreground inline-flex items-center gap-1">
                        <Clock size={10} weight="bold" />
                        Ausente hasta {formatFecha(u.bloque_activo!.fecha_fin)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  {!u.is_available && u.unavailable_reason && (
                    <p className="text-secundario text-warning-soft-foreground mt-0.5">Motivo: {u.unavailable_reason}</p>
                  )}
                </div>

                <span
                  className={`h-8 px-2.5 inline-flex items-center gap-1.5 rounded-md text-xs font-semibold border ${
                    u.is_available
                      ? 'bg-success-soft text-success-soft-foreground border-success/30'
                      : 'bg-destructive-soft text-destructive-soft-foreground border-destructive/30'
                  }`}
                >
                  {u.is_available
                    ? <><CheckCircle size={13} weight="duotone" /> Disponible</>
                    : <><XCircle size={13} weight="duotone" /> No disponible</>}
                </span>

                <button
                  type="button"
                  onClick={() => setSeleccionado(u)}
                  className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-xs font-medium border border-border bg-card hover:bg-muted"
                >
                  <CalendarBlank size={13} />
                  Gestionar
                  {u.bloques_futuros > 0 && (
                    <span className="text-secundario font-bold bg-primary/15 text-primary rounded-full px-1.5">
                      {u.bloques_futuros}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {seleccionado && (
        <AvailabilityDialog
          user={seleccionado}
          estadoInicial={seleccionado}
          onClose={() => setSeleccionado(null)}
          onChange={recargar}
        />
      )}
    </div>
  );
}
