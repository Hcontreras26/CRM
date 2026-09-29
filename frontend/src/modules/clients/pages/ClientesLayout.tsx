import { Outlet } from 'react-router-dom';
import { UserCheck, ListBullets, GraduationCap } from '@phosphor-icons/react';
import SubNav from '@/shared/components/ui/SubNav';
import { useProjectContext } from '@/contexts/ProjectContext';
import { ofreceMatriculas } from '@/shared/lib/etiquetas';

export default function ClientesLayout() {
  const { activeProject } = useProjectContext();

  // Matrículas no sale en una plataforma de IA, igual que en los accesos clave
  // de la propia pantalla: el catálogo de tipos dice «producto de suscripción,
  // sin matrículas ni catálogo de cursos», y esa pestaña lleva a una lista que
  // ahí siempre estará vacía.
  //
  // Esta segunda puerta salió de mirar la captura, no el código: el acceso ya
  // estaba escondido y la pestaña seguía ofreciéndolo dos centímetros más
  // arriba. Esconder una de las dos es peor que no esconder ninguna, porque
  // parece decidido.
  const tabs = [
    { label: 'Listado', to: '/clientes', icon: ListBullets },
    ...(ofreceMatriculas(activeProject)
      ? [{ label: 'Matrículas', to: '/clientes/matriculas', icon: GraduationCap }]
      : []),
  ];

  return (
    <div className="flex flex-col h-full">
      <SubNav tabs={tabs} sectionLabel="Clientes" sectionIcon={UserCheck} />
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
