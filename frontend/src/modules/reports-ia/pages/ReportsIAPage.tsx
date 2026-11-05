import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useProjectContext } from '@/contexts/ProjectContext';
import PageHeader from '@/shared/components/ui/PageHeader';
import EmptyState from '@/shared/components/ui/EmptyState';
import { Sparkle, ChartBar } from '@phosphor-icons/react';
import ReportsIAView from '../components/ReportsIAView';
import { ambitoComoObjeto, TODOS_LOS_PROYECTOS } from '@/shared/lib/ambitoInforme';

/**
 * Página dedicada de Análisis IA, para cualquier campus.
 *
 * Antes solo dejaba entrar a los proyectos «de tipo IA» (Psicólogo IA,
 * Nutricionista IA, Tarot IA), que no están dados de alta, así que nadie podía
 * generar un informe (#216). El servidor nunca tuvo esa restricción, y el
 * informe sale de los leads, las ventas y los UTM del campus.
 */
export default function ReportsIAPage() {
  const { activeProject, activeIssuerId } = useProjectContext() as {
    activeProject: { id: number; nombre?: string; slug?: string } | null;
    activeIssuerId?: number | null;
  };
  // Con «Todos» o una empresa (#218, Diego 04/11): los informes de todos sus
  // campus, cada uno con el suyo. Generar uno nuevo pide su campus dentro.
  const general = activeProject?.id === TODOS_LOS_PROYECTOS || !!activeIssuerId;
  // Memorizado: el historial se vuelve a pedir cuando cambia, y un objeto nuevo
  // en cada render lo pediría sin parar.
  const ambito = useMemo(
    () => (general ? ambitoComoObjeto({ activeIssuerId, activeProject: { id: TODOS_LOS_PROYECTOS } }) : null),
    [general, activeIssuerId],
  );

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Análisis IA"
        subtitle={
          general
            ? 'Reportes generados con Claude AI · los de todos tus campus'
            : activeProject
            ? `Reportes generados con Claude AI · ${activeProject.nombre}`
            : 'Reportes generados con Claude AI'
        }
      />

      {!activeProject ? (
        <EmptyState
          icon={Sparkle}
          title="Elige un campus"
          description="El informe se hace con los datos de un campus. Elígelo en la barra superior."
          action={
            <Link
              to="/informes"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted transition-colors"
            >
              <ChartBar size={14} weight="bold" /> Ver reportes CRM
            </Link>
          }
        />
      ) : (
        <ReportsIAView project={general ? null : activeProject} ambito={ambito} />
      )}
    </div>
  );
}
