import { useState } from 'react';
import {
  X, Gear, FolderOpen, Notepad, PlugsConnected, Key, Tag, Table as TableIcon, CreditCard, Globe, TextT,
} from '@phosphor-icons/react';
import Portal from '@/shared/components/ui/portal';
import { useAuth } from '@/contexts/AuthContext';
import GeneralTab from './projectSettings/GeneralTab';
import ModulosTab from './projectSettings/ModulosTab';
import CategoriesTab from './projectSettings/CategoriesTab';
import FieldsTab from './projectSettings/FieldsTab';
import ColumnsTab from './projectSettings/ColumnsTab';
import WebhookTab from './projectSettings/WebhookTab';
import ApisTab from './projectSettings/ApisTab';
import StripeTab from './projectSettings/StripeTab';
import ExternalPanelsTab from './projectSettings/ExternalPanelsTab';
import SidebarLabelsTab from './projectSettings/SidebarLabelsTab';

const TABS_BASE = [
  { id: 'general', label: 'General', icon: Gear },
  { id: 'modulos', label: 'Modulos', icon: Tag },
  { id: 'categorias', label: 'Categorias', icon: FolderOpen },
  { id: 'campos', label: 'Campos', icon: Notepad },
  { id: 'columnas', label: 'Columnas', icon: TableIcon },
  { id: 'paneles', label: 'Paneles externos', icon: Globe },
  { id: 'webhook', label: 'Webhook', icon: PlugsConnected },
  { id: 'apis', label: 'APIs', icon: Key },
];
const TAB_SIDEBAR_LABELS = { id: 'etiquetas', label: 'Etiquetas sidebar', icon: TextT };
const TAB_STRIPE = { id: 'stripe', label: 'Stripe', icon: CreditCard };

export default function ProjectSettingsDialog({ project, onClose, onSaved, initialTab = 'general' }) {
  const [tab, setTab] = useState(initialTab);
  const auth = useAuth() as unknown as { user: { role?: string } | null };
  const isSuperadmin = auth.user?.role === 'superadmin';
  const TABS = [
    ...TABS_BASE,
    ...(isSuperadmin ? [TAB_SIDEBAR_LABELS] : []),
    ...(project.type === 'ia' ? [TAB_STRIPE] : []),
  ];

  return (
    <Portal>
      <div className="fixed inset-0 !m-0 z-[70] flex items-center justify-center sm:p-4">
        <div className="fixed inset-0 !m-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-card sm:rounded-lg border border-border w-full max-w-4xl flex flex-col h-full sm:h-auto sm:max-h-[92vh]">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center text-xl flex-shrink-0 overflow-hidden">
                {project.emoji || '📁'}
              </div>
              <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-semibold truncate">Configurar {project.nombre}</h2>
                <p className="text-xs text-muted-foreground truncate">{project.slug} &mdash; {project.type === 'crm' ? 'Proyecto CRM' : 'Proyecto IA'}</p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-md hover:bg-muted flex-shrink-0"><X size={18} /></button>
          </div>

          <div className="flex flex-col lg:flex-row flex-1 min-h-0">
            <nav className="lg:w-52 lg:border-r border-b lg:border-b-0 border-border lg:p-3 p-2 lg:space-y-1 bg-muted/20 flex-shrink-0 overflow-x-auto lg:overflow-x-visible">
              <div className="flex lg:flex-col gap-1 lg:gap-1 lg:w-auto w-max">
                {TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`lg:w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors whitespace-nowrap ${
                      tab === t.id
                        ? 'bg-primary text-primary-foreground font-semibold'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <t.icon size={16} weight={tab === t.id ? 'fill' : 'regular'} />
                    {t.label}
                  </button>
                ))}
              </div>
            </nav>

            <div className="flex-1 overflow-y-auto p-4 lg:p-6 min-w-0">
              {tab === 'general' && <GeneralTab project={project} onSaved={onSaved} />}
              {tab === 'modulos' && <ModulosTab project={project} onSaved={onSaved} />}
              {tab === 'categorias' && <CategoriesTab project={project} />}
              {tab === 'campos' && <FieldsTab project={project} onSaved={onSaved} />}
              {tab === 'columnas' && <ColumnsTab project={project} onSaved={onSaved} />}
              {tab === 'paneles' && <ExternalPanelsTab project={project} onSaved={onSaved} />}
              {tab === 'etiquetas' && isSuperadmin && <SidebarLabelsTab project={project} onSaved={onSaved} />}
              {tab === 'webhook' && <WebhookTab project={project} />}
              {tab === 'apis' && <ApisTab project={project} />}
              {tab === 'stripe' && <StripeTab project={project} />}
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
