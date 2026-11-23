import { Outlet } from 'react-router-dom';
import { Package, ListBullets, Tree, Clock, ShoppingBag, GraduationCap } from '@phosphor-icons/react';
import SubNav from '@/shared/components/ui/SubNav';
import { useAuth } from '@/contexts/AuthContext';
import { soloEsTutor, soloEsTutorRedactor } from '@/shared/lib/roles';

// Cada pestaña se llama como la pantalla que abre (#79).
//
// «Árbol» abría «Productos por categoría», mientras que el árbol de categorías
// de verdad —otra pantalla— vivía en `/configuracion/categorias-arbol` y no
// tenía entrada en ningún sitio: no se podía llegar a ella. Dos pantallas, tres
// nombres cruzados.
const TABS = [
  { label: 'Catálogo', to: '/productos', icon: ListBullets },
  { label: 'Por categoría', to: '/productos/arbol', icon: ListBullets },
  { label: 'Árbol de categorías', to: '/productos/categorias', icon: Tree },
  { label: 'Cursos pendientes', to: '/productos/pendientes', icon: Clock },
  { label: 'WooCommerce', to: '/productos/woocommerce', icon: ShoppingBag },
  // CRM#957: el curso de Moodle de cada producto. La pestaña sale con su permiso (rutaPermitida).
  { label: 'Cursos de Moodle', to: '/productos/cursos-moodle', icon: GraduationCap },
];

export default function ProductosLayout() {
  const { user } = useAuth() as { user: Parameters<typeof soloEsTutor>[0] };
  // Un tutor o un tutor redactor solo entra a «Cursos pendientes» (#770): las
  // demás pestañas le devolverían a lo suyo (ProtectedRoute).
  const tabs = soloEsTutor(user) || soloEsTutorRedactor(user)
    ? TABS.filter((t) => t.to === '/productos/pendientes')
    : TABS;
  return (
    <div className="flex flex-col h-full">
      <SubNav tabs={tabs} sectionLabel="Productos" sectionIcon={Package} />
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
