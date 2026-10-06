import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  MagnifyingGlass,
  Kanban,
  ArrowsClockwise,
} from '@phosphor-icons/react';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectContext } from '@/contexts/ProjectContext';
import usePermission from '@/shared/hooks/usePermission';
import { toast } from '@/shared/hooks/useToast';
import client from '@/shared/api/client';
import * as tasksApi from '../api/tasks.api';
import { TaskColumn } from '../components/TaskColumn';
import { TaskModal } from '../components/TaskModal';
import { TeamTasksMetrics } from '../components/TeamTasksMetrics';
import type { Task, TaskStatus, TeamMemberMetric } from '../types';

export const TasksPage: React.FC = () => {
  const { user } = useAuth();
  const { projects } = useProjectContext();
  const { can, isAdmin } = usePermission();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Filtros
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | ''>('');
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);

  // Métricas de equipo (Fase 4)
  const [metrics, setMetrics] = useState<TeamMemberMetric[]>([]);
  const [showMetrics, setShowMetrics] = useState(false);

  // Usuarios del sistema para el selector
  const [users, setUsers] = useState<Array<{ id: number; nombre: string; email: string }>>([]);

  const canCreate = can('tasks.create') || isAdmin;
  const canAssign = can('tasks.assign') || isAdmin;
  const canDelete = can('tasks.delete') || isAdmin;
  const canViewAll = can('tasks.view_all') || isAdmin;

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      const data = await tasksApi.getTasks({
        search: search.trim() || undefined,
        priority: priorityFilter || undefined,
        project_id: selectedProjectId ? Number(selectedProjectId) : undefined,
        assigned_to: selectedUserId || undefined,
      });
      setTasks(data);
    } catch {
      toast.error('Error al cargar las tareas');
    } finally {
      setLoading(false);
    }
  }, [search, priorityFilter, selectedProjectId, selectedUserId]);

  const loadUsersAndMetrics = useCallback(async () => {
    try {
      const { data: usersRes } = await client.get('/users');
      if (usersRes?.data) {
        setUsers(usersRes.data);
      }
    } catch {
      // ignore
    }

    if (canViewAll) {
      try {
        const metricsData = await tasksApi.getTeamMetrics(
          selectedProjectId ? Number(selectedProjectId) : undefined
        );
        setMetrics(metricsData);
      } catch {
        // ignore
      }
    }
  }, [canViewAll, selectedProjectId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    loadUsersAndMetrics();
  }, [loadUsersAndMetrics]);

  const handleCreateTask = (initialStatus: TaskStatus = 'por_hacer') => {
    setSelectedTask({
      id: 0,
      title: '',
      description: null,
      status: initialStatus,
      priority: 'media',
      position: 1000,
      due_date: null,
      project_id: selectedProjectId ? Number(selectedProjectId) : null,
      assigned_to: user?.id || null,
      created_by: user?.id || 0,
      completed_at: null,
      archived_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setIsModalOpen(true);
  };

  const handleEditTask = (task: Task) => {
    setSelectedTask(task);
    setIsModalOpen(true);
  };

  const handleMoveTask = async (taskId: number, newStatus: TaskStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.status === newStatus) return;

    // Actualización optimista
    const prevTasks = [...tasks];
    setTasks(tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));

    try {
      await tasksApi.moveTask(taskId, { status: newStatus });
      toast.success('Estado actualizado');
      loadTasks();
    } catch (err: unknown) {
      setTasks(prevTasks);
      const msg = err instanceof Error ? err.message : 'Error al mover la tarea';
      toast.error(msg);
    }
  };

  const columnTasks = useMemo(() => {
    return {
      por_hacer: tasks.filter((t) => t.status === 'por_hacer'),
      en_curso: tasks.filter((t) => t.status === 'en_curso'),
      en_revision: tasks.filter((t) => t.status === 'en_revision'),
      hecha: tasks.filter((t) => t.status === 'hecha'),
    };
  }, [tasks]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Kanban className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                Tablero de Tareas
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Gestión Kanban del equipo y proyectos
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {canViewAll && (
            <button
              onClick={() => setShowMetrics(!showMetrics)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                showMetrics
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/50 dark:border-indigo-800 dark:text-indigo-300'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50'
              }`}
            >
              {showMetrics ? 'Ocultar Métricas' : 'Métricas del Equipo'}
            </button>
          )}

          <button
            onClick={() => loadTasks()}
            className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl transition-colors"
            title="Recargar tareas"
          >
            <ArrowsClockwise className="w-4 h-4" />
          </button>

          {canCreate && (
            <button
              onClick={() => handleCreateTask('por_hacer')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold rounded-xl shadow-sm flex items-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4" />
              Nueva Tarea
            </button>
          )}
        </div>
      </div>

      {/* Métricas del Equipo (Fase 4) */}
      {showMetrics && canViewAll && (
        <TeamTasksMetrics
          metrics={metrics}
          selectedUserId={selectedUserId}
          onSelectUser={setSelectedUserId}
        />
      )}

      {/* Barra de Filtros */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center gap-3">
        {/* Búsqueda */}
        <div className="relative flex-1 w-full">
          <MagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título o contenido..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          />
        </div>

        {/* Proyecto */}
        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value ? Number(e.target.value) : '')}
          className="w-full sm:w-48 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
        >
          <option value="">Todos los proyectos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>

        {/* Prioridad */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="w-full sm:w-40 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
        >
          <option value="">Todas las prioridades</option>
          <option value="alta">Alta</option>
          <option value="media">Media</option>
          <option value="baja">Baja</option>
        </select>

        {/* Asignado (solo para admins) */}
        {canViewAll && (
          <select
            value={selectedUserId || ''}
            onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : null)}
            className="w-full sm:w-48 px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="">Todos los miembros</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Tablero de Columnas */}
      <div className="flex gap-4 overflow-x-auto pb-6 items-start">
        <TaskColumn
          status="por_hacer"
          title="Por hacer"
          tasks={columnTasks.por_hacer}
          onTaskClick={handleEditTask}
          onAddTask={handleCreateTask}
          onMoveTask={handleMoveTask}
          canCreate={canCreate}
        />

        <TaskColumn
          status="en_curso"
          title="En curso"
          tasks={columnTasks.en_curso}
          onTaskClick={handleEditTask}
          onAddTask={handleCreateTask}
          onMoveTask={handleMoveTask}
          canCreate={canCreate}
        />

        <TaskColumn
          status="en_revision"
          title="En revisión"
          tasks={columnTasks.en_revision}
          onTaskClick={handleEditTask}
          onAddTask={handleCreateTask}
          onMoveTask={handleMoveTask}
          canCreate={canCreate}
        />

        <TaskColumn
          status="hecha"
          title="Hecha"
          tasks={columnTasks.hecha}
          onTaskClick={handleEditTask}
          onAddTask={handleCreateTask}
          onMoveTask={handleMoveTask}
          canCreate={canCreate}
        />
      </div>

      {/* Modal de Tarea */}
      <TaskModal
        task={selectedTask}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onTaskUpdated={loadTasks}
        users={users}
        projects={projects}
        currentUserId={user?.id || 0}
        isAdmin={isAdmin}
        canAssign={canAssign}
        canDelete={canDelete}
      />
    </div>
  );
};

export default TasksPage;
