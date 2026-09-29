import { useEffect, useRef, useState } from 'react';
import {
  PencilSimple, DotsThreeVertical, UserCircleMinus, UserCirclePlus, CalendarBlank,
} from '@phosphor-icons/react';
import Portal from '@/shared/components/ui/portal';

/**
 * Las acciones de un usuario: editar, ausencias, desactivar.
 *
 * EL MENÚ SE PINTA FUERA DE LA TABLA, en un portal, y no colgando del botón.
 * La tarjeta que envuelve la tabla lleva `overflow-hidden` —lo necesita para
 * sus esquinas redondeadas— y eso RECORTA cualquier cosa que se salga: con una
 * sola fila en la lista, del menú se veía una tira blanca de dos píxeles y
 * parecía que el botón no hacía nada. Diego, 23/09: «toqué ahí y no se
 * despliega».
 *
 * Al ir por libre hay que colocarlo a mano: se mide el botón y se pone justo
 * debajo, pegado a su derecha. Y se cierra al hacer rodar la página o al
 * cambiar el tamaño de la ventana, porque entonces esas medidas ya no valen y
 * el menú se quedaría flotando lejos de su fila.
 */
export default function UserActionsMenu({
  isActive, isOpen, onToggle, onClose, onEdit, onToggleActive, onAvailability,
}: {
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  /** Ausencias: solo para roles que entran en el reparto. */
  onAvailability?: () => void;
}) {
  const boton = useRef<HTMLButtonElement>(null);
  const [sitio, setSitio] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!isOpen) { setSitio(null); return; }
    const colocar = () => {
      const r = boton.current?.getBoundingClientRect();
      if (!r) return;
      // Si no cabe debajo, va encima: en la última fila de la tabla, el menú
      // se salía por el pie de la ventana.
      const alto = 132;
      const debajo = window.innerHeight - r.bottom > alto;
      setSitio({
        top: debajo ? r.bottom + 4 : Math.max(8, r.top - alto),
        right: Math.max(8, window.innerWidth - r.right),
      });
    };
    colocar();
    // Rodar la página o cambiar el tamaño mueve la fila y no el menú: se cierra.
    const cerrar = () => onClose();
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    return () => {
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', cerrar);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [isOpen, onClose]);

  return (
    <div className="relative inline-block">
      <button
        ref={boton}
        onClick={onToggle}
        aria-label="Acciones de usuario"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <DotsThreeVertical size={18} weight="bold" />
      </button>

      {isOpen && sitio && (
        <Portal>
          {/* La capa de cerrar, tambien fuera: dentro de la tarjeta se
              recortaba igual y no se podia cerrar pulsando al lado. */}
          <div className="fixed inset-0 z-[80]" onClick={onClose} aria-hidden="true" />
          <div
            role="menu"
            style={{ top: sitio.top, right: sitio.right }}
            className="fixed z-[81] w-48 bg-card rounded-md border border-border py-1.5 shadow-lg"
          >
            <button
              role="menuitem"
              onClick={onEdit}
              className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-normal hover:bg-muted transition-colors"
            >
              <PencilSimple size={14} /> Editar usuario
            </button>
            {onAvailability && (
              <button
                role="menuitem"
                onClick={onAvailability}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-left text-normal hover:bg-muted transition-colors"
              >
                <CalendarBlank size={14} /> Ausencias
              </button>
            )}
            <button
              role="menuitem"
              onClick={onToggleActive}
              className={`w-full flex items-center gap-2.5 px-4 py-2 text-left text-normal hover:bg-muted transition-colors ${isActive ? 'text-destructive' : 'text-success'}`}
            >
              {isActive
                ? <><UserCircleMinus size={14} /> Desactivar</>
                : <><UserCirclePlus size={14} /> Reactivar</>}
            </button>
          </div>
        </Portal>
      )}
    </div>
  );
}
