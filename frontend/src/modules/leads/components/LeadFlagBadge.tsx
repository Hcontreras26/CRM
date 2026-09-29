import { useState, useRef, useEffect } from 'react';
import { Flag } from '@phosphor-icons/react';

export type LeadFlagKind =
  | 'reincidente'
  | 'duplicado'
  | 'propuesto'
  | 'spam_pending'
  | 'inactivo'
  | 'sin_interaccion';

interface FlagDef {
  label: string;
  badgeClass: string;
  title: string;
  detail: string;
  example?: string;
  icon?: React.ReactNode;
}

const FLAG_DEFS: Record<LeadFlagKind, FlagDef> = {
  reincidente: {
    label: 'Reincidente',
    badgeClass: 'bg-destructive-soft text-destructive-soft-foreground',
    title: 'Reincidente',
    detail: 'El mismo email ya preguntó antes por el MISMO producto/programa. Insiste con lo mismo — buena señal para llamar directamente.',
    example: 'Ej: María preguntó por "Curso EFT" hace 1 mes y vuelve a preguntar por "Curso EFT".',
  },
  duplicado: {
    label: 'Duplicado',
    badgeClass: 'bg-warning-soft text-warning-soft-foreground',
    title: 'Duplicado',
    detail: 'El email ya existe en este proyecto, pero esta vez pregunta por otro programa. Mira el historial en su ficha antes de responder.',
    example: 'Ej: María preguntó por "Curso EFT" hace 1 mes; ahora pregunta por "Curso Tapping".',
  },
  propuesto: {
    label: 'Propuesto',
    // Verde y no azul: es una oportunidad de venta calificada, no un aviso.
    badgeClass: 'bg-success-soft text-success-soft-foreground',
    title: 'Propuesto (cross-sell)',
    detail: 'Es un cliente que ya compró algo y ahora pregunta por OTRO programa. Oportunidad calificada de venta cruzada — prioridad alta.',
    example: 'Ej: María compró "Curso EFT" y ahora pregunta por "Máster Quiropráctica".',
  },
  spam_pending: {
    label: 'Marcado para revisión',
    badgeClass: 'bg-warning-soft text-warning-soft-foreground',
    title: 'Pendiente de revisión por spam',
    detail: 'Una gestora reportó este lead como spam. Revisa en Notificaciones para confirmar (se elimina) o descartar (sigue activo).',
    icon: <Flag size={9} weight="fill" />,
  },
  inactivo: {
    label: '',
    badgeClass: 'bg-warning-soft text-warning-soft-foreground',
    title: 'Lead inactivo',
    detail: 'Este lead lleva más días sin actividad de los configurados como límite en el proyecto. Considera contactarlo o cambiar su estado.',
  },
  sin_interaccion: {
    label: 'Falta interacción',
    badgeClass: 'bg-warning-soft text-warning-soft-foreground',
    title: 'Marcado contactado sin interacción registrada',
    detail: 'Este lead está en estado "contactado" pero no tiene ninguna interacción (llamada, WhatsApp, email, nota) registrada en su ficha. Agrega la interacción que corresponda para que el seguimiento sea trazable.',
  },
};

interface Props {
  kind: LeadFlagKind;
  // Para 'inactivo' se pasa el número de días (se muestra como "Xd")
  daysInactive?: number;
  // Para 'spam_pending' la animación pulse (default true)
  pulse?: boolean;
  className?: string;
}

// Badge con tooltip rico (hover + click en móvil) explicando el significado.
// Reemplaza los <span> inline para los flags de leads.
export default function LeadFlagBadge({ kind, daysInactive, pulse, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const def = FLAG_DEFS[kind];
  const labelText = kind === 'inactivo' && daysInactive != null ? `${daysInactive}d` : def.label;
  const isPulse = pulse !== false && kind === 'spam_pending';

  return (
    <span
      ref={ref}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      aria-label={def.title}
    >
      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold cursor-help ${def.badgeClass} ${isPulse ? 'animate-pulse' : ''}`}>
        {def.icon}
        {labelText}
      </span>
      {open && (
        <span
          role="tooltip"
          className="absolute z-[60] left-0 top-full mt-1.5 w-72 max-w-[calc(100vw-1.5rem)] p-3 rounded-md bg-foreground text-background shadow-popover text-[11px] leading-snug normal-case font-normal pointer-events-none"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="font-bold text-white mb-1">{def.title}</p>
          <p className="text-background/80">{def.detail}</p>
          {def.example && (
            <p className="text-background/60 italic mt-1.5 border-t border-background/20 pt-1.5">{def.example}</p>
          )}
          <span className="absolute -top-1 left-3 w-2 h-2 bg-foreground rotate-45" />
        </span>
      )}
    </span>
  );
}
