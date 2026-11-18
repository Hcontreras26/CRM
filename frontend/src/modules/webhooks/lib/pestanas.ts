import { Bank, Lightning, ListBullets, UserPlus } from '@phosphor-icons/react';

/*
  Las pestañas de Conexión › Webhooks (#690). Viven aquí y no en
  WebhooksLayout.tsx: un archivo de componentes que exporta también datos o
  funciones rompe la recarga en caliente de Vite («Fast Refresh»).

  `module`: el módulo del campus que tenían sus entradas del menú. Con él
  apagado en el campus de arriba, la pestaña no sale, como no salía la entrada.
  `salvoTipo`: el tipo de proyecto en el que no salía su entrada (Prospectos y
  Make estaban en Captación, que un proyecto IA no tiene).
*/
type Pestana = {
  label: string; to: string; icon: typeof ListBullets; end?: boolean; module?: string; salvoTipo?: string[];
};
export const TABS: Pestana[] = [
  { label: 'Resumen', to: '/conexion/webhooks', icon: ListBullets },
  { label: 'Prospectos', to: '/conexion/webhooks/prospectos', icon: UserPlus, end: false, module: 'webhooks', salvoTipo: ['ia'] },
  { label: 'Make', to: '/conexion/webhooks/make', icon: Lightning, end: false, module: 'make', salvoTipo: ['ia'] },
  { label: 'Transferencias', to: '/conexion/webhooks/transferencias', icon: Bank },
];

/**
 * Las pestañas que salen con los módulos de este campus (`false`: apagado) y su
 * tipo de proyecto (el del menú, `tipoDelMenu`).
 */
export function pestanasDe(modules?: Record<string, boolean> | null, projectType?: string) {
  return TABS.filter((t) => (!t.module || modules?.[t.module] !== false)
    && !(t.salvoTipo && projectType && t.salvoTipo.includes(projectType)));
}
