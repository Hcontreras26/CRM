import * as taskModel from './tasks.model.js';
import { AppError } from '../../shared/utils/AppError.js';
import { logger } from '../../shared/utils/logger.js';
import { tieneRol } from '../../shared/utils/roles.js';
import { query as dbQuery } from '../../shared/config/db.js';
import { notifyUsers } from '../notifications/notifications.service.js';

async function validarAccesoProyecto(projectId, user) {
  if (!projectId) return;
  if (tieneRol(user, 'superadmin')) return;

  const { rows } = await dbQuery(
    `SELECT 1 FROM user_projects WHERE user_id = $1 AND project_id = $2`,
    [user.id, projectId]
  );
  if (rows.length === 0) {
    throw new AppError('No tienes acceso al campus/proyecto seleccionado', 403, 'FORBIDDEN');
  }
}

export async function listTasks(user, query) {
  const isSuperOrAdmin = tieneRol(user, 'superadmin', 'admin');
  const hasViewAll = isSuperOrAdmin || !!user.permissions?.['tasks.view_all'];

  let assignedToFilter = query.assigned_to;
  if (!hasViewAll) {
    // Gestores, soporte y colaboradores solo ven sus propias tareas asignadas
    assignedToFilter = user.id;
  }

  if (query.project_id) {
    await validarAccesoProyecto(query.project_id, user);
  }

  return taskModel.findTasks({
    assigned_to: assignedToFilter,
    project_id: query.project_id,
    status: query.status,
    priority: query.priority,
    search: query.search,
    incluir_archivadas: query.incluir_archivadas,
  });
}

export async function getTaskById(id, user) {
  const task = await taskModel.findTaskById(id);
  if (!task || task.archived_at) {
    throw new AppError('Tarea no encontrada', 404, 'NOT_FOUND');
  }

  const isSuperOrAdmin = tieneRol(user, 'superadmin', 'admin');
  const hasViewAll = isSuperOrAdmin || !!user.permissions?.['tasks.view_all'];

  if (!hasViewAll && task.assigned_to !== user.id && task.created_by !== user.id) {
    throw new AppError('No tienes permiso para consultar esta tarea', 403, 'FORBIDDEN');
  }

  const [events, checklist, comments, tags] = await Promise.all([
    taskModel.findTaskEvents(id),
    taskModel.findChecklistItems(id),
    taskModel.findComments(id),
    taskModel.findTags(id),
  ]);

  return { ...task, events, checklist, comments, tags };
}

export async function createTask(data, user) {
  const isSuperOrAdmin = tieneRol(user, 'superadmin', 'admin');
  const canAssign = isSuperOrAdmin || !!user.permissions?.['tasks.assign'];

  let targetAssignedTo = data.assigned_to;

  if (targetAssignedTo && targetAssignedTo !== user.id && !canAssign) {
    throw new AppError('Solo los administradores pueden asignar tareas a otros miembros del equipo', 403, 'FORBIDDEN');
  }

  if (!targetAssignedTo) {
    targetAssignedTo = user.id;
  }

  if (data.project_id) {
    await validarAccesoProyecto(data.project_id, user);
  }

  const maxPos = await taskModel.getMaxPosition(data.status || 'por_hacer', targetAssignedTo);
  const position = maxPos + 1000.0;

  const createdTask = await taskModel.createTask({
    ...data,
    position,
    assigned_to: targetAssignedTo,
    created_by: user.id,
  });

  await taskModel.createTaskEvent({
    task_id: createdTask.id,
    user_id: user.id,
    event_type: 'created',
    details: {
      title: createdTask.title,
      status: createdTask.status,
      priority: createdTask.priority,
      assigned_to: createdTask.assigned_to,
    },
  });

  // Notificar al usuario asignado si es diferente del creador
  if (targetAssignedTo && targetAssignedTo !== user.id) {
    await notifyUsers({
      targetUserIds: [targetAssignedTo],
      type: 'task_asignada',
      title: `Nueva tarea asignada: ${createdTask.title}`,
      message: `Te han asignado la tarea "${createdTask.title}" en el tablero de equipo.`,
      link_path: `/tareas?id=${createdTask.id}`,
      triggered_by_user_id: user.id,
      metadata: { task_id: createdTask.id },
    });
  }

  logger.info({ taskId: createdTask.id, userId: user.id }, 'Tarea creada en el tablero');
  return createdTask;
}

export async function updateTask(id, fields, user) {
  const currentTask = await taskModel.findTaskById(id);
  if (!currentTask || currentTask.archived_at) {
    throw new AppError('Tarea no encontrada', 404, 'NOT_FOUND');
  }

  const isSuperOrAdmin = tieneRol(user, 'superadmin', 'admin');
  const hasViewAll = isSuperOrAdmin || !!user.permissions?.['tasks.view_all'];

  if (!hasViewAll && currentTask.assigned_to !== user.id && currentTask.created_by !== user.id) {
    throw new AppError('No tienes permiso para editar esta tarea', 403, 'FORBIDDEN');
  }

  if (fields.project_id) {
    await validarAccesoProyecto(fields.project_id, user);
  }

  if (fields.assigned_to !== undefined && fields.assigned_to !== currentTask.assigned_to) {
    const canAssign = isSuperOrAdmin || !!user.permissions?.['tasks.assign'];
    if (!canAssign) {
      throw new AppError('Solo los administradores pueden reasignar tareas', 403, 'FORBIDDEN');
    }
  }

  const updatedTask = await taskModel.updateTask(id, fields);

  await taskModel.createTaskEvent({
    task_id: id,
    user_id: user.id,
    event_type: 'updated',
    details: fields,
  });

  if (fields.assigned_to && fields.assigned_to !== currentTask.assigned_to && fields.assigned_to !== user.id) {
    await notifyUsers({
      targetUserIds: [fields.assigned_to],
      type: 'task_asignada',
      title: `Tarea reasignada: ${updatedTask.title}`,
      message: `Te han reasignado la tarea "${updatedTask.title}".`,
      link_path: `/tareas?id=${id}`,
      triggered_by_user_id: user.id,
      metadata: { task_id: id },
    });
  }

  return updatedTask;
}

export async function moveTask(id, { status, position, prevPosition, nextPosition }, user) {
  const currentTask = await taskModel.findTaskById(id);
  if (!currentTask || currentTask.archived_at) {
    throw new AppError('Tarea no encontrada', 404, 'NOT_FOUND');
  }

  const isSuperOrAdmin = tieneRol(user, 'superadmin', 'admin');
  const hasViewAll = isSuperOrAdmin || !!user.permissions?.['tasks.view_all'];

  if (!hasViewAll && currentTask.assigned_to !== user.id && currentTask.created_by !== user.id) {
    throw new AppError('No tienes permiso para mover esta tarea', 403, 'FORBIDDEN');
  }

  // Regla del CRM:
  // «La persona mueve su tarjeta hasta «En revisión». Solo admin y superadmin
  // la pasan a «Hecha», o la devuelven a «En curso».»
  if (status === 'hecha' && currentTask.status !== 'hecha' && !isSuperOrAdmin) {
    throw new AppError('Solo los administradores pueden marcar una tarea como Hecha', 403, 'FORBIDDEN');
  }

  if (currentTask.status === 'hecha' && status !== 'hecha' && !isSuperOrAdmin) {
    throw new AppError('Solo los administradores pueden reabrir una tarea completada', 403, 'FORBIDDEN');
  }

  // Cálculo de posición numérica
  let newPos = position;
  if (newPos === undefined || newPos === null) {
    if (prevPosition != null && nextPosition != null) {
      newPos = (Number(prevPosition) + Number(nextPosition)) / 2;
    } else if (prevPosition != null) {
      newPos = Number(prevPosition) + 1000.0;
    } else if (nextPosition != null) {
      newPos = Number(nextPosition) / 2;
    } else {
      const maxPos = await taskModel.getMaxPosition(status, currentTask.assigned_to);
      newPos = maxPos + 1000.0;
    }
  }

  let completed_at = currentTask.completed_at;
  if (status === 'hecha' && currentTask.status !== 'hecha') {
    completed_at = new Date().toISOString();
  } else if (status !== 'hecha' && currentTask.status === 'hecha') {
    completed_at = null;
  }

  const movedTask = await taskModel.updateTaskPositionAndStatus(id, {
    status,
    position: newPos,
    completed_at,
  });

  await taskModel.createTaskEvent({
    task_id: id,
    user_id: user.id,
    event_type: 'status_changed',
    details: {
      old_status: currentTask.status,
      new_status: status,
      old_position: currentTask.position,
      new_position: newPos,
    },
  });

  // Notificar al creador de la tarea si no es quien la movió
  if (currentTask.created_by && currentTask.created_by !== user.id && currentTask.status !== status) {
    await notifyUsers({
      targetUserIds: [currentTask.created_by],
      type: 'task_estado_cambiado',
      title: `Tarea actualizada: ${currentTask.title}`,
      message: `El estado cambió de ${currentTask.status} a ${status}.`,
      link_path: `/tareas?id=${id}`,
      triggered_by_user_id: user.id,
      metadata: { task_id: id, status },
    });
  }

  return movedTask;
}

export async function archiveTask(id, user) {
  const currentTask = await taskModel.findTaskById(id);
  if (!currentTask || currentTask.archived_at) {
    throw new AppError('Tarea no encontrada', 404, 'NOT_FOUND');
  }

  const isSuperOrAdmin = tieneRol(user, 'superadmin', 'admin');
  const canDelete = isSuperOrAdmin || !!user.permissions?.['tasks.delete'];

  if (!canDelete && currentTask.created_by !== user.id) {
    throw new AppError('Solo los administradores o el creador pueden archivar esta tarea', 403, 'FORBIDDEN');
  }

  const archived = await taskModel.archiveTask(id);

  await taskModel.createTaskEvent({
    task_id: id,
    user_id: user.id,
    event_type: 'archived',
    details: { archived_by: user.id },
  });

  return archived;
}

/* --- Checklist Handlers --- */

export async function addChecklistItem(taskId, data, user) {
  await getTaskById(taskId, user); // check access
  const item = await taskModel.createChecklistItem({ task_id: taskId, title: data.title, position: data.position });
  await taskModel.createTaskEvent({
    task_id: taskId,
    user_id: user.id,
    event_type: 'checklist',
    details: { action: 'item_added', title: data.title },
  });
  return item;
}

export async function updateChecklistItem(taskId, itemId, fields, user) {
  await getTaskById(taskId, user); // check access
  const updated = await taskModel.updateChecklistItem(itemId, fields);
  if (fields.is_completed !== undefined) {
    await taskModel.createTaskEvent({
      task_id: taskId,
      user_id: user.id,
      event_type: 'checklist',
      details: { action: 'item_toggled', itemId, is_completed: fields.is_completed },
    });
  }
  return updated;
}

export async function deleteChecklistItem(taskId, itemId, user) {
  await getTaskById(taskId, user); // check access
  const deleted = await taskModel.deleteChecklistItem(itemId);
  return deleted;
}

/* --- Comments Handlers --- */

export async function addComment(taskId, data, user) {
  const task = await getTaskById(taskId, user); // check access
  const comment = await taskModel.createComment({ task_id: taskId, user_id: user.id, content: data.content });
  await taskModel.createTaskEvent({
    task_id: taskId,
    user_id: user.id,
    event_type: 'comment',
    details: { comment_id: comment.id },
  });

  // Notificar al asignado o creador si son distintos del autor del comentario
  const notifyTargets = new Set();
  if (task.assigned_to && task.assigned_to !== user.id) notifyTargets.add(task.assigned_to);
  if (task.created_by && task.created_by !== user.id) notifyTargets.add(task.created_by);

  if (notifyTargets.size > 0) {
    await notifyUsers({
      targetUserIds: Array.from(notifyTargets),
      type: 'task_comentario',
      title: `Nuevo comentario en: ${task.title}`,
      message: `${user.email || 'Un usuario'} comentó en la tarea "${task.title}".`,
      link_path: `/tareas?id=${taskId}`,
      triggered_by_user_id: user.id,
      metadata: { task_id: taskId, comment_id: comment.id },
    });
  }

  return comment;
}

export async function deleteComment(taskId, commentId, user) {
  await getTaskById(taskId, user);
  const isSuperOrAdmin = tieneRol(user, 'superadmin', 'admin');
  const comments = await taskModel.findComments(taskId);
  const comment = comments.find((c) => c.id === Number(commentId));
  if (!comment) throw new AppError('Comentario no encontrado', 404, 'NOT_FOUND');

  if (!isSuperOrAdmin && comment.user_id !== user.id) {
    throw new AppError('Solo puedes borrar tus propios comentarios', 403, 'FORBIDDEN');
  }

  return taskModel.deleteComment(commentId);
}

/* --- Tags Handlers --- */

export async function addTag(taskId, data, user) {
  await getTaskById(taskId, user);
  return taskModel.createTag({ task_id: taskId, name: data.name, color: data.color });
}

export async function deleteTag(taskId, tagId, user) {
  await getTaskById(taskId, user);
  return taskModel.deleteTag(tagId);
}

/* --- Team Metrics (Fase 4) --- */

export async function getTeamMetrics(projectId, user) {
  const isSuperOrAdmin = tieneRol(user, 'superadmin', 'admin');
  if (!isSuperOrAdmin) {
    throw new AppError('Solo los administradores pueden consultar las métricas de equipo', 403, 'FORBIDDEN');
  }
  if (projectId) {
    await validarAccesoProyecto(projectId, user);
  }
  return taskModel.getTeamMetrics(projectId);
}
