import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProducts } from '../hooks/useProducts';
import { useProject } from '@/shared/hooks/useProject';
import usePermission from '@/shared/hooks/usePermission';
import ProductFormDialog from '../components/ProductFormDialog';
import { toast } from '@/shared/hooks/useToast';
import {
  Plus, PencilSimple, Trash, FileText, Package,
  Tree, MagnifyingGlass, X, Funnel, ArrowsClockwise,
} from '@phosphor-icons/react';
import PageHeader from '@/shared/components/ui/PageHeader';
import EmptyState from '@/shared/components/ui/EmptyState';
import { SkeletonCard } from '@/shared/components/ui/SkeletonTable';
import {
  getTree,
  startWcSync,
  getCurrentSyncStatus,
  type CategoryNode,
  type WcRunStatus,
} from '@/modules/product-categories/api/categories.api';

import ArbolDeCategorias from '@/modules/product-categories/components/ArbolDeCategorias';

const ConfirmDialog = lazy(() => import('@/shared/components/ui/ConfirmDialog'));

// Recolecta IDs recursivos de una rama del árbol (la cat + todos descendientes)
function collectDescendantIds(node: CategoryNode): Set<number> {
  const ids = new Set<number>([node.id]);
  function walk(n: CategoryNode) {
    for (const c of n.children) {
      ids.add(c.id);
      walk(c);
    }
  }
  walk(node);
  return ids;
}

export default function ProductsPage() {
  const navigate = useNavigate();
  const { can } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeProject } = useProject();
  const projectId = activeProject?.id;
  const { products, loading, error, refetch: refetchProducts, create, update, deactivate } = useProducts(projectId, true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  // Filtros (mi árbol + buscador + estado)
  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [selectedCat, setSelectedCat] = useState<CategoryNode | null>(null);
  const [catSearch, setCatSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Sync WC status (polling)
  const [syncStatus, setSyncStatus] = useState<WcRunStatus | null>(null);
  const [syncStarting, setSyncStarting] = useState(false);

  // Polling del estado del sync
  useEffect(() => {
    if (!projectId) return;
    let cancel = false;
    async function tick() {
      try {
        const s = await getCurrentSyncStatus(projectId!);
        if (cancel) return;
        // Si pasó de running a no-running, refrescar arbol + productos sin recargar pagina.
        // (antes hacia window.location.reload() lo que generaba el "se refresca solo"
        // que el usuario veia al entrar tras un sync en curso).
        if (syncStatus?.status === 'running' && s && s.status !== 'running') {
          getTree(projectId!).then(setTree);
          refetchProducts?.();
        }
        setSyncStatus(s);
      } catch { /* silencioso */ }
    }
    tick();
    const interval = setInterval(tick, syncStatus?.status === 'running' ? 3000 : 30000);
    return () => { cancel = true; clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, syncStatus?.status]);

  async function handleSyncWc() {
    if (!projectId) return;
    setSyncStarting(true);
    try {
      await startWcSync(projectId);
      const s = await getCurrentSyncStatus(projectId);
      setSyncStatus(s);
      toast({ title: 'Sincronización iniciada', description: 'Se está descargando WooCommerce…' });
    } catch (err: any) {
      toast({
        title: 'No se pudo iniciar',
        description: err?.message?.includes('NO_CREDS') || err?.message?.includes('400')
          ? 'Configura primero las credenciales en /woocommerce'
          : err.message,
        variant: 'destructive',
      });
    } finally {
      setSyncStarting(false);
    }
  }

  // CRM-147: quick-add via ?new=1. Cuando el FAB navega aquí con ese param,
  // abrimos el modal de creación y limpiamos el query para no re-disparar.
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditingProduct(null);
      setFormOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('new');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Cargar árbol cuando cambia el proyecto
  useEffect(() => {
    if (!projectId) return;
    getTree(projectId).then(setTree).catch(() => setTree([]));
  }, [projectId]);

  // IDs de la rama seleccionada (cat + descendientes)
  const selectedIds = useMemo(() => selectedCat ? collectDescendantIds(selectedCat) : null, [selectedCat]);

  // Filtrar productos
  const filteredProducts = useMemo(() => {
    let list = products;
    if (selectedIds) list = list.filter((p) => p.categoria_id != null && selectedIds.has(p.categoria_id));
    if (statusFilter === 'active') list = list.filter((p) => p.active);
    else if (statusFilter === 'inactive') list = list.filter((p) => !p.active);
    if (productSearch) {
      const q = productSearch.toLowerCase();
      list = list.filter((p) =>
        p.nombre.toLowerCase().includes(q) ||
        (p.sku || '').toLowerCase().includes(q) ||
        (p.descripcion || '').toLowerCase().includes(q),
      );
    }
    return list;
  }, [products, selectedIds, statusFilter, productSearch]);

  function openCreate() { setEditingProduct(null); setFormOpen(true); }
  function openEdit(product: any) { setEditingProduct(product); setFormOpen(true); }

  async function handleSubmit(data: any) {
    try {
      if (editingProduct) {
        await update(editingProduct.id, data);
        toast({ title: 'Producto actualizado', description: data.nombre });
      } else {
        await create(data);
        toast({ title: 'Producto creado', description: data.nombre });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      throw err;
    }
  }

  async function handleDeactivate() {
    if (!deleteTarget) return;
    try {
      await deactivate(deleteTarget.id);
      toast({ title: 'Producto desactivado', description: deleteTarget.nombre, variant: 'destructive' });
      setDeleteTarget(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  }

  if (!projectId) {
    return <EmptyState icon={Package} title="Selecciona un proyecto" description="Elige un proyecto en el sidebar para ver sus productos." className="py-32" />;
  }

  const hasFilters = !!selectedCat || !!productSearch || statusFilter !== 'active';

  return (
    <div className="space-y-4">
      <ProductFormDialog open={formOpen} onClose={() => setFormOpen(false)} product={editingProduct} onSubmit={handleSubmit} />

      <Suspense fallback={null}>
        <ConfirmDialog
          open={!!deleteTarget}
          title="Desactivar producto"
          message={<>Vas a desactivar <strong>&quot;{deleteTarget?.nombre}&quot;</strong>. El producto dejará de estar visible pero no se eliminará.</>}
          confirmLabel="Desactivar"
          tone="destructive"
          onConfirm={handleDeactivate}
          onCancel={() => setDeleteTarget(null)}
        />
      </Suspense>

      <PageHeader
        title="Productos"
        subtitle={`Catálogo — ${activeProject.nombre} · ${filteredProducts.length} de ${products.length}${selectedCat ? ` en "${selectedCat.nombre}"` : ''}`}
        actions={
          <div className="flex items-center gap-2">
            {can('woocommerce.sync') && (
            <button
              onClick={handleSyncWc}
              disabled={syncStarting || syncStatus?.status === 'running'}
              className="flex items-center gap-2 h-9 px-3 rounded-md border bg-card text-sm hover:bg-muted disabled:opacity-50"
              title="Sincronizar productos desde WooCommerce"
            >
              <ArrowsClockwise size={16} className={syncStatus?.status === 'running' ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">
                {syncStatus?.status === 'running' ? 'Sincronizando…' : 'Sincronizar WC'}
              </span>
            </button>
            )}
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="flex items-center gap-2 h-9 px-3 rounded-md border bg-card text-sm hover:bg-muted"
            >
              <Funnel size={16} weight={sidebarOpen ? 'fill' : 'regular'} />
              <span className="hidden sm:inline">{sidebarOpen ? 'Ocultar filtros' : 'Filtros'}</span>
            </button>
            {can('products.create') && (
            <button
              onClick={openCreate}
              className="flex items-center gap-2 h-9 px-3 sm:px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
            >
              <Plus size={16} weight="bold" /> <span className="hidden sm:inline">Nuevo Producto</span>
            </button>
            )}
          </div>
        }
      />

      {/* Banner de progreso del sync WC */}
      {syncStatus?.status === 'running' && (
        <div className="p-3 rounded-lg border bg-blue-500/10 border-blue-500/30 text-sm flex items-center gap-3">
          <ArrowsClockwise size={18} className="animate-spin text-blue-500" />
          <span>
            Sincronizando WooCommerce · <strong>{syncStatus.elapsed_seconds}s</strong> transcurridos
            {syncStatus.total_fetched ? ` · ${syncStatus.total_fetched} productos descargados` : ''}
          </span>
        </div>
      )}
      {syncStatus?.status === 'success' && syncStatus.finished_at && Date.now() - new Date(syncStatus.finished_at).getTime() < 60000 && (
        <div className="p-3 rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-sm">
          ✅ Sync OK · <strong>{syncStatus.total_fetched}</strong> productos
          ({syncStatus.total_created} nuevos, {syncStatus.total_updated} actualizados)
          en {syncStatus.elapsed_seconds}s
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-md px-3 py-2 font-medium">
          {error}
        </p>
      )}

      <div className={`grid gap-4 ${sidebarOpen ? 'grid-cols-1 lg:grid-cols-[260px_1fr]' : 'grid-cols-1'}`}>
        {/* Sidebar filtros */}
        {sidebarOpen && (
          <aside className="border rounded-lg bg-card h-fit lg:sticky lg:top-4">
            <div className="flex items-center gap-2 p-3 border-b">
              <Tree size={14} className="text-primary" />
              <span className="font-medium text-sm flex-1">Categorías</span>
              {hasFilters && (
                <button
                  onClick={() => { setSelectedCat(null); setCatSearch(''); setProductSearch(''); setStatusFilter('active'); }}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                  title="Limpiar todos los filtros"
                >
                  <X size={11} /> Limpiar
                </button>
              )}
            </div>

            <div className="p-2 border-b">
              <div className="flex items-center gap-2">
                <MagnifyingGlass size={12} className="text-muted-foreground" />
                <input
                  type="text"
                  value={catSearch}
                  onChange={(e) => setCatSearch(e.target.value)}
                  placeholder="Buscar categoría…"
                  className="flex-1 text-xs px-1 py-0.5 bg-transparent border-b focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="p-1 max-h-[500px] overflow-y-auto">
              <div
                className={`flex items-center gap-1 py-1.5 px-3 rounded text-[13px] cursor-pointer ${
                  !selectedCat ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-muted/50'
                }`}
                onClick={() => setSelectedCat(null)}
              >
                <span className="flex-1">Todos</span>
                <span className="text-[10px] text-muted-foreground font-mono">{products.length}</span>
              </div>
              <ArbolDeCategorias
                nodos={tree}
                selectedId={selectedCat?.id ?? null}
                onSelect={setSelectedCat}
                search={catSearch}
              />
              {tree.length === 0 && (
                <div className="text-xs text-muted-foreground p-4 text-center">
                  Sin categorías.<br />
                  Sincroniza WC desde<br />
                  <a href={`${(import.meta.env.BASE_URL || '/crm/').replace(/\/$/, '')}/configuracion/categorias-arbol`} className="text-primary hover:underline">Configuración</a>.
                </div>
              )}
            </div>

            <div className="p-3 border-t space-y-2">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Estado</div>
              <div className="flex gap-1">
                {(['all', 'active', 'inactive'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`flex-1 text-xs py-1 rounded ${statusFilter === s ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-muted text-muted-foreground'}`}
                  >
                    {s === 'all' ? 'Todos' : s === 'active' ? 'Activos' : 'Inactivos'}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* Listado de productos */}
        <main>
          <div className="mb-3 flex items-center gap-2">
            <div className="flex-1 relative">
              <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar por nombre, SKU o descripción…"
                className="w-full h-9 pl-9 pr-3 rounded-md border bg-card text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)}
            </div>
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              icon={Package}
              title={hasFilters ? 'Sin resultados con esos filtros' : 'No hay productos en este proyecto'}
              description={hasFilters ? 'Prueba a limpiar los filtros o cambiar la categoría.' : 'Crea tu primer producto para empezar a gestionar el catálogo.'}
              action={hasFilters ? (
                <button
                  onClick={() => { setSelectedCat(null); setProductSearch(''); setStatusFilter('active'); }}
                  className="text-primary text-sm hover:underline"
                >
                  Limpiar filtros
                </button>
              ) : can('products.create') ? (
                <button
                  onClick={openCreate}
                  className="flex items-center gap-2 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
                >
                  <Plus size={16} weight="bold" /> Crear primer producto
                </button>
              ) : null}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredProducts.map((product: any) => (
                <div key={product.id} className={`bg-card p-5 rounded-lg border border-border transition-all ${!product.active ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between mb-3">
                    {product.image_url_signed ? (
                      <div className="w-10 h-10 rounded-md overflow-hidden border border-border bg-muted">
                        <img src={product.image_url_signed} alt={product.nombre} className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                        <Package size={20} weight="regular" />
                      </div>
                    )}
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-medium ${product.active ? 'bg-emerald-50 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>
                      {product.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>

                  <h3 className="font-semibold">{product.nombre}</h3>
                  {product.categoria_nombre && (
                    <p className="text-[11px] text-primary/70 mt-0.5 truncate">📁 {product.categoria_nombre}</p>
                  )}
                  <p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-2">{product.descripcion || 'Sin descripción'}</p>
                  {product.sku && <p className="text-[11px] text-muted-foreground font-mono mt-1">{product.sku}</p>}

                  {product.precio && (
                    <div className="flex items-center justify-between mt-3 pt-3 border-t">
                      <span className="text-xl font-semibold">{product.precio.toLocaleString('es-ES')} &euro;</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mt-3 text-[13px]">
                    {product.has_dossier ? (
                      <button onClick={() => navigate(`/products/${product.id}`)} className="flex items-center gap-1.5 text-primary font-medium hover:underline">
                        <FileText size={14} /> Dossier v{product.dossier_version}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">Sin dossier</span>
                    )}
                  </div>

                  {(can('products.edit') || can('products.delete')) && (
                  <div className="flex gap-2 mt-3 pt-3 border-t">
                    {can('products.edit') && (
                    <button onClick={() => openEdit(product)} className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md border bg-card text-[13px] font-medium hover:bg-muted">
                      <PencilSimple size={14} /> Editar
                    </button>
                    )}
                    {can('products.delete') && (
                    <button onClick={() => setDeleteTarget(product)} title="Desactivar" className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-md border text-[13px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
                      <Trash size={14} />
                    </button>
                    )}
                  </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
