import { fondoDeEstado, puntoDeEstado, haloDeEstado, cssDeEstado } from '../lib/estadoTono';
import { avatarColorFor } from '@/shared/lib/ui';
import { useState, useEffect, useCallback, lazy, Suspense, type DragEvent } from 'react';
import { useProjectContext } from '@/contexts/ProjectContext';
import { useIdsDelAmbito } from '@/shared/hooks/useAmbito';
import client from '@/shared/api/client';
import LeadFormDialog from '../components/LeadFormDialog';
import { getLeadPriority, getPriorityStyle } from '../lib/leadPriority';
import { toast } from '@/shared/hooks/useToast';
import { Plus, User, DotsSixVertical, Users, CalendarBlank } from '@phosphor-icons/react';
import ChannelBadge from '@/shared/components/ui/ChannelBadge';
import PageHeader from '@/shared/components/ui/PageHeader';
import type { Lead, LeadStatus } from '@/shared/types';
import { idsDelAmbito } from '@/shared/lib/ambitoInforme';

const LeadDrawer = lazy(() => import('../components/LeadDrawer'));

type PipelineLead = Lead & { gestor?: string; fecha?: string };

// Los tonos salen de lib/estadoTono.ts. Aqui estaban a mano, con un hexadecimal
// ademas de la clase, y los dos podian irse por su lado.
const COLUMNS = [
  { key: 'nuevo', label: 'Nuevo' },
  { key: 'por_contactar', label: 'Por contactar' },
  { key: 'contactado', label: 'Contactado' },
  { key: 'en_seguimiento', label: 'En seguimiento' },
  { key: 'convertido', label: 'Convertido' },
  { key: 'no_interesado', label: 'No interesado' },
  { key: 'proxima_convocatoria', label: 'Próxima convocatoria' },
].map((c) => ({ ...c, bg: fondoDeEstado(c.key), dot: puntoDeEstado(c.key), ring: haloDeEstado(c.key), color: cssDeEstado(c.key) }));

function getInitials(name: string | null | undefined): string {
  if (!name) return '??';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function daysAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return 'hoy';
  if (diff === 1) return 'ayer';
  return `hace ${diff}d`;
}

// Parser robusto YYYY-MM-DD → fecha LOCAL del navegador (no UTC).
function parseLocalDateOnly(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const s = String(dateStr).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
}
function todayLocal(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function nextContactInfo(dateStr: string | null | undefined) {
  const target = parseLocalDateOnly(dateStr);
  if (!target) return null;
  const today = todayLocal();
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) {
    return { label: `vencido ${Math.abs(diffDays)}d`, classes: 'bg-destructive-soft text-destructive-soft-foreground' };
  }
  if (diffDays === 0) return { label: 'hoy', classes: 'bg-success-soft text-success-soft-foreground' };
  if (diffDays === 1) return { label: 'mañana', classes: 'bg-info-soft text-info-soft-foreground' };
  if (diffDays <= 7) return { label: `en ${diffDays}d`, classes: 'bg-info-soft text-info-soft-foreground' };
  return { label: target.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }), classes: 'bg-muted text-muted-foreground' };
}

type NextContactFilter = 'todos' | 'vencidos' | 'hoy' | 'manana' | 'semana' | 'sin';
function matchesNextContactFilter(lead: PipelineLead, filter: NextContactFilter): boolean {
  if (filter === 'todos') return true;
  const target = parseLocalDateOnly((lead as any).next_reminder_at);
  if (!target) return filter === 'sin';
  if (filter === 'sin') return false;
  const today = todayLocal();
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (filter === 'vencidos') return diff < 0;
  if (filter === 'hoy') return diff === 0;
  if (filter === 'manana') return diff === 1;
  if (filter === 'semana') return diff >= 0 && diff <= 7;
  return true;
}

interface LeadCardProps {
  lead: PipelineLead;
  onClick: (id: number) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, lead: PipelineLead) => void;
  onDragEnd: () => void;
}

function LeadCard({ lead, onClick, onDragStart, onDragEnd }: LeadCardProps) {
  const canal = lead.canal_detectado || lead.origen;
  const priority = getLeadPriority(lead);
  const pStyle = getPriorityStyle(priority);
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(lead.id)}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(lead.id); }}
      title={`Prioridad: ${pStyle.label}`}
      className={`bg-card border border-border border-l-4 ${pStyle.borderClass} rounded-lg p-3 space-y-2 cursor-grab active:cursor-grabbing hover:shadow-sm hover:border-primary/30 transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold flex-shrink-0 ${avatarColorFor(lead.id)}`}>
            {getInitials(lead.nombre)}
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold leading-tight truncate">{lead.nombre}</p>
            <p className="text-[11px] text-muted-foreground truncate">{lead.email}</p>
          </div>
        </div>
        <DotsSixVertical size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
      </div>

      {lead.producto_interes && (
        <p className="text-[11px] text-muted-foreground bg-muted rounded-md px-2 py-1 truncate">
          {lead.producto_interes}
        </p>
      )}

      {(() => {
        const info = nextContactInfo((lead as any).next_reminder_at);
        if (!info) return null;
        return (
          <div className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded ${info.classes}`}>
            <CalendarBlank size={10} weight="bold" />
            <span>Próx. {info.label}</span>
          </div>
        );
      })()}

      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        {canal ? <ChannelBadge channel={canal} showIcon /> : <span />}
        <span className="flex items-center gap-1 flex-shrink-0">
          {(lead.responsable_nombre || lead.gestor) && (
            <>
              <User size={10} weight="regular" />
              <span className="truncate max-w-[60px]">{(lead.responsable_nombre || lead.gestor || '').split(' ')[0]}</span>
              <span className="text-muted-foreground/60">&bull;</span>
            </>
          )}
          <span>{daysAgo(lead.created_at || lead.fecha)}</span>
        </span>
      </div>
    </div>
  );
}

export default function LeadsPipelinePage() {
  const { activeProject, projects, isAllProjects, activeIssuer } = useProjectContext() as {
    activeProject: { id?: number | null; isAll?: boolean };
    projects: Array<{ id: number }>;
    isAllProjects: boolean;
    activeIssuer: { id: number; nombre: string; campus: Array<{ id: number }> } | null;
  };
  const idsDelAmbito = useIdsDelAmbito();
  const pid = activeProject?.id;

  const [allLeads, setAllLeads] = useState<PipelineLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [drawerLeadId, setDrawerLeadId] = useState<number | null>(null);
  const [dragLead, setDragLead] = useState<PipelineLead | null>(null);
  const [dragOverCol, setDragOverCol] = useState<LeadStatus | null>(null);
  const [contactFilter, setContactFilter] = useState<NextContactFilter>(() => {
    try { return (localStorage.getItem('pipeline-next-contact-filter') as NextContactFilter) || 'todos'; } catch { return 'todos'; }
  });
  function setFilter(f: NextContactFilter) {
    setContactFilter(f);
    try { localStorage.setItem('pipeline-next-contact-filter', f); } catch { /* ignore */ }
  }

  const fetchAllLeads = useCallback(async () => {
    if (isAllProjects && (!projects || projects.length === 0)) return;
    if (!isAllProjects && !pid) return;
    setLoading(true);
    try {
      const qs = isAllProjects
        // Con una empresa elegida, «todos» son sus campus y ninguno mas.
        ? `projectIds=${idsDelAmbito.join(',')}&limit=200&includeConverted=1`
        : `projectId=${pid}&limit=200&includeConverted=1`;
      const res = await client.get<PipelineLead[]>(`/leads?${qs}`);
      if (res.success) {
        // Backend devuelve status, frontend usa estado - normalizar
        setAllLeads((res.data || []).map((l: PipelineLead) => ({
          ...l,
          estado: (l.status || l.estado) as LeadStatus,
          origen: l.canal_detectado || l.origen || 'directo',
        })));
      }
    } catch (err: unknown) {
      toast({ title: 'Error cargando leads', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [pid, isAllProjects, projects]);

  useEffect(() => {
    fetchAllLeads();
  }, [fetchAllLeads]);

  // Agrupa leads por estado, aplicando filtro de próximo contacto.
  const grouped: Record<string, PipelineLead[]> = {};
  for (const col of COLUMNS) {
    grouped[col.key] = [];
  }
  for (const lead of allLeads) {
    if (!matchesNextContactFilter(lead, contactFilter)) continue;
    if (grouped[lead.estado]) {
      grouped[lead.estado].push(lead);
    }
  }
  const filteredCount = Object.values(grouped).reduce((acc, arr) => acc + arr.length, 0);

  function handleDragStart(e: DragEvent<HTMLDivElement>, lead: PipelineLead) {
    setDragLead(lead);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, colKey: LeadStatus) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverCol !== colKey) setDragOverCol(colKey);
  }
  function handleDragLeave() {
    setDragOverCol(null);
  }
  function handleDragEnd() {
    setDragLead(null);
    setDragOverCol(null);
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>, targetEstado: LeadStatus) {
    e.preventDefault();
    setDragOverCol(null);
    if (!dragLead || dragLead.estado === targetEstado) {
      setDragLead(null);
      return;
    }

    try {
      // Backend requiere motivo al cambiar status
      await client.patch(`/leads/${dragLead.id}/status`, {
        status: targetEstado,
        motivo: `Movido a ${COLUMNS.find(c => c.key === targetEstado)?.label} desde pipeline`,
      });
      toast({
        title: 'Estado actualizado',
        description: `${dragLead.nombre} movido a "${COLUMNS.find(c => c.key === targetEstado)?.label}"`,
      });
      setAllLeads((prev) =>
        prev.map((l) => l.id === dragLead.id ? { ...l, estado: targetEstado, status: targetEstado } : l)
      );
    } catch (err: any) {
      toast({ title: 'Error', description: err?.data?.error || err?.message || String(err), variant: 'destructive' });
    }
    setDragLead(null);
  }

  async function handleCreateLead(data: any) {
    if (!pid) return;
    try {
      let productoInteresId: number | null = null;
      if (data.producto_interes) {
        try {
          const pr = await client.get<Array<{ id: number; nombre: string }>>(`/products/${pid}`);
          const list = pr.success ? (pr.data || []) : [];
          const prod = list.find(p => p.nombre === data.producto_interes);
          productoInteresId = prod?.id || null;
        } catch { /* ignore */ }
      }
      const res = await client.post('/leads', {
        project_id: pid,
        nombre: data.nombre,
        email: data.email,
        telefono: data.telefono || '',
        // El usuario de WhatsApp tambien va: hay gente que solo da eso.
        //
        // Faltaba en la peticion y el servidor rechazaba el lead con «hace
        // falta al menos una forma de contacto», aunque la gestora lo hubiera
        // escrito. El formulario lo recogia y lo perdia aqui, al armar el envio.
        whatsapp_usuario: data.whatsapp_usuario || null,
        producto_interes_id: productoInteresId,
        canal: data.origen || 'directo',
        notas: data.notas || '',
        custom_fields: data.custom_fields || undefined,
      });
      if (res.success) {
        toast({ title: 'Lead creado' });
        await fetchAllLeads();
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err?.data?.error || err?.message || String(err), variant: 'destructive' });
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="Pipeline de Prospectos" subtitle="Cargando…" />
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <div key={col.key} className="flex-shrink-0 w-[260px] sm:w-[280px]">
              <div className={`rounded-lg px-4 py-3 mb-3 ${col.bg} animate-pulse`}>
                <div className="w-24 h-4 bg-muted rounded" />
              </div>
              <div className="space-y-2.5">
                {[1, 2].map((i) => (
                  <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse">
                    <div className="flex items-center gap-2.5 mb-3">
                      <div className="w-7 h-7 rounded-full bg-muted" />
                      <div><div className="w-20 h-4 bg-muted rounded mb-1" /><div className="w-28 h-3 bg-muted rounded" /></div>
                    </div>
                    <div className="w-full h-3 bg-muted rounded" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <LeadFormDialog open={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleCreateLead} lead={null} />

      <PageHeader
        title="Pipeline de prospectos"
        subtitle="Arrastra una tarjeta para cambiar su estado"
        actions={
          <>
            <button
              onClick={() => setFormOpen(true)}
              aria-label="Nuevo prospecto"
              className="flex items-center gap-2 h-9 px-3 sm:px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
            >
              <Plus size={16} weight="bold" /> <span className="hidden sm:inline">Nuevo prospecto</span>
            </button>
          </>
        }
      />

      <Suspense fallback={null}>
        <LeadDrawer
          leadId={drawerLeadId}
          open={drawerLeadId !== null}
          onClose={() => setDrawerLeadId(null)}
        />
      </Suspense>

      {/* Filtros de próximo contacto */}
      <div className="flex items-center gap-2 flex-wrap bg-card border border-border rounded-lg p-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2">
          Próximo contacto:
        </span>
        {([
          { k: 'todos', label: 'Todos' },
          { k: 'vencidos', label: '🔴 Vencidos' },
          { k: 'hoy', label: '🟢 Hoy' },
          { k: 'manana', label: '🔵 Mañana' },
          { k: 'semana', label: '📆 7 días' },
          { k: 'sin', label: '⚪ Sin programar' },
        ] as Array<{ k: NextContactFilter; label: string }>).map((f) => (
          <button
            key={f.k}
            type="button"
            onClick={() => setFilter(f.k)}
            className={`h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors ${
              contactFilter === f.k
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted/50 hover:bg-muted text-muted-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground px-2">
          {filteredCount} visibles
        </span>
      </div>

      {/* Pipeline columns */}
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 lg:mx-0 lg:px-0">
        {COLUMNS.map((col) => {
          const colLeads = grouped[col.key] || [];
          return (
            <div
              key={col.key}
              onDragOver={(e) => handleDragOver(e, col.key as LeadStatus)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.key as LeadStatus)}
              className={`flex-shrink-0 w-[260px] sm:w-[280px] flex flex-col rounded-lg transition-all ${
                dragOverCol === col.key && dragLead?.estado !== col.key
                  ? `ring-2 ${col.ring} bg-muted/30`
                  : ''
              }`}
            >
              {/* Column header */}
              <div className={`rounded-lg px-3 py-2 mb-2 ${col.bg}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                    <span className="text-[13px] font-semibold">{col.label}</span>
                  </div>
                  <span className="text-[12px] font-semibold bg-card border border-border rounded-md px-2 py-0.5 tabular-nums">
                    {colLeads.length}
                  </span>
                </div>
              </div>

              {/* Drop hint */}
              {dragOverCol === col.key && dragLead?.estado !== col.key && (
                <div className={`mb-2 px-3 py-2 rounded-md border-2 border-dashed text-xs font-medium text-center text-muted-foreground`} style={{ borderColor: col.color }}>
                  Soltar para mover a "{col.label}"
                </div>
              )}

              {/* Cards */}
              <div className="space-y-2.5 flex-1 min-h-[200px] px-1">
                {colLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    onClick={(id) => setDrawerLeadId(id)}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                  />
                ))}
                {colLeads.length === 0 && (
                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center text-[13px] text-muted-foreground">
                    <Users size={20} className="mx-auto mb-1 opacity-40" weight="regular" />
                    Sin prospectos
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
