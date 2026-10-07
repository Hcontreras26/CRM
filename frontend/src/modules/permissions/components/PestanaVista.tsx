import { useEffect, useState } from 'react';
import { Lock, FloppyDisk, ArrowCounterClockwise, House, EyeSlash, SquaresFour } from '@phosphor-icons/react';
import { RUTAS_ATERRIZAJE } from '@/shared/lib/rutasAterrizaje';
import { toast } from '@/shared/hooks/useToast';
import * as api from '../api/permissions.api';
import type { RoleView, SystemDefaults } from '../api/permissions.api';

/**
 * La vista con la que arranca un rol. Tarea #7, parte 4.
 *
 * Tres cosas: donde aterriza al entrar, que se le esconde del menu y que
 * bloques ve en el dashboard. Los cuatro roles fijos se muestran pero no se
 * tocan — viven en el codigo del backend, y el PUT responde 400 si se intenta.
 * Por eso a esos ni se les pinta el boton de guardar.
 *
 * El catalogo (elementos del menu, widgets) llega del backend. Copiarlo aqui es
 * exactamente como empezo el lio de `leads.read` contra `leads.view`.
 */

interface Props {
  roleKey: string;
  esFijo: boolean;
  customId?: number;
  defaults: SystemDefaults | null;
}

const vacia: RoleView = { default_route: '/', hidden_sidebar_items: [], dashboard_widgets: [], compact_sidebar: false };

const mismaLista = (a?: string[], b?: string[]) =>
  JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());

/** Si no hay nada que guardar, el boton se queda apagado. */
const iguales = (a: RoleView, b: RoleView) =>
  a.default_route === b.default_route
  && !!a.compact_sidebar === !!b.compact_sidebar
  && mismaLista(a.hidden_sidebar_items, b.hidden_sidebar_items)
  && mismaLista(a.dashboard_widgets, b.dashboard_widgets);

export default function PestanaVista({ roleKey, esFijo, customId, defaults }: Props) {
  const [original, setOriginal] = useState<RoleView>(vacia);
  const [vista, setVista] = useState<RoleView>(vacia);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    (async () => {
      try {
        const v = await api.getRoleView(esFijo ? roleKey : (customId as number));
        if (!cancelado) { setOriginal(v); setVista(v); }
      } catch {
        // Un rol recien creado puede no tener vista propia todavia.
        if (!cancelado) { setOriginal(vacia); setVista(vacia); }
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [roleKey, esFijo, customId]);

  const sucio = !iguales(original, vista);

  function alterna(campo: 'hidden_sidebar_items' | 'dashboard_widgets', id: string) {
    setVista((v) => {
      const lista = v[campo] || [];
      return { ...v, [campo]: lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id] };
    });
  }

  async function guardar() {
    if (!customId) return;
    setGuardando(true);
    try {
      const guardada = await api.setRoleView(customId, vista);
      setOriginal(guardada);
      setVista(guardada);
      toast({ title: 'Vista guardada', description: 'Sus usuarios la veran la proxima vez que entren.' });
    } catch (e: any) {
      toast({
        title: 'No se pudo guardar',
        description: e?.response?.data?.error || 'Intentalo de nuevo.',
        variant: 'destructive',
      });
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <p className="text-sm text-muted-foreground text-center py-10">Cargando la vista…</p>;

  const escondidos = vista.hidden_sidebar_items || [];
  const widgets = vista.dashboard_widgets || [];
  const itemsMenu = defaults?.catalogs.sidebar_items || [];
  const itemsWidgets = defaults?.catalogs.dashboard_widgets || [];

  return (
    <div className="space-y-5">
      {esFijo && (
        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground">
          <Lock size={14} className="flex-shrink-0 mt-0.5" />
          <p>
            Los cuatro roles del sistema traen su vista de fabrica y no se editan desde aqui.
            Para una a medida, crea un rol propio.
          </p>
        </div>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
          <House size={13} weight="bold" /> Donde entra
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {RUTAS_ATERRIZAJE.map((r) => {
            const elegida = (vista.default_route || '/') === r.ruta;
            return (
              <button
                key={r.ruta}
                type="button"
                disabled={esFijo}
                onClick={() => setVista((v) => ({ ...v, default_route: r.ruta }))}
                className={`text-left p-2.5 rounded-lg border transition-colors disabled:cursor-not-allowed ${
                  elegida ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50 disabled:hover:bg-card'
                } ${esFijo && !elegida ? 'opacity-50' : ''}`}
              >
                <span className="block text-sm font-semibold">{r.label}</span>
                <span className="block text-[11px] text-muted-foreground">{r.pista}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
          <EyeSlash size={13} weight="bold" /> Que no ve en el menu
          <span className="font-normal normal-case text-[11px]">
            ({escondidos.length} de {itemsMenu.length} escondidos)
          </span>
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {itemsMenu.map((it) => {
            const oculto = escondidos.includes(it.id);
            return (
              <button
                key={it.id}
                type="button"
                disabled={esFijo}
                onClick={() => alterna('hidden_sidebar_items', it.id)}
                className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                  oculto
                    ? 'border-destructive/30 bg-destructive-soft text-destructive-soft-foreground line-through'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted'
                } ${esFijo ? 'opacity-70' : ''}`}
              >
                {it.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5">
          <SquaresFour size={13} weight="bold" /> Bloques del dashboard
          <span className="font-normal normal-case text-[11px]">({widgets.length} activos)</span>
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {itemsWidgets.map((w) => {
            const activo = widgets.includes(w.id);
            return (
              <button
                key={w.id}
                type="button"
                disabled={esFijo}
                onClick={() => alterna('dashboard_widgets', w.id)}
                className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                  activo
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted'
                } ${esFijo ? 'opacity-70' : ''}`}
              >
                {w.label}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <label className={`flex items-center gap-2.5 text-sm ${esFijo ? 'opacity-70' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            disabled={esFijo}
            checked={!!vista.compact_sidebar}
            onChange={(e) => setVista((v) => ({ ...v, compact_sidebar: e.target.checked }))}
            className="w-4 h-4 rounded border-border accent-primary"
          />
          <span>
            Menu estrecho al entrar
            <span className="block text-[11px] text-muted-foreground">Solo los iconos, sin los nombres.</span>
          </span>
        </label>
      </section>

      {!esFijo && (
        <div className="flex items-center gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={guardar}
            disabled={!sucio || guardando}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FloppyDisk size={14} weight="bold" /> {guardando ? 'Guardando…' : 'Guardar vista'}
          </button>
          {sucio && (
            <button
              type="button"
              onClick={() => setVista(original)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted"
            >
              <ArrowCounterClockwise size={14} /> Descartar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
