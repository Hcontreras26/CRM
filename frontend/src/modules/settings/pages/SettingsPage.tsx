import { useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { ArrowSquareOut } from '@phosphor-icons/react';
import PageHeader from '@/shared/components/ui/PageHeader';
import usePermission from '@/shared/hooks/usePermission';
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

// Pestañas que piden un permiso para leerse (QA de /testeo del 18/11/2026). Sin
// él, el servidor contesta 403: Usuarios y Disponibilidad leen `/users*`
// (users.view) y APIs globales lee `/credentials` (credentials.view). Antes se
// pintaban igual, y una gestora veía «sin configurar» con un «Configurar» que
// acababa en 403, o tres peticiones fallidas detrás del aviso de Usuarios.
// Las que no salen aquí no piden permiso para leerse.
// Diego, 21/11/2026: una gestora tampoco ve «Roles y Permisos» ni «Webhooks»
// (las dos piden su permiso en el servidor y la gestora no lo trae).
export const PERMISO_DE_PESTANA: Record<string, string> = {
  users: 'users.view',
  availability: 'users.view',
  apis: 'credentials.view',
  roles: 'roles.view',
  webhooks: 'webhooks.view',
};

export default function SettingsPage() {
  // `?pestana=users` abre directamente esa pestaña (el buscador, Ctrl K, #591).
  // Sin el parámetro, como siempre: Proyectos.
  const [params] = useSearchParams();
  const { can } = usePermission();
  const permitida = (id: string) => !PERMISO_DE_PESTANA[id] || can(PERMISO_DE_PESTANA[id]);
  const pestanas = TABS.filter((tab) => permitida(tab.id));
  const pedida = params.get('pestana');
  const [elegida, setActiveTab] = useState(pedida && pedida in TAB_CONTENT ? pedida : 'projects');
  // Con la dirección a mano (`?pestana=users`) y sin el permiso: Proyectos.
  const activeTab = permitida(elegida) ? elegida : 'projects';
  const TabContent = TAB_CONTENT[activeTab];

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" subtitle="Ajustes del sistema y gestión de usuarios" />

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-52 flex lg:flex-col gap-1 overflow-x-auto flex-shrink-0">
          {pestanas.map((tab) => {
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
