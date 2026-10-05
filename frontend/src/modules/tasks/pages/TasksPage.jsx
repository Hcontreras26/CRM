import React, { useState, useEffect, useCallback } from 'react';
import { TaskColumn } from '../components/TaskColumn';
import { TaskModal } from '../components/TaskModal';
import * as tasksApi from '../api/tasks.api';
import client from '@/shared/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectContext } from '@/contexts/ProjectContext';
import { toast } from '@/shared/hooks/useToast';
import { Plus, MagnifyingGlass, Funnel, User, Users } from '@phosphor-icons/react';

const COLUMNS = [
  { key: 'por_hacer', label: 'Por hacer', dotClass: 'bg-slate-400' },
  { key: 'en_curso', label: 'En curso', dotClass: 'bg-blue-500' },
  { key: 'en_revision', label: 'En revisión', dotClass: 'bg-amber-500' },
  { key: 'hecha', label: 'Hecha', dotClass: 'bg-emerald-500' },
];

export default function TasksPage() {
  const { user } = useAuth();
  const { activeProject, projects } = useProjectContext();
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';

  const [tasks, setTasks] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [selectedUserFilter, setSelectedUserFilter] = useState('mine'); // 'mine', 'all', or user id
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [modalInitialStatus, setModalInitialStatus] = useState('por_hacer');

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data } = await client.get('/api/users');
      setTeamUsers(data?.data || data || []);
    } catch {
      // Si no tiene acceso completo a users, no bloquea
    }
  }, [isAdmin]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedUserFilter === 'mine') {
        params.assigned_to = user?.id;
      } else if (selectedUserFilter !== 'all' && selectedUserFilter !== '') {
        params.assigned_to = Number(selectedUserFilter);
      }

      if (projectFilter) {
        params.project_id = Number(projectFilter);
      } else if (activeProject?.id) {
        params.project_id = activeProject.id;
      }

      if (priorityFilter) params.priority = priorityFilter;
      if (search.trim()) params.search = search.trim();

      const data = await tasksApi.getTasks(params);
      setTasks(data || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Error al cargar las tareas');
    } finally {
      setLoading(false);
    }
  }, [selectedUserFilter, user?.id, projectFilter, activeProject?.id, priorityFilter, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Arrastre y soltar (Drag & Drop)
  const handleDragStart = (e, task) => {
    e.dataTransfer.setData('text/plain', String(task.id));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDropTask = async (taskId, newStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === newStatus) return;

    // Regla: si no es admin, no puede pasar a "hecha" ni salir de "hecha"
    if (newStatus === 'hecha' && !isAdmin) {
      toast.error('Solo los administradores pueden marcar una tarea como Hecha');
      return;
    }
    if (task.status === 'hecha' && newStatus !== 'hecha' && !isAdmin) {
      toast.error('Solo los administradores pueden reabrir una tarea completada');
      return;
    }

    // Actualización optimista
    const previousTasks = [...tasks];
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );

    try {
      await tasksApi.moveTask(taskId, { status: newStatus });
      toast.success(`Tarea movida a "${COLUMNS.find((c) => c.key === newStatus)?.label}"`);
    } catch (err) {
      // Revertir en caso de error
      setTasks(previousTasks);
      toast.error(err?.response?.data?.message || 'No se pudo mover la tarea');
    }
  };

  const handleSaveTask = async (payload, taskId) => {
    if (taskId) {
      await tasksApi.updateTask(taskId, payload);
      toast.success('Tarea actualizada');
    } else {
      await tasksApi.createTask(payload);
      toast.success('Tarea creada con éxito');
    }
    fetchTasks();
  };

  const handleArchiveTask = async (taskId) => {
    await tasksApi.archiveTask(taskId);
    toast.success('Tarea archivada');
    fetchTasks();
  };

  const openCreateModal = (status = 'por_hacer') => {
    setSelectedTask(null);
    setModalInitialStatus(status);
    setIsModalOpen(true);
  };

  const openEditModal = (task) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-6 space-y-4">
      {/* Cabecera y Barra de Acciones */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Tablero de Tareas
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gestión visual del flujo de trabajo y tareas del equipo
          </p>
        </div>

        <button
          type="button"
          onClick={() => openCreateModal('por_hacer')}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus size={16} weight="bold" />
          Nueva Tarea
        </button>
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border bg-card/60">
        {/* Buscador */}
        <div className="relative flex-1 min-w-[200px]">
          <MagnifyingGlass
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título o descripción..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* Filtro por Persona */}
        <div className="flex items-center gap-1.5">
          <select
            value={selectedUserFilter}
            onChange={(e) => setSelectedUserFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="mine">Mis Tareas</option>
            {isAdmin && <option value="all">Todo el equipo</option>}
            {isAdmin &&
              teamUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre || u.name || u.email}
                </option>
              ))}
          </select>
        </div>

        {/* Filtro por Prioridad */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Todas las prioridades</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>

        {/* Filtro por Proyecto */}
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="px-3 py-1.5 text-xs rounded-lg border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">Todos los proyectos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tablero Kanban (4 Columnas) */}
      <div className="flex-1 flex gap-4 overflow-x-auto pb-2">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.key);
          return (
            <TaskColumn
              key={col.key}
              column={col}
              tasks={colTasks}
              onDragStart={handleDragStart}
              onDropTask={handleDropTask}
              onCardClick={openEditModal}
              onQuickAdd={openCreateModal}
            />
          );
        })}
      </div>

      {/* Modal de Tarea */}
      <TaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        task={selectedTask}
        initialStatus={modalInitialStatus}
        users={teamUsers}
        projects={projects}
        onSave={handleSaveTask}
        onArchive={handleArchiveTask}
      />
    </div>
  );
}
