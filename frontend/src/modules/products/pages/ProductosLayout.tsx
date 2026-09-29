import { Outlet } from 'react-router-dom';
import { Package, ListBullets, Tree, Clock, ShoppingBag } from '@phosphor-icons/react';
import SubNav from '@/shared/components/ui/SubNav';

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
];

export default function ProductosLayout() {
  return (
    <div className="flex flex-col h-full">
      <SubNav tabs={TABS} sectionLabel="Productos" sectionIcon={Package} />
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
