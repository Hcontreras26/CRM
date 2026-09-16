import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Tag } from '@phosphor-icons/react';
import client from '@/shared/api/client';
import Select from '@/shared/components/ui/Select';
import { toast } from '@/shared/hooks/useToast';
import { SectionTitle, useConfirm, inputClass } from './shared';

/**
 * Las categorias son de PRODUCTOS, y hoy solo de productos (#8).
 *
 * El ticket pide un selector `[Productos | Leads | Clientes]` con «solo
 * Productos funcional». Se enseñan las tres, pero las otras dos salen
 * deshabilitadas y diciendo POR QUE — no como dos botones muertos que parecen
 * rotos.
 *
 * Y el motivo es de verdad, no una tarea a medias: `product_categories` cuelga
 * de un producto y no tiene columna de entidad. Categorizar prospectos o
 * clientes no es enchufar esta pantalla a otro sitio; es otra tabla y otra
 * decision sobre que significa ahi una categoria — para un prospecto, el
 * equivalente que YA existe es su estado.
 */
const ENTIDADES = [
  { clave: 'product', label: 'Productos', lista: true },
  { clave: 'lead', label: 'Prospectos', lista: false },
  { clave: 'client', label: 'Clientes', lista: false },
];

export default function CategoriesTab({ project }) {
  const { ask, dialog: confirmDialog } = useConfirm();
  const [entidad, setEntidad] = useState('product');
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newCat, setNewCat] = useState({ nombre: '', parent_id: '' });
  const productoLabel = project.producto_label_plural?.toLowerCase() || 'productos';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.get(`/product-categories/project/${project.id}`);
      if (res.success) setCats(res.data || []);
    } finally { setLoading(false); }
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    if (!newCat.nombre.trim()) return;
    try {
      await client.post('/product-categories', {
        project_id: project.id,
        parent_id: newCat.parent_id ? Number(newCat.parent_id) : null,
        nombre: newCat.nombre.trim(),
        orden: cats.length,
      });
      toast({ title: 'Categoria creada' });
      setNewCat({ nombre: '', parent_id: '' });
      await load();
    } catch (err) {
      toast({ title: 'Error', description: err?.data?.error, variant: 'destructive' });
    }
  }

  function handleDelete(id) {
    ask('Eliminar categoría', `¿Eliminar esta categoría? Los ${productoLabel} quedan sin categoría pero no se borran.`, async () => {
      try {
        await client.delete(`/product-categories/${id}`);
        await load();
      } catch (err) { toast({ title: 'Error', description: err?.data?.error, variant: 'destructive' }); }
    });
  }

  const parents = cats.filter(c => !c.parent_id);
  const childrenByParent = cats.reduce((acc, c) => {
    if (c.parent_id) (acc[c.parent_id] = acc[c.parent_id] || []).push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-5 max-w-2xl">
      <SectionTitle title="Categorias y subcategorias" subtitle={`Organiza ${productoLabel} en grupos (ej: Cursos, Presenciales, Talleres)`} />

      {/* Las tres entidades. Las que no tienen categorias salen deshabilitadas
          con el motivo puesto: un boton muerto sin explicacion parece roto. */}
      <div role="tablist" aria-label="Entidad" className="flex flex-wrap gap-1.5">
        {ENTIDADES.map((e) => (
          <button key={e.clave} type="button" role="tab" aria-selected={entidad === e.clave}
            disabled={!e.lista}
            onClick={() => setEntidad(e.clave)}
            title={e.lista ? undefined : 'Las categorías son de productos'}
            className={`h-8 px-3 rounded-md text-xs font-medium border transition-colors ${
              entidad === e.clave
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-muted'
            } ${e.lista ? '' : 'opacity-40 cursor-not-allowed'}`}>
            {e.label}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Las categorías son de {productoLabel}. Un prospecto se agrupa por su <strong>estado</strong>,
        que se configura en Prospectos; los clientes todavía no tienen agrupación propia.
      </p>

      <form onSubmit={handleAdd} className="p-4 bg-muted/30 rounded-md border border-border space-y-2">
        <p className="text-secundario font-medium text-muted-foreground">Añadir categoría</p>
        <div className="flex gap-2">
          <input value={newCat.nombre} onChange={e => setNewCat({ ...newCat, nombre: e.target.value })} placeholder="Nombre" className={inputClass + ' flex-1'} required />
          <Select
            value={newCat.parent_id}
            onChange={(v) => setNewCat({ ...newCat, parent_id: v })}
            options={[
              { value: '', label: 'Categoria raiz' },
              ...parents.map(p => ({ value: String(p.id), label: `Subcategoria de: ${p.nombre}` })),
            ]}
            ariaLabel="Categoría padre"
            className="flex-1"
          />
          <button type="submit" className="px-4 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 flex items-center gap-1">
            <Plus size={14} weight="bold" /> Añadir
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : parents.length === 0 ? (
        <div className="text-center py-10 border-2 border-dashed border-border rounded-md">
          <Tag size={32} className="text-muted-foreground/30 mx-auto mb-2" weight="regular" />
          <p className="text-sm font-semibold">Sin categorias</p>
          <p className="text-xs text-muted-foreground mt-1">Crea una categoria para empezar a organizar tus {productoLabel}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {parents.map(p => (
            <div key={p.id} className="bg-card border border-border rounded-md p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag size={14} className="text-primary" weight="fill" />
                  <span className="font-bold text-sm">{p.nombre}</span>
                  {childrenByParent[p.id]?.length > 0 && (
                    <span className="text-secundario px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {childrenByParent[p.id].length} subcategoria{childrenByParent[p.id].length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <button onClick={() => handleDelete(p.id)} aria-label="Eliminar" className="p-1 rounded hover:bg-destructive-soft text-destructive"><X size={14} /></button>
              </div>
              {childrenByParent[p.id]?.length > 0 && (
                <div className="mt-2 ml-5 space-y-1 border-l border-border pl-3">
                  {childrenByParent[p.id].map(c => (
                    <div key={c.id} className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>— {c.nombre}</span>
                      <button onClick={() => handleDelete(c.id)} aria-label="Eliminar" className="p-0.5 rounded hover:bg-destructive-soft text-destructive"><X size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {confirmDialog}
    </div>
  );
}
