import { useMemo } from 'react';
import { ArrowRight, CheckCircle } from '@phosphor-icons/react';
import Card from '@/shared/components/ui/Card';
import { getInitials } from '@/shared/lib/ui';
import { avatarColorFor } from '@/shared/lib/ui';
import { cuandoVence, diasHasta } from '@/shared/lib/fechas';
import { cn } from '@/shared/lib/utils';

/**
 * Lo que vence pronto, del más atrasado al que viene.
 *
 * Nació como «Siguientes acciones» de prospectos: la tabla va ordenada por
 * fecha, que sirve para buscar a alguien y es lo peor para empezar el día
 * —lo urgente queda repartido por las siete páginas—. Esto saca los primeros
 * por urgencia y ya está: no es otra tabla, es por dónde empezar.
 *
 * Vale igual para las cuotas de un cliente, que es la misma pregunta con otro
 * nombre. Lo único que cambia es qué se le pasa.
 */

export interface Vencimiento {
  id: number;
  /** Lo que se lee en grande. El nombre de quien sea. */
  titulo: string | null | undefined;
  /** La línea de debajo: la gestora, el producto, lo que aclare la fila. */
  subtitulo?: string | null;
  /** Cuándo vence. Sin ella, la fila no entra. */
  fecha?: string | null;
}

export default function ListaDeVencimientos({
  titulo,
  descripcion,
  items,
  onAbrir,
  onVerTodos,
  textoVerTodos = 'Ver todos',
  textoVacio,
  maximo = 5,
  ventanaDias = 7,
}: {
  titulo: string;
  descripcion: string;
  items: Vencimiento[];
  onAbrir?: (id: number) => void;
  onVerTodos?: () => void;
  textoVerTodos?: string;
  textoVacio: string;
  maximo?: number;
  ventanaDias?: number;
}) {
  const cola = useMemo(() => (
    items
      .map((it) => ({ it, dias: diasHasta(it.fecha) }))
      .filter((x): x is { it: Vencimiento; dias: number } => x.dias !== null)
      // Lo más vencido primero: es lo que lleva más tiempo esperando.
      .sort((a, b) => a.dias - b.dias)
      .filter((x) => x.dias <= ventanaDias)
      .slice(0, maximo)
      .map((x) => x.it)
  ), [items, maximo, ventanaDias]);

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-seccion">{titulo}</h2>
          <p className="text-secundario text-muted-foreground">{descripcion}</p>
        </div>
        {onVerTodos && (
          <button
            type="button"
            onClick={onVerTodos}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-secundario font-semibold hover:bg-muted"
          >
            {textoVerTodos} <ArrowRight size={12} weight="bold" />
          </button>
        )}
      </div>

      {cola.length === 0 ? (
        <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <CheckCircle size={28} weight="duotone" className="text-success" />
          <p className="text-secundario text-muted-foreground">{textoVacio}</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {cola.map((it) => {
            const c = cuandoVence(it.fecha);
            // Sin sitio al que ir, la fila no finge que se puede pulsar.
            const Fila = onAbrir ? 'button' : 'div';
            return (
              <li key={it.id}>
                <Fila
                  {...(onAbrir ? { type: 'button' as const, onClick: () => onAbrir(it.id) } : {})}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                    onAbrir && 'hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/40',
                  )}
                >
                  <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold', avatarColorFor(it.id))}>
                    {getInitials(it.titulo)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-normal font-medium">{it.titulo || 'Sin nombre'}</span>
                    {it.subtitulo && (
                      <span className="block truncate text-secundario text-muted-foreground">{it.subtitulo}</span>
                    )}
                  </span>
                  <span className={cn('shrink-0 text-secundario font-semibold', c.urgente ? 'text-destructive' : 'text-muted-foreground')}>
                    {c.texto}
                  </span>
                </Fila>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
