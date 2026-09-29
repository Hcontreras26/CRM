// Calcula la prioridad visual de un lead segun su estado, recordatorios y dias inactivos.
// Resultado: { tone, label, dotClass, borderClass }
import type { Lead } from '@/shared/types';

export type Priority = 'overdue' | 'urgent' | 'fresh' | 'inProgress' | 'won' | 'lost' | 'normal';

export interface PriorityStyle {
  label: string;
  dotClass: string;
  borderClass: string;
  rowBgClass: string;
}

// El tono dice QUE HAY QUE HACER, igual que en StatusBadge: no puede pasar que
// el mismo lead salga ambar en la tabla y violeta en su punto.
//
//   destructive  se paso la fecha
//   warning      corre prisa
//   info         acaba de entrar, no toca nada todavia
//   success      gano
//   neutro       cerrado o sin nada que decir
const PRIORITY_STYLES: Record<Priority, PriorityStyle> = {
  overdue: {
    label: 'Vencido',
    dotClass: 'bg-destructive',
    borderClass: 'border-l-destructive',
    rowBgClass: 'hover:bg-destructive-soft',
  },
  urgent: {
    label: 'Urgente',
    dotClass: 'bg-warning',
    borderClass: 'border-l-warning',
    rowBgClass: 'hover:bg-warning-soft',
  },
  fresh: {
    label: 'Nuevo',
    dotClass: 'bg-info',
    borderClass: 'border-l-info',
    rowBgClass: '',
  },
  inProgress: {
    label: 'En curso',
    dotClass: 'bg-primary',
    borderClass: 'border-l-primary',
    rowBgClass: '',
  },
  won: {
    // Verde, no violeta: convertido es el final bueno del embudo y el color
    // tiene que decirlo. Era violeta y no se distinguia de «nuevo».
    label: 'Convertido',
    dotClass: 'bg-success',
    borderClass: 'border-l-success',
    rowBgClass: '',
  },
  lost: {
    label: 'No interesado',
    dotClass: 'bg-muted-foreground/50',
    borderClass: 'border-l-border',
    rowBgClass: '',
  },
  normal: {
    label: 'Normal',
    dotClass: 'bg-muted-foreground/40',
    borderClass: 'border-l-transparent',
    rowBgClass: '',
  },
};
export function getLeadPriority(lead: Partial<Lead> | null | undefined): Priority {
  if (!lead) return 'normal';
  const estado = lead.estado || lead.status;

  // Recordatorio vencido tiene prioridad maxima
  if (lead.next_reminder_at) {
    const due = new Date(lead.next_reminder_at);
    if (!isNaN(due.getTime()) && due < new Date()) return 'overdue';
  }

  // Estados terminales
  if (estado === 'convertido') return 'won';
  if (estado === 'no_interesado') return 'lost';

  // Inactividad sobre estados activos (nuevo, por_contactar, en_seguimiento)
  const dias = Number(lead.dias_inactivo || 0);
  const isActive = estado === 'nuevo' || estado === 'por_contactar' || estado === 'en_seguimiento';
  if (isActive && dias >= 3) return 'urgent';

  // Activos con poca antiguedad
  if (estado === 'nuevo' || estado === 'por_contactar') return 'fresh';
  if (estado === 'contactado' || estado === 'en_seguimiento') return 'inProgress';

  return 'normal';
}

export function getPriorityStyle(priority: Priority | string): PriorityStyle {
  return PRIORITY_STYLES[priority as Priority] || PRIORITY_STYLES.normal;
}
