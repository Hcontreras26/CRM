import * as taskModel from './tasks.model.js';
import { AppError } from '../../shared/utils/AppError.js';
import { logger } from '../../shared/utils/logger.js';
import { tieneRol } from '../../shared/utils/roles.js';
import { query as dbQuery } from '../../shared/config/db.js';
import { notifyUsers } from '../notifications/notifications.service.js';
import { resolvePermission } from '../permissions/permissions.service.js';
import {
  enviarCorreoAsignada,
  enviarCorreoDevuelta,
  enviarCorreoCerrada,
  enviarCorreoComentario,
  AVISO_TAREA_ASIGNADA,
  AVISO_TAREA_DEVUELTA,
  AVISO_TAREA_CERRADA,
  AVISO_TAREA_COMENTARIO,
} from './tasks.emails.js';

const HUECO_MINIMO = 0.001;

/**
 * Resuelve los permisos específicos para el módulo de tareas:
 * - viewAll: ver tareas de cualquier miembro del equipo (`tasks.view_all`).
 * - assign: asignar o reasignar tareas a otros (`tasks.assign`).
 * - archive: borrar/archivar tareas (`tasks.delete`).
 * - close: aprobar, devolver, marcar como «Hecha» o reabrir tareas (`tasks.close`).
 * - manage: gestionar configuración del tablero (columnas, áreas, proyectos propios) (`tasks.manage`).
 */
export async function permisosDe(user) {
  const admin = tieneRol(user, 'superadmin', 'admin');
  if (admin) {
    return { admin, viewAll: true, assign: true, archive: true, close: true, manage: true };
  }

  const puede = (accion) => resolvePermission(
    user.userId, user.role, user.customRoleId ?? null, 'tasks', accion, user.roles_extra || []
  );

  const [viewAll, assign, archive, close, manage] = await Promise.all([
    puede('view_all'),
    puede('assign'),
    puede('delete'),
    puede('close'),
    puede('manage'),
  ]);

  return { admin, viewAll, assign, archive, close, manage };
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

async function validarResponsable(userId) {
  const persona = await taskModel.findUserBasic(userId);
  if (!persona || !persona.active || !persona.con_tablero) {
    throw new AppError('Esa persona no existe, está inactiva o no tiene tablero de tareas', 400, 'VALIDATION_ERROR');
  }
  return persona;
}

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

/* --- Tablero y Tareas --- */

export async function listTasks(user, q) {
  const p = await permisosDe(user);
  const assignedTo = p.viewAll ? q.assigned_to : user.userId;

  if (q.project_id) {
    await validarAccesoProyecto(q.project_id, user);
  }

  return taskModel.findTasks({
    assigned_to: assignedTo,
    project_id: q.project_id,
    external_project_id: q.external_project_id,
    area_id: q.area_id,
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

  const responsable = data.assigned_to || user.userId;
  if (responsable !== user.userId && !p.assign) {
    throw new AppError('Solo quienes tienen permiso pueden asignar tareas a otros miembros del equipo', 403, 'FORBIDDEN');
  }

  if (data.status === 'hecha' && !p.close) {
    throw new AppError('Solo quienes tienen permiso de cierre pueden crear una tarea como Hecha', 403, 'FORBIDDEN');
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
      throw new AppError('Solo quienes tienen permiso pueden reasignar tareas', 403, 'FORBIDDEN');
    }
    if (fields.assigned_to) await validarResponsable(fields.assigned_to);
  }

  if (fields.project_id && fields.project_id !== currentTask.project_id) {
    await validarAccesoProyecto(fields.project_id, user);
  }

  const updatedTask = await taskModel.updateTask(id, fields);
  if (!updatedTask) throw new AppError('Tarea no encontrada', 404, 'NOT_FOUND');

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

export async function moveTask(id, { status, prev_id, next_id }, user) {
  const p = await permisosDe(user);
  const currentTask = await tareaVisible(id, user, p);

  if (status === 'hecha' && currentTask.status !== 'hecha' && !p.close) {
    throw new AppError('Solo quienes tienen permiso de cierre pueden marcar una tarea como Hecha', 403, 'FORBIDDEN');
  }
  if (currentTask.status === 'hecha' && status !== 'hecha' && !p.close) {
    throw new AppError('Solo quienes tienen permiso de cierre pueden reabrir una tarea completada', 403, 'FORBIDDEN');
  }

  const { prevPos: prev, nextPos: next } = await taskModel.findNeighbors(status, currentTask.assigned_to, { prev_id, next_id });

  let newPos;
  if (prev != null && next != null) {
    if (next - prev < HUECO_MINIMO) {
      await taskModel.renumberColumn(status, currentTask.assigned_to);
      const renum = await taskModel.findNeighbors(status, currentTask.assigned_to, { prev_id, next_id });
      newPos = (renum.prevPos + renum.nextPos) / 2;
    } else {
      newPos = (prev + next) / 2;
    }
  } else if (prev != null) {
    newPos = prev + 1000;
  } else if (next != null) {
    newPos = next / 2;
  } else if (status === currentTask.status) {
    newPos = currentTask.position;
  } else {
    newPos = (await taskModel.getMaxPosition(status, currentTask.assigned_to)) + 1000;
  }

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

  // En el historial solo se guardan cambios de columna, para no saturar con reordenaciones internas
  if (cambiaEstado) {
    await taskModel.createTaskEvent({
      task_id: id,
      user_id: user.userId,
      event_type: 'status_changed',
      details: {
        old_status: currentTask.status,
        new_status: status,
        old_position: currentTask.position,
        new_position: newPos,
      },
    });

    const statusName = NOMBRE_ESTADO[status] || status;
    const oldStatusName = NOMBRE_ESTADO[currentTask.status] || currentTask.status;
    const texto = `«${currentTask.title}» pasó de ${oldStatusName} a ${statusName}.`;

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
    throw new AppError('Solo quienes tienen permiso de borrado o quien la creó pueden archivar esta tarea', 403, 'FORBIDDEN');
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

/**
 * Devolver tarea a «en_curso» atómicamente con comentario obligatorio y aviso.
 */
export async function returnTask(id, { comment }, user) {
  const p = await permisosDe(user);
  if (!p.close) {
    throw new AppError('No tienes permiso para devolver tareas a revisión', 403, 'FORBIDDEN');
  }

  const result = await taskModel.returnTaskAtomic({ taskId: id, comment, user });
  if (!result) throw new AppError('Tarea no encontrada', 404, 'NOT_FOUND');

  const { task, oldTask } = result;

  // Notificación en la campana
  if (oldTask.assigned_to && oldTask.assigned_to !== user.userId) {
    await notifyUsers({
      targetUserIds: [oldTask.assigned_to],
      type: 'task_devuelta',
      title: `Tarea devuelta para corrección: ${oldTask.title}`,
      message: comment,
      link_path: `/tareas?id=${id}`,
      triggered_by_user_id: user.userId,
      metadata: { task_id: id, status: 'en_curso', comment },
    });

    (async () => {
      const persona = await taskModel.findUserBasic(oldTask.assigned_to);
      if (!persona?.email) return;
      if (await taskModel.avisoApagado(oldTask.assigned_to, AVISO_TAREA_DEVUELTA)) return;
      const autor = await taskModel.findUserBasic(user.userId);
      await enviarCorreoDevuelta({ persona, tarea: oldTask, quien: autor, comentario: comment });
    })().catch((err) => {
      logger.warn({ err: err.message, taskId: id }, 'No se pudo mandar el correo de tarea devuelta');
    });
  }

  return task;
}

/**
 * Aprobar tarea: pasa a «hecha» con completed_at, evento y aviso.
 */
export async function approveTask(id, user) {
  const p = await permisosDe(user);
  if (!p.close) {
    throw new AppError('No tienes permiso para aprobar tareas', 403, 'FORBIDDEN');
  }

  const currentTask = await taskModel.findTaskById(id);
  if (!currentTask || currentTask.archived_at) {
    throw new AppError('Tarea no encontrada', 404, 'NOT_FOUND');
  }

  const completedAt = new Date().toISOString();
  const movedTask = await taskModel.updateTaskPositionAndStatus(id, {
    status: 'hecha',
    position: (await taskModel.getMaxPosition('hecha', currentTask.assigned_to)) + 1000,
    completed_at: completedAt,
  });

  await taskModel.createTaskEvent({
    task_id: id,
    user_id: user.userId,
    event_type: 'status_changed',
    details: {
      old_status: currentTask.status,
      new_status: 'hecha',
      action: 'approved',
    },
  });

  // Avisar al responsable
  if (currentTask.assigned_to && currentTask.assigned_to !== user.userId) {
    await notifyUsers({
      targetUserIds: [currentTask.assigned_to],
      type: 'task_aprobada',
      title: `Tarea aprobada: ${currentTask.title}`,
      message: `Tu tarea "${currentTask.title}" ha sido aprobada y marcada como Hecha.`,
      link_path: `/tareas?id=${id}`,
      triggered_by_user_id: user.userId,
      metadata: { task_id: id, status: 'hecha' },
    });

    (async () => {
      const persona = await taskModel.findUserBasic(currentTask.assigned_to);
      if (!persona?.email) return;
      if (await taskModel.avisoApagado(currentTask.assigned_to, AVISO_TAREA_CERRADA)) return;
      const autor = await taskModel.findUserBasic(user.userId);
      await enviarCorreoCerrada({ persona, tarea: currentTask, quien: autor });
    })().catch((err) => {
      logger.warn({ err: err.message, taskId: id }, 'No se pudo mandar el correo de tarea aprobada');
    });
  }

  return movedTask;
}

/**
 * Lista de tareas pendientes de revisión en todo el equipo.
 */
export async function getReviewTasks(user) {
  const p = await permisosDe(user);
  if (!p.close) {
    throw new AppError('No tienes permiso para ver las tareas por revisar', 403, 'FORBIDDEN');
  }

  return taskModel.findTasks({
    status: 'en_revision',
    incluir_archivadas: false,
  });
}

export async function getReviewCount(user) {
  const p = await permisosDe(user);
  if (!p.close) {
    return { count: 0 };
  }
  const tasks = await taskModel.findTasks({
    status: 'en_revision',
    incluir_archivadas: false,
  });
  return { count: tasks.length };
}

/* --- Lista de comprobación --- */

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

    (async () => {
      for (const destId of notifyTargets) {
        const persona = await taskModel.findUserBasic(destId);
        if (!persona?.email) continue;
        if (await taskModel.avisoApagado(destId, AVISO_TAREA_COMENTARIO)) continue;
        await enviarCorreoComentario({
          persona,
          tarea: task,
          quien: autor,
          comentario: data.content,
          commentId: comment.id,
        });
      }
    })().catch((err) => {
      logger.warn({ err: err.message, taskId }, 'No se pudo mandar el correo de nuevo comentario');
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

/* --- Métricas de equipo --- */

export async function getTeamMetrics(projectId, areaId, user) {
  const p = await permisosDe(user);
  if (!p.viewAll) {
    throw new AppError('No tienes permiso para ver las métricas del equipo', 403, 'FORBIDDEN');
  }
  if (projectId) {
    await validarAccesoProyecto(projectId, user);
  }
  return taskModel.getTeamMetrics(projectId, areaId);
}

/* --- Configuración: Columnas --- */

export async function listColumns(user) {
  const p = await permisosDe(user);
  if (p.manage) {
    return taskModel.findAllColumns();
  }
  return taskModel.findActiveColumns();
}

export async function createColumn(data, user) {
  const p = await permisosDe(user);
  if (!p.manage) {
    throw new AppError('No tienes permiso para gestionar columnas', 403, 'FORBIDDEN');
  }
  const existing = await taskModel.findColumnByKey(data.key);
  if (existing) {
    throw new AppError('Ya existe una columna con esa clave', 400, 'VALIDATION_ERROR');
  }
  return taskModel.createColumn(data);
}

export async function updateColumn(id, fields, user) {
  const p = await permisosDe(user);
  if (!p.manage) {
    throw new AppError('No tienes permiso para gestionar columnas', 403, 'FORBIDDEN');
  }
  const col = await taskModel.findColumnById(id);
  if (!col) throw new AppError('Columna no encontrada', 404, 'NOT_FOUND');

  if (col.is_system && fields.is_active === false) {
    throw new AppError('No se pueden archivar las columnas del sistema', 400, 'VALIDATION_ERROR');
  }

  return taskModel.updateColumn(id, fields);
}

export async function archiveColumn(id, user) {
  const p = await permisosDe(user);
  if (!p.manage) {
    throw new AppError('No tienes permiso para archivar columnas', 403, 'FORBIDDEN');
  }
  const col = await taskModel.findColumnById(id);
  if (!col) throw new AppError('Columna no encontrada', 404, 'NOT_FOUND');

  if (col.is_system) {
    throw new AppError('No se pueden archivar las columnas fijas del sistema', 400, 'VALIDATION_ERROR');
  }

  const count = await taskModel.countTasksInColumn(col.key);
  if (count > 0) {
    throw new AppError(`No se puede archivar la columna "${col.name}" porque contiene ${count} tarea(s). Muévelas primero.`, 400, 'VALIDATION_ERROR');
  }

  return taskModel.updateColumn(id, { is_active: false });
}

export async function reorderColumns({ keys }, user) {
  const p = await permisosDe(user);
  if (!p.manage) {
    throw new AppError('No tienes permiso para ordenar columnas', 403, 'FORBIDDEN');
  }
  return taskModel.reorderColumns(keys);
}

/* --- Configuración: Áreas --- */

export async function listAreas(user) {
  const p = await permisosDe(user);
  if (p.manage) {
    return taskModel.findAllAreas();
  }
  return taskModel.findActiveAreas();
}

export async function createArea(data, user) {
  const p = await permisosDe(user);
  if (!p.manage) {
    throw new AppError('No tienes permiso para crear áreas', 403, 'FORBIDDEN');
  }
  return taskModel.createArea(data);
}

export async function updateArea(id, fields, user) {
  const p = await permisosDe(user);
  if (!p.manage) {
    throw new AppError('No tienes permiso para actualizar áreas', 403, 'FORBIDDEN');
  }
  const area = await taskModel.findAreaById(id);
  if (!area) throw new AppError('Área no encontrada', 404, 'NOT_FOUND');
  return taskModel.updateArea(id, fields);
}

export async function getUserAreas(userId) {
  return taskModel.getUserAreas(userId);
}

export async function getUserAreaAssignments(user) {
  const p = await permisosDe(user);
  if (!p.viewAll && !p.manage) {
    throw new AppError('No tienes permiso para consultar asignaciones de áreas', 403, 'FORBIDDEN');
  }
  return taskModel.getUserAreaAssignments();
}

export async function setUserAreas(userId, { area_ids }, user) {
  const p = await permisosDe(user);
  if (!p.manage) {
    throw new AppError('No tienes permiso para asignar áreas a usuarios', 403, 'FORBIDDEN');
  }
  await validarResponsable(userId);
  return taskModel.setUserAreas(userId, area_ids);
}

/* --- Configuración: Proyectos Propios (Externos) --- */

export async function listExternalProjects(user) {
  const p = await permisosDe(user);
  if (p.manage) {
    return taskModel.findAllExternalProjects();
  }
  return taskModel.findActiveExternalProjects();
}

export async function createExternalProject(data, user) {
  const p = await permisosDe(user);
  if (!p.manage) {
    throw new AppError('No tienes permiso para crear proyectos propios', 403, 'FORBIDDEN');
  }
  return taskModel.createExternalProject(data);
}

export async function updateExternalProject(id, fields, user) {
  const p = await permisosDe(user);
  if (!p.manage) {
    throw new AppError('No tienes permiso para actualizar proyectos propios', 403, 'FORBIDDEN');
  }
  const proj = await taskModel.findExternalProjectById(id);
  if (!proj) throw new AppError('Proyecto propio no encontrado', 404, 'NOT_FOUND');
  return taskModel.updateExternalProject(id, fields);
}
