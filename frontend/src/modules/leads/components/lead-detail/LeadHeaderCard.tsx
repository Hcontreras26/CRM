import { useState, lazy, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CaretRight, Lightning, WarningCircle, Link as LinkIcon, GitMerge, ChatCircle, FileText } from '@phosphor-icons/react';
import StatusBadge from '@/shared/components/ui/StatusBadge';
import { getLeadPriority, getPriorityStyle } from '../../lib/leadPriority';
import { avatarColor, getInitials } from './InfoField';
import type { Lead } from '@/shared/types';

const MergeLeadDialog = lazy(() => import('../MergeLeadDialog'));
// Repartir la venta de este prospecto entre dos gestoras. Se carga aparte
// porque solo lo ven admin y superadmin.
const CompartirVentaBoton = lazy(() => import('@/modules/sales/components/CompartirVentaBoton'));

interface LeadHeaderCardProps {
  lead: Lead;
  isAdmin: boolean;
  onReassign: () => void;
  onBack: () => void;
  onMerged?: () => void;
}

export default function LeadHeaderCard({ lead, isAdmin, onReassign, onBack, onMerged }: LeadHeaderCardProps) {
  const [mergeOpen, setMergeOpen] = useState(false);
  const navigate = useNavigate();
  return (
    <>
      {lead.lead_duplicado_de && (
        <div role="alert" className="flex items-center gap-3 p-4 rounded-xl bg-warning-soft border border-warning/30 text-warning dark:text-warning">
          <WarningCircle size={20} weight="bold" className="flex-shrink-0 text-warning" />
          <div className="text-sm flex-1">
            <span className="font-bold">Prospecto duplicado</span> — este email ya existe en el sistema.
          </div>
          <Link
            to={`/prospectos/${lead.lead_duplicado_de}`}
            className="text-xs font-bold flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning-soft hover:bg-warning transition-colors flex-shrink-0 focus:outline-none focus:ring-2 focus:ring-warning/40"
          >
            <LinkIcon size={12} weight="bold" /> Ver original #{lead.lead_duplicado_de}
          </Link>
        </div>
      )}

      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Link to="/prospectos" className="hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 rounded px-1">
          Prospectos
        </Link>
        <CaretRight size={10} weight="bold" className="opacity-50" />
        <span className="text-foreground font-medium truncate max-w-[200px]">{lead.nombre}</span>
      </nav>

      <div className={`bg-card border border-border border-l-4 ${getPriorityStyle(getLeadPriority(lead)).borderClass} rounded-xl p-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-base font-semibold flex-shrink-0 ${avatarColor(lead.id)}`}>
              {getInitials(lead.nombre)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-semibold truncate">{lead.nombre}</h2>
                <StatusBadge status={lead.estado} showIcon />
              </div>
              <p className="text-muted-foreground text-xs mt-0.5">
                Prospecto #{lead.id} · creado {lead.created_at ? new Date(lead.created_at).toLocaleString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--'}
                {lead.proyecto_nombre && <> · {lead.proyecto_nombre}</>}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {/* «Compartir» va antes de «Reasignar» porque son la misma familia:
                reasignar es pasarsela a otra, compartir es atenderla entre dos.
                Diego: «no es nada intuitivo» — la funcion existia pero habia que
                entrar a la ficha de la venta para encontrarla. */}
            {isAdmin && (
              <Suspense fallback={null}>
                <CompartirVentaBoton leadId={lead.id} />
              </Suspense>
            )}
            {isAdmin && (
              <button
                onClick={onReassign}
                aria-label="Reasignar"
                className="h-9 px-3 rounded-lg border border-border bg-secondary text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
              >
                <Lightning size={14} weight="bold" /> <span className="hidden sm:inline">Reasignar</span>
              </button>
            )}
            {isAdmin && lead.responsable_id && (
              <button
                onClick={() => navigate(`/mensajes?chatWith=${lead.responsable_id}&leadId=${lead.id}`)}
                aria-label="Enviar mensaje al responsable"
                title={`Chatear con el responsable sobre este prospecto`}
                className="h-9 px-3 rounded-lg border border-success/30 bg-success-soft text-success text-sm font-medium hover:bg-success-soft transition-colors flex items-center gap-2"
              >
                <ChatCircle size={14} weight="bold" /> <span className="hidden sm:inline">Mensaje</span>
              </button>
            )}
            <button
              onClick={() => navigate(`/finanzas/facturas/nueva?tipo=proforma&leadId=${lead.id}`)}
              aria-label="Emitir proforma"
              title="Emitir una proforma (presupuesto) para este prospecto, sin convertir"
              className="h-9 px-3 rounded-lg border border-info/30 bg-info-soft text-info text-sm font-medium hover:bg-info-soft transition-colors flex items-center gap-2"
            >
              <FileText size={14} weight="bold" /> <span className="hidden sm:inline">Proforma</span>
            </button>
            <button
              onClick={() => setMergeOpen(true)}
              aria-label="Fusionar duplicado"
              title="Fusionar con otro prospecto duplicado"
              className="h-9 px-3 rounded-lg border border-info/30 bg-info-soft text-info text-sm font-medium hover:bg-info-soft transition-colors flex items-center gap-2"
            >
              <GitMerge size={14} weight="bold" /> <span className="hidden sm:inline">Fusionar</span>
            </button>
            <button
              onClick={onBack}
              aria-label="Volver a prospectos"
              className="h-9 px-3 rounded-lg border border-border bg-secondary text-sm font-medium hover:bg-muted transition-colors flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
            >
              <ArrowLeft size={14} weight="bold" />
              <span className="hidden sm:inline">Volver</span>
            </button>
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <MergeLeadDialog
          open={mergeOpen}
          winner={{ id: lead.id, nombre: lead.nombre, email: lead.email }}
          projectId={(lead as any).project_id || null}
          onClose={() => setMergeOpen(false)}
          onMerged={() => { setMergeOpen(false); onMerged?.(); }}
        />
      </Suspense>
    </>
  );
}
