import { useState, useEffect, useCallback } from 'react';
import { Plus, X, ArrowUp, ArrowDown, FloppyDisk, Gear, Notepad } from '@phosphor-icons/react';
import client from '@/shared/api/client';
import Select from '@/shared/components/ui/Select';
import Field from '@/shared/components/ui/Field';
import FilaCampos from '@/shared/components/ui/FilaCampos';
import { inputClass } from '@/shared/lib/ui';
import { toast } from '@/shared/hooks/useToast';
import { avisoDeLoQueFalta, type Falta } from '@/shared/lib/loQueFalta';
import { SectionTitle, useConfirm, FIELD_TYPES, BASE_FIELDS } from './shared';
import { lista } from '@/shared/lib/lista';

export default function FieldsTab({ project, onSaved }) {
  const { ask, dialog: confirmDialog } = useConfirm();
  const [baseConfig, setBaseConfig] = useState(project.lead_base_fields_config || {});
  const [savingBase, setSavingBase] = useState(false);

  async function saveBase(next) {
    setBaseConfig(next);
    setSavingBase(true);
    try {
      const res = await client.patch(`/projects/${project.id}`, { lead_base_fields_config: next });
      if (res.success && onSaved) onSaved(res.data);
    } catch (err) {
      toast({ title: 'No se pudieron guardar los campos base', description: err?.data?.error || 'Inténtalo de nuevo en un momento.', variant: 'destructive' });
    } finally { setSavingBase(false); }
  }

  function toggleBase(key, prop) {
    const cur = baseConfig[key] || { required: false, visible: true };
    saveBase({ ...baseConfig, [key]: { ...cur, [prop]: !cur[prop] } });
  }

  interface FieldDef {
    id: number;
    project_id: number;
    field_key: string;
    label: string;
    type: string;
    required: boolean;
    orden: number;
    grupo?: string | null;
    options?: string[] | null;
  }

  interface NewField {
    field_key: string;
    label: string;
    type: string;
    required: boolean;
    grupo: string;
    options: string;
  }

  const [fields, setFields] = useState<FieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'editor' | 'preview'>('editor');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBuf, setEditBuf] = useState<{ label?: string; required?: boolean; grupo?: string; options?: string }>({});
  const [newField, setNewField] = useState<NewField>({ field_key: '', label: '', type: 'text', required: false, grupo: '', options: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get(`/field-definitions/project/${project.id}`);
      if (res.success) setFields(lista(res.data));
    } finally { setLoading(false); }
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    // Lo decía el globo del navegador; ahora el CRM, y dónde (#106).
    const faltan: Falta[] = [];
    if (!newField.field_key) faltan.push({ title: 'Falta la clave interna', description: 'Escríbela en «Clave interna», en minúsculas y con _ (clave_snake_case).', que: 'la clave en «Clave interna»' });
    if (!newField.label) faltan.push({ title: 'Falta la etiqueta', description: 'Escríbela en «Etiqueta visible»: es lo que se ve en el formulario.', que: 'la etiqueta en «Etiqueta visible»' });
    const falta = avisoDeLoQueFalta(faltan);
    if (falta) { toast(falta); return; }
    try {
      const payload: Partial<FieldDef> = {
        project_id: project.id,
        field_key: newField.field_key,
        label: newField.label,
        type: newField.type,
        required: newField.required,
        orden: fields.length,
        grupo: newField.grupo || null,
      };
      if (newField.type === 'select' && newField.options) {
        payload.options = newField.options.split(',').map(s => s.trim()).filter(Boolean);
      }
      await client.post('/field-definitions', payload);
      toast({ title: 'Campo agregado' });
      setNewField({ field_key: '', label: '', type: 'text', required: false, grupo: '', options: '' });
      await load();
    } catch (err) {
      toast({ title: 'No se pudo agregar el campo', description: err?.data?.error || 'Inténtalo de nuevo en un momento.', variant: 'destructive' });
    }
  }

  function handleDelete(id) {
    ask('Eliminar campo', '¿Eliminar este campo personalizado? Esta acción no se puede deshacer.', async () => {
      try { await client.delete(`/field-definitions/${id}`); await load(); }
      catch (err) { toast({ title: 'No se pudo eliminar el campo', description: err?.data?.error || 'Inténtalo de nuevo en un momento.', variant: 'destructive' }); }
    });
  }

  async function handleMove(idx, dir) {
    const next = [...fields];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setFields(next);
    try {
      await client.post('/field-definitions/reorder', {
        project_id: project.id,
        order: next.map((f, i) => ({ id: f.id, orden: i })),
      });
    } catch { await load(); }
  }

  function startEdit(f) {
    setEditingId(f.id);
    setEditBuf({ label: f.label, required: f.required, grupo: f.grupo || '', options: Array.isArray(f.options) ? f.options.join(', ') : '' });
  }

  async function saveEdit(f: FieldDef) {
    try {
      const payload: Partial<FieldDef> = { label: editBuf.label, required: editBuf.required, grupo: editBuf.grupo || null };
      if (f.type === 'select' && editBuf.options !== undefined) {
        payload.options = editBuf.options.split(',').map(s => s.trim()).filter(Boolean);
      }
      await client.patch(`/field-definitions/${f.id}`, payload);
      setEditingId(null);
      await load();
    } catch (err) { toast({ title: 'No se pudo guardar el campo', description: err?.data?.error || 'Inténtalo de nuevo en un momento.', variant: 'destructive' }); }
  }

  // #106: la misma clase de campo que el resto del CRM (antes llevaba la suya,
  // sin el anillo de foco y con otras esquinas).
  const groups = fields.reduce<Record<string, FieldDef[]>>((acc, f) => {
    const g = f.grupo || 'General';
    (acc[g] = acc[g] || []).push(f);
    return acc;
  }, {});

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <SectionTitle title="Campos base" subtitle="Los que vienen por defecto en cada lead. No se pueden borrar." />
        <div className="mt-3 border border-border rounded-xl divide-y divide-border bg-muted/10">
          {BASE_FIELDS.map(bf => {
            const cfg = baseConfig[bf.key] || { required: false, visible: true };
            const isReq = bf.alwaysRequired || cfg.required;
            const isVis = bf.key === 'nombre' || bf.key === 'email' ? true : (cfg.visible !== false);
            return (
              <div key={bf.key} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold">{bf.label}</span>
                  <span className="font-mono text-secundario text-muted-foreground">{bf.key}</span>
                  {bf.alwaysRequired && <span className="px-1.5 py-0.5 rounded text-secundario font-bold bg-destructive-soft text-destructive-soft-foreground">SIEMPRE REQ</span>}
                </div>
                <div className="flex items-center gap-4">
                  <label className={`flex items-center gap-1.5 text-xs ${bf.key === 'nombre' || bf.key === 'email' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input type="checkbox" checked={isVis} disabled={bf.key === 'nombre' || bf.key === 'email' || savingBase} onChange={() => toggleBase(bf.key, 'visible')} />
                    Visible
                  </label>
                  <label className={`flex items-center gap-1.5 text-xs ${bf.alwaysRequired ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                    <input type="checkbox" checked={isReq} disabled={bf.alwaysRequired || savingBase} onChange={() => toggleBase(bf.key, 'required')} />
                    Requerido
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <SectionTitle title="Campos personalizados" subtitle={`${fields.length} campos. Hasta ~15 recomendados.`} />
        <div className="flex items-center rounded-lg border border-border p-0.5 bg-muted/40">
          <button onClick={() => setView('editor')} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${view === 'editor' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Editor</button>
          <button onClick={() => setView('preview')} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${view === 'preview' ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>Vista previa</button>
        </div>
      </div>

      {view === 'editor' ? (
        <>
          <form onSubmit={handleAdd} noValidate className="p-4 bg-muted/30 rounded-md border border-border">
            <p className="text-secundario font-medium text-muted-foreground mb-3">Nuevo campo</p>
            {/* #106: cada campo con su etiqueta (antes solo el texto de ejemplo,
                que desaparece al escribir). Y `sm:col-span-2`, no `col-span-2`:
                en el móvil la rejilla tiene una columna, y un col-span-2 creaba
                una segunda que sacaba los campos de la pantalla. */}
            <FilaCampos>
              <Field label="Clave interna" required htmlFor="nuevo-campo-clave">
                <input autoComplete="off" id="nuevo-campo-clave" value={newField.field_key} onChange={e => setNewField({ ...newField, field_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })} placeholder="clave_snake_case" className={`${inputClass} font-mono`} required />
              </Field>
              <Field label="Etiqueta visible" required htmlFor="nuevo-campo-etiqueta">
                <input autoComplete="off" id="nuevo-campo-etiqueta" value={newField.label} onChange={e => setNewField({ ...newField, label: e.target.value })} placeholder="Etiqueta visible" className={inputClass} required />
              </Field>
              <Field label="Tipo" htmlFor="nuevo-campo-tipo">
                <Select
                  id="nuevo-campo-tipo"
                  value={newField.type}
                  onChange={(v) => setNewField({ ...newField, type: v })}
                  options={FIELD_TYPES.map(t => ({ value: t.v, label: t.label }))}
                  ariaLabel="Tipo de campo"
                />
              </Field>
              <Field label="Sección" hint="Opcional" htmlFor="nuevo-campo-seccion">
                <input autoComplete="off" id="nuevo-campo-seccion" value={newField.grupo} onChange={e => setNewField({ ...newField, grupo: e.target.value })} placeholder="Sección (opcional)" className={inputClass} />
              </Field>
              {newField.type === 'select' && (
                <Field label="Opciones" hint="Separadas por coma" htmlFor="nuevo-campo-opciones" className="sm:col-span-2">
                  <input autoComplete="off" id="nuevo-campo-opciones" value={newField.options} onChange={e => setNewField({ ...newField, options: e.target.value })} placeholder="Opciones separadas por coma" className={inputClass} />
                </Field>
              )}
              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input type="checkbox" checked={newField.required} onChange={e => setNewField({ ...newField, required: e.target.checked })} />
                  Campo requerido
                </label>
                <button type="submit" className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90">
                  <Plus size={14} weight="bold" /> Agregar
                </button>
              </div>
            </FilaCampos>
          </form>

          {loading ? (
            <p className="text-sm text-muted-foreground">Cargando…</p>
          ) : fields.length === 0 ? (
            <div className="text-center py-10 border-2 border-dashed border-border rounded-md">
              <Notepad size={32} className="text-muted-foreground/30 mx-auto mb-2" weight="regular" />
              <p className="text-sm font-semibold">Sin campos custom</p>
              <p className="text-secundario text-muted-foreground mt-1">Los prospectos solo tendrán los campos base (nombre, email, teléfono)</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {fields.map((f, idx) => {
                const isEditing = editingId === f.id;
                return (
                  <div key={f.id} className="group flex items-start gap-2 p-3 bg-muted/20 hover:bg-muted/40 rounded-lg border border-border">
                    <div className="flex flex-col gap-0.5 pt-0.5">
                      <button onClick={() => handleMove(idx, -1)} disabled={idx === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-20" title="Subir"><ArrowUp size={12} /></button>
                      <button onClick={() => handleMove(idx, 1)} disabled={idx === fields.length - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-20" title="Bajar"><ArrowDown size={12} /></button>
                    </div>
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        // Cada campo con su etiqueta, como en «Nuevo campo» (#106):
                        // aquí no tenían ninguna y la sección solo se reconocía
                        // por el texto de ejemplo.
                        <FilaCampos>
                          <Field label="Etiqueta visible" required htmlFor={`campo-${f.id}-etiqueta`}>
                            <input autoComplete="off" id={`campo-${f.id}-etiqueta`} value={editBuf.label} onChange={e => setEditBuf({ ...editBuf, label: e.target.value })} className={inputClass} />
                          </Field>
                          <Field label="Sección" hint="Opcional" htmlFor={`campo-${f.id}-seccion`}>
                            <input autoComplete="off" id={`campo-${f.id}-seccion`} value={editBuf.grupo} onChange={e => setEditBuf({ ...editBuf, grupo: e.target.value })} className={inputClass} placeholder="Sección" />
                          </Field>
                          {f.type === 'select' && (
                            <Field label="Opciones" hint="Separadas por coma" htmlFor={`campo-${f.id}-opciones`} className="sm:col-span-2">
                              <input autoComplete="off" id={`campo-${f.id}-opciones`} value={editBuf.options} onChange={e => setEditBuf({ ...editBuf, options: e.target.value })} className={inputClass} placeholder="opciones,separadas" />
                            </Field>
                          )}
                          <label className="flex items-center gap-1.5 text-sm sm:col-span-2">
                            <input type="checkbox" checked={editBuf.required} onChange={e => setEditBuf({ ...editBuf, required: e.target.checked })} />
                            Requerido
                          </label>
                        </FilaCampos>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{f.label}</span>
                            <span className="font-mono text-secundario text-muted-foreground">{f.field_key}</span>
                            <span className="px-1.5 py-0.5 rounded text-secundario font-medium bg-primary/10 text-primary">{FIELD_TYPES.find(t => t.v === f.type)?.label || f.type}</span>
                            {f.required && <span className="px-1.5 py-0.5 rounded text-secundario font-bold bg-destructive-soft text-destructive">REQ</span>}
                            {f.grupo && <span className="px-1.5 py-0.5 rounded text-secundario font-bold bg-warning-soft text-warning-soft-foreground">{f.grupo}</span>}
                          </div>
                          {Array.isArray(f.options) && f.options.length > 0 && (
                            <p className="text-secundario text-muted-foreground mt-1 truncate">Opciones: {f.options.join(', ')}</p>
                          )}
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEdit(f)} aria-label="Guardar" className="p-1.5 rounded hover:bg-success-soft text-success"><FloppyDisk size={14} weight="bold" /></button>
                          <button onClick={() => setEditingId(null)} aria-label="Cancelar edición" className="p-1.5 rounded hover:bg-muted"><X size={14} /></button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(f)} aria-label="Editar campo" className="p-1.5 rounded hover:bg-muted opacity-0 group-hover:opacity-100"><Gear size={14} /></button>
                          <button onClick={() => handleDelete(f.id)} aria-label="Eliminar campo" className="p-1.5 rounded hover:bg-destructive-soft text-destructive opacity-0 group-hover:opacity-100"><X size={14} /></button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <p className="text-secundario text-muted-foreground">Así se verán los campos al crear o editar un prospecto:</p>
          {Object.keys(groups).length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground border-2 border-dashed border-border rounded-md">Sin campos</div>
          ) : Object.entries(groups).map(([grupo, items]) => (
            <div key={grupo} className="bg-muted/20 rounded-md p-4 border border-border">
              <p className="text-secundario font-medium text-muted-foreground mb-3">{grupo}</p>
              <FilaCampos>
                {items.map(f => (
                  // La vista previa, con la misma etiqueta que el formulario de verdad (#106).
                  <Field key={f.id} label={f.label} required={f.required} htmlFor={`vista-${f.id}`} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                    <input autoComplete="off" id={`vista-${f.id}`} disabled type={f.type === 'number' ? 'number' : 'text'} className={inputClass} placeholder={`(${f.field_key})`} />
                  </Field>
                ))}
              </FilaCampos>
            </div>
          ))}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
