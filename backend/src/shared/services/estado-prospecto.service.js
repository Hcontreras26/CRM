import { query, getClient } from '../config/db.js';
import { logger } from '../utils/logger.js';
import { PASO_CERRADO } from '../utils/pasoCerrado.js';
import { EN_EL_PROCESO } from '../utils/enElProceso.js';

/**
 * EL ESTADO DEL PROSPECTO, DEDUCIDO DEL TRABAJO DE VERDAD.
 *
 * El problema que arregla: la etiqueta («por contactar», «contactado»...) la
 * movia una persona a mano, y la agenda comercial iba por su cuenta con las
 * fechas y los contactos apuntados. Dos libros de contabilidad. En la cola hay
 * prospectos marcados «Contactado» con cero contactos hechos y 28 dias de
 * retraso: la etiqueta dice una cosa y el trabajo otra, y el filtro de estado
 * deja de servir para repartir el dia.
 *
 * Aqui la etiqueta pasa a ser una CONSECUENCIA, y se mueve en las dos
 * direcciones:
 *
 *   · hacia delante, cuando se apunta un contacto o se marca un paso;
 *   · hacia atras, cuando vence un paso sin darlo, para que la persona vuelva
 *     a salir en «por contactar».
 *
 * Sigue pudiendose cambiar a mano: esto no bloquea nada, solo rellena lo que
 * antes habia que acordarse de mover.
 */

/**
 * Los que NO se tocan nunca, ni hacia delante ni hacia atras.
 *
 * Los puso una persona con informacion que el CRM no tiene: que compro, que
 * dijo que no, o que lo suyo es para la convocatoria siguiente. Un automatismo
 * que pisara eso haria llamar otra vez a quien ya dijo que no, que es la forma
 * mas rapida de que el equipo deje de fiarse del CRM.
 */
const INTOCABLES = ['convertido', 'no_interesado', 'proxima_convocatoria'];

/**
 * El orden del embudo. Sirve para no retroceder por accidente: apuntar el
 * quinto contacto de alguien que ya esta «en seguimiento» no puede devolverlo
 * a «contactado».
 */
const ESCALON = { nuevo: 0, por_contactar: 1, contactado: 2, en_seguimiento: 3 };

async function mover(leadId, desde, hasta, userId) {
  await query(`UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2`, [hasta, leadId]);
  await query(
    `INSERT INTO lead_status_history (lead_id, status_anterior, status_nuevo, changed_by)
     VALUES ($1, $2, $3, $4)`,
    [leadId, desde, hasta, userId || null]
  );
}

/**
 * Hacia delante: alguien ha hablado con esta persona.
 *
 * Se llama al apuntar un contacto real y al marcar un paso de la agenda. Cuenta
 * los contactos de verdad --una nota interna no es hablar con nadie-- y decide:
 * el primero deja «contactado»; «en seguimiento» es cuando se le ha vuelto a
 * contactar OTRO DIA.
 *
 * Por dias y no por contactos. Diego, 30/09: «no a todos les han hecho
 * seguimiento». Contando contactos, un WhatsApp y una llamada el mismo dia de
 * la entrada ya lo ponian «en seguimiento» (#3965, dos contactos el 30/09).
 * Seguir a alguien es volver otro dia, que es tambien lo que pide la regla de
 * los pasos: uno por dia (pasoCerrado.js).
 *
 * Devuelve el cambio si lo hubo, o null si no habia nada que mover, que es el
 * caso normal.
 */
export async function avanzarPorContacto(leadId, userId = null) {
  const { rows } = await query(
    `SELECT l.status,
            (SELECT count(*) FROM lead_interactions li
              WHERE li.lead_id = l.id AND li.tipo <> 'nota')::int AS contactos,
            (SELECT count(*) FROM lead_steps ls
              WHERE ls.lead_id = l.id AND ls.estado = 'hecho')::int AS pasos_marcados,
            -- En cuantos DIAS distintos (de Madrid) se le ha contactado: los
            -- contactos apuntados y los pasos marcados a mano, juntos.
            (SELECT count(DISTINCT d) FROM (
               SELECT (li.fecha AT TIME ZONE 'Europe/Madrid')::date AS d
                 FROM lead_interactions li
                WHERE li.lead_id = l.id AND li.tipo <> 'nota'
               UNION
               SELECT (ls.hecho_at AT TIME ZONE 'Europe/Madrid')::date
                 FROM lead_steps ls
                WHERE ls.lead_id = l.id AND ls.estado = 'hecho' AND ls.hecho_at IS NOT NULL
             ) x)::int AS dias,
            ${EN_EL_PROCESO('l')} AS en_el_proceso
       FROM leads l
      WHERE l.id = $1 AND l.deleted_at IS NULL`,
    [leadId]
  );
  if (!rows.length) return null;

  const { status, contactos, pasos_marcados, dias, en_el_proceso } = rows[0];
  if (INTOCABLES.includes(status)) return null;
  // Los de antes del 01/09 no estan en el proceso: su estado lo mueve una
  // persona, como siempre (ver enElProceso.js).
  if (!en_el_proceso) return null;

  // Los pasos marcados a mano cuentan igual que los contactos apuntados: quien
  // cierra el paso 2 ya hablo con ella dos veces, lo haya escrito o no.
  if (Math.max(Number(contactos), Number(pasos_marcados)) === 0) return null;

  const seguimiento = (Number(dias) || 0) >= 2 || Number(pasos_marcados) >= 2;
  const destino = seguimiento ? 'en_seguimiento' : 'contactado';
  if (ESCALON[destino] <= (ESCALON[status] ?? 0)) return null;

  await mover(leadId, status, destino, userId);
  return { anterior: status, nuevo: destino };
}

/**
 * Hacia atras: se le paso el dia y nadie hizo el paso.
 *
 * Los devuelve a «por contactar», que es el filtro con el que se reparte la
 * mañana. No pierden nada al volver: la checklist de la ficha sigue enseñando
 * los pasos que ya estan dados, asi que se ve de un vistazo que no es alguien
 * sin tocar sino alguien a medias y parado.
 *
 * Solo los que estan a la espera de trabajo, y UNA vez: quien ya esta en «por
 * contactar» no se vuelve a escribir, o el historial se llenaria con una linea
 * por dia y por persona hasta enterrar los cambios de verdad.
 *
 * Va en pasos sueltos dentro de una transaccion, y no en una sola consulta con
 * CTE que actualiza y apunta a la vez. La consulta lista existe y es mas corta,
 * pero esto corre solo de madrugada y sin nadie mirando: mas vale que se lea de
 * un vistazo. El bucle de apuntes tampoco preocupa, son 500 como mucho y una
 * vez al dia.
 */
export async function devolverLosVencidos({ tope = 500 } = {}) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT DISTINCT l.id, l.status
         FROM leads l
         JOIN lead_steps ls ON ls.lead_id = l.id
        WHERE l.deleted_at IS NULL
          AND l.status IN ('nuevo', 'contactado', 'en_seguimiento')
          AND ls.estado = 'pendiente'
          AND ls.fecha_prevista < CURRENT_DATE
          -- A quien entro antes del proceso no le vence nada (enElProceso.js).
          AND ${EN_EL_PROCESO('l')}
          -- El paso ya dado no vence: se deduce de los contactos apuntados,
          -- igual que en la cola del dia, para que los dos sitios cuenten lo
          -- mismo y no se contradigan en la misma pantalla.
          AND NOT ${PASO_CERRADO('ls')}
        LIMIT $1`,
      [tope]
    );

    if (!rows.length) {
      await client.query('COMMIT');
      return 0;
    }

    await client.query(
      `UPDATE leads SET status = 'por_contactar', updated_at = NOW()
        WHERE id = ANY($1::int[])`,
      [rows.map((r) => r.id)]
    );

    for (const r of rows) {
      await client.query(
        `INSERT INTO lead_status_history (lead_id, status_anterior, status_nuevo, changed_by)
         VALUES ($1, $2, 'por_contactar', NULL)`,
        [r.id, r.status]
      );
    }

    await client.query('COMMIT');
    logger.info({ cuantos: rows.length }, 'Prospectos devueltos a «por contactar» por paso vencido');
    return rows.length;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
