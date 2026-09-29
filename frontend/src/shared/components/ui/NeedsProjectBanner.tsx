import { Info } from '@phosphor-icons/react';

interface Props {
  feature?: string;
  /** La empresa elegida, si la hay. Cambia el aviso entero: con una empresa
      puesta no esta activa la vista «Todos los proyectos», y decirlo mandaba a
      buscar un interruptor que no es el que hay que tocar. Diego, 14/09: «que
      al indicar eso, sea "selecciona una empresa"». */
  sociedad?: string | null;
  className?: string;
}

// Cuando lo elegido no es un proyecto concreto —«Todos los proyectos», o una
// sociedad entera— y la pantalla solo sabe trabajar con uno (catálogo,
// configuración, documentos…): esta tarjeta en lugar de la pantalla vacía.
//
// Se dice CUÁL de las dos cosas está puesta. Con una sociedad elegida, un
// «tienes activa la vista Todos los proyectos» seria falso, y quien lo lee se
// queda buscando algo que no ha hecho.
export default function NeedsProjectBanner({ feature = 'esta sección', sociedad = null, className = '' }: Props) {
  const queEs = feature.charAt(0).toUpperCase() + feature.slice(1);
  return (
    <div className={`bg-info-soft border border-border rounded-md p-6 text-center shadow-sm ${className}`}>
      <div className="w-10 h-10 rounded-md bg-info text-info-foreground mx-auto mb-3 flex items-center justify-center">
        <Info size={20} weight="regular" />
      </div>
      <p className="text-sm font-semibold mb-1">
        {sociedad ? 'Elige un campus' : 'Selecciona un proyecto'}
      </p>
      <p className="text-xs text-muted-foreground">
        {sociedad ? (
          <>
            Tienes elegida la empresa <strong>{sociedad}</strong>. {queEs} todavía se gestiona
            por proyecto, así que aquí no se pueden sumar sus campus: elige uno desde el selector
            de la cabecera.
          </>
        ) : (
          <>
            Tienes activa la vista <strong>Todos los proyectos</strong>. {queEs} se gestiona por
            proyecto: elige uno desde el selector de la cabecera para continuar.
          </>
        )}
      </p>
    </div>
  );
}
