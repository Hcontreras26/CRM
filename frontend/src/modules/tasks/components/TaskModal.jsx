import React, { useState, useEffect } from 'react';
import { X, Trash, FloppyDisk } from '@phosphor-icons/react';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectContext } from '@/contexts/ProjectContext';

export function TaskModal({
  isOpen,
  onClose,
  task = null,
  initialStatus = 'por_hacer',
  users = [],
  projects = [],
  onSave,
  onArchive,
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('por_hacer');
  const [priority, setPriority] = useState('media');
  const [dueDate, setDueDate] = useState('');
  const [projectId, setProjectId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (task) {
      setTitle(task.title || '');
      setDescription(task.description || '');
      setStatus(task.status || 'por_hacer');
      setPriority(task.priority || 'media');
      setDueDate(task.due_date ? task.due_date.slice(0, 10) : '');
      setProjectId(task.project_id ? String(task.project_id) : '');
      setAssignedTo(task.assigned_to ? String(task.assigned_to) : '');
    } else {
      setTitle('');
      setDescription('');
      setStatus(initialStatus);
      setPriority('media');
      setDueDate('');
      setProjectId('');
      setAssignedTo(isAdmin ? '' : String(user?.id || ''));
    }
    setError(null);
  }, [task, initialStatus, isOpen, isAdmin, user?.id]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('El título de la tarea es obligatorio');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        due_date: dueDate || null,
        project_id: projectId ? Number(projectId) : null,
        assigned_to: assignedTo ? Number(assignedTo) : null,
      };

      if (!task) {
        payload.status = status;
      }

      await onSave(payload, task?.id);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Error al guardar la tarea');
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!task) return;
    if (!window.confirm('¿Seguro que deseas archivar esta tarea?')) return;

    setLoading(true);
    try {
      await onArchive(task.id);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Error al archivar la tarea');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-xl animate-in fade-in-0 zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">
            {task ? 'Editar Tarea' : 'Nueva Tarea'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Título *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Revisar documentación del alumno..."
              className="w-full px-3 py-2 text-sm rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalles o notas sobre la tarea..."
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Prioridad
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Fecha límite
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Proyecto / Marca
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="">General (Sin proyecto)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Responsable
              </label>
              <select
                value={assignedTo}
                disabled={!isAdmin && task && task.assigned_to !== user?.id}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-60"
              >
                {isAdmin ? (
                  <>
                    <option value="">Sin asignar</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre || u.name || u.email}
                      </option>
                    ))}
                  </>
                ) : (
                  <option value={user?.id}>
                    {user?.nombre || user?.name || user?.email || 'Mí mismo'}
                  </option>
                )}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t mt-6">
            {task && (
              <button
                type="button"
                onClick={handleArchive}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
              >
                <Trash size={15} />
                Archivar
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="px-4 py-2 text-xs font-medium text-muted-foreground hover:bg-muted rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors shadow-sm"
              >
                <FloppyDisk size={15} />
                {task ? 'Guardar' : 'Crear Tarea'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
