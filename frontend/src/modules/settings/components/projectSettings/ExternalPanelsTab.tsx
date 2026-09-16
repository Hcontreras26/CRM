import { useState } from 'react';
import { Plus, X, ArrowUp, ArrowDown, FloppyDisk, ArrowSquareOut, Globe } from '@phosphor-icons/react';
import client from '@/shared/api/client';
import Select from '@/shared/components/ui/Select';
import { toast } from '@/shared/hooks/useToast';
import { SectionTitle, useConfirm, inputClass } from './shared';

// CRM-155: paneles externos por proyecto. Se muestran en el sidebar
// y se abren embebidos vía iframe (default) o en pestaña nueva.

interface ExternalPanel {
  id: string;
  label: string;
  url: string;
  icon?: string | null;
  open_in?: 'iframe' | 'tab';
}

const ICON_HINT = 'Nombre de un icono Phosphor (CreditCard, ChartLineUp, etc.)';

function uid(): string {
  return `xp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch { return false; }
}

interface Project {
  id: number;
  external_panels?: ExternalPanel[];
}

interface Props {
  project: Project;
  onSaved?: (next: Project) => void;
}

export default function ExternalPanelsTab({ project, onSaved }: Props) {
  const { ask, dialog: confirmDialog } = useConfirm();
  const [items, setItems] = useState<ExternalPanel[]>(project.external_panels || []);
  const [draft, setDraft] = useState<ExternalPanel>({ id: '', label: '', url: '', icon: '', open_in: 'iframe' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBuf, setEditBuf] = useState<ExternalPanel | null>(null);
  const [saving, setSaving] = useState(false);

  async function persist(next: ExternalPanel[]): Promise<void> {
    setSaving(true);
    try {
      const res = await client.patch(`/projects/${project.id}`, { external_panels: next });
      if (res.success) {
        setItems(next);
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

  async function handleAdd(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!draft.label.trim() || !draft.url.trim()) return;
    if (!isValidUrl(draft.url.trim())) {
      toast({ title: 'URL inválida', description: 'Debe empezar por http:// o https://', variant: 'destructive' });
      return;
    }
    const next: ExternalPanel = {
      id: uid(),
      label: draft.label.trim(),
      url: draft.url.trim(),
      icon: draft.icon?.trim() || null,
      open_in: draft.open_in || 'iframe',
    };
    await persist([...items, next]);
    setDraft({ id: '', label: '', url: '', icon: '', open_in: 'iframe' });
  }

  function handleDelete(id: string): void {
    const target = items.find(p => p.id === id);
    ask(
      'Eliminar panel',
      `¿Eliminar el panel "${target?.label || ''}"? El item desaparecerá del sidebar.`,
      () => persist(items.filter(p => p.id !== id)),
    );
  }

  async function handleMove(idx: number, dir: -1 | 1): Promise<void> {
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[idx], next[j]] = [next[j], next[idx]];
    await persist(next);
  }

  function startEdit(p: ExternalPanel): void {
    setEditingId(p.id);
    setEditBuf({ ...p });
  }

  async function saveEdit(): Promise<void> {
    if (!editBuf) return;
    if (!editBuf.label.trim() || !editBuf.url.trim()) return;
    if (!isValidUrl(editBuf.url.trim())) {
      toast({ title: 'URL inválida', variant: 'destructive' });
      return;
    }
    const cleaned: ExternalPanel = {
      ...editBuf,
      label: editBuf.label.trim(),
      url: editBuf.url.trim(),
      icon: editBuf.icon?.trim() || null,
      open_in: editBuf.open_in || 'iframe',
    };
    await persist(items.map(p => p.id === cleaned.id ? cleaned : p));
    setEditingId(null);
    setEditBuf(null);
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <SectionTitle
        title="Paneles externos"
        subtitle="Aparecen como items del sidebar. Se abren embebidos via iframe o en pestaña nueva."
      />

      <form onSubmit={handleAdd} className="p-4 bg-muted/30 rounded-md border border-border">
        <p className="text-secundario font-medium text-muted-foreground mb-3">Nuevo panel</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={draft.label}
            onChange={e => setDraft({ ...draft, label: e.target.value })}
            placeholder="Nombre visible (ej. Stripe)"
            className={inputClass}
            maxLength={80}
            required
          />
          <input
            value={draft.url}
            onChange={e => setDraft({ ...draft, url: e.target.value })}
            placeholder="https://..."
            className={inputClass + ' font-mono text-xs'}
            required
          />
          <input
            value={draft.icon || ''}
            onChange={e => setDraft({ ...draft, icon: e.target.value })}
            placeholder="Icono Phosphor (opcional)"
            title={ICON_HINT}
            className={inputClass}
          />
          <Select<'iframe' | 'tab'>
            value={draft.open_in || 'iframe'}
            onChange={(v) => setDraft({ ...draft, open_in: v })}
            options={[
              { value: 'iframe', label: 'Embebido (iframe dentro del CRM)' },
              { value: 'tab', label: 'Pestaña nueva' },
            ]}
            ariaLabel="Cómo abrir el panel"
          />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={saving || !draft.label || !draft.url}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus size={14} weight="bold" /> Agregar panel
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed border-border rounded-md">
          <Globe size={32} className="text-muted-foreground/30 mx-auto mb-2" weight="regular" />
          <p className="text-sm font-semibold">Sin paneles externos</p>
          <p className="text-xs text-muted-foreground mt-1">Añade enlaces que aparecerán en el sidebar (Stripe, WhatsApp Web, etc.)</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((p, idx) => {
            const isEditing = editingId === p.id;
            return (
              <div key={p.id} className="group flex items-start gap-2 p-3 bg-muted/20 hover:bg-muted/40 rounded-lg border border-border">
                <div className="flex flex-col gap-0.5 pt-0.5">
                  <button onClick={() => handleMove(idx, -1)} disabled={idx === 0 || saving} className="p-0.5 rounded hover:bg-muted disabled:opacity-20" title="Subir" aria-label="Subir"><ArrowUp size={12} /></button>
                  <button onClick={() => handleMove(idx, 1)} disabled={idx === items.length - 1 || saving} className="p-0.5 rounded hover:bg-muted disabled:opacity-20" title="Bajar" aria-label="Bajar"><ArrowDown size={12} /></button>
                </div>

                <div className="flex-1 min-w-0">
                  {isEditing && editBuf ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        value={editBuf.label}
                        onChange={e => setEditBuf({ ...editBuf, label: e.target.value })}
                        className={inputClass + ' h-8'}
                        maxLength={80}
                      />
                      <input
                        value={editBuf.url}
                        onChange={e => setEditBuf({ ...editBuf, url: e.target.value })}
                        className={inputClass + ' h-8 font-mono text-xs'}
                      />
                      <input
                        value={editBuf.icon || ''}
                        onChange={e => setEditBuf({ ...editBuf, icon: e.target.value })}
                        placeholder="Icono Phosphor"
                        title={ICON_HINT}
                        className={inputClass + ' h-8'}
                      />
                      <Select<'iframe' | 'tab'>
                        value={editBuf.open_in || 'iframe'}
                        onChange={(v) => setEditBuf({ ...editBuf, open_in: v })}
                        options={[
                          { value: 'iframe', label: 'Embebido (iframe)' },
                          { value: 'tab', label: 'Pestaña nueva' },
                        ]}
                        ariaLabel="Cómo abrir el panel"
                        size="sm"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{p.label}</span>
                        <span className="px-1.5 py-0.5 rounded text-secundario font-bold bg-primary/10 text-primary">
                          {p.open_in === 'tab' ? 'Pestaña' : 'Iframe'}
                        </span>
                        {p.icon && <span className="font-mono text-secundario text-muted-foreground">{p.icon}</span>}
                      </div>
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-secundario text-muted-foreground hover:text-primary truncate block mt-0.5">
                        {p.url}
                      </a>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {isEditing ? (
                    <>
                      <button onClick={saveEdit} disabled={saving} aria-label="Guardar" className="p-1.5 rounded hover:bg-success-soft text-success">
                        <FloppyDisk size={14} weight="bold" />
                      </button>
                      <button onClick={() => { setEditingId(null); setEditBuf(null); }} aria-label="Cancelar" className="p-1.5 rounded hover:bg-muted">
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(p)} aria-label="Editar" className="p-1.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100">
                        <ArrowSquareOut size={14} />
                      </button>
                      <button onClick={() => handleDelete(p.id)} aria-label="Eliminar" className="p-1.5 rounded hover:bg-destructive-soft text-destructive opacity-0 group-hover:opacity-100">
                        <X size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-secundario text-muted-foreground">
        <strong>Nota:</strong> algunos sitios (banca, Google Workspace, GitHub) bloquean ser embebidos en iframes
        mediante <code className="font-mono">X-Frame-Options</code> o <code className="font-mono">CSP frame-ancestors</code>.
        En esos casos, usa "Pestaña nueva".
      </p>

      {confirmDialog}
    </div>
  );
}
