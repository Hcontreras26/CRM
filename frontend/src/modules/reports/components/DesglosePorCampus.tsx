/**
 * NO ESTÁ MONTADO. Lo quitó Diego el 24/09: «en informes está esto duplicado,
 * hay muchos datos duplicados y llamados varias veces».
 *
 * Enseñaba la misma tabla que «Cuánto pone cada proyecto» de la propia pantalla
 * de informes --mismas columnas, mismas cifras-- y, para componerla, pedía
 * `/informes/overview` una vez por campus: siete peticiones en CEDIA para
 * recomponer algo que ya venía servido en `por_proyecto`.
 *
 * Se conserva por UNA cosa que la otra tabla no hace: avisar del descuadre
 * entre la suma de los campus y el cobrado de la sociedad. Si esa comprobación
 * se lleva a la tabla que se queda, este fichero se puede borrar.
 */
import { useEffect, useMemo, useState } from 'react';
import { Buildings, Warning } from '@phosphor-icons/react';
import client from '@/shared/api/client';
import { cn } from '@/shared/lib/utils';

/**
 * De dónde salen las cifras de una sociedad, campus a campus.
 *
 * «Separar métricas en plan: cuántas ventas son de Psiko, ISEIH, y así por los
 * proyectos que tenga la empresa» (#125). Mirando CEDIA, el total no basta:
 * 120.409 € en bloque no dicen de dónde vienen, y sin eso no se puede decidir
 * nada — ni felicitar a nadie, ni ir a mirar qué pasa en el que ha bajado.
 *
 * Se pide un informe por campus. El servidor no da el reparto hecho, pero sí da
 * el de cada proyecto, así que se piden todos a la vez y se compone aquí. Para
 * las seis o siete marcas de una sociedad es una llamada por marca, en
 * paralelo: no se nota.
 *
 * LA SUMA SE COMPRUEBA SOLA. Si el total de los campus no cuadra con el que da
 * el servidor para la sociedad, se dice. Es exactamente la comprobación que
 * pedía el #120 —«que las cifras sean la suma de sus campus»— y ahora la hace
 * la pantalla en cada carga en vez de alguien a mano.
 */

interface Campus { id: number; nombre: string }

interface Fila {
  id: number;
  nombre: string;
  prospectos: number;
  ventas: number;
  brutas: number;
  cobrado: number;
}

const euros = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

export default function DesglosePorCampus({
  campus,
  from,
  to,
  /** El total que da el servidor para la sociedad entera, si se conoce. */
  cobradoDeLaSociedad,
}: {
  campus: Campus[];
  from: string;
  to: string;
  cobradoDeLaSociedad?: number | null;
}) {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    if (campus.length === 0) { setFilas([]); setCargando(false); return undefined; }
    setCargando(true);
    setError(false);

    Promise.all(campus.map(async (c) => {
      const p = new URLSearchParams({ projectId: String(c.id), from, to });
      try {
        const r = await client.get(`/informes/overview?${p.toString()}`);
        const d = r?.data || {};
        return {
          id: c.id,
          nombre: c.nombre,
          prospectos: Number(d.leads?.total) || 0,
          ventas: Number(d.conversions?.total) || 0,
          brutas: Number(d.conversions?.ventas_brutas) || 0,
          cobrado: Number(d.conversions?.cobrado) || 0,
        } as Fila;
      } catch {
        // Un campus que falla no puede tumbar el reparto entero: sale a cero y
        // el aviso de descuadre lo delata.
        return { id: c.id, nombre: c.nombre, prospectos: 0, ventas: 0, brutas: 0, cobrado: 0 } as Fila;
      }
    }))
      .then((rs) => { if (vivo) setFilas(rs); })
      .catch(() => { if (vivo) { setFilas([]); setError(true); } })
      .finally(() => { if (vivo) setCargando(false); });

    return () => { vivo = false; };
  }, [campus, from, to]);

  const { ordenadas, totales, descuadre } = useMemo(() => {
    const ord = [...filas].sort((a, b) => b.cobrado - a.cobrado);
    const t = filas.reduce(
      (acc, f) => ({
        prospectos: acc.prospectos + f.prospectos,
        ventas: acc.ventas + f.ventas,
        brutas: acc.brutas + f.brutas,
        cobrado: acc.cobrado + f.cobrado,
      }),
      { prospectos: 0, ventas: 0, brutas: 0, cobrado: 0 },
    );
    // Un euro de diferencia es redondeo; mas es que algo no cuadra.
    const desc = cobradoDeLaSociedad != null && Math.abs(t.cobrado - cobradoDeLaSociedad) > 1
      ? Math.abs(t.cobrado - cobradoDeLaSociedad)
      : 0;
    return { ordenadas: ord, totales: t, descuadre: desc };
  }, [filas, cobradoDeLaSociedad]);

  if (campus.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-2.5">
        <Buildings size={17} weight="regular" className="mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="text-seccion">De dónde vienen estas cifras</h3>
          <p className="text-secundario text-muted-foreground">
            El reparto por campus. Los totales de arriba son la suma de esta tabla.
          </p>
        </div>
      </div>

      {cargando ? (
        <div className="mt-4 space-y-1.5" aria-busy="true">
          {campus.map((c) => <div key={c.id} className="h-9 animate-pulse rounded-md bg-muted/40" />)}
        </div>
      ) : error ? (
        <p role="alert" className="mt-4 text-normal text-muted-foreground">
          No se ha podido componer el reparto por campus.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-normal">
            <thead>
              <tr className="border-b border-border text-tabla uppercase text-muted-foreground">
                <th className="py-2 pr-3 text-left font-semibold">Campus</th>
                <th className="py-2 px-3 text-right font-semibold">Prospectos</th>
                <th className="py-2 px-3 text-right font-semibold">Ventas</th>
                <th className="py-2 px-3 text-right font-semibold">Facturado</th>
                <th className="py-2 pl-3 text-right font-semibold">Cobrado</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((f) => (
                <tr key={f.id} className="border-b border-border/60 last:border-0">
                  <td className="py-2 pr-3 truncate">{f.nombre}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{f.prospectos}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{f.ventas}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{euros(f.brutas)}</td>
                  <td className="py-2 pl-3 text-right tabular-nums font-semibold">{euros(f.cobrado)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="py-2 pr-3">Total</td>
                <td className="py-2 px-3 text-right tabular-nums">{totales.prospectos}</td>
                <td className="py-2 px-3 text-right tabular-nums">{totales.ventas}</td>
                <td className="py-2 px-3 text-right tabular-nums">{euros(totales.brutas)}</td>
                <td className="py-2 pl-3 text-right tabular-nums">{euros(totales.cobrado)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {descuadre > 0 && (
        // Que no cuadre importa mas que las propias cifras: significa que una
        // de las dos —la de arriba o esta— esta contando otra cosa.
        <p
          role="alert"
          className={cn(
            'mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-soft',
            'px-3 py-2 text-secundario text-warning-soft-foreground',
          )}
        >
          <Warning size={14} weight="fill" className="mt-0.5 shrink-0" />
          <span>
            La suma de los campus se lleva <strong>{euros(descuadre)}</strong> con el total de la sociedad.
            Una de las dos cifras está contando algo que la otra no.
          </span>
        </p>
      )}
    </section>
  );
}
