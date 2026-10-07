// CRM-217: editor de etiquetas del sidebar por proyecto. Solo superadmin
// puede renombrar items (ej. "Prospectos" -> "Estudiantes"). Los cambios
// se guardan en projects.sidebar_labels y los lee Sidebar.jsx en runtime.

import { useState, useMemo } from 'react';
import { ArrowCounterClockwise } from '@phosphor-icons/react';
import client from '@/shared/api/client';
import { toast } from '@/shared/hooks/useToast';
import { useAuth } from '@/contexts/AuthContext';
import { SectionTitle, inputClass } from './shared';
import { getSidebarLabelCatalog } from '@/shared/components/layout/Sidebar';

interface Project {
  id: number;
  sidebar_labels?: Record<string, string> | null;
}

interface Props {
  project: Project;
  onSaved?: (next: Project) => void;
}

const TYPE_LABEL: Record<string, string> = {
  group: 'Grupo',
  item: 'Item',
  child: 'Sub-item',
};

export default function SidebarLabelsTab({ project, onSaved }: Props) {
  const { user } = useAuth() as unknown as { user: { role?: string } | null };
  const [overrides, setOverrides] = useState<Record<string, string>>(project.sidebar_labels || {});
  const [saving, setSaving] = useState(false);

  const catalog = useMemo(() => getSidebarLabelCatalog(), []);

  if (user?.role !== 'superadmin') {
    return (
      <div className="max-w-md">
        <SectionTitle
          title="Etiquetas del sidebar"
          subtitle="Solo superadmin puede modificar las etiquetas del sidebar."
        />
      </div>
    );
  }

  function setOne(label: string, value: string): void {
    setOverrides((prev) => {
      const next = { ...prev };
      const trimmed = value.trim();
      if (!trimmed || trimmed === label) delete next[label];
      else next[label] = trimmed;
      return next;
    });
  }

  function clearOne(label: string): void {
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[label];
      return next;
    });
  }

  async function handleSave(): Promise<void> {
    setSaving(true);
    try {
      const res = await client.patch(`/projects/${project.id}`, { sidebar_labels: overrides });
      if (res.success) {
        toast({ title: 'Etiquetas guardadas', description: 'Los cambios se aplican al recargar la sesión.' });
        if (onSaved) onSaved(res.data);
      }
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string }; message?: string })?.data?.error
        || (err as { message?: string })?.message || 'Error desconocido';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  function handleResetAll(): void {
    setOverrides({});
  }

  const hasChanges = JSON.stringify(overrides) !== JSON.stringify(project.sidebar_labels || {});
  const overrideCount = Object.keys(overrides).length;

  return (
    <div className="space-y-5 max-w-3xl">
      <SectionTitle
        title="Etiquetas del sidebar"
        subtitle="Renombra los items que aparecen en el menú lateral. Útil para adaptar la jerga (ej. 'Prospectos' → 'Estudiantes')."
      />

      <div className="space-y-4">
        {catalog.map(({ section, labels }) => {
          const sectionOverride = overrides[section];
          return (
            <div key={section} className="border border-border rounded-md overflow-hidden">
              <div className="bg-muted/40 px-4 py-2 border-b border-border flex items-center gap-3">
                <span className="text-secundario font-bold uppercase tracking-wider text-muted-foreground/80">Sección</span>
                <input
                  value={sectionOverride || ''}
                  onChange={(e) => setOne(section, e.target.value)}
                  placeholder={section}
                  className={inputClass + ' h-8 max-w-xs'}
                  maxLength={80}
                />
                {sectionOverride && (
                  <button
                    type="button"
                    onClick={() => clearOne(section)}
                    aria-label={`Restaurar etiqueta de ${section}`}
                    className="text-secundario text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <ArrowCounterClockwise size={11} weight="bold" /> reset
                  </button>
                )}
              </div>
              <div className="divide-y divide-border">
                {labels.map(({ label, type }) => {
                  const override = overrides[label];
                  return (
                    <div key={`${section}-${label}-${type}`} className="px-4 py-2 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 text-sm">
                      <div className="flex items-center gap-2 sm:gap-3 sm:contents">
                        <span className={`text-secundario font-bold uppercase rounded px-1.5 py-0.5 flex-shrink-0 ${
                          type === 'group' ? 'bg-warning-soft text-warning-soft-foreground' :
                          type === 'child' ? 'bg-muted text-muted-foreground' :
                          'bg-primary/10 text-primary'
                        }`}>
                          {TYPE_LABEL[type] || 'Item'}
                        </span>
                        <span className="font-medium w-full sm:w-44 flex-shrink-0 truncate" title={label}>{label}</span>
                      </div>
                      <input
                        value={override || ''}
                        onChange={(e) => setOne(label, e.target.value)}
                        placeholder={label}
                        className={inputClass + ' h-8 flex-1 min-w-0'}
                        maxLength={80}
                      />
                      {override && (
                        <button
                          type="button"
                          onClick={() => clearOne(label)}
                          aria-label={`Restaurar etiqueta de ${label}`}
                          className="text-secundario text-muted-foreground hover:text-foreground inline-flex items-center gap-1 flex-shrink-0 self-start sm:self-auto"
                        >
                          <ArrowCounterClockwise size={11} weight="bold" /> reset
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
        <p className="text-xs text-muted-foreground">
          {overrideCount === 0
            ? 'Sin etiquetas personalizadas'
            : `${overrideCount} etiqueta${overrideCount === 1 ? '' : 's'} personalizada${overrideCount === 1 ? '' : 's'}`}
        </p>
        <div className="flex items-center gap-2">
          {overrideCount > 0 && (
            <button
              type="button"
              onClick={handleResetAll}
              disabled={saving}
              className="h-9 px-3 rounded-md border border-border bg-card text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              Limpiar todo
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
