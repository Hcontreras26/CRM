import client from '@/shared/api/client';

const IS_BYPASS = String(import.meta.env.VITE_DEV_BYPASS_AUTH || '').toLowerCase() === 'true';

// Mock storage para pruebas en local sin base de datos Docker
const MOCK_KEY = 'crm_dev_tasks_mock';

function getLocalMockTasks() {
  const raw = localStorage.getItem(MOCK_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {
      // fallback
    }
  }
  const initial = [
    {
      id: 1,
      title: 'Revisar prospectos asignados hoy',
      description: 'Contactar a los nuevos leads de Psiko Aprende',
      status: 'por_hacer',
      priority: 'alta',
      position: 1000,
      due_date: new Date(Date.now() + 86400000 * 2).toISOString(),
      project_name: 'Psiko Aprende',
      project_id: 1,
      assigned_to: 1,
      assigned_to_name: 'Hugo Contreras',
      created_by: 1,
    },
    {
      id: 2,
      title: 'Validar matrículas de ISEIH',
      description: 'Comprobar pagos pendientes en Stripe',
      status: 'en_curso',
      priority: 'media',
      position: 2000,
      due_date: new Date(Date.now() + 86400000 * 5).toISOString(),
      project_name: 'ISEIH',
      project_id: 2,
      assigned_to: 1,
      assigned_to_name: 'Hugo Contreras',
      created_by: 1,
    },
    {
      id: 3,
      title: 'Documentación de tutores lista',
      description: 'Dossiers cargados en R2',
      status: 'en_revision',
      priority: 'baja',
      position: 3000,
      due_date: null,
      project_name: 'General',
      project_id: null,
      assigned_to: 1,
      assigned_to_name: 'Hugo Contreras',
      created_by: 1,
    },
  ];
  localStorage.setItem(MOCK_KEY, JSON.stringify(initial));
  return initial;
}

function saveLocalMockTasks(tasks) {
  localStorage.setItem(MOCK_KEY, JSON.stringify(tasks));
}

export async function getTasks(params = {}) {
  if (IS_BYPASS) {
    let tasks = getLocalMockTasks();
    if (params.status) tasks = tasks.filter((t) => t.status === params.status);
    if (params.priority) tasks = tasks.filter((t) => t.priority === params.priority);
    if (params.project_id) tasks = tasks.filter((t) => t.project_id === params.project_id);
    if (params.search) {
      const q = params.search.toLowerCase();
      tasks = tasks.filter((t) => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
    }
    return tasks;
  }
  const { data } = await client.get('/api/tasks', { params });
  return data.data;
}

export async function getTaskById(id) {
  if (IS_BYPASS) {
    const tasks = getLocalMockTasks();
    return tasks.find((t) => t.id === Number(id)) || null;
  }
  const { data } = await client.get(`/api/tasks/${id}`);
  return data.data;
}

export async function createTask(payload) {
  if (IS_BYPASS) {
    const tasks = getLocalMockTasks();
    const newTask = {
      id: Date.now(),
      title: payload.title,
      description: payload.description || null,
      status: payload.status || 'por_hacer',
      priority: payload.priority || 'media',
      position: tasks.length * 1000 + 1000,
      due_date: payload.due_date || null,
      project_id: payload.project_id || null,
      project_name: payload.project_id === 1 ? 'Psiko Aprende' : payload.project_id === 2 ? 'ISEIH' : null,
      assigned_to: payload.assigned_to || 1,
      assigned_to_name: 'Hugo Contreras',
      created_by: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    tasks.push(newTask);
    saveLocalMockTasks(tasks);
    return newTask;
  }
  const { data } = await client.post('/api/tasks', payload);
  return data.data;
}

export async function updateTask(id, payload) {
  if (IS_BYPASS) {
    const tasks = getLocalMockTasks();
    const idx = tasks.findIndex((t) => t.id === Number(id));
    if (idx >= 0) {
      tasks[idx] = { ...tasks[idx], ...payload, updated_at: new Date().toISOString() };
      saveLocalMockTasks(tasks);
      return tasks[idx];
    }
    return null;
  }
  const { data } = await client.patch(`/api/tasks/${id}`, payload);
  return data.data;
}

export async function moveTask(id, payload) {
  if (IS_BYPASS) {
    const tasks = getLocalMockTasks();
    const idx = tasks.findIndex((t) => t.id === Number(id));
    if (idx >= 0) {
      tasks[idx].status = payload.status;
      if (payload.status === 'hecha') {
        tasks[idx].completed_at = new Date().toISOString();
      } else {
        tasks[idx].completed_at = null;
      }
      tasks[idx].updated_at = new Date().toISOString();
      saveLocalMockTasks(tasks);
      return tasks[idx];
    }
    return null;
  }
  const { data } = await client.patch(`/api/tasks/${id}/move`, payload);
  return data.data;
}

export async function archiveTask(id) {
  if (IS_BYPASS) {
    let tasks = getLocalMockTasks();
    tasks = tasks.filter((t) => t.id !== Number(id));
    saveLocalMockTasks(tasks);
    return { id };
  }
  const { data } = await client.delete(`/api/tasks/${id}`);
  return data.data;
}
