import { useEffect, useState } from 'react';
import { UsersThree } from '@phosphor-icons/react';
import Casilla from '@/shared/components/ui/Casilla';
import { toast } from '@/shared/hooks/useToast';
import { getEquipoComercial, setEquipoComercial, type EquipoComercial as Equipo } from '../api/equipoComercial.api';

/**
 * «Equipo comercial a su cargo», en la ficha de una persona (Carlos, 09/11/2026).
 *
 * «Raquel pasa a ser administradora como Daniela: no recibe leads y puede ver
 * los leads y la gestión de las diferentes compañeras. Daniela puede ver todas.
 * Raquel podrá ver sus comerciales asignadas (pueden variar).»
 *
 * Con alguna gestora marcada, esta persona ve solo lo suyo y lo de ellas
 * (prospectos, ventas, facturas, informes y Claude). Sin ninguna, todo lo de
 * sus campus, como hasta ahora.
 *
 * Se ve si ya tiene equipo o si quien mira puede decidirlo
 * (`equipos.gestionar`, de serie solo el super admin). Sin el permiso, solo se
 * lee (lo dice el servidor en `puede_cambiar`: así el componente no depende de
 * la sesión del navegador). Se guarda con su propio botón, aparte del
 * formulario de la ficha.
 */
export default function EquipoComercial({ userId }: { userId: number }) {
  const [equipo, setEquipo] = useState<Equipo | null>(null);
  const [marcadas, setMarcadas] = useState<number[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    getEquipoComercial(userId)
      .then((e) => { if (vivo) { setEquipo(e); setMarcadas(e.gestora_ids); } })
      // Sin acceso o sin la migración: la sección no sale.
      .catch(() => { if (vivo) setEquipo(null); });
    return () => { vivo = false; };
  }, [userId]);

  if (!equipo) return null;
  const puedeCambiar = equipo.puede_cambiar === true;
  if (!puedeCambiar && equipo.gestora_ids.length === 0) return null;

  const cambiado = [...marcadas].sort().join(',') !== [...equipo.gestora_ids].sort().join(',');

  function alternar(id: number, marcar: boolean) {
    setMarcadas((prev) => (marcar ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  async function guardar() {
    setGuardando(true);
    try {
      const nuevo = await setEquipoComercial(userId, marcadas);
      setEquipo(nuevo);
      setMarcadas(nuevo.gestora_ids);
      toast({
        title: 'Equipo guardado',
        description: nuevo.gestora_ids.length
          ? 'A partir de ahora ve solo lo suyo y lo de las gestoras marcadas.'
          : 'Sin equipo: vuelve a ver todo lo de sus campus.',
      });
    } catch (err) {
      toast({ title: 'No se pudo guardar el equipo', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  }

  const delEquipo = equipo.gestoras.filter((g) => equipo.gestora_ids.includes(g.id));
  const lista = puedeCambiar ? equipo.gestoras : delEquipo;

  return (
    <section className="rounded-lg border border-border p-3" aria-labelledby={`equipo-comercial-${userId}`} data-testid="equipo-comercial">
      <h3 id={`equipo-comercial-${userId}`} className="flex items-center gap-1.5 text-sm font-medium">
        <UsersThree size={14} weight="bold" /> Equipo comercial a su cargo
      </h3>
      <p className="mt-0.5 text-secundario text-muted-foreground">
        {puedeCambiar
          ? 'Si marcas gestoras, esta persona verá solo sus prospectos, ventas y facturas y los de ellas. Sin ninguna marcada, ve todo lo de sus campus.'
          : 'Ve solo lo suyo y lo de estas gestoras.'}
      </p>

      {lista.length === 0 ? (
        <p className="mt-2 text-secundario text-muted-foreground">
          No hay gestoras en sus campus para ponerle.
        </p>
      ) : (
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {lista.map((g) => (
            <li key={g.id}>
              {puedeCambiar ? (
                <Casilla
                  id={`equipo-${userId}-${g.id}`}
                  marcada={marcadas.includes(g.id)}
                  onCambiar={(m) => alternar(g.id, m)}
                  deshabilitada={guardando}
                  etiqueta={<>{g.nombre}{!g.active && <span className="text-muted-foreground"> (desactivada)</span>}</>}
                  descripcion={g.email}
                />
              ) : (
                <span className="text-normal">
                  {g.nombre}{!g.active && <span className="text-muted-foreground"> (desactivada)</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {puedeCambiar && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={guardar}
            disabled={guardando || !cambiado}
            className="h-9 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar equipo'}
          </button>
        </div>
      )}
    </section>
  );
}
