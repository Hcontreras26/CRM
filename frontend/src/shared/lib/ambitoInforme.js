/*
  De qué va lo que estás mirando: un campus, una sociedad entera, o todo.

  Empezó siendo solo para informes (#120) y ahora vale para cualquier pantalla
  que sepa trabajar con varios proyectos a la vez (#103), que es lo que pedía
  Diego: «como Todos, pero acotado a una sociedad».

  Los informes se piden desde ocho sitios distintos, y cada uno se montaba sus
  parámetros a mano con un `if (activeProject?.id) p.set('projectId', …)`. Con
  la sociedad de por medio (#120) eso son ocho sitios donde olvidarse de
  `issuerId`, y el fallo no se ve: el informe sale, con las cifras de otro
  ámbito.

  Aquí se decide una vez.

  EL NOMBRE SE QUEDA CORTO A PROPÓSITO. Esto ya no es solo de informes, así que
  «ambitoInforme» no lo describe bien. Pero lo importan nueve pantallas y
  renombrarlo convierte un cambio de nueve líneas en nueve conflictos con quien
  esté tocando esas pantallas — que es exactamente el #127. Un nombre regular
  cuesta menos que una fusión perdida.

  LA REGLA
  --------
    una sociedad  →  issuerId=3      (sus campus sumados)
    un campus     →  projectId=7
    todos         →  no se manda nada

  «Todos los proyectos» es el id -1, que es un valor interno del CRM y no
  significa nada para el servidor: mandarlo pediría el proyecto número menos
  uno. Por eso se omite.
*/

export const TODOS_LOS_PROYECTOS = -1;

/**
 * Pone en `params` lo que corresponda. Devuelve los mismos `params` para poder
 * encadenar.
 *
 * @param {URLSearchParams} params
 * @param {{ activeIssuerId?: number|null, activeProject?: { id?: number|null }|null }} ambito
 */
export function ponerAmbito(params, { activeIssuerId = null, activeProject = null } = {}) {
  if (activeIssuerId) {
    params.set('issuerId', String(activeIssuerId));
    return params;
  }
  const id = activeProject?.id;
  if (id && id !== TODOS_LOS_PROYECTOS) params.set('projectId', String(id));
  return params;
}

/**
 * Lo mismo, para quien arma un objeto en vez de una cadena de consulta.
 * Devuelve `{}`, `{ projectId }` o `{ issuerId }`.
 */
export function ambitoComoObjeto({ activeIssuerId = null, activeProject = null } = {}) {
  if (activeIssuerId) return { issuerId: activeIssuerId };
  const id = activeProject?.id;
  return id && id !== TODOS_LOS_PROYECTOS ? { projectId: id } : {};
}

/**
 * Si la sociedad elegida no tiene ni un campus, el informe sale vacío a
 * propósito. Quien pinta la pantalla necesita saberlo para decirlo en vez de
 * enseñar una tabla vacía, que parece una avería.
 */
export function sociedadSinCampus(activeIssuer) {
  return !!activeIssuer && (activeIssuer.campus?.length ?? 0) === 0;
}

/**
 * Los proyectos que entran en lo que estás mirando.
 *
 * Es la misma pregunta que `ponerAmbito`, para las pantallas que no filtran
 * con un `issuerId` sino con una lista de proyectos: `/leads` acepta
 * `projectIds=1,2,3` y filtra con un IN, así que una sociedad es exactamente
 * eso con una lista más corta. Sin tocar el servidor.
 *
 *   una sociedad  →  sus campus
 *   todos         →  todos los proyectos del usuario
 *   un campus     →  vacío, que quiere decir «usa el projectId de siempre»
 */
export function proyectosDelAmbito({ activeIssuer = null, isAllProjects = false, projects = [] } = {}) {
  if (activeIssuer) return activeIssuer.campus || [];
  if (isAllProjects) return projects || [];
  return [];
}

/** Los ids de esos proyectos, que es lo que viaja en la consulta. */
export function idsDelAmbito(ambito) {
  return proyectosDelAmbito(ambito).map((p) => p.id);
}
