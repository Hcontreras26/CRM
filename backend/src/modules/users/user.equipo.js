/*
  EL EQUIPO COMERCIAL DE UNA ADMINISTRADORA (Carlos, 09/11/2026).

  «Raquel pasa a ser administradora como Daniela: no recibe leads y puede ver
  los leads y la gestión de las diferentes compañeras. Daniela puede ver todas.
  Raquel podrá ver sus comerciales asignadas (pueden variar).»

  Aquí se lee y se cambia QUIÉNES son esas comerciales (tabla `equipo_comercial`,
  migración 246). Lo que ve después cada una lo decide `alcanceComercial`
  (shared/utils/roles.js), en cada petición: un cambio aquí se nota en la
  siguiente, sin volver a entrar.

  Solo pueden estar en el equipo gestoras (o project managers) activas que
  compartan al menos un campus con la líder, y nunca ella misma.
*/
import { query, getClient } from '../../shared/config/db.js';
import { AppError } from '../../shared/utils/AppError.js';
import { registrarCambio } from '../permissions/permissions.model.js';

// Rol comercial propio: el principal o uno añadido.
const ES_COMERCIAL = `(u.role IN ('gestor', 'project_manager')
   OR COALESCE(u.roles_extra::text[], '{}') && ARRAY['gestor', 'project_manager'])`;

// Comparte al menos un campus activo con la líder ($1).
const COMPARTE_CAMPUS = `EXISTS (SELECT 1 FROM user_projects mio
     JOIN user_projects suyo ON suyo.project_id = mio.project_id AND suyo.active
    WHERE mio.user_id = $1 AND mio.active AND suyo.user_id = u.id)`;

async function exigirLider(liderId, db = { query }) {
  const { rows: [lider] } = await db.query('SELECT id, nombre FROM users WHERE id = $1', [liderId]);
  if (!lider) throw new AppError('Usuario no encontrado', 404, 'USER_NOT_FOUND');
  return lider;
}

/**
 * El equipo de una persona y las gestoras que se le pueden poner.
 *
 * `campus` (opcional): los campus de quien MIRA. Si viene, solo salen gestoras
 * de esos campus, para no enseñar nombres de una empresa que no es suya.
 */
export async function leerEquipo(liderId, { campus = null } = {}) {
  await exigirLider(liderId);
  const params = [liderId];
  let recorte = '';
  if (Array.isArray(campus)) {
    params.push(campus.map(Number));
    recorte = `AND EXISTS (SELECT 1 FROM user_projects up
                            WHERE up.user_id = u.id AND up.active AND up.project_id = ANY($2::int[]))`;
  }
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.email, u.role, u.active,
            (ec.gestora_id IS NOT NULL) AS en_equipo
       FROM users u
       LEFT JOIN equipo_comercial ec ON ec.lider_id = $1 AND ec.gestora_id = u.id
      WHERE u.id <> $1
        AND (ec.gestora_id IS NOT NULL
             OR (u.active AND ${ES_COMERCIAL} AND ${COMPARTE_CAMPUS}))
        ${recorte}
      ORDER BY (ec.gestora_id IS NULL), u.nombre`,
    params);
  return {
    lider_id: Number(liderId),
    gestora_ids: rows.filter((r) => r.en_equipo).map((r) => r.id),
    gestoras: rows,
  };
}

/**
 * Cambia el equipo entero de una vez: lo que llega es la lista nueva.
 * En una transacción, con su apunte en el registro de permisos.
 */
export async function guardarEquipo(liderId, gestoraIds, { quienId }) {
  const ids = [...new Set(gestoraIds.map(Number))];
  if (ids.includes(Number(liderId))) {
    throw new AppError('Una persona no puede estar en su propio equipo', 400, 'EQUIPO_A_SI_MISMA');
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await exigirLider(liderId, client);

    if (ids.length) {
      const { rows: validas } = await client.query(
        `SELECT u.id FROM users u
          WHERE u.id = ANY($2::int[]) AND u.active AND ${ES_COMERCIAL} AND ${COMPARTE_CAMPUS}`,
        [liderId, ids]);
      const buenas = new Set(validas.map((r) => Number(r.id)));
      const malas = ids.filter((id) => !buenas.has(id));
      if (malas.length) {
        throw new AppError(
          'Solo se pueden poner gestoras activas que compartan algún campus con esta persona',
          400, 'GESTORA_NO_VALIDA');
      }
    }

    // Se bloquean sus filas: dos cambios a la vez no pueden pisarse el apunte.
    const { rows: antes } = await client.query(
      'SELECT gestora_id FROM equipo_comercial WHERE lider_id = $1 ORDER BY gestora_id FOR UPDATE', [liderId]);
    const antesIds = antes.map((r) => Number(r.gestora_id));

    await client.query('DELETE FROM equipo_comercial WHERE lider_id = $1', [liderId]);
    if (ids.length) {
      await client.query(
        `INSERT INTO equipo_comercial (lider_id, gestora_id, creado_por)
         SELECT $1, g, $3 FROM unnest($2::int[]) AS g`,
        [liderId, ids, quienId ?? null]);
    }

    const despuesIds = [...ids].sort((a, b) => a - b);
    if (antesIds.join(',') !== despuesIds.join(',')) {
      await registrarCambio(client, {
        quienId: quienId ?? null,
        destino: 'usuario',
        usuarioId: Number(liderId),
        clave: 'equipo_comercial',
        antes: antesIds.join(', ') || '(sin equipo)',
        despues: despuesIds.join(', ') || '(sin equipo)',
        origen: 'ficha_usuario',
      });
    }
    await client.query('COMMIT');
    return { lider_id: Number(liderId), gestora_ids: despuesIds };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
