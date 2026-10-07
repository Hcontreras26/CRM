import { useEffect, useState } from 'react';
import { EyeSlash, SquaresFour, Lock } from '@phosphor-icons/react';
import { useAuth } from '@/contexts/AuthContext';
import { getSystemDefaults } from '@/modules/permissions/api/permissions.api';

/**
 * Mi vista: lo que cada uno se esconde por su cuenta. Tarea #7, parte 5.
 *
 * Ojo con como guarda esto el backend. `user_views.hidden_sidebar_items`
 * SUSTITUYE la lista del rol, no se suma a ella. O sea que si un gestor se
 * escondiera una sola cosa suya, reapareceria todo lo que le esconde el rol
 * —Contabilidad, Nominas, Usuarios…— porque su lista de uno pisaria la de
 * siete. Por eso aqui se guarda siempre la UNION, y lo que esconde el rol se
 * muestra bloqueado: es un recorte, no algo que uno pueda deshacerse.
 *
 * Con los bloques del dashboard pasa lo mismo al reves: la lista del rol es lo
 * que se PUEDE ver, y aqui se elige un subconjunto. Dejarlos todos apagados
 * equivale a no tener preferencia, y vuelve a mandar el rol.
 */

export default function MiVista({ preferences, update }) {
  const { view } = useAuth();
  const [catalogos, setCatalogos] = useState(null);

  useEffect(() => {
    let cancelado = false;
    getSystemDefaults()
      .then((d) => { if (!cancelado) setCatalogos(d.catalogs); })
      .catch(() => {});
    return () => { cancelado = true; };
  }, []);

  const delRol = view?.hidden_sidebar_items || [];
  const escondidos = preferences.hidden_sidebar_items || [];
  // Lo que se ha escondido uno mismo: lo guardado menos lo que ya recorta el rol.
  const mios = escondidos.filter((id) => !delRol.includes(id));

  const permitidos = view?.dashboard_widgets || [];
  const misBloques = preferences.dashboard_widgets || [];

  function alternaMenu(id) {
    if (delRol.includes(id)) return;               // eso no se toca
    const siguientes = mios.includes(id) ? mios.filter((x) => x !== id) : [...mios, id];
    update({ hidden_sidebar_items: [...new Set([...delRol, ...siguientes])] });
  }

  function alternaBloque(id) {
    const base = misBloques.length ? misBloques : permitidos;
    update({ dashboard_widgets: base.includes(id) ? base.filter((x) => x !== id) : [...base, id] });
  }

  const itemsMenu = catalogos?.sidebar_items || [];
  const itemsBloques = (catalogos?.dashboard_widgets || []).filter((w) => permitidos.includes(w.id));

  return (
    <>
      <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <EyeSlash size={18} weight="duotone" className="text-primary" />
          <h3 className="font-bold">Lo que no quiero en el menú</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Marca lo que prefieres no ver. Lo que ya te recorta tu rol sale con candado y no se puede recuperar desde aquí.
        </p>

        {!catalogos ? (
          <p className="text-sm text-muted-foreground italic">Cargando el menú…</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {itemsMenu.map((it) => {
              const porElRol = delRol.includes(it.id);
              const porMi = mios.includes(it.id);
              return (
                <button
                  key={it.id}
                  type="button"
                  disabled={porElRol}
                  onClick={() => alternaMenu(it.id)}
                  title={porElRol ? 'Lo esconde tu rol' : undefined}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                    porElRol
                      ? 'border-border bg-muted/50 text-muted-foreground/60 line-through cursor-not-allowed'
                      : porMi
                        ? 'border-destructive/30 bg-destructive-soft text-destructive-soft-foreground line-through'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {porElRol && <Lock size={10} weight="bold" />}
                  {it.label}
                </button>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          {mios.length === 0
            ? 'No has escondido nada tú.'
            : `Escondes ${mios.length} además de lo que recorta tu rol.`}
        </p>
      </div>

      {itemsBloques.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <SquaresFour size={18} weight="duotone" className="text-primary" />
            <h3 className="font-bold">Bloques de mi dashboard</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            De los que trae tu rol, quédate con los que uses. Si los apagas todos, vuelven todos.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {itemsBloques.map((w) => {
              const activo = misBloques.length ? misBloques.includes(w.id) : true;
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => alternaBloque(w.id)}
                  className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
                    activo
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {w.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
