import {
  Circle,
  Clock,
  Phone,
  ChartLineUp,
  CheckCircle,
  XCircle,
  CalendarStar,
} from '@phosphor-icons/react';
import { cn } from '@/shared/lib/utils';

/**
 * El estado de un prospecto.
 *
 * Antes eran siete colores sueltos —azul, naranja, esmeralda, ámbar, violeta,
 * rojo, cian— elegidos uno a uno y repetidos en cada tema. Siete tonos que no
 * querían decir nada: el violeta de «convertido» y el rojo de «no interesado»
 * son el final del embudo, uno bueno y otro malo, y nada lo indicaba.
 *

 * Ahora el color dice QUE HAY QUE HACER, no cual de los siete es:
 *
 *   azul   aun no toca nada
 *   ambar  hay algo pendiente
 *   gris   hecho, esperando
 *   verde  gano
 *   rojo   perdio
 *
 * Dos estados de la misma clase comparten tono; los separan la etiqueta y el
 * icono, que es lo que de verdad se lee. Y al ir por tokens, funcionan en claro
 * y en oscuro sin una segunda lista.
 *
 * «contactado» va en gris y no en el azul de la marca a proposito: con el azul
 * se confundia con «nuevo» de un vistazo, que es justo lo contrario —uno esta
 * sin tocar y el otro ya se ha trabajado.
 */
export const STATUS_STYLES = {
  nuevo: 'bg-info-soft text-info-soft-foreground',
  proxima_convocatoria: 'bg-info-soft text-info-soft-foreground',
  por_contactar: 'bg-warning-soft text-warning-soft-foreground',
  en_seguimiento: 'bg-warning-soft text-warning-soft-foreground',
  contactado: 'bg-muted text-muted-foreground',
  convertido: 'bg-success-soft text-success-soft-foreground',
  no_interesado: 'bg-destructive-soft text-destructive-soft-foreground',
};

export const STATUS_LABELS = {
  nuevo: 'Nuevo',
  por_contactar: 'Por contactar',
  contactado: 'Contactado',
  en_seguimiento: 'En seguimiento',
  convertido: 'Convertido',
  no_interesado: 'No interesado',
  proxima_convocatoria: 'Próxima convocatoria',
};

const STATUS_ICONS = {
  nuevo: Circle,
  por_contactar: Clock,
  contactado: Phone,
  en_seguimiento: ChartLineUp,
  convertido: CheckCircle,
  no_interesado: XCircle,
  proxima_convocatoria: CalendarStar,
};

export const STATUS_KEYS = [
  'nuevo',
  'por_contactar',
  'contactado',
  'en_seguimiento',
  'convertido',
  'no_interesado',
  'proxima_convocatoria',
];

/**
 * @param {{ status: string; showIcon?: boolean; className?: string }} props
 */
export default function StatusBadge({ status, showIcon = false, className = '' }) {
  const style = STATUS_STYLES[status] || 'bg-muted text-muted-foreground';
  const label = STATUS_LABELS[status] || status;
  const Icon = STATUS_ICONS[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium',
        style,
        className,
      )}
    >
      {showIcon && Icon && <Icon size={11} weight="bold" />}
      {label}
    </span>
  );
}
