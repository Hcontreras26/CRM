import * as taskService from './tasks.service.js';
import { AppError } from '../../shared/utils/AppError.js';
import {
  createTaskSchema,
  updateTaskSchema,
  moveTaskSchema,
  listTasksQuerySchema,
  metricsQuerySchema,
  addChecklistItemSchema,
  updateChecklistItemSchema,
  addCommentSchema,
  addTagSchema,
  addLinkSchema,
} from './tasks.validation.js';

function validar(schema, datos) {
  const r = schema.safeParse(datos ?? {});
  if (!r.success) {
    throw new AppError(r.error.errors[0]?.message || 'Datos inválidos', 400, 'VALIDATION_ERROR');
  }
  return r.data;
}

function validarId(paramId) {
  if (!/^\d+$/.test(String(paramId))) {
    throw new AppError('ID inválido', 400, 'VALIDATION_ERROR');
  }
  const id = Number(paramId);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
    throw new AppError('ID inválido', 400, 'VALIDATION_ERROR');
  }
  return id;
}

// El usuario de la sesion, tal cual viene en el testigo: `userId`, `role`,
// `roles_extra` y `customRoleId`. Nunca `req.user.id`.
const quien = (req) => req.user;

// Envuelve cada accion: un error, al errorHandler.
const accion = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

export const list = accion(async (req, res) => {
  const q = validar(listTasksQuerySchema, req.query);
  const data = await taskService.listTasks(quien(req), q);
  res.json({ success: true, data });
});

export const getById = accion(async (req, res) => {
  const data = await taskService.getTaskById(validarId(req.params.id), quien(req));
  res.json({ success: true, data });
});

export const create = accion(async (req, res) => {
  const body = validar(createTaskSchema, req.body);
  const data = await taskService.createTask(body, quien(req));
  res.status(201).json({ success: true, data });
});

export const update = accion(async (req, res) => {
  const id = validarId(req.params.id);
  const body = validar(updateTaskSchema, req.body);
  const data = await taskService.updateTask(id, body, quien(req));
  res.json({ success: true, data });
});

export const move = accion(async (req, res) => {
  const id = validarId(req.params.id);
  const body = validar(moveTaskSchema, req.body);
  const data = await taskService.moveTask(id, body, quien(req));
  res.json({ success: true, data });
});

export const archive = accion(async (req, res) => {
  const data = await taskService.archiveTask(validarId(req.params.id), quien(req));
  res.json({ success: true, data });
});

/* --- Personas y etiquetas (selectores del tablero) --- */

export const assignees = accion(async (req, res) => {
  const data = await taskService.listAssignees(quien(req));
  res.json({ success: true, data });
});

export const tagNames = accion(async (req, res) => {
  const data = await taskService.listTagNames(quien(req));
  res.json({ success: true, data });
});

/* --- Lista de comprobacion --- */

export const addChecklistItem = accion(async (req, res) => {
  const taskId = validarId(req.params.id);
  const body = validar(addChecklistItemSchema, req.body);
  const data = await taskService.addChecklistItem(taskId, body, quien(req));
  res.status(201).json({ success: true, data });
});

export const updateChecklistItem = accion(async (req, res) => {
  const taskId = validarId(req.params.id);
  const itemId = validarId(req.params.itemId);
  const body = validar(updateChecklistItemSchema, req.body);
  const data = await taskService.updateChecklistItem(taskId, itemId, body, quien(req));
  res.json({ success: true, data });
});

export const deleteChecklistItem = accion(async (req, res) => {
  const taskId = validarId(req.params.id);
  const itemId = validarId(req.params.itemId);
  const data = await taskService.deleteChecklistItem(taskId, itemId, quien(req));
  res.json({ success: true, data });
});

/* --- Comentarios --- */

export const addComment = accion(async (req, res) => {
  const taskId = validarId(req.params.id);
  const body = validar(addCommentSchema, req.body);
  const data = await taskService.addComment(taskId, body, quien(req));
  res.status(201).json({ success: true, data });
});

export const deleteComment = accion(async (req, res) => {
  const taskId = validarId(req.params.id);
  const commentId = validarId(req.params.commentId);
  const data = await taskService.deleteComment(taskId, commentId, quien(req));
  res.json({ success: true, data });
});

/* --- Etiquetas --- */

export const addTag = accion(async (req, res) => {
  const taskId = validarId(req.params.id);
  const body = validar(addTagSchema, req.body);
  const data = await taskService.addTag(taskId, body, quien(req));
  res.status(201).json({ success: true, data });
});

export const deleteTag = accion(async (req, res) => {
  const taskId = validarId(req.params.id);
  const tagId = validarId(req.params.tagId);
  const data = await taskService.deleteTag(taskId, tagId, quien(req));
  res.json({ success: true, data });
});

/* --- Enlaces --- */

export const addLink = accion(async (req, res) => {
  const taskId = validarId(req.params.id);
  const body = validar(addLinkSchema, req.body);
  const data = await taskService.addLink(taskId, body, quien(req));
  res.status(201).json({ success: true, data });
});

export const deleteLink = accion(async (req, res) => {
  const taskId = validarId(req.params.id);
  const linkId = validarId(req.params.linkId);
  const data = await taskService.deleteLink(taskId, linkId, quien(req));
  res.json({ success: true, data });
});

/* --- Todo el equipo --- */

export const teamMetrics = accion(async (req, res) => {
  const { project_id: projectId } = validar(metricsQuerySchema, req.query);
  const data = await taskService.getTeamMetrics(projectId || null, quien(req));
  res.json({ success: true, data });
});
