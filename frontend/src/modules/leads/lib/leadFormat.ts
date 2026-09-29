import { avatarColorFor } from '@/shared/lib/ui';
// Helpers de formato y avatar para LeadsPage. Extraídos de la página
// para facilitar su test unitario y aliviar el archivo principal.
import type { Lead } from '@/shared/types';
import type { ExportColumn } from '@/shared/lib/export';
import { soloFecha, formatFecha, formatRelative } from '@/shared/lib/fechas';

// Las fechas se calculaban aquí y otras dos veces más —dentro de ClientsPage y
// dentro de SiguientesAcciones—, y la de Clientes no coincidía: las compras
// salían un día antes. Ahora hay una sola definición, en `shared/lib/fechas`.
// Se siguen exportando desde aquí porque medio módulo de prospectos las importa
// por este nombre.
export { formatFecha, formatRelative };

export function getInitials(name: string | null | undefined): string {
  if (!name) return '??';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

export function getAvatarColor(id: number): string {
  return avatarColorFor(id);
}

export function formatDate(dateStr: string | null | undefined): string {
  const d = soloFecha(dateStr);
  if (!d) return '--';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

/**
 * Solo los digitos. NO sirve para armar un enlace de WhatsApp ni para decidir
 * si un telefono es utilizable — usa `telefonoParaWhatsapp` de
 * `@/shared/lib/telefono`, que aplica el mismo criterio que el backend.
 *
 * Esta se limita a tirar lo que no sea un digito, y con eso un «0034 600…» sale
 * como «0034600…» —el 00 hay que cambiarlo por «+», no conservarlo— y un
 * «600123456.0» de Excel sale con un cero de mas. Los tres sitios que la usaban
 * para el boton de WhatsApp ya no lo hacen (tarea #25).
 */
export function cleanPhone(phone: string | null | undefined): string {
  return (phone || '').replace(/[^\d]/g, '');
}

const STATUS_LABELS_ES: Record<string, string> = {
  nuevo: 'Nuevo',
  por_contactar: 'Por contactar',
  contactado: 'Contactado',
  en_seguimiento: 'En seguimiento',
  convertido: 'Convertido',
  no_interesado: 'No interesado',
  proxima_convocatoria: 'Próxima convocatoria',
};

// Columnas para el export universal (CRM-196). Usado por ExportDialog.
export function getLeadExportColumns(): ExportColumn<Lead>[] {
  return [
    { key: 'proyecto', label: 'Proyecto', type: 'string', value: (l) => l.proyecto_nombre || '', width: 18 },
    { key: 'nombre', label: 'Nombre', type: 'string', value: (l) => l.nombre || '', width: 24 },
    { key: 'email', label: 'Email', type: 'string', value: (l) => l.email || '', width: 28 },
    { key: 'telefono', label: 'Teléfono', type: 'string', value: (l) => l.telefono || '', width: 16 },
    { key: 'estado', label: 'Estado', type: 'string', value: (l) => STATUS_LABELS_ES[l.estado] || l.estado || '' },
    { key: 'canal', label: 'Canal', type: 'string', value: (l) => l.canal || l.canal_detectado || '' },
    { key: 'origen', label: 'Origen', type: 'string', value: (l) => l.origen || '' },
    { key: 'responsable', label: 'Responsable', type: 'string', value: (l) => l.responsable_nombre || '' },
    { key: 'producto_interes', label: 'Producto interés', type: 'string', value: (l) => l.producto_interes || '' },
    { key: 'pais', label: 'País', type: 'string', value: (l) => l.pais || '' },
    { key: 'notas', label: 'Notas', type: 'string', value: (l) => l.notas || '' },
    { key: 'created_at', label: 'Creado', type: 'date', value: (l) => l.created_at || null },
    { key: 'last_interaction_at', label: 'Último contacto', type: 'date', value: (l) => l.last_interaction_at || null },
    { key: 'next_reminder_at', label: 'Próximo recordatorio', type: 'date', value: (l) => l.next_reminder_at || null },
  ];
}

export function exportLeadsCSV(leads: Lead[], filename: string): void {
  const rows = [
    ['Nombre', 'Email', 'Teléfono', 'Estado', 'Canal', 'Responsable', 'Producto interés', 'Notas', 'Creado', 'Último contacto', 'Próximo recordatorio'],
    ...leads.map((l) => [
      l.nombre || '',
      l.email || '',
      l.telefono || '',
      STATUS_LABELS_ES[l.estado] || l.estado || '',
      l.canal || '',
      l.responsable_nombre || '',
      l.producto_interes || '',
      l.notas || '',
      l.created_at ? new Date(l.created_at).toLocaleDateString('es-ES') : '',
      l.last_interaction_at ? new Date(l.last_interaction_at).toLocaleDateString('es-ES') : '',
      l.next_reminder_at ? new Date(l.next_reminder_at).toLocaleDateString('es-ES') : '',
    ]),
  ];
  const csv = rows.map((r) => r.map((v: unknown) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
