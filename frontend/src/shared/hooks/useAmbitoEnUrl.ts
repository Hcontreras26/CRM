import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useProjectContext } from '@/contexts/ProjectContext';

/**
 * El campus o la empresa que se mira, escrito en la dirección (#1194).
 *
 * Así un enlace de Ventas o de Análisis abre con el mismo campus (`?projectId=`)
 * o la misma empresa (`?issuerId=`). Lo LEE `AuthContext` al entrar —antes que
 * el router— y solo elige entre los campus de la persona: un id ajeno en la
 * barra no da acceso a nada. Este hook solo lo mantiene al día cuando se cambia
 * arriba, con `replace` para no llenar el historial.
 *
 * Con «Todos los proyectos» no se escribe nada: no hay un campus que pasar.
 *
 * `alCambiar`: claves de la dirección que se borran cuando se cambia de campus
 * (la página, por ejemplo). Van en la MISMA escritura: dos `setSearchParams`
 * seguidos se pisan.
 */
export default function useAmbitoEnUrl(alCambiar: readonly string[] = []) {
  const { activeProject, activeIssuerId } = useProjectContext() as {
    activeProject: { id: number | null } | null;
    activeIssuerId: number | null;
  };
  const [params, setParams] = useSearchParams();
  const id = activeProject?.id ?? null;
  const quiereProyecto = !activeIssuerId && id && id > 0 ? String(id) : null;
  const quiereEmpresa = activeIssuerId ? String(activeIssuerId) : null;
  const tieneProyecto = params.get('projectId');
  const tieneEmpresa = params.get('issuerId');
  const claves = alCambiar.join(',');

  useEffect(() => {
    // Aún cargando la sesión: no hay campus que escribir.
    if (!id) return;
    if (tieneProyecto === quiereProyecto && tieneEmpresa === quiereEmpresa) return;
    // Si la dirección ya decía otro campus, es un cambio de verdad: se borra lo
    // que depende de él. Si no decía ninguno, es la primera vez y no se toca.
    const cambio = tieneProyecto !== null || tieneEmpresa !== null;
    setParams((previos) => {
      const nuevos = new URLSearchParams(previos);
      nuevos.delete('projectId');
      nuevos.delete('issuerId');
      if (quiereProyecto) nuevos.set('projectId', quiereProyecto);
      if (quiereEmpresa) nuevos.set('issuerId', quiereEmpresa);
      if (cambio) for (const k of claves.split(',').filter(Boolean)) nuevos.delete(k);
      return nuevos;
    }, { replace: true, preventScrollReset: true });
  }, [id, quiereProyecto, quiereEmpresa, tieneProyecto, tieneEmpresa, claves, setParams]);
}
