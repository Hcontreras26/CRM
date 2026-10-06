import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Trash,
  Calendar,
  User,
  Tag,
  CheckSquare,
  ChatTeardrop,
  ClockCounterClockwise,
  Plus,
  PaperPlaneRight,
} from '@phosphor-icons/react';
import type { Task, TaskChecklistItem, TaskComment, TaskTag, TaskEvent, TaskStatus, TaskPriority } from '../types';
import * as tasksApi from '../api/tasks.api';
import { toast } from '@/shared/hooks/useToast';

interface TaskModalProps {
  task: Task | null;
  isOpen: boolean;
  onClose: () => void;
  onTaskUpdated: () => void;
  users: Array<{ id: number; nombre: string; email: string }>;
  projects: Array<{ id: number; nombre: string }>;
  currentUserId: number;
  isAdmin: boolean;
  canAssign: boolean;
  canDelete: boolean;
}

const TAG_COLOR_OPTIONS = ['sky', 'rose', 'emerald', 'amber', 'violet', 'indigo'];

export const TaskModal: React.FC<TaskModalProps> = ({
  task,
  isOpen,
  onClose,
  onTaskUpdated,
  users,
  projects,
  currentUserId,
  isAdmin,
  canAssign,
  canDelete,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<TaskStatus>('por_hacer');
  const [priority, setPriority] = useState<TaskPriority>('media');
  const [dueDate, setDueDate] = useState('');
  const [projectId, setProjectId] = useState<number | ''>('');
  const [assignedTo, setAssignedTo] = useState<number | ''>('');

  // Sub-entities state
  const [checklist, setChecklist] = useState<TaskChecklistItem[]>([]);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [tags, setTags] = useState<TaskTag[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('sky');
  const [events, setEvents] = useState<TaskEvent[]>([]);

  const [saving, setSaving] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const loadFullTask = useCallback(async (taskId: number) => {
    try {
      setLoadingDetails(true);
      const fullTask = await tasksApi.getTaskById(taskId);
      setTitle(fullTask.title || '');
      setDescription(fullTask.description || '');
      setStatus(fullTask.status || 'por_hacer');
      setPriority(fullTask.priority || 'media');
      setDueDate(fullTask.due_date ? fullTask.due_date.slice(0, 10) : '');
      setProjectId(fullTask.project_id || '');
      setAssignedTo(fullTask.assigned_to || '');
      setChecklist(fullTask.checklist || []);
      setComments(fullTask.comments || []);
      setTags(fullTask.tags || []);
      setEvents(fullTask.events || []);
    } catch {
      toast.error('Error al cargar los detalles de la tarea');
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    if (task) {
      loadFullTask(task.id);
    } else {
      setTitle('');
      setDescription('');
      setStatus('por_hacer');
      setPriority('media');
      setDueDate('');
      setProjectId('');
      setAssignedTo(currentUserId);
      setChecklist([]);
      setComments([]);
      setTags([]);
      setEvents([]);
    }
  }, [task, currentUserId, loadFullTask]);

  if (!isOpen) return null;

  const isEditing = Boolean(task?.id);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('El título es obligatorio');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        status,
        priority,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        project_id: projectId ? Number(projectId) : null,
        assigned_to: assignedTo ? Number(assignedTo) : null,
      };

      if (isEditing && task) {
        // Si cambió el estado, usar moveTask para respetar las reglas de servidor
        if (task.status !== status) {
          await tasksApi.moveTask(task.id, { status });
        }
        await tasksApi.updateTask(task.id, payload);
        toast.success('Tarea actualizada');
      } else {
        await tasksApi.createTask(payload);
        toast.success('Tarea creada');
      }

      onTaskUpdated();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar la tarea';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!task) return;
    if (!window.confirm('¿Deseas archivar esta tarea?')) return;

    try {
      await tasksApi.archiveTask(task.id);
      toast.success('Tarea archivada');
      onTaskUpdated();
      onClose();
    } catch {
      toast.error('Error al archivar la tarea');
    }
  };

  /* --- Checklists --- */

  const handleAddChecklistItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !newChecklistTitle.trim()) return;

    try {
      const item = await tasksApi.addChecklistItem(task.id, { title: newChecklistTitle.trim() });
      setChecklist([...checklist, item]);
      setNewChecklistTitle('');
    } catch {
      toast.error('Error al añadir elemento');
    }
  };

  const handleToggleChecklistItem = async (itemId: number, currentCompleted: boolean) => {
    if (!task) return;
    try {
      const updated = await tasksApi.updateChecklistItem(task.id, itemId, { is_completed: !currentCompleted });
      setChecklist(checklist.map((i) => (i.id === itemId ? updated : i)));
    } catch {
      toast.error('Error al actualizar elemento');
    }
  };

  const handleDeleteChecklistItem = async (itemId: number) => {
    if (!task) return;
    try {
      await tasksApi.deleteChecklistItem(task.id, itemId);
      setChecklist(checklist.filter((i) => i.id !== itemId));
    } catch {
      toast.error('Error al eliminar elemento');
    }
  };

  /* --- Comentarios --- */

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !newComment.trim()) return;

    try {
      const created = await tasksApi.addComment(task.id, { content: newComment.trim() });
      setComments([...comments, created]);
      setNewComment('');
    } catch {
      toast.error('Error al publicar comentario');
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!task) return;
    try {
      await tasksApi.deleteComment(task.id, commentId);
      setComments(comments.filter((c) => c.id !== commentId));
      toast.success('Comentario eliminado');
    } catch {
      toast.error('Error al eliminar comentario');
    }
  };

  /* --- Tags --- */

  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task || !newTagName.trim()) return;

    try {
      const created = await tasksApi.addTag(task.id, { name: newTagName.trim(), color: newTagColor });
      setTags([...tags, created]);
      setNewTagName('');
    } catch {
      toast.error('Error al añadir etiqueta');
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    if (!task) return;
    try {
      await tasksApi.deleteTag(task.id, tagId);
      setTags(tags.filter((t) => t.id !== tagId));
    } catch {
      toast.error('Error al eliminar etiqueta');
    }
  };

  const completedCount = checklist.filter((c) => c.is_completed).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {isEditing ? 'Detalle de la Tarea' : 'Nueva Tarea'}
            </h2>
            {isEditing && (
              <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('details')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors ${
                    activeTab === 'details'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  Detalles
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className={`px-3 py-1 rounded-md font-medium flex items-center gap-1.5 transition-colors ${
                    activeTab === 'history'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <ClockCounterClockwise className="w-3.5 h-3.5" />
                  Historial
                </button>
              </div>
            )}
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loadingDetails ? (
            <div className="py-12 flex justify-center text-slate-400 text-sm">Cargando detalles...</div>
          ) : activeTab === 'history' ? (
            /* Historial de eventos */
            <div className="space-y-3">
              <h3 className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                Registro de actividad
              </h3>
              {events.length === 0 ? (
                <p className="text-xs text-slate-400">No hay eventos registrados.</p>
              ) : (
                <div className="relative pl-4 border-l border-slate-200 dark:border-slate-800 space-y-4 text-xs">
                  {events.map((ev) => (
                    <div key={ev.id} className="relative">
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-white dark:ring-slate-900" />
                      <p className="font-medium text-slate-700 dark:text-slate-200">
                        {ev.user_name || 'Sistema'}:{' '}
                        <span className="text-slate-500 dark:text-slate-400 font-normal">
                          {ev.event_type === 'created' && 'creó la tarea.'}
                          {ev.event_type === 'status_changed' &&
                            `cambió el estado a ${String(ev.details?.new_status || '')}.`}
                          {ev.event_type === 'updated' && 'actualizó los campos de la tarea.'}
                          {ev.event_type === 'comment' && 'añadió un comentario.'}
                          {ev.event_type === 'checklist' && 'modificó la lista de verificación.'}
                          {ev.event_type === 'archived' && 'archivó la tarea.'}
                        </span>
                      </p>
                      <span className="text-[10px] text-slate-400">
                        {new Date(ev.created_at).toLocaleString('es-ES')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Formulario y subsecciones */
            <form id="task-form" onSubmit={handleSave} className="space-y-6">
              {/* Título */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Título de la tarea
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej: Revisar documentación del campus"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              {/* Descripción */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Descripción
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detalles adicionales, objetivos o notas..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Parámetros: Estado, Prioridad, Fecha, Proyecto, Asignado */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Estado */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Estado
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="por_hacer">Por hacer</option>
                    <option value="en_curso">En curso</option>
                    <option value="en_revision">En revisión</option>
                    {/* Regla del CRM: Solo admin/superadmin pueden seleccionar Hecha */}
                    {(isAdmin || status === 'hecha') && <option value="hecha">Hecha</option>}
                  </select>
                </div>

                {/* Prioridad */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Prioridad
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>

                {/* Fecha Límite */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    Fecha Límite
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>

                {/* Proyecto */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Proyecto / Campus
                  </label>
                  <select
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="">General (Sin proyecto)</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Asignado a */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    Asignado a
                  </label>
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value ? Number(e.target.value) : '')}
                    disabled={!canAssign && !isAdmin}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <option value="">Sin asignar</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.nombre} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Subsecciones (solo si la tarea ya está creada) */}
              {isEditing && task && (
                <>
                  {/* Etiquetas / Tags */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5" />
                        Etiquetas
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center mb-3">
                      {tags.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                        >
                          {t.name}
                          <button
                            type="button"
                            onClick={() => handleDeleteTag(t.id)}
                            className="text-slate-400 hover:text-rose-500"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>

                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="Nueva etiqueta..."
                        className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <select
                        value={newTagColor}
                        onChange={(e) => setNewTagColor(e.target.value)}
                        className="px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                      >
                        {TAG_COLOR_OPTIONS.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAddTag}
                        className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg transition-colors"
                      >
                        Añadir
                      </button>
                    </div>
                  </div>

                  {/* Checklist */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckSquare className="w-3.5 h-3.5" />
                        Lista de comprobación ({completedCount}/{checklist.length})
                      </label>
                    </div>

                    {checklist.length > 0 && (
                      <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden mb-3">
                        <div
                          className="bg-indigo-600 h-full transition-all duration-300"
                          style={{
                            width: `${(completedCount / checklist.length) * 100}%`,
                          }}
                        />
                      </div>
                    )}

                    <div className="space-y-2 mb-3">
                      {checklist.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800/80 text-xs group"
                        >
                          <label className="flex items-center gap-2 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={item.is_completed}
                              onChange={() => handleToggleChecklistItem(item.id, item.is_completed)}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span
                              className={`${
                                item.is_completed
                                  ? 'line-through text-slate-400 dark:text-slate-500'
                                  : 'text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {item.title}
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleDeleteChecklistItem(item.id)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 transition-opacity"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newChecklistTitle}
                        onChange={(e) => setNewChecklistTitle(e.target.value)}
                        placeholder="Añadir elemento de checklist..."
                        className="flex-1 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddChecklistItem}
                        className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Añadir
                      </button>
                    </div>
                  </div>

                  {/* Comentarios */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <ChatTeardrop className="w-3.5 h-3.5" />
                      Comentarios ({comments.length})
                    </label>

                    <div className="space-y-3 mb-4 max-h-48 overflow-y-auto">
                      {comments.map((c) => (
                        <div
                          key={c.id}
                          className="p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl text-xs space-y-1 group"
                        >
                          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {c.user_name}
                            </span>
                            <div className="flex items-center gap-2">
                              <span>{new Date(c.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                              {(isAdmin || c.user_id === currentUserId) && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteComment(c.id)}
                                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-500 transition-opacity"
                                >
                                  <Trash className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                            {c.content}
                          </p>
                        </div>
                      ))}
                      {comments.length === 0 && (
                        <p className="text-xs text-slate-400">Sin comentarios aún.</p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <textarea
                        rows={2}
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Escribe un comentario..."
                        className="flex-1 px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                      />
                      <button
                        type="button"
                        onClick={handleAddComment}
                        className="self-end px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <PaperPlaneRight className="w-3.5 h-3.5" />
                        Enviar
                      </button>
                    </div>
                  </div>
                </>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div>
            {isEditing && (canDelete || isAdmin) && (
              <button
                type="button"
                onClick={handleArchive}
                className="px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-xl transition-colors flex items-center gap-1.5"
              >
                <Trash className="w-4 h-4" />
                Archivar
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="task-form"
              disabled={saving}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-sm transition-all disabled:opacity-50"
            >
              {saving ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Crear Tarea'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
