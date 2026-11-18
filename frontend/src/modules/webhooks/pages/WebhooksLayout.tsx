import { Outlet } from 'react-router-dom';
import { WebhooksLogo } from '@phosphor-icons/react';
import SubNav from '@/shared/components/ui/SubNav';
import { useProjectContext } from '@/contexts/ProjectContext';
import { tipoDelMenu } from '@/shared/lib/proyectosIA';
import { pestanasDe } from '../lib/pestanas';

/*
  Conexión › Webhooks (#690): un solo apartado para todos. El Resumen los reúne
  por función; las otras pestañas son las pantallas de siempre, que estaban
  sueltas en Captación (Webhooks y Make) y en Conexión (transferencias). Sus
  direcciones viejas redirigen aquí (App.jsx). SubNav esconde la pestaña que no
  se puede abrir, con el permiso de `SIN_ENTRADA` en el Sidebar; las pestañas y
  su módulo, en ../lib/pestanas.
*/
export default function WebhooksLayout() {
  const { activeProject } = useProjectContext() as {
    activeProject: { modules?: Record<string, boolean> | null; type?: string | null } | null;
  };
  // El tipo, con la MISMA regla que el menú y el buscador (`tipoDelMenu` del
  // proyecto de arriba): las pestañas de Captación salen donde salía su sección.
  // Con una empresa o «Todos» (`type: 'multi'`), salen, como salía Captación.
  const tipo = tipoDelMenu(activeProject?.type);
  return (
    <div className="flex flex-col h-full">
      <SubNav tabs={pestanasDe(activeProject?.modules, tipo)} sectionLabel="Webhooks" sectionIcon={WebhooksLogo} />
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
