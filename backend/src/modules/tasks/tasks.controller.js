import * as taskService from './tasks.service.js';
import {
  createTaskSchema,
  updateTaskSchema,
  moveTaskSchema,
  listTasksQuerySchema,
} from './tasks.validation.js';

function getActor(req) {
  return {
    id: req.user.userId || req.user.id,
    role: req.user.role,
    email: req.user.email,
    permissions: req.user.permissions || {},
  };
}

export async function list(req, res, next) {
  try {
    const query = listTasksQuerySchema.parse(req.query);
    const data = await taskService.listTasks(getActor(req), query);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getById(req, res, next) {
  try {
    const id = Number(req.params.id);
    const data = await taskService.getTaskById(id, getActor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const body = createTaskSchema.parse(req.body);
    const data = await taskService.createTask(body, getActor(req));
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const id = Number(req.params.id);
    const body = updateTaskSchema.parse(req.body);
    const data = await taskService.updateTask(id, body, getActor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function move(req, res, next) {
  try {
    const id = Number(req.params.id);
    const body = moveTaskSchema.parse(req.body);
    const data = await taskService.moveTask(id, body, getActor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function archive(req, res, next) {
  try {
    const id = Number(req.params.id);
    const data = await taskService.archiveTask(id, getActor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
