import * as taskModel from './tasks.model.js';
import { AppError } from '../../shared/utils/AppError.js';
import { logger } from '../../shared/utils/logger.js';
import { tieneRol } from '../../shared/utils/roles.js';
import { query as dbQuery } from '../../shared/config/db.js';
import { notifyUsers } from '../notifications/notifications.service.js';
import { resolvePermission } from '../permissions/permissions.service.js';
import { enviarCorreoAsignada, AVISO_TAREA_ASIGNADA } from './tasks.emails.js';

// Por debajo de este hueco entre dos vecinas se renumera la columna.
const HUECO_MINIMO = 0.001;

/**
 * Lo que esta persona puede hacer en el tablero.
 *
 * Con el sistema de claves de siempre (`tasks.view_all`, `tasks.assign`,
 * `tasks.delete`): rol, roles añadidos, rol a medida y excepciones personales.
 * El testigo de sesion no trae los permisos, asi que se resuelven aqui.
 *
 * Cerrar y reabrir («Hecha») NO es un permiso: es la decision 4 de la #210,
 * solo admin y superadmin.
 */
async function permisosDe(user) {
  const admin = tieneRol(user, 'superadmin', 'admin');
  if (admin) return { admin, viewAll: true, assign: true, archive: true };

  const puede = (accion) => resolvePermission(
    user.userId, user.role, user.customRoleId ?? null, 'tasks', accion, user.roles_extra || []
  );
  const [viewAll, assign, archive] = await Promise.all([puede('view_all'), puede('assign'), puede('delete')]);
  return { admin, viewAll, assign, archive };
}

/** El proyecto tiene que ser uno de los campus de la persona. */
async function validarAccesoProyecto(projectId, user) {
  if (!projectId) return;
  if (tieneRol(user, 'superadmin', 'soporte')) return;

  const { rows } = await dbQuery(
    'SELECT 1 FROM user_projects WHERE user_id = $1 AND project_id = $2 AND active = true',
    [user.userId, projectId]
  );
  if (rows.length === 0) {
    throw new AppError('No tienes acceso al campus/proyecto seleccionado', 403, 'FORBIDDEN');
  }
}

/** A quien se asigna tiene que existir, estar activo y tener tablero. */
async function validarResponsable(userId) {
  const persona = await taskModel.findUserBasic(userId);
  if (!persona || !persona.active || !persona.con_tablero) {
    throw new AppError('Esa persona no existe, está inactiva o no tiene tablero de tareas', 400, 'VALIDATION_ERROR');
  }
  return persona;
}

/** La tarea, si existe, sigue viva y esta persona puede verla. */
async function tareaVisible(id, user, permisos) {
  const task = await taskModel.findTaskById(id);
  if (!task || task.archived_at) {
    throw new AppError('Tarea no encontrada', 404, 'NOT_FOUND');
  }
  const p = permisos || await permisosDe(user);
  if (!p.viewAll && task.assigned_to !== user.userId && task.created_by !== user.userId) {
    throw new AppError('No tienes permiso para esta tarea', 403, 'FORBIDDEN');
  }
  return task;
}

/**
 * Avisa a quien le acaban de asignar una tarea: campana y correo.
 *
 * El correo sale en segundo plano: la respuesta del tablero no espera a Brevo,
 * y si Brevo falla, la tarea ya esta creada y la campana ya ha sonado.
 */
async function avisarAsignacion({ tarea, responsableId, quien, reasignada = false }) {
  await notifyUsers({
    targetUserIds: [responsableId],
    type: 'task_asignada',
    title: `${reasignada ? 'Tarea reasignada' : 'Nueva tarea asignada'}: ${tarea.title}`,
    message: `Te han ${reasignada ? 'reasignado' : 'asignado'} la tarea "${tarea.title}" en el tablero de equipo.`,
    link_path: `/tareas?id=${tarea.id}`,
    triggered_by_user_id: quien.userId,
    metadata: { task_id: tarea.id },
  });

  (async () => {
    const persona = await taskModel.findUserBasic(responsableId);
    if (!persona?.email) return;
    if (await taskModel.avisoApagado(responsableId, AVISO_TAREA_ASIGNADA)) return;
    const autor = await taskModel.findUserBasic(quien.userId);
    await enviarCorreoAsignada({ persona, tarea, quien: autor });
  })().catch((err) => {
    logger.warn({ err: err.message, taskId: tarea.id }, 'No se pudo mandar el correo de tarea asignada');
  });
}

const NOMBRE_ESTADO = {
  por_hacer: 'Por hacer', en_curso: 'En curso', en_revision: 'En revisión', hecha: 'Hecha',
};

/* --- Tablero --- */

export async function listTasks(user, q) {
  const p = await permisosDe(user);

  // Sin «ver todo», cada persona ve solo su tablero, pida lo que pida.
  const assignedTo = p.viewAll ? q.assigned_to : user.userId;

  if (q.project_id) {
    await validarAccesoProyecto(q.project_id, user);
  }

  return taskModel.findTasks({
    assigned_to: assignedTo,
    project_id: q.project_id,
    status: q.status,
    priority: q.priority,
    search: q.search,
    tag: q.tag,
    vencidas: q.vencidas,
    desde: q.desde,
    hasta: q.hasta,
    incluir_archivadas: p.viewAll ? q.incluir_archivadas : false,
  });
}

export async function getTaskById(id, user) {
  const task = await tareaVisible(id, user);

  const [events, checklist, comments, tags, links] = await Promise.all([
    taskModel.findTaskEvents(id),
    taskModel.findChecklistItems(id),
    taskModel.findComments(id),
    taskModel.findTags(id),
    taskModel.findLinks(id),
  ]);

  return { ...task, events, checklist, comments, tags, links };
}

/** El selector de persona y el de responsable. Solo quien puede ver o asignar a otros. */
export async function listAssignees(user) {
  const p = await permisosDe(user);
  if (!p.viewAll && !p.assign) {
    throw new AppError('No tienes permiso para ver el equipo', 403, 'FORBIDDEN');
  }
  return taskModel.findAssignees();
}

export async function listTagNames(user) {
  const p = await permisosDe(user);
  return taskModel.findTagNames({ assigned_to: p.viewAll ? null : user.userId });
}

export async function createTask(data, user) {
  const p = await permisosDe(user);

  // Decision 3: cualquiera se crea tareas, pero solo para si mismo.
  const responsable = data.assigned_to || user.userId;
  if (responsable !== user.userId && !p.assign) {
    throw new AppError('Solo los administradores pueden asignar tareas a otros miembros del equipo', 403, 'FORBIDDEN');
  }
  // Decision 4: «Hecha» la pone admin o superadmin, tambien al crear. Si no,
  // crearla ya cerrada se saltaba la regla del endpoint de mover.
  if (data.status === 'hecha' && !p.admin) {
    throw new AppError('Solo los administradores pueden marcar una tarea como Hecha', 403, 'FORBIDDEN');
  }

  if (responsable !== user.userId) await validarResponsable(responsable);
  if (data.project_id) await validarAccesoProyecto(data.project_id, user);

  const status = data.status || 'por_hacer';
  const position = (await taskModel.getMaxPosition(status, responsable)) + 1000;

  const createdTask = await taskModel.createTask({
    ...data,
    status,
    position,
    assigned_to: responsable,
    created_by: user.userId,
    completed_at: status === 'hecha' ? new Date().toISOString() : null,
  });

  await taskModel.createTaskEvent({
    task_id: createdTask.id,
    user_id: user.userId,
    event_type: 'created',
    details: {
      title: createdTask.title,
      status: createdTask.status,
      priority: createdTask.priority,
      assigned_to: createdTask.assigned_to,
    },
  });

  if (responsable !== user.userId) {
    await avisarAsignacion({ tarea: createdTask, responsableId: responsable, quien: user });
  }

  logger.info({ taskId: createdTask.id, userId: user.userId }, 'Tarea creada en el tablero');
  return createdTask;
}

export async function updateTask(id, fields, user) {
  const p = await permisosDe(user);
  const currentTask = await tareaVisible(id, user, p);

  const cambiaResponsable = fields.assigned_to !== undefined && fields.assigned_to !== currentTask.assigned_to;
  if (cambiaResponsable) {
    if (!p.assign) {
      throw new AppError('Solo los administradores pueden reasignar tareas', 403, 'FORBIDDEN');
    }
    if (fields.assigned_to) await validarResponsable(fields.assigned_to);
  }

  if (fields.project_id && fields.project_id !== currentTask.project_id) {
    await validarAccesoProyecto(fields.project_id, user);
  }

  const updatedTask = await taskModel.updateTask(id, fields);
  if (!updatedTask) throw new AppError('Tarea no encontrada', 404, 'NOT_FOUND');

  // En el historial, solo lo que cambio de verdad: el formulario manda todo.
  const cambios = {};
  for (const [k, v] of Object.entries(fields)) {
    const antes = currentTask[k] instanceof Date ? currentTask[k].toISOString() : currentTask[k];
    const despues = updatedTask[k] instanceof Date ? updatedTask[k].toISOString() : updatedTask[k];
    if (antes !== despues) cambios[k] = { antes: antes ?? null, despues: v ?? null };
  }
  if (Object.keys(cambios).length > 0) {
    await taskModel.createTaskEvent({
      task_id: id,
      user_id: user.userId,
      event_type: cambiaResponsable ? 'assigned' : 'updated',
      details: cambios,
    });
  }

  if (cambiaResponsable && fields.assigned_to && fields.assigned_to !== user.userId) {
    await avisarAsignacion({ tarea: updatedTask, responsableId: fields.assigned_to, quien: user, reasignada: true });
  }

  return updatedTask;
}

/**
 * Mueve una tarjeta: de columna, de sitio dentro de la columna, o las dos.
 *
 * `prev_id`/`next_id` son las tarjetas entre las que se suelta. La posicion
 * nueva es el punto medio entre las dos (NUMERIC): no se reescribe ninguna otra
 * tarjeta, salvo cuando el hueco se agota y hay que renumerar esa columna.
 */
export async function moveTask(id, { status, prev_id, next_id }, user) {
  const p = await permisosDe(user);
  const currentTask = await tareaVisible(id, user, p);

  // Decision 4: «La persona mueve su tarjeta hasta "En revisión". Solo admin y
  // superadmin la pasan a "Hecha", o la devuelven a "En curso".»
  if (status === 'hecha' && currentTask.status !== 'hecha' && !p.admin) {
    throw new AppError('Solo los administradores pueden marcar una tarea como Hecha', 403, 'FORBIDDEN');
  }
  if (currentTask.status === 'hecha' && status !== 'hecha' && !p.admin) {
    throw new AppError('Solo los administradores pueden reabrir una tarea completada', 403, 'FORBIDDEN');
  }

  const vecina = async (vecinaId) => {
    if (!vecinaId || vecinaId === id) return null;
    const v = await taskModel.findPosition(vecinaId);
    // Una vecina de otra columna u otra persona no sirve de referencia.
    if (!v || v.status !== status || v.assigned_to !== currentTask.assigned_to) return null;
    return v.position;
  };

  let prev = await vecina(prev_id);
  let next = await vecina(next_id);

  const huecoAgotado = (prev != null && next != null && next - prev < HUECO_MINIMO)
    || (prev == null && next != null && next < HUECO_MINIMO);
  if (huecoAgotado) {
    await taskModel.renumberColumn(status, currentTask.assigned_to);
    prev = await vecina(prev_id);
    next = await vecina(next_id);
  }

  let newPos;
  if (prev != null && next != null) newPos = (prev + next) / 2;
  else if (prev != null) newPos = prev + 1000;
  else if (next != null) newPos = next / 2;
  else if (status === currentTask.status) newPos = currentTask.position;
  else newPos = (await taskModel.getMaxPosition(status, currentTask.assigned_to)) + 1000;

  let completedAt = currentTask.completed_at;
  if (status === 'hecha' && currentTask.status !== 'hecha') completedAt = new Date().toISOString();
  else if (status !== 'hecha') completedAt = null;

  const movedTask = await taskModel.updateTaskPositionAndStatus(id, {
    status,
    position: newPos,
    completed_at: completedAt,
  });
  if (!movedTask) throw new AppError('Tarea no encontrada', 404, 'NOT_FOUND');

  const cambiaEstado = currentTask.status !== status;
  await taskModel.createTaskEvent({
    task_id: id,
    user_id: user.userId,
    event_type: cambiaEstado ? 'status_changed' : 'reordered',
    details: {
      old_status: currentTask.status,
      new_status: status,
      old_position: currentTask.position,
      new_position: newPos,
    },
  });

  if (cambiaEstado) {
    const texto = `«${currentTask.title}» pasó de ${NOMBRE_ESTADO[currentTask.status]} a ${NOMBRE_ESTADO[status]}.`;

    // A quien la creo: cuando pasa a «En revisión» o a «Hecha» (#210, avisos).
    if (['en_revision', 'hecha'].includes(status)
        && currentTask.created_by && currentTask.created_by !== user.userId) {
      await notifyUsers({
        targetUserIds: [currentTask.created_by],
        type: 'task_estado_cambiado',
        title: status === 'hecha' ? `Tarea cerrada: ${currentTask.title}` : `Tarea en revisión: ${currentTask.title}`,
        message: texto,
        link_path: `/tareas?id=${id}`,
        triggered_by_user_id: user.userId,
        metadata: { task_id: id, status },
      });
    }

    // A quien la lleva, si se la mueve otra persona: la cierran o se la devuelven.
    if (currentTask.assigned_to && currentTask.assigned_to !== user.userId
        && currentTask.assigned_to !== currentTask.created_by) {
      await notifyUsers({
        targetUserIds: [currentTask.assigned_to],
        type: 'task_estado_cambiado',
        title: `Tu tarea cambió de estado: ${currentTask.title}`,
        message: texto,
        link_path: `/tareas?id=${id}`,
        triggered_by_user_id: user.userId,
        metadata: { task_id: id, status },
      });
    }
  }

  return movedTask;
}

export async function archiveTask(id, user) {
  const p = await permisosDe(user);
  const currentTask = await tareaVisible(id, user, p);

  if (!p.archive && currentTask.created_by !== user.userId) {
    throw new AppError('Solo los administradores o quien la creó pueden archivar esta tarea', 403, 'FORBIDDEN');
  }

  const archived = await taskModel.archiveTask(id);
  if (!archived) throw new AppError('Tarea no encontrada', 404, 'NOT_FOUND');

  await taskModel.createTaskEvent({
    task_id: id,
    user_id: user.userId,
    event_type: 'archived',
    details: { archived_by: user.userId },
  });

  return archived;
}

/* --- Lista de comprobacion --- */

export async function addChecklistItem(taskId, data, user) {
  await tareaVisible(taskId, user);
  const item = await taskModel.createChecklistItem({ task_id: taskId, title: data.title });
  await taskModel.createTaskEvent({
    task_id: taskId,
    user_id: user.userId,
    event_type: 'checklist',
    details: { action: 'item_added', title: data.title },
  });
  return item;
}

export async function updateChecklistItem(taskId, itemId, fields, user) {
  await tareaVisible(taskId, user);
  const updated = await taskModel.updateChecklistItem(taskId, itemId, fields);
  if (!updated) throw new AppError('Elemento no encontrado en esta tarea', 404, 'NOT_FOUND');
  if (fields.is_completed !== undefined) {
    await taskModel.createTaskEvent({
      task_id: taskId,
      user_id: user.userId,
      event_type: 'checklist',
      details: { action: fields.is_completed ? 'item_checked' : 'item_unchecked', title: updated.title },
    });
  }
  return updated;
}

export async function deleteChecklistItem(taskId, itemId, user) {
  await tareaVisible(taskId, user);
  const deleted = await taskModel.deleteChecklistItem(taskId, itemId);
  if (!deleted) throw new AppError('Elemento no encontrado en esta tarea', 404, 'NOT_FOUND');
  await taskModel.createTaskEvent({
    task_id: taskId,
    user_id: user.userId,
    event_type: 'checklist',
    details: { action: 'item_removed', title: deleted.title },
  });
  return deleted;
}

/* --- Comentarios --- */

export async function addComment(taskId, data, user) {
  const task = await tareaVisible(taskId, user);
  const comment = await taskModel.createComment({ task_id: taskId, user_id: user.userId, content: data.content });
  await taskModel.createTaskEvent({
    task_id: taskId,
    user_id: user.userId,
    event_type: 'comment',
    details: { comment_id: comment.id },
  });

  const notifyTargets = new Set();
  if (task.assigned_to && task.assigned_to !== user.userId) notifyTargets.add(task.assigned_to);
  if (task.created_by && task.created_by !== user.userId) notifyTargets.add(task.created_by);

  if (notifyTargets.size > 0) {
    const autor = await taskModel.findUserBasic(user.userId);
    await notifyUsers({
      targetUserIds: [...notifyTargets],
      type: 'task_comentario',
      title: `Nuevo comentario en: ${task.title}`,
      message: `${autor?.nombre || 'Alguien del equipo'} comentó en la tarea "${task.title}".`,
      link_path: `/tareas?id=${taskId}`,
      triggered_by_user_id: user.userId,
      metadata: { task_id: taskId, comment_id: comment.id },
    });
  }

  return comment;
}

export async function deleteComment(taskId, commentId, user) {
  const p = await permisosDe(user);
  await tareaVisible(taskId, user, p);
  const comment = await taskModel.findComment(taskId, commentId);
  if (!comment) throw new AppError('Comentario no encontrado', 404, 'NOT_FOUND');

  if (!p.admin && comment.user_id !== user.userId) {
    throw new AppError('Solo puedes borrar tus propios comentarios', 403, 'FORBIDDEN');
  }

  return taskModel.deleteComment(taskId, commentId);
}

/* --- Etiquetas --- */

export async function addTag(taskId, data, user) {
  await tareaVisible(taskId, user);
  const tag = await taskModel.createTag({ task_id: taskId, name: data.name, color: data.color });
  await taskModel.createTaskEvent({
    task_id: taskId,
    user_id: user.userId,
    event_type: 'tag',
    details: { action: 'added', name: tag.name },
  });
  return tag;
}

export async function deleteTag(taskId, tagId, user) {
  await tareaVisible(taskId, user);
  const deleted = await taskModel.deleteTag(taskId, tagId);
  if (!deleted) throw new AppError('Etiqueta no encontrada en esta tarea', 404, 'NOT_FOUND');
  await taskModel.createTaskEvent({
    task_id: taskId,
    user_id: user.userId,
    event_type: 'tag',
    details: { action: 'removed', name: deleted.name },
  });
  return deleted;
}

/* --- Enlaces --- */

export async function addLink(taskId, data, user) {
  await tareaVisible(taskId, user);
  const link = await taskModel.createLink({
    task_id: taskId, url: data.url, title: data.title || null, created_by: user.userId,
  });
  await taskModel.createTaskEvent({
    task_id: taskId,
    user_id: user.userId,
    event_type: 'link',
    details: { action: 'added', url: link.url, title: link.title },
  });
  return link;
}

export async function deleteLink(taskId, linkId, user) {
  await tareaVisible(taskId, user);
  const deleted = await taskModel.deleteLink(taskId, linkId);
  if (!deleted) throw new AppError('Enlace no encontrado en esta tarea', 404, 'NOT_FOUND');
  await taskModel.createTaskEvent({
    task_id: taskId,
    user_id: user.userId,
    event_type: 'link',
    details: { action: 'removed', url: deleted.url },
  });
  return deleted;
}

/* --- Todo el equipo (fase 4) --- */

export async function getTeamMetrics(projectId, user) {
  const p = await permisosDe(user);
  if (!p.viewAll) {
    throw new AppError('No tienes permiso para ver las métricas del equipo', 403, 'FORBIDDEN');
  }
  if (projectId) {
    await validarAccesoProyecto(projectId, user);
  }
  return taskModel.getTeamMetrics(projectId);
}
