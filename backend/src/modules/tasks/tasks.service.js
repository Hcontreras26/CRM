import * as taskModel from './tasks.model.js';
import { AppError } from '../../shared/utils/AppError.js';
import { logger } from '../../shared/utils/logger.js';

export async function listTasks(user, query) {
  const isSuperOrAdmin = user.role === 'superadmin' || user.role === 'admin';
  const hasViewAll = isSuperOrAdmin || user.permissions?.['tasks.view_all'];

  let assignedToFilter = query.assigned_to;
  if (!hasViewAll) {
    // Gestores, soporte y colaboradores solo ven sus propias tareas
    assignedToFilter = user.id;
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
    throw new AppError('Tarea no encontrada', 404);
  }

  const isSuperOrAdmin = user.role === 'superadmin' || user.role === 'admin';
  const hasViewAll = isSuperOrAdmin || user.permissions?.['tasks.view_all'];

  if (!hasViewAll && task.assigned_to !== user.id && task.created_by !== user.id) {
    throw new AppError('No tienes permiso para consultar esta tarea', 403);
  }

  const events = await taskModel.findTaskEvents(id);
  return { ...task, events };
}

export async function createTask(data, user) {
  const isSuperOrAdmin = user.role === 'superadmin' || user.role === 'admin';
  const canAssign = isSuperOrAdmin || user.permissions?.['tasks.assign'];

  let targetAssignedTo = data.assigned_to;

  if (targetAssignedTo && targetAssignedTo !== user.id && !canAssign) {
    throw new AppError('Solo los administradores pueden asignar tareas a otros miembros del equipo', 403);
  }

  if (!targetAssignedTo) {
    targetAssignedTo = user.id;
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

  logger.info({ taskId: createdTask.id, userId: user.id }, 'Tarea creada en el tablero');
  return createdTask;
}

export async function updateTask(id, fields, user) {
  const currentTask = await taskModel.findTaskById(id);
  if (!currentTask || currentTask.archived_at) {
    throw new AppError('Tarea no encontrada', 404);
  }

  const isSuperOrAdmin = user.role === 'superadmin' || user.role === 'admin';
  const hasViewAll = isSuperOrAdmin || user.permissions?.['tasks.view_all'];

  if (!hasViewAll && currentTask.assigned_to !== user.id && currentTask.created_by !== user.id) {
    throw new AppError('No tienes permiso para editar esta tarea', 403);
  }

  if (fields.assigned_to !== undefined && fields.assigned_to !== currentTask.assigned_to) {
    const canAssign = isSuperOrAdmin || user.permissions?.['tasks.assign'];
    if (!canAssign) {
      throw new AppError('Solo los administradores pueden reasignar tareas', 403);
    }
  }

  const updatedTask = await taskModel.updateTask(id, fields);

  await taskModel.createTaskEvent({
    task_id: id,
    user_id: user.id,
    event_type: 'updated',
    details: fields,
  });

  return updatedTask;
}

export async function moveTask(id, { status, position, prevPosition, nextPosition }, user) {
  const currentTask = await taskModel.findTaskById(id);
  if (!currentTask || currentTask.archived_at) {
    throw new AppError('Tarea no encontrada', 404);
  }

  const isSuperOrAdmin = user.role === 'superadmin' || user.role === 'admin';
  const hasViewAll = isSuperOrAdmin || user.permissions?.['tasks.view_all'];

  if (!hasViewAll && currentTask.assigned_to !== user.id && currentTask.created_by !== user.id) {
    throw new AppError('No tienes permiso para mover esta tarea', 403);
  }

  // Regla de Diego:
  // «La persona mueve su tarjeta hasta «En revisión». Solo admin y superadmin
  // la pasan a «Hecha», o la devuelven a «En curso».»
  if (status === 'hecha' && currentTask.status !== 'hecha' && !isSuperOrAdmin) {
    throw new AppError('Solo los administradores pueden marcar una tarea como Hecha', 403);
  }

  if (currentTask.status === 'hecha' && status !== 'hecha' && !isSuperOrAdmin) {
    throw new AppError('Solo los administradores pueden reabrir una tarea completada', 403);
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

  return movedTask;
}

export async function archiveTask(id, user) {
  const currentTask = await taskModel.findTaskById(id);
  if (!currentTask || currentTask.archived_at) {
    throw new AppError('Tarea no encontrada', 404);
  }

  const isSuperOrAdmin = user.role === 'superadmin' || user.role === 'admin';
  const canDelete = isSuperOrAdmin || user.permissions?.['tasks.delete'];

  if (!canDelete && currentTask.created_by !== user.id) {
    throw new AppError('Solo los administradores o el creador pueden archivar esta tarea', 403);
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
