import { lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { List } from '@phosphor-icons/react';
import { useProjectContext } from '@/contexts/ProjectContext';
import { tituloDeRuta } from '@/shared/lib/rutasTitulos';
import { cn } from '@/shared/lib/utils';
import { useCabecera } from './CabeceraContext';
import SelectorProyecto from './SelectorProyecto';

const NotificationsBell = lazy(() => import('./NotificationsBell'));

/**
 * La cabecera: donde estoy, en que marca, y que puedo hacer aqui.
 *
 * No existia. Cada pantalla dibujaba su propio titulo dentro del contenido,
 * cada una a su manera, y no habia ninguna barra arriba — por eso al bajar por
 * una tabla larga se perdia la referencia de donde estabas.
 *
 * El titulo sale de dos sitios, en este orden:
 *
 *  1. Lo que pinta la pantalla con `PageHeader` en el hueco de aqui, que es lo
 *     mas concreto — puede llevar el nombre del cliente que se esta viendo.
 *  2. Si la pantalla no trae cabecera, el mapa de rutas: el mismo que nombra la
 *     pestana del navegador, asi que una pantalla no se llama de dos formas.
 *
 * Las acciones de la pantalla suben aqui. Antes competian con el titulo en una
 * fila dentro del contenido; arriba estan siempre en el mismo sitio, se vea la
 * pantalla que se vea.
 */
export default function Topbar({ onAbrirMenu, className }) {
  const { pathname } = useLocation();
  const { activeProject } = useProjectContext();
  const ctx = useCabecera();
  const ocupado = !!ctx?.ocupado;
  const titulo = tituloDeRuta(pathname);

  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur',
        'supports-[backdrop-filter]:bg-background/80',
        className,
      )}
    >
      <div className="flex min-h-14 items-center gap-3 px-4 py-2 lg:px-6 xl:px-8">
        {/* En movil el menu se abre desde aqui: es donde se busca. */}
        <button
          type="button"
          onClick={onAbrirMenu}
          aria-label="Abrir menu"
          className="lg:hidden -ml-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-border hover:bg-muted"
        >
          <List size={18} weight="regular" />
        </button>

        {/* El hueco que usa `PageHeader`. Va siempre montado —aunque no se vea—
            para que la pantalla lo encuentre en cuanto se pinta. */}
        <div
          ref={ctx?.registrarHueco}
          className={cn('min-w-0 items-center gap-3', ocupado ? 'flex flex-1' : 'hidden')}
        />

        {/* Pantalla sin cabecera propia: el nombre de la ruta.
            Si la ruta no esta en el mapa —un enlace roto, un 404— no se pinta
            un <h1> vacio: la pantalla ya trae el suyo y saldrian dos. */}
        {!ocupado && (
          <div className="min-w-0 flex-1">
            {titulo && (
              <h1 className="truncate text-base font-semibold leading-tight">{titulo}</h1>
            )}
          </div>
        )}

        {/* En qué marca estás, Y cómo cambiarla.
            Era una píldora que solo informaba: para cambiar de marca había que
            bajar al menú lateral — donde además el nombre salía otras dos veces
            (#79, punto 2). Ahora sale una vez y desde aquí se cambia. */}
        <SelectorProyecto className="flex-shrink-0" />

        {/* La campana estaba al fondo del menu lateral, junto al usuario. Aqui
            arriba es donde se busca, y se ve sin desplegar nada. */}
        <div className="flex flex-shrink-0 items-center">
          <Suspense fallback={null}>
            <NotificationsBell />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
