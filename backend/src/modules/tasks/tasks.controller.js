import * as taskService from './tasks.service.js';
import { AppError } from '../../shared/utils/AppError.js';
import {
  createTaskSchema,
  updateTaskSchema,
  moveTaskSchema,
  listTasksQuerySchema,
  addChecklistItemSchema,
  updateChecklistItemSchema,
  addCommentSchema,
  addTagSchema,
} from './tasks.validation.js';

function validar(schema, datos) {
  const r = schema.safeParse(datos);
  if (!r.success) {
    throw new AppError(r.error.errors[0]?.message || 'Datos inválidos', 400, 'VALIDATION_ERROR');
  }
  return r.data;
}

function validarId(paramId) {
  const id = Number(paramId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError('ID inválido', 400, 'VALIDATION_ERROR');
  }
  return id;
}

function getActor(req) {
  return {
    id: req.user.userId,
    userId: req.user.userId,
    role: req.user.role,
    roles_extra: req.user.roles_extra || [],
    email: req.user.email,
    permissions: req.user.permissions || {},
  };
}

export async function list(req, res, next) {
  try {
    const query = validar(listTasksQuerySchema, req.query);
    const data = await taskService.listTasks(getActor(req), query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const id = validarId(req.params.id);
    const data = await taskService.getTaskById(id, getActor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const body = validar(createTaskSchema, req.body);
    const data = await taskService.createTask(body, getActor(req));
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const id = validarId(req.params.id);
    const body = validar(updateTaskSchema, req.body);
    const data = await taskService.updateTask(id, body, getActor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function move(req, res, next) {
  try {
    const id = validarId(req.params.id);
    const body = validar(moveTaskSchema, req.body);
    const data = await taskService.moveTask(id, body, getActor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function archive(req, res, next) {
  try {
    const id = validarId(req.params.id);
    const data = await taskService.archiveTask(id, getActor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/* --- Checklist Items --- */

export async function addChecklistItem(req, res, next) {
  try {
    const taskId = validarId(req.params.id);
    const body = validar(addChecklistItemSchema, req.body);
    const data = await taskService.addChecklistItem(taskId, body, getActor(req));
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function updateChecklistItem(req, res, next) {
  try {
    const taskId = validarId(req.params.id);
    const itemId = validarId(req.params.itemId);
    const body = validar(updateChecklistItemSchema, req.body);
    const data = await taskService.updateChecklistItem(taskId, itemId, body, getActor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function deleteChecklistItem(req, res, next) {
  try {
    const taskId = validarId(req.params.id);
    const itemId = validarId(req.params.itemId);
    const data = await taskService.deleteChecklistItem(taskId, itemId, getActor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/* --- Comments --- */

export async function addComment(req, res, next) {
  try {
    const taskId = validarId(req.params.id);
    const body = validar(addCommentSchema, req.body);
    const data = await taskService.addComment(taskId, body, getActor(req));
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function deleteComment(req, res, next) {
  try {
    const taskId = validarId(req.params.id);
    const commentId = validarId(req.params.commentId);
    const data = await taskService.deleteComment(taskId, commentId, getActor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/* --- Tags --- */

export async function addTag(req, res, next) {
  try {
    const taskId = validarId(req.params.id);
    const body = validar(addTagSchema, req.body);
    const data = await taskService.addTag(taskId, body, getActor(req));
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function deleteTag(req, res, next) {
  try {
    const taskId = validarId(req.params.id);
    const tagId = validarId(req.params.tagId);
    const data = await taskService.deleteTag(taskId, tagId, getActor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/* --- Team Metrics (Fase 4) --- */

export async function teamMetrics(req, res, next) {
  try {
    const projectId = req.query.project_id ? validarId(req.query.project_id) : null;
    const data = await taskService.getTeamMetrics(projectId, getActor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
