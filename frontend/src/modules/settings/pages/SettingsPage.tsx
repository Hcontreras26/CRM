import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowSquareOut } from '@phosphor-icons/react';
import PageHeader from '@/shared/components/ui/PageHeader';
import { TABS } from '../components/settings/shared';
import UsersTab from '../components/settings/UsersTab';
import ProjectsTab from '../components/settings/ProjectsTab';
import ApisTab from '../components/settings/ApisTab';
import SecurityTab from '../components/settings/SecurityTab';
import FormsTab from '../components/settings/FormsTab';
import AvailabilityTab from '../components/settings/AvailabilityTab';

// Todos los iconos del submenú, del mismo tamaño y del mismo grosor.
//
// Antes el seleccionado iba en `duotone` y el resto en `regular`: dos dibujos
// distintos del mismo icono según dónde estuvieras, y la lista dejaba de leerse
// como una lista. Lo que marca la selección es el fondo y el color, que es
// donde se mira. Y nunca emojis: cambian de dibujo en cada sistema, no se
// colorean y no se alinean con el texto.
const ICONO_TAM = 16;
const ICONO_GROSOR = 'regular' as const;

const ITEM_BASE =
  'w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-md text-normal whitespace-nowrap transition-colors';

const TAB_CONTENT = {
  users: UsersTab,
  availability: AvailabilityTab,
  projects: ProjectsTab,
  forms: FormsTab,
  apis: ApisTab,
  security: SecurityTab,
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('projects');
  const TabContent = TAB_CONTENT[activeTab];

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" subtitle="Ajustes del sistema y gestión de usuarios" />

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-52 flex lg:flex-col gap-1 overflow-x-auto flex-shrink-0">
          {TABS.map((tab) => {
            if (tab.to) {
              return (
                <NavLink
                  key={tab.id}
                  to={tab.to}
                  className={`${ITEM_BASE} text-muted-foreground hover:bg-muted hover:text-foreground`}
                >
                  <tab.icon size={ICONO_TAM} weight={ICONO_GROSOR} className="flex-shrink-0" />
                  <span className="flex-1">{tab.label}</span>
                  <ArrowSquareOut size={12} className="opacity-50 flex-shrink-0" />
                </NavLink>
              );
            }
            const seleccionado = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={seleccionado ? 'page' : undefined}
                className={`${ITEM_BASE} ${
                  seleccionado
                    ? 'bg-primary/10 text-primary font-semibold'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <tab.icon size={ICONO_TAM} weight={ICONO_GROSOR} className="flex-shrink-0" />
                <span className="flex-1">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-w-0">
          <TabContent />
        </div>
      </div>
    </div>
  );
}
