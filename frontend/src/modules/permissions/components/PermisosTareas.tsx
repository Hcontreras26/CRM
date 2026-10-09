import { useEffect, useState } from 'react';
import { ArrowCounterClockwise, FloppyDisk, Kanban } from '@phosphor-icons/react';
import { toast } from '@/shared/hooks/useToast';
import * as api from '../api/permissions.api';

/**
 * Los permisos de Tareas que se editan por rol (Diego, 08/10, #210): «Aprobar
 * y cerrar» y «Configurar». Los cambian el superadmin y el admin (09/10).
 *
 * El servidor guarda solo lo que se aparta del valor por defecto del rol (o lo
 * fusiona en el JSON de un rol a medida) y cada persona lo recibe en /auth/me:
 * `can()` ya da prioridad a ese mapa, así que no hay que tocar nada más.
 */

// Las dos que se cambian por rol, con lo que hace cada una.
const CLAVES: ReadonlyArray<{ clave: string; nombre: string; ayuda: string }> = [
  { clave: 'tasks.close', nombre: 'Aprobar y cerrar', ayuda: 'Aprobar o devolver desde «Por revisar», y cerrar o reabrir' },
  { clave: 'tasks.manage', nombre: 'Configurar', ayuda: 'Columnas, áreas y proyectos propios del tablero' },
];

type Mapa = Record<string, boolean>;

const iguales = (a: Mapa, b: Mapa) => CLAVES.every(({ clave }) => !!a[clave] === !!b[clave]);

interface Props {
  /** `admin`, `gestor`… o `custom:<id>`. */
  roleKey: string;
  onGuardado?: () => void;
}

export default function PermisosTareas({ roleKey, onGuardado }: Props) {
  const [original, setOriginal] = useState<Mapa | null>(null);
  const [mapa, setMapa] = useState<Mapa>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setOriginal(null);
    setError(null);
    api.getRolePermissions(roleKey)
      .then((p) => { if (!cancelado) { setOriginal(p); setMapa(p); } })
      .catch((err: unknown) => { if (!cancelado) setError(err instanceof Error ? err.message : 'No se pudieron cargar'); });
    return () => { cancelado = true; };
  }, [roleKey]);

  const sucio = !!original && !iguales(original, mapa);

  async function guardar() {
    setGuardando(true);
    try {
      const nuevos = await api.saveRolePermissions(roleKey, mapa);
      setOriginal(nuevos);
      setMapa(nuevos);
      toast({ title: 'Permisos de Tareas guardados', description: 'Cada persona los tendrá al volver a cargar el CRM.' });
      onGuardado?.();
    } catch (err: unknown) {
      toast({ title: 'No se pudieron guardar', description: err instanceof Error ? err.message : '', variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="rounded-xl border border-border p-3 space-y-3">
      <header>
        <h3 className="text-sm font-bold flex items-center gap-1.5"><Kanban size={15} weight="bold" /> Tareas</h3>
        <p className="text-[11px] text-muted-foreground">
          Lo que puede hacer este rol en el tablero. Lo que se cambie aquí manda también en el servidor.
        </p>
      </header>

      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : !original ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {CLAVES.map(({ clave, nombre, ayuda }) => (
            <label key={clave} className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!mapa[clave]}
                onChange={(e) => setMapa((m) => ({ ...m, [clave]: e.target.checked }))}
                className="mt-0.5 w-4 h-4 rounded border-border accent-primary"
              />
              <span>
                {nombre}
                <span className="block text-[11px] text-muted-foreground">{ayuda}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 pt-3 border-t border-border">
        <button
          type="button"
          onClick={guardar}
          disabled={!sucio || guardando}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FloppyDisk size={14} weight="bold" /> {guardando ? 'Guardando…' : 'Guardar permisos de Tareas'}
        </button>
        {sucio && original && (
          <button
            type="button"
            onClick={() => setMapa(original)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted"
          >
            <ArrowCounterClockwise size={14} /> Descartar
          </button>
        )}
      </div>
    </section>
  );
}
