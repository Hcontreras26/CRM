import { useMemo, useState } from 'react';
import { CaretDown, MagnifyingGlass } from '@phosphor-icons/react';
import { cn } from '@/shared/lib/utils';
import type { Catalogo, Origen } from '../api/permissions.api';
import { clavesDeSeccion, filtrar } from '../lib/permisos';

const NOMBRE_ROL: Record<string, string> = {
  superadmin: 'Superadmin', admin: 'Admin', gestor: 'Gestora', soporte: 'Soporte',
  project_manager: 'Project manager', tutor: 'Tutor', colaborador: 'Colaborador',
};

/** De dónde le viene un permiso, en una etiqueta corta. */
export function textoDeOrigen(o: Origen | undefined): string {
  if (!o) return '';
  switch (o.tipo) {
    case 'superadmin': return 'Superadmin';
    case 'rol': return `Su rol: ${NOMBRE_ROL[o.rol] || o.rol}`;
    case 'ajuste_rol': return `Su rol (cambiado en Roles): ${NOMBRE_ROL[o.rol] || o.rol}`;
    case 'rol_a_medida': return `Rol a medida: ${o.nombre}`;
    case 'excepcion': return 'Excepción suya';
    case 'nunca': return 'Su rol no puede tenerlo';
    default: return '';
  }
}

export { NOMBRE_ROL };

export type Eleccion = 'rol' | 'si' | 'no';

/**
 * La lista de permisos de una persona, agrupada como en Roles (#423, #694):
 * cada permiso, si lo tiene, de dónde le viene y —quien puede— su excepción
 * («Como su rol · Sí · No»). La usan la ficha de una persona, el alta de un
 * usuario (antes de crearlo) y el diálogo de permisos.
 *
 * `puedeDar(clave)`: si quien edita puede dar ese «Sí». Nadie da lo que no
 * tiene; el servidor lo vuelve a comprobar.
 */
export default function ListaDePermisos({
  catalogo, mapa, origenes, excepciones, puedeEditar, ocupado = false, onElegir, puedeDar = () => true,
}: {
  catalogo: Catalogo;
  mapa: Record<string, boolean>;
  origenes: Record<string, Origen>;
  excepciones: Record<string, boolean>;
  puedeEditar: boolean;
  ocupado?: boolean;
  onElegir?: (clave: string, e: Eleccion) => void;
  puedeDar?: (clave: string) => boolean;
}) {
  const [texto, setTexto] = useState('');
  const [soloLoQuePuede, setSoloLoQuePuede] = useState(true);
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});

  const secciones = useMemo(() => {
    const base = filtrar(catalogo, texto);
    if (!soloLoQuePuede) return base;
    return base
      .map((s) => ({ ...s, recursos: s.recursos.map((r) => ({ ...r, acciones: r.acciones.filter((a) => mapa[a.clave] || a.clave in excepciones) })).filter((r) => r.acciones.length) }))
      .filter((s) => s.recursos.length);
  }, [catalogo, mapa, excepciones, texto, soloLoQuePuede]);

  const buscando = texto.trim().length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          {/* Dentro del formulario de la ficha: Intro no tiene que guardarla. */}
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar un permiso" aria-label="Buscar un permiso"
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-normal" />
        </div>
        <label className="flex items-center gap-2 text-secundario">
          <input type="checkbox" checked={soloLoQuePuede} onChange={(e) => setSoloLoQuePuede(e.target.checked)} className="h-4 w-4 accent-primary" />
          Solo lo que puede
        </label>
      </div>

      <div className="space-y-2">
        {secciones.map((s) => {
          const abierta = buscando || abiertas[s.clave] === true;
          return (
            <section key={s.clave} className="rounded-xl border border-border">
              <button type="button" aria-expanded={abierta} onClick={() => setAbiertas((a) => ({ ...a, [s.clave]: !abierta }))}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left">
                <CaretDown size={14} weight="bold" className={cn('transition-transform', !abierta && '-rotate-90')} />
                <span className="font-semibold">{s.nombre}</span>
                <span className="text-secundario text-muted-foreground">
                  {clavesDeSeccion(s).filter((k) => mapa[k]).length} de {clavesDeSeccion(s).length}
                </span>
              </button>
              {abierta && (
                <ul className="divide-y divide-border border-t border-border">
                  {s.recursos.flatMap((r) => r.acciones.map((a) => {
                    const puede = mapa[a.clave] === true;
                    const eleccion: Eleccion = a.clave in excepciones ? (excepciones[a.clave] ? 'si' : 'no') : 'rol';
                    const nunca = origenes[a.clave]?.tipo === 'nunca';
                    return (
                      <li key={a.clave} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="text-normal">
                            <span className={cn('mr-1.5 inline-block w-4 text-center font-bold', puede ? 'text-success' : 'text-muted-foreground')} aria-label={puede ? 'Puede' : 'No puede'}>
                              {puede ? '✓' : '–'}
                            </span>
                            <span className="text-muted-foreground">{r.nombre} · </span>{a.nombre}
                          </p>
                          <p className="pl-5 text-secundario text-muted-foreground">{textoDeOrigen(origenes[a.clave]) || a.descripcion}</p>
                        </div>
                        {puedeEditar && onElegir && (
                          <div role="radiogroup" aria-label={`Excepción para ${a.nombre}`} className="flex overflow-hidden rounded-lg border border-border text-secundario">
                            {([['rol', 'Como su rol'], ['si', 'Sí'], ['no', 'No']] as const).map(([v, t]) => {
                              // «Sí» no se ofrece si su rol no puede tenerlo o si quien edita no lo tiene.
                              const noSePuede = v === 'si' && eleccion !== 'si' && (nunca || !puedeDar(a.clave));
                              return (
                                <button key={v} type="button" role="radio" aria-checked={eleccion === v} disabled={ocupado || noSePuede}
                                  title={noSePuede ? (nunca ? 'Su rol no puede tenerlo' : 'No lo puedes dar: tú no lo tienes') : undefined}
                                  onClick={() => eleccion !== v && onElegir(a.clave, v)}
                                  className={cn('px-2.5 py-1 font-semibold disabled:opacity-40', eleccion === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                                  {t}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    );
                  }))}
                </ul>
              )}
            </section>
          );
        })}
        {secciones.length === 0 && <p className="py-4 text-center text-normal text-muted-foreground">Nada que enseñar con este filtro.</p>}
      </div>
    </div>
  );
}
