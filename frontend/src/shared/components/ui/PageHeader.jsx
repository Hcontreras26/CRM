import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { CaretLeft } from '@phosphor-icons/react';
import { useCabecera } from '@/shared/components/layout/CabeceraContext';
import { cn } from '@/shared/lib/utils';

/**
 * PageHeader — la cabecera de una pantalla.
 *
 * Ya no se pinta donde se la pone: se pinta arriba, en la barra del marco. Por
 * eso las 58 pantallas que ya la usaban no hay que tocarlas — siguen
 * escribiendo lo mismo y ahora sale en el sitio bueno, y con la misma forma en
 * todas.
 *
 * El motivo: el titulo vivia dentro del contenido, uno por pantalla y cada uno
 * a su manera. Con una cabecera arriba salia dos veces, y adaptar ochenta
 * ficheros a mano es exactamente lo que hace que la pantalla 40 no se parezca
 * a la 3.
 *
 * Fuera del marco —acceso, poner contrasena, formulario embebido— no hay barra
 * donde meterse, asi que se pinta como siempre.
 *
 * props:
 *  - title, subtitle, actions, breadcrumbs, className
 *  - backTo / backLabel: el enlace de vuelta de las pantallas que cuelgan de
 *    otra (las ocho de Configuracion). Dentro del marco va encima del titulo,
 *    pequeno, que es donde se busca el camino de vuelta.
 */
export default function PageHeader({
  title,
  subtitle = null,
  actions = null,
  breadcrumbs = null,
  backTo = null,
  backLabel = 'Volver',
  className = '',
}) {
  const ctx = useCabecera();
  const marcarOcupado = ctx?.marcarOcupado;

  // Le avisa a la barra de que esta pantalla trae titulo propio, para que no
  // saque ademas el del mapa de rutas. Se quita al salir de la pantalla.
  useEffect(() => {
    if (!marcarOcupado) return undefined;
    marcarOcupado(true);
    return () => marcarOcupado(false);
  }, [marcarOcupado]);

  const volver = backTo && (
    <Link
      to={backTo}
      className="inline-flex items-center gap-1 -ml-1 px-1 rounded text-secundario font-medium text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
    >
      <CaretLeft size={12} weight="bold" />
      {backLabel}
    </Link>
  );

  if (ctx) {
    // El hueco llega en el render siguiente al de la barra. Un fotograma sin
    // titulo se nota menos que el titulo saltando de sitio.
    if (!ctx.hueco) return null;

    return createPortal(
      <>
        <div className="min-w-0 flex-1">
          {(volver || breadcrumbs) && (
            <div className="flex items-center gap-2 leading-none">
              {volver}
              {breadcrumbs}
            </div>
          )}
          <h1 className="truncate text-seccion leading-tight">{title}</h1>
          {subtitle && (
            <p className="truncate text-secundario leading-tight text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        )}
      </>,
      ctx.hueco,
    );
  }

  // Sin marco: la cabecera de siempre.
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-4', className)}>
      <div className="min-w-0">
        {volver && <div className="mb-1">{volver}</div>}
        {breadcrumbs && <div className="mb-1">{breadcrumbs}</div>}
        <h1 className="text-titulo truncate">{title}</h1>
        {subtitle && (
          <p className="text-muted-foreground text-secundario mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
