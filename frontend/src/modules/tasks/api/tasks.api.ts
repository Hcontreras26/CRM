import client from '@/shared/api/client';
import type {
  Task,
  TaskChecklistItem,
  TaskComment,
  TaskTag,
  TeamMemberMetric,
} from '../types';

export interface GetTasksParams {
  status?: string;
  assigned_to?: number;
  project_id?: number;
  priority?: string;
  search?: string;
  incluir_archivadas?: boolean;
}

export async function getTasks(params: GetTasksParams = {}): Promise<Task[]> {
  const { data } = await client.get('/tasks', { params });
  return data.data;
}

export async function getTaskById(id: number): Promise<Task> {
  const { data } = await client.get(`/tasks/${id}`);
  return data.data;
}

export async function createTask(payload: Partial<Task>): Promise<Task> {
  const { data } = await client.post('/tasks', payload);
  return data.data;
}

export async function updateTask(id: number, payload: Partial<Task>): Promise<Task> {
  const { data } = await client.patch(`/tasks/${id}`, payload);
  return data.data;
}

export async function moveTask(
  id: number,
  payload: {
    status: string;
    position?: number;
    prevPosition?: number | null;
    nextPosition?: number | null;
  }
): Promise<Task> {
  const { data } = await client.patch(`/tasks/${id}/move`, payload);
  return data.data;
}

export async function archiveTask(id: number): Promise<{ id: number }> {
  const { data } = await client.delete(`/tasks/${id}`);
  return data.data;
}

/* --- Checklists --- */

export async function addChecklistItem(
  taskId: number,
  payload: { title: string; position?: number }
): Promise<TaskChecklistItem> {
  const { data } = await client.post(`/tasks/${taskId}/checklist`, payload);
  return data.data;
}

export async function updateChecklistItem(
  taskId: number,
  itemId: number,
  payload: { title?: string; is_completed?: boolean; position?: number }
): Promise<TaskChecklistItem> {
  const { data } = await client.patch(`/tasks/${taskId}/checklist/${itemId}`, payload);
  return data.data;
}

export async function deleteChecklistItem(
  taskId: number,
  itemId: number
): Promise<{ id: number }> {
  const { data } = await client.delete(`/tasks/${taskId}/checklist/${itemId}`);
  return data.data;
}

/* --- Comments --- */

export async function addComment(
  taskId: number,
  payload: { content: string }
): Promise<TaskComment> {
  const { data } = await client.post(`/tasks/${taskId}/comments`, payload);
  return data.data;
}

export async function deleteComment(
  taskId: number,
  commentId: number
): Promise<{ id: number }> {
  const { data } = await client.delete(`/tasks/${taskId}/comments/${commentId}`);
  return data.data;
}

/* --- Tags --- */

export async function addTag(
  taskId: number,
  payload: { name: string; color: string }
): Promise<TaskTag> {
  const { data } = await client.post(`/tasks/${taskId}/tags`, payload);
  return data.data;
}

export async function deleteTag(
  taskId: number,
  tagId: number
): Promise<{ id: number }> {
  const { data } = await client.delete(`/tasks/${taskId}/tags/${tagId}`);
  return data.data;
}

/* --- Team Metrics --- */

export async function getTeamMetrics(projectId?: number): Promise<TeamMemberMetric[]> {
  const { data } = await client.get('/tasks/metrics', {
    params: projectId ? { project_id: projectId } : {},
  });
  return data.data;
}
