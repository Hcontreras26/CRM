import { useState, useEffect } from 'react';
import { Plus, X, ArrowUp, ArrowDown } from '@phosphor-icons/react';
import client from '@/shared/api/client';
import { toast } from '@/shared/hooks/useToast';
import { SectionTitle, useConfirm, ENTIDADES_CON_COLUMNAS } from './shared';

export default function ColumnsTab({ project, onSaved }) {
  const { ask, dialog: confirmDialog } = useConfirm();

  // La pestaña servia SOLO para prospectos (#8). Clientes y Productos salian
  // con su listado fijo, sin forma de tocarlo.
  const [entidad, setEntidad] = useState('lead');
  const cual = ENTIDADES_CON_COLUMNAS.find((e) => e.clave === entidad);

  // El proyecto se pide A LA FUENTE, no se usa el que llega por prop.
  //
  // Ese viene de `/auth/me`, que no devuelve las columnas configuradas — por eso
  // esta pestaña guardaba bien y al volver a abrirla enseñaba la lista por
  // defecto: lo guardado no se leia NUNCA. `GET /projects/:id` si las trae.
  //
  // Y de paso resuelve lo otro: las de clientes y productos solo existen con la
  // migracion 141 aplicada, asi que su ausencia en la respuesta es la señal de
  // que falta. No hace falta preguntar nada aparte.
  const [config, setConfig] = useState(null);
  useEffect(() => {
    client.get(`/projects/${project.id}`)
      .then((r) => { if (r.success) setConfig(r.data); })
      .catch(() => setConfig({}));   // sin respuesta, se trabaja con lo que hay
  }, [project.id]);

  const fuente = config || project;
  const disponible = (e) => e.clave === 'lead' || (config ? e.columna in config : false);

  const guardadas = fuente[cual.columna];
  const initial = Array.isArray(guardadas) && guardadas.length ? guardadas : cual.porDefecto;
  const [cols, setCols] = useState(initial);
  const [customFields, setCustomFields] = useState([]);
  const [saving, setSaving] = useState(false);

  // Al cambiar de entidad —o cuando llega la configuracion— se carga LO SUYO.
  // Sin esto se quedaban las columnas de la anterior, y guardar las habria
  // copiado de una entidad a otra.
  useEffect(() => {
    const g = (config || project)[cual.columna];
    setCols(Array.isArray(g) && g.length ? g : cual.porDefecto);
  }, [entidad, config, project, cual]);

  useEffect(() => {
    client.get(`/field-definitions/project/${project.id}?entity=${entidad}`).then(r => {
      if (r.success) setCustomFields(r.data || []);
    }).catch(() => toast({ title: 'Error al cargar campos personalizados', variant: 'destructive' }));
  }, [project.id, entidad]);

  function move(idx, dir) {
    const j = idx + dir;
    if (j < 0 || j >= cols.length) return;
    const next = [...cols];
    [next[idx], next[j]] = [next[j], next[idx]];
    setCols(next);
  }

  function toggle(idx) {
    const next = [...cols];
    next[idx] = { ...next[idx], visible: !next[idx].visible };
    setCols(next);
  }

  function remove(idx) {
    setCols(cols.filter((_, i) => i !== idx));
  }

  function addCol(col) {
    if (cols.find(c => c.key === col.key)) {
      toast({ title: 'Columna ya añadida' });
      return;
    }
    setCols([...cols, { key: col.key, label: col.label, visible: true }]);
  }

  function resetDefaults() {
    ask('Restablecer columnas', '¿Restablecer las columnas a los valores por defecto? Se perderá la configuración actual.', () => setCols(cual.porDefecto), 'warning', 'Restablecer');
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await client.patch(`/projects/${project.id}`, { [cual.columna]: cols });
      if (res.success) {
        toast({ title: 'Columnas guardadas' });
        setConfig((antes) => ({ ...(antes || {}), ...res.data }));
        if (onSaved) onSaved(res.data);
      }
    } catch (err) {
      toast({ title: 'Error', description: err?.data?.error, variant: 'destructive' });
    } finally { setSaving(false); }
  }

  const presentKeys = new Set(cols.map(c => c.key));
  const extraOptions = [
    ...cual.extras.filter(c => !presentKeys.has(c.key)),
    ...customFields
      .filter(f => !presentKeys.has(`custom.${f.field_key}`))
      .map(f => ({ key: `custom.${f.field_key}`, label: f.label + ' (custom)' })),
  ];

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start justify-between">
        <SectionTitle title={`Columnas del listado de ${cual.label.toLowerCase()}`}
          subtitle="Elige cuales se ven y en que orden. Aplica al listado tabla." />
        <button onClick={resetDefaults} className="text-xs text-muted-foreground hover:text-foreground underline">Restablecer</button>
      </div>

      {/* Las tres entidades. Las que faltan por migrar salen DESHABILITADAS y
          diciendo por que: esconderlas haria parecer que no se ha hecho. */}
      <div role="tablist" aria-label="Entidad" className="flex flex-wrap gap-1.5">
        {ENTIDADES_CON_COLUMNAS.map((e) => {
          const hay = disponible(e);
          return (
            <button key={e.clave} type="button" role="tab" aria-selected={entidad === e.clave}
              disabled={!hay}
              onClick={() => setEntidad(e.clave)}
              title={hay ? undefined : 'Necesita la migración 141'}
              className={`h-8 px-3 rounded-md text-xs font-medium border transition-colors ${
                entidad === e.clave
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border hover:bg-muted'
              } ${hay ? '' : 'opacity-40 cursor-not-allowed'}`}>
              {e.label}
            </button>
          );
        })}
      </div>

      {!ENTIDADES_CON_COLUMNAS.every(disponible) && (
        <p className="text-xs text-muted-foreground">
          Clientes y Productos necesitan la migración <strong>141</strong>, todavía sin aplicar.
        </p>
      )}

      <div className="border border-border rounded-xl divide-y divide-border bg-muted/10">
        {cols.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Sin columnas. Añade alguna abajo.</div>
        ) : cols.map((c, idx) => (
          <div key={c.key} className="flex items-center gap-3 px-4 py-2.5">
            <div className="flex flex-col gap-0.5">
              <button onClick={() => move(idx, -1)} disabled={idx === 0} aria-label="Subir" className="p-0.5 rounded hover:bg-muted disabled:opacity-20"><ArrowUp size={12} /></button>
              <button onClick={() => move(idx, 1)} disabled={idx === cols.length - 1} aria-label="Bajar" className="p-0.5 rounded hover:bg-muted disabled:opacity-20"><ArrowDown size={12} /></button>
            </div>
            <div className="flex-1 min-w-0">
              <input
                value={c.label}
                onChange={e => {
                  const next = [...cols];
                  next[idx] = { ...next[idx], label: e.target.value };
                  setCols(next);
                }}
                className="w-full h-8 px-2 rounded-md bg-card border border-border text-sm outline-none focus:border-primary"
              />
              <p className="font-mono text-secundario text-muted-foreground mt-0.5">{c.key}</p>
            </div>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={c.visible} onChange={() => toggle(idx)} />
              Visible
            </label>
            <button onClick={() => remove(idx)} className="p-1.5 rounded hover:bg-destructive-soft text-destructive" title="Quitar"><X size={14} /></button>
          </div>
        ))}
      </div>

      {extraOptions.length > 0 && (
        <div>
          <p className="text-secundario font-bold uppercase text-muted-foreground mb-2">Añadir columna</p>
          <div className="flex flex-wrap gap-2">
            {extraOptions.map(c => (
              <button
                key={c.key}
                onClick={() => addCol(c)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-muted/40 hover:bg-muted text-xs font-medium border border-border"
              >
                <Plus size={12} weight="bold" /> {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-2 border-t border-border">
        <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 shadow disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar columnas'}
        </button>
      </div>
      {confirmDialog}
    </div>
  );
}
