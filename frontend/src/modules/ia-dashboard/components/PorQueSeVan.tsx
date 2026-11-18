import { ChatCircleText } from '@phosphor-icons/react';

/**
 * Por qué se van, en el dashboard de un proyecto IA (#44).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTE BLOQUE Y NO OTRO NÚMERO MÁS
 *
 * De todo lo que se mira de retención, esto es lo único **accionable**. Que el
 * churn sea del 8 % no se puede arreglar; que cuatro de cada diez digan «no lo
 * uso suficiente» sí — y apunta a un sitio distinto que si dijeran «es
 * demasiado caro».
 *
 * Los motivos son los de Stripe, los mismos que ya enseña el panel de cada
 * proyecto. No se inventa una clasificación nueva: se lee la que se usa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE NO SE ESCONDE
 *
 * Quien canceló sin decir nada sale como «No lo dijo», con su barra. Si de 24
 * bajas 20 no dijeron nada, el reparto de las otras 4 no representa a nadie, y
 * eso hay que poder verlo ANTES de sacar conclusiones — que es exactamente
 * cuando se sacan.
 *
 * Y los comentarios escritos a mano se enseñan sueltos, sin agregar: son de
 * cada persona, y meterlos en un porcentaje los convierte en otra cosa.
 */

interface Motivo {
  clave: string;
  etiqueta: string;
  bajas: number;
  pct: number;
}

interface Comentario {
  cuando: string | null;
  motivo: string | null;
  comentario: string | null;
}

/** Un color por motivo, estable: el mismo motivo, el mismo color cada mes. */
const COLOR: Record<string, string> = {
  unused: 'bg-emerald-500',
  missing_features: 'bg-blue-500',
  switched_service: 'bg-pink-500',
  too_expensive: 'bg-orange-500',
  too_complex: 'bg-amber-500',
  low_quality: 'bg-rose-500',
  customer_service: 'bg-violet-500',
  other: 'bg-purple-500',
  sin_motivo: 'bg-muted-foreground/40',
};

export default function PorQueSeVan({
  datos,
  comentarios = [],
}: {
  datos?: { total: number; motivos: Motivo[] } | null;
  comentarios?: Comentario[];
}) {
  // Sin bajas este mes no se pinta un cuadro vacío: es una buena noticia y no
  // necesita media pantalla para decirla.
  if (!datos || datos.total === 0) return null;

  const sinMotivo = datos.motivos.find((m) => m.clave === 'sin_motivo');
  const callaronCasiTodos = sinMotivo ? sinMotivo.pct >= 60 : false;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold">Por qué se van</h3>
        <span className="text-[11px] text-muted-foreground">
          {datos.total} {datos.total === 1 ? 'baja' : 'bajas'} este mes
        </span>
      </div>

      {callaronCasiTodos && (
        <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
          La mayoría se fue sin decir por qué. Lo de abajo describe a los pocos que
          contestaron, no a todos los que se han ido.
        </p>
      )}

      <ul className="space-y-2">
        {datos.motivos.map((m) => (
          <li key={m.clave}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className={m.clave === 'sin_motivo' ? 'text-muted-foreground' : ''}>
                {m.etiqueta}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {m.bajas} · {m.pct} %
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${COLOR[m.clave] || 'bg-primary'}`}
                style={{ width: `${Math.max(m.pct, 2)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>

      {comentarios.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Lo que escribieron
          </p>
          <ul className="space-y-2">
            {comentarios.map((c, i) => (
              <li key={i} className="flex gap-2 text-[11px]">
                <ChatCircleText size={13} className="mt-0.5 flex-shrink-0 text-muted-foreground" />
                <span>
                  <span className="text-muted-foreground">{c.cuando}{c.motivo ? ` · ${c.motivo}` : ''} — </span>
                  {c.comentario}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
