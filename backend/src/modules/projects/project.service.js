import { getClient } from '../../shared/config/db.js';
import { logger } from '../../shared/utils/logger.js';
import * as model from './project.model.js';
import { darCampusALosAdminsDeSuEmpresa } from '../users/user.empresas.js';

/*
  CREAR O CAMBIAR UN CAMPUS, Y LOS ADMINS DE SU EMPRESA (#220)

  Diego, 10/10: «Cuando se crea un campus nuevo en esa empresa, ese admin lo ve
  sin tener que añadírselo a mano».

  Se hace aquí, en la misma transacción que el proyecto, y no con un trigger:
  todo el reparto de acceso del CRM está en el código (`user.model.js`,
  `projectAccess`, `ambito.js`), las migraciones de este repo no tienen ni un
  trigger, y así se prueba sin base. Si algún día se crean proyectos a mano por
  SQL, ese campus no le llega solo: se le da desde Usuarios, guardando al admin.

  Si el proyecto no se puede guardar, tampoco se le da a nadie; y si darlo
  falla, el proyecto no se crea a medias.

  Al SACAR un campus de la empresa no se le quita a nadie: igual que al quitar
  la casilla, lo que ya tiene se queda.
*/

async function enTransaccion(fn) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const r = await fn(client);
    await client.query('COMMIT');
    return r;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function crear(data) {
  // Sin empresa no hay admins a los que dárselo: lo de siempre.
  if (data.sociedad_emisora_id == null) return model.create(data);

  return enTransaccion(async (client) => {
    const project = await model.create(data, client);
    const admins = await darCampusALosAdminsDeSuEmpresa(client, project.id);
    if (admins.length) logger.info({ projectId: project.id, admins }, 'Campus nuevo: añadido a los admins de su empresa');
    return project;
  });
}

export async function actualizar(id, fields) {
  // Sin cambio de empresa, lo de siempre: una sola consulta, sin transacción.
  if (fields.sociedad_emisora_id === undefined) return model.update(id, fields);

  return enTransaccion(async (client) => {
    const antes = await model.sociedadDelProyecto(id, client);
    const updated = await model.update(id, fields, client);
    const ahora = updated?.sociedad_emisora_id == null ? null : Number(updated.sociedad_emisora_id);
    // Solo si de verdad pasa a otra empresa. Guardar el proyecto con la misma
    // no le devuelve a un admin el campus que se le quitó a mano.
    if (updated && ahora != null && ahora !== antes) {
      const admins = await darCampusALosAdminsDeSuEmpresa(client, id);
      if (admins.length) logger.info({ projectId: id, de: antes, a: ahora, admins }, 'Campus cambiado de empresa: añadido a sus admins');
    }
    return updated;
  });
}
