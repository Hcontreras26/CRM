import { useProjectContext } from '@/contexts/ProjectContext';
import { Outlet, useLocation } from 'react-router-dom';
import {
  Calculator, ChartBar, TrendUp, Receipt, TrendDown, GraduationCap,
  Wallet, HandCoins, CurrencyEur, PlugsConnected, WarningCircle, CreditCard,
} from '@phosphor-icons/react';
import SubNav from '@/shared/components/ui/SubNav';
import BetaDisclaimer from '@/shared/components/ui/BetaDisclaimer';

export const TABS = [
  { label: 'Dashboard', to: '/finanzas', icon: ChartBar },
  { label: 'Ventas', to: '/finanzas/ventas', icon: Receipt },
  { label: 'Análisis de ventas', to: '/finanzas/ventas-analisis', icon: ChartBar },
  { label: 'Ingresos', to: '/finanzas/ingresos', icon: TrendUp },
  { label: 'Conversiones', to: '/finanzas/conversiones', icon: CurrencyEur },
  { label: 'Egresos', to: '/finanzas/egresos', icon: TrendDown },
  { label: 'Por cobrar', to: '/finanzas/por-cobrar', icon: Wallet },
  { label: 'Por pagar', to: '/finanzas/por-pagar', icon: Receipt },
  { label: 'Comisiones', to: '/finanzas/comisiones', icon: HandCoins },
  { label: 'Nóminas', to: '/finanzas/nominas', icon: Calculator },
  { label: 'Pendientes facturar', to: '/finanzas/pendiente-facturar', icon: WarningCircle },
  // Al lado de «pendientes de facturar» porque es su pariente: cosas cobradas
  // a las que les falta un dato para poder cerrarse (#41).
  { label: 'Sin formación', to: '/finanzas/ventas-sin-formacion', icon: GraduationCap },
  { label: 'Pagos Stripe', to: '/finanzas/pagos-stripe', icon: CreditCard },
  { label: 'Facturas', to: '/finanzas/facturas', icon: Receipt },
  // Facturas de colaboradores (#202): en evaluación, solo en /testeo y en local.
  { label: 'Facturas de colaboradores', to: '/finanzas/facturas-colaboradores', icon: Receipt },
  { label: 'Integraciones', to: '/finanzas/integraciones', icon: PlugsConnected },
];

/**
 * Pantallas de Finanzas que van SIN el submenú (#79 punto 3): en Ventas
 * competía con la cabecera y quedaban dos barras de navegación una debajo de
 * otra. Lo que ofrecía ya está en el menú lateral, como en SuiteDash (#78);
 * lo único que no está, «Análisis de ventas», va como botón en su cabecera.
 */
export const SIN_SUBMENU = ['/finanzas/ventas'];

/**
 * Las pestañas de un proyecto IA son OTRAS (#44).
 *
 * Un proyecto IA no tiene egresos, ni nóminas, ni comisiones, ni cuentas por
 * pagar: cobra suscripciones. De las quince pestañas, once no pueden tener
 * contenido nunca — y con once vacías no se encuentran las cuatro que sí.
 *
 * Es el mismo recorte que ya hace el menú lateral. Se repite aquí porque son
 * dos barras distintas: esconder una y dejar la otra es lo que hacía que el
 * menú dijera cinco cosas y la pantalla siguiera enseñando quince.
 */
const EN_IA = new Set([
  '/finanzas',
  '/finanzas/ventas',
  '/finanzas/pagos-stripe',
  '/finanzas/facturas',
  '/finanzas/integraciones',
]);

export default function FinanzasLayout() {
  const { pathname } = useLocation();
  const conSubmenu = !SIN_SUBMENU.includes(pathname.replace(/\/$/, ''));
  const { activeProject } = useProjectContext() as { activeProject: { type?: string } | null };
  const tabs = activeProject?.type === 'ia'
    // En IA los cobros no entran por Stripe: la pestaña se llama como lo que enseña.
    ? TABS.filter((t) => EN_IA.has(t.to)).map((t) => (t.to === '/finanzas/pagos-stripe' ? { ...t, label: 'Cobros' } : t))
    : TABS;

  return (
    <div className="flex flex-col h-full">
      {conSubmenu && <SubNav tabs={tabs} sectionLabel="Finanzas" sectionIcon={Calculator} />}
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
