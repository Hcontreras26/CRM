import client from '@/shared/api/client';

export async function getTasks(params = {}) {
  const { data } = await client.get('/api/tasks', { params });
  return data.data;
}

export async function getTaskById(id) {
  const { data } = await client.get(`/api/tasks/${id}`);
  return data.data;
}

export async function createTask(payload) {
  const { data } = await client.post('/api/tasks', payload);
  return data.data;
}

export async function updateTask(id, payload) {
  const { data } = await client.patch(`/api/tasks/${id}`, payload);
  return data.data;
}

export async function moveTask(id, payload) {
  const { data } = await client.patch(`/api/tasks/${id}/move`, payload);
  return data.data;
}

export async function archiveTask(id) {
  const { data } = await client.delete(`/api/tasks/${id}`);
  return data.data;
}
