/**
 * Quien entra en el reparto de leads, y en que orden (#11).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTA AQUI Y NO EN CADA SITIO
 *
 * Esta lista estaba escrita DOS VECES, y las dos no decian lo mismo:
 *
 *   - `lead.model.js` la usa para repartir de verdad. Salta a quien esta
 *     marcado como no disponible, a quien tiene una ausencia hoy, y a quien
 *     lleva las colaboraciones de los profesores; y para que un admin entre,
 *     exige `recibe_leads`.
 *   - `shortcuts.controller.js` la usaba para contestar «a quien le toca el
 *     siguiente», y no miraba NADA de eso.
 *
 * O sea que la pantalla podia decir «el proximo es Laura» con Laura de
 * vacaciones, y el lead caerle a otra persona. Una pantalla que nombra a
 * alguien con seguridad y se equivoca es peor que no tenerla: el equipo se
 * organiza con lo que lee.
 *
 * No es culpa de nadie: son dos consultas parecidas en ficheros distintos y
 * cada arreglo del reparto —lo de las ausencias, lo de `recibe_leads`, lo de
 * las colaboraciones— se hizo en una sola. Por eso ahora hay una y la usan las
 * dos: para que no puedan volver a separarse.
 *
 * EL ORDEN TIENE QUE SER DETERMINISTA
 *
 * El round-robin guarda una POSICION (`last_assigned_index`), no una persona.
 * Si dos gestores comparten `orden_cola`, Postgres puede devolverlos en un
 * orden distinto entre dos consultas —no lo promete— y entonces la misma
 * posicion apunta a alguien distinto: uno recibe dos leads seguidos y el otro
 * ninguno, sin que nada falle ni quede rastro. Por eso se desempata por `id`.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Los gestores que van a recibir leads de este proyecto, en el orden en que les
 * toca.
 *
 * `ejecutar` es la funcion de consulta: el `query` normal, o el `client.query`
 * de dentro de la transaccion del alta —el reparto va en transaccion y tiene
 * que leer con el mismo cliente que hizo el `FOR UPDATE`, o se lee otra cosa.
 */
export async function gestoresDelReparto(ejecutar, projectId) {
  const { rows } = await ejecutar(
    `SELECT u.id, u.nombre, u.email, u.avatar_url, up.orden_cola
       FROM user_projects up
       JOIN users u ON u.id = up.user_id
        AND u.active = true
        AND u.is_available = true
        AND (u.role = 'gestor' OR (u.role IN ('admin','superadmin') AND up.recibe_leads = TRUE))
        -- Quien lleva las colaboraciones de los profesores NO vende: da de alta
        -- tutores y le toca el porcentaje. Entraba en el reparto solo por tener
        -- rol de gestora, y un lead que le cae a ella es un lead que nadie
        -- llama — no es su trabajo ni mira esa bandeja.
        AND NOT COALESCE(u.gestor_colaboraciones, false)
      WHERE up.project_id = $1 AND up.active = true
        AND NOT EXISTS (
          SELECT 1 FROM user_availability_blocks ab
           WHERE ab.user_id = u.id
             AND CURRENT_DATE BETWEEN ab.fecha_inicio AND ab.fecha_fin
        )
      ORDER BY up.orden_cola, u.id`,
    [projectId]
  );
  return rows;
}

/**
 * A quien le toca el siguiente, dado el cursor guardado.
 *
 * La cuenta es la misma que hace el alta. Se saca aparte para que la pantalla
 * y el reparto no puedan contestar cosas distintas teniendo la misma lista.
 */
export function aQuienLeToca(gestores, ultimoIndice) {
  if (!gestores.length) return { indice: null, gestor: null };

  // `Number(undefined) ?? -1` NO da -1: `??` solo mira null y undefined, y
  // `NaN` no es ninguno de los dos. Se colaba como NaN hasta `gestores[NaN]`,
  // o sea `undefined` haciendose pasar por una persona hasta la pantalla.
  const n = Number(ultimoIndice);
  const desde = Number.isFinite(n) ? Math.trunc(n) : -1;

  // El doble resto es para los negativos: `(-5 + 1) % 3` es -1 en JavaScript,
  // no 2. Un cursor negativo raro no puede acabar en un hueco de la lista.
  const indice = (((desde + 1) % gestores.length) + gestores.length) % gestores.length;
  return { indice, gestor: gestores[indice] };
}

export default { gestoresDelReparto, aQuienLeToca };
