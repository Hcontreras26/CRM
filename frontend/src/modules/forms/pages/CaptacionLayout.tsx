import { Outlet } from 'react-router-dom';
import { Globe, ListBullets } from '@phosphor-icons/react';
import SubNav from '@/shared/components/ui/SubNav';

// Webhooks y Make eran pestañas de aquí; desde la #690 viven en Conexión ›
// Webhooks, con todos los demás (sus direcciones viejas redirigen allí).
const TABS = [
  { label: 'Formularios', to: '/captacion', icon: ListBullets },
];

export default function CaptacionLayout() {
  return (
    <div className="flex flex-col h-full">
      <SubNav tabs={TABS} sectionLabel="Captación" sectionIcon={Globe} />
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
