import client from '@/shared/api/client';
import type {
  Assignee,
  TagName,
  Task,
  TaskChecklistItem,
  TaskComment,
  TaskDetail,
  TaskLink,
  TaskPriority,
  TaskStatus,
  TaskTag,
  TeamMemberMetric,
} from '../types';

// El cliente ya pone el prefijo `/api`: aqui las rutas van sin el.

// `type` y no `interface`: un `interface` no encaja en el
// `Record<string, unknown>` que espera `params` del cliente.
export type GetTasksParams = {
  status?: TaskStatus;
  assigned_to?: number;
  project_id?: number;
  priority?: TaskPriority;
  search?: string;
  tag?: string;
  vencidas?: boolean;
  desde?: string;
  hasta?: string;
};

export type TaskPayload = {
  title: string;
  description: string | null;
  priority: TaskPriority;
  due_date: string | null;
  project_id: number | null;
  status?: TaskStatus;
  assigned_to?: number | null;
};

export async function getTasks(params: GetTasksParams = {}): Promise<Task[]> {
  const limpios = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== false)
  );
  const { data } = await client.get<Task[]>('/tasks', { params: limpios });
  return data ?? [];
}

export async function getTaskById(id: number): Promise<TaskDetail> {
  const { data } = await client.get<TaskDetail>(`/tasks/${id}`);
  return data as TaskDetail;
}

export async function createTask(payload: TaskPayload): Promise<Task> {
  const { data } = await client.post<Task>('/tasks', payload);
  return data as Task;
}

export async function updateTask(id: number, payload: Partial<TaskPayload>): Promise<Task> {
  const { data } = await client.patch<Task>(`/tasks/${id}`, payload);
  return data as Task;
}

/** Mover a una columna y, si se suelta entre dos tarjetas, decir cuales. */
export async function moveTask(
  id: number,
  payload: { status: TaskStatus; prev_id?: number | null; next_id?: number | null }
): Promise<Task> {
  const { data } = await client.patch<Task>(`/tasks/${id}/move`, payload);
  return data as Task;
}

export async function archiveTask(id: number): Promise<Task> {
  const { data } = await client.delete<Task>(`/tasks/${id}`);
  return data as Task;
}

export async function getAssignees(): Promise<Assignee[]> {
  const { data } = await client.get<Assignee[]>('/tasks/assignees');
  return data ?? [];
}

export async function getTagNames(): Promise<TagName[]> {
  const { data } = await client.get<TagName[]>('/tasks/tags');
  return data ?? [];
}

/* --- Lista de comprobacion --- */

export async function addChecklistItem(taskId: number, payload: { title: string }): Promise<TaskChecklistItem> {
  const { data } = await client.post<TaskChecklistItem>(`/tasks/${taskId}/checklist`, payload);
  return data as TaskChecklistItem;
}

export async function updateChecklistItem(
  taskId: number,
  itemId: number,
  payload: { title?: string; is_completed?: boolean }
): Promise<TaskChecklistItem> {
  const { data } = await client.patch<TaskChecklistItem>(`/tasks/${taskId}/checklist/${itemId}`, payload);
  return data as TaskChecklistItem;
}

export async function deleteChecklistItem(taskId: number, itemId: number): Promise<void> {
  await client.delete(`/tasks/${taskId}/checklist/${itemId}`);
}

/* --- Comentarios --- */

export async function addComment(taskId: number, payload: { content: string }): Promise<TaskComment> {
  const { data } = await client.post<TaskComment>(`/tasks/${taskId}/comments`, payload);
  return data as TaskComment;
}

export async function deleteComment(taskId: number, commentId: number): Promise<void> {
  await client.delete(`/tasks/${taskId}/comments/${commentId}`);
}

/* --- Etiquetas --- */

export async function addTag(taskId: number, payload: { name: string; color: string }): Promise<TaskTag> {
  const { data } = await client.post<TaskTag>(`/tasks/${taskId}/tags`, payload);
  return data as TaskTag;
}

export async function deleteTag(taskId: number, tagId: number): Promise<void> {
  await client.delete(`/tasks/${taskId}/tags/${tagId}`);
}

/* --- Enlaces --- */

export async function addLink(taskId: number, payload: { url: string; title?: string | null }): Promise<TaskLink> {
  const { data } = await client.post<TaskLink>(`/tasks/${taskId}/links`, payload);
  return data as TaskLink;
}

export async function deleteLink(taskId: number, linkId: number): Promise<void> {
  await client.delete(`/tasks/${taskId}/links/${linkId}`);
}

/* --- Todo el equipo --- */

export async function getTeamMetrics(projectId?: number): Promise<TeamMemberMetric[]> {
  const { data } = await client.get<TeamMemberMetric[]>('/tasks/metrics', {
    params: projectId ? { project_id: projectId } : {},
  });
  return data ?? [];
}
