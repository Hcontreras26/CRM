import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { abrirChatCrm } from '@/shared/lib/abrirChatCrm';
import { toast } from '@/shared/hooks/useToast';
import {
  WhatsappLogo, EnvelopeSimple, CalendarPlus, CheckCircle, Lightning, PencilSimple, Trash, Flag,
} from '@phosphor-icons/react';
import { fillTemplate } from '../hooks/useWhatsappTemplates';
import { telefonoParaWhatsapp } from '@/shared/lib/telefono';

interface LeadLite {
  id: number;
  nombre?: string;
  telefono?: string | null;
  estado?: string;
}

interface WhatsappTemplate {
  id: string | number;
  label: string;
  text: string;
}

interface Props {
  lead: LeadLite;
  onMarkContacted?: (lead: LeadLite) => void;
  onConvert?: (lead: LeadLite) => void;
  onLogInteraction?: (lead: LeadLite, kind: string) => void;
  onCreateReminder?: (lead: LeadLite) => void;
  onEnrollSequence?: (lead: LeadLite) => void;
  onSoftDelete?: (lead: LeadLite) => void;  // superadmin
  onReportSpam?: (lead: LeadLite) => void;  // cualquier rol
  templates?: WhatsappTemplate[];
  projectName?: string;
  onEditTemplates?: () => void;
}

/**
 * Iconos de acción rápida en cada fila/card de lead. Mantiene su propio
 * estado para el menú desplegable de plantillas WhatsApp.
 */
export default function QuickActions({
  lead,
  onMarkContacted,
  onConvert,
  onLogInteraction,
  onCreateReminder,
  onEnrollSequence,
  onSoftDelete,
  onReportSpam,
  templates,
  projectName,
  onEditTemplates,
}: Props) {
  const navigate = useNavigate();
  // Con el criterio del backend, no con «quitale lo que no sea un digito».
  // Ese daba por bueno un «600123456.0» de Excel —Excel los guarda como numero
  // y deja el .0— y un «123», asi que se enseñaba el boton, se pulsaba, y el
  // chat no abria. Ahora si no hay numero utilizable no hay boton.
  const wa = telefonoParaWhatsapp(lead.telefono);
  const [waMenuOpen, setWaMenuOpen] = useState(false);

  // La plantilla se copia al portapapeles y la conversacion se abre DENTRO del
  // CRM. Antes se lanzaba wa.me en otra pestaña: se salia del CRM, no quedaba
  // registro, y con varias sesiones enlazadas abria la del navegador —que puede
  // ser la personal de quien pulsa— en vez de la del CRM.
  async function openWhatsappWithTemplate(tpl: WhatsappTemplate | null) {
    const text = tpl ? fillTemplate(tpl.text, { lead, projectName }) : '';
    if (text) { try { await navigator.clipboard?.writeText(text); } catch { /* sin portapapeles */ } }
    setWaMenuOpen(false);
    const destino = await abrirChatCrm({ leadId: lead.id, telefono: lead.telefono });
    if (!destino) {
      toast({
        title: 'No se ha podido abrir el chat',
        description: 'Comprueba en WhatsApp · Conexión que tu número sigue enlazado.',
        variant: 'destructive',
      });
      return;
    }
    onLogInteraction?.(lead, 'whatsapp');
    navigate(destino);
  }

  return (
    <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {wa && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setWaMenuOpen((o) => !o)}
            title="WhatsApp con plantilla"
            className="p-1.5 rounded hover:bg-success-soft text-muted-foreground hover:text-success transition-colors"
          >
            <WhatsappLogo size={14} weight="regular" />
          </button>
          {waMenuOpen && (
            <>
              <div className="fixed inset-0 !m-0 z-30" onClick={() => setWaMenuOpen(false)} />
              <div
                className="absolute right-0 top-full mt-1 bg-card border border-border rounded-md py-1 min-w-60 z-40"
                style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.12)' }}
              >
                <div className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Plantillas</div>
                <button
                  type="button"
                  onClick={() => openWhatsappWithTemplate(null)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2"
                >
                  <WhatsappLogo size={12} weight="regular" /> Mensaje en blanco
                </button>
                {(templates || []).map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => openWhatsappWithTemplate(tpl)}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted"
                    title={tpl.text}
                  >
                    <span className="font-medium block truncate">{tpl.label}</span>
                    <span className="block text-[10px] text-muted-foreground truncate">{tpl.text}</span>
                  </button>
                ))}
                {onEditTemplates && (
                  <>
                    <div className="my-1 border-t border-border" />
                    <button
                      type="button"
                      onClick={() => { onEditTemplates(); setWaMenuOpen(false); }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2 text-muted-foreground"
                    >
                      <PencilSimple size={12} weight="regular" /> Editar plantillas
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
      {onEnrollSequence && (
        <button
          onClick={() => onEnrollSequence(lead)}
          title="Enrolar en secuencia de email"
          className="p-1.5 rounded hover:bg-warning-soft text-muted-foreground hover:text-warning transition-colors"
        >
          <EnvelopeSimple size={14} weight="regular" />
        </button>
      )}
      {onCreateReminder && (
        <button
          onClick={() => onCreateReminder(lead)}
          title="Programar siguiente contacto"
          className="p-1.5 rounded hover:bg-info-soft text-muted-foreground hover:text-info transition-colors"
        >
          <CalendarPlus size={14} weight="regular" />
        </button>
      )}
      {lead.estado !== 'contactado' && lead.estado !== 'convertido' && lead.estado !== 'no_interesado' && onMarkContacted && (
        <button
          onClick={() => onMarkContacted(lead)}
          title="Marcar contactado"
          className="p-1.5 rounded hover:bg-success-soft text-muted-foreground hover:text-success transition-colors"
        >
          <CheckCircle size={14} weight="regular" />
        </button>
      )}
      {lead.estado !== 'convertido' && onConvert && (
        <button
          onClick={() => onConvert(lead)}
          title="Convertir a cliente"
          className="p-1.5 rounded hover:bg-info-soft text-muted-foreground hover:text-info transition-colors"
        >
          <Lightning size={14} weight="regular" />
        </button>
      )}
      {onReportSpam && (
        <button
          onClick={() => onReportSpam(lead)}
          title="Reportar como spam (revisa superadmin)"
          className="p-1.5 rounded hover:bg-warning-soft text-muted-foreground hover:text-warning transition-colors"
        >
          <Flag size={14} weight="regular" />
        </button>
      )}
      {onSoftDelete && (
        <button
          onClick={() => onSoftDelete(lead)}
          title="Eliminar (superadmin)"
          className="p-1.5 rounded hover:bg-destructive-soft text-muted-foreground hover:text-destructive transition-colors"
        >
          <Trash size={14} weight="regular" />
        </button>
      )}
    </div>
  );
}
