import { useMemo } from 'react';
import { useProjectContext } from '@/contexts/ProjectContext';
import { ambitoComoObjeto, TODOS_LOS_PROYECTOS } from '@/shared/lib/ambitoInforme';

/**
 * ¿Hay UN campus arriba, o la vista general (#218)? Con «Todos los proyectos»
 * o una empresa, `activeProject` es el seudoproyecto -1 (`switchIssuer` lo deja
 * así a propósito) y las pantallas de catálogo enseñan todos los campus juntos.
 *
 *   · `general`: true con «Todos» o una empresa.
 *   · `campus`: el id del campus de arriba, o null en la vista general.
 *   · `ambito`: lo que se manda al servidor (`{}`, `{ issuerId }`), que recorta
 *     a los campus de quien pide.
 */
export function useVistaGeneral() {
  const { activeProject, activeIssuerId } = useProjectContext() as {
    activeProject: { id?: number | null } | null;
    activeIssuerId?: number | null;
  };
  const id = activeProject?.id ?? null;
  const general = id === TODOS_LOS_PROYECTOS || !!activeIssuerId;
  const ambito = useMemo(
    () => (general ? ambitoComoObjeto({ activeIssuerId, activeProject: { id } }) : null),
    [general, activeIssuerId, id],
  );
  return { general, campus: general ? null : id, ambito };
}
