import { useState, useEffect } from 'react';
import { Plus, Gear } from '@phosphor-icons/react';
import { useAuth } from '@/contexts/AuthContext';
import client from '@/shared/api/client';
import SkeletonTable from '@/shared/components/ui/SkeletonTable';
import ProjectSettingsDialog from '../ProjectSettingsDialog';
import ProjectDialog from './ProjectDialog';
import { lista } from '@/shared/lib/lista';

export default function ProjectsTab() {
  const { user, refreshUser } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [configProject, setConfigProject] = useState(null);

  const canCreate = user?.role === 'superadmin';

  async function load() {
    setLoading(true);
    try {
      const res = await client.get('/projects');
      if (res.success) setProjects(lista(res.data));
      // Refresca AuthContext.projects para que el sidebar incluya proyectos nuevos
      refreshUser?.();
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-seccion">Proyectos</h2>
          <p className="text-normal text-muted-foreground mt-0.5">Psiko, ISEIH, Fono Aprende + plataformas IA</p>
        </div>
        {canCreate && (
          <button onClick={() => { setEditing(null); setDialogOpen(true); }} className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 whitespace-nowrap flex-shrink-0">
            <Plus size={14} weight="bold" /> <span className="hidden sm:inline">Nuevo proyecto</span><span className="sm:hidden">Nuevo</span>
          </button>
        )}
      </div>

      {loading ? (
        <SkeletonTable rows={3} columns={1} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((p) => (
            <div key={p.id} className="bg-card rounded-lg border border-border overflow-hidden hover:border-foreground/20 transition-colors">
              <div className="p-5 flex items-start gap-4">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden">
                  {p.logo_url ? (
                    <img src={`${(import.meta.env.BASE_URL || '/crm/').replace(/\/$/, '')}/api/projects/${p.id}/logo`} alt="" width={48} height={48} loading="lazy" decoding="async" className="w-full h-full object-contain" />
                  ) : (p.emoji || '📁')}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-sm truncate">{p.nombre}</p>
                    <span className={`px-1.5 py-0.5 rounded text-secundario font-medium ${p.type === 'ia' ? 'bg-violet-100 text-violet-700 dark:bg-violet-950/30 dark:text-violet-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400'}`}>{p.type}</span>
                    <span className={`px-1.5 py-0.5 rounded text-secundario font-medium ${p.active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {p.active ? 'activo' : 'inactivo'}
                    </span>
                  </div>
                  <p className="text-secundario text-muted-foreground font-mono">/{p.slug}</p>
                  <p className="text-secundario text-muted-foreground mt-1">
                    {p.producto_label_plural || 'Productos'} &middot; Alerta {p.dias_alerta_inactividad}d
                  </p>
                </div>
              </div>
              {canCreate && (
                <div className="border-t border-border bg-muted/20 px-5 py-2.5 flex items-center justify-between">
                  <span className="text-secundario text-muted-foreground">Gestión completa del proyecto</span>
                  <button onClick={() => setConfigProject(p)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 shadow">
                    <Gear size={13} weight="bold" /> Configurar
                  </button>
                </div>
              )}
            </div>
          ))}
          {projects.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-2 text-center py-8">No hay proyectos</p>
          )}
        </div>
      )}

      <ProjectDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        existing={editing}
        onSaved={load}
      />

      {configProject && (
        <ProjectSettingsDialog
          project={configProject}
          onClose={() => setConfigProject(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
