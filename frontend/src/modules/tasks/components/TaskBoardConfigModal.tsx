import { useState, useEffect } from 'react';
import {
  Columns, Globe, Folder, Plus, Trash, ArrowUp, ArrowDown, X, Lock, Check,
} from '@phosphor-icons/react';
import Portal from '@/shared/components/ui/portal';
import { Button } from '@/shared/components/ui/button';
import { useEscapeKey } from '@/shared/hooks/useEscapeKey';
import { toast } from '@/shared/hooks/useToast';
import * as tasksApi from '../api/tasks.api';
import { COLUMN_COLORS, AREA_COLORS } from '../lib/taskUi';
import type { Assignee, TaskArea, TaskColumn, TaskExternalProject } from '../types';

interface TaskBoardConfigModalProps {
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  assignees: Assignee[];
}

export function TaskBoardConfigModal({
  open,
  onClose,
  onChanged,
  assignees,
}: TaskBoardConfigModalProps) {
  useEscapeKey(onClose, open);

  const [activeTab, setActiveTab] = useState<'columnas' | 'areas' | 'proyectos'>('columnas');

  // Estado Columnas
  const [columnas, setColumnas] = useState<TaskColumn[]>([]);
  const [nuevaColClave, setNuevaColClave] = useState('');
  const [nuevaColNombre, setNuevaColNombre] = useState('');
  const [nuevaColColor, setNuevaColColor] = useState('gray');

  // Estado Áreas
  const [areas, setAreas] = useState<TaskArea[]>([]);
  const [nuevaAreaNombre, setNuevaAreaNombre] = useState('');
  const [nuevaAreaColor, setNuevaAreaColor] = useState('gray');
  const [areaSeleccionada, setAreaSeleccionada] = useState<number | null>(null);
  const [areaMiembros, setAreaMiembros] = useState<Record<number, number[]>>({}); // areaId -> userIds[]

  // Estado Proyectos Propios
  const [proyectosExt, setProyectosExt] = useState<TaskExternalProject[]>([]);
  const [nuevoProyNombre, setNuevoProyNombre] = useState('');
  const [nuevoProyDesc, setNuevoProyDesc] = useState('');
  const [nuevoProyColor, setNuevoProyColor] = useState('gray');

  const [cargando, setCargando] = useState(false);

  async function cargarTodo() {
    setCargando(true);
    try {
      const [cols, ars, assigns, projs] = await Promise.all([
        tasksApi.getColumns(),
        tasksApi.getAreas(),
        tasksApi.getUserAreaAssignments(),
        tasksApi.getExternalProjects(),
      ]);
      setColumnas(cols);
      setAreas(ars);
      setProyectosExt(projs);

      const mapa: Record<number, number[]> = {};
      for (const a of ars) mapa[a.id] = [];
      for (const row of assigns) {
        if (!mapa[row.area_id]) mapa[row.area_id] = [];
        mapa[row.area_id].push(row.user_id);
      }
      setAreaMiembros(mapa);
      if (ars.length > 0 && areaSeleccionada === null) {
        setAreaSeleccionada(ars[0].id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar configuración';
      toast({ title: 'No se pudo cargar la configuración', description: msg, tone: 'destructive' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (open) {
      cargarTodo();
    }
  }, [open]);

  if (!open) return null;

  /* --- Acciones de Columnas --- */

  async function handleCrearColumna(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevaColNombre.trim()) return;
    const key = nuevaColClave.trim() || nuevaColNombre.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    try {
      await tasksApi.createColumn({
        key,
        name: nuevaColNombre.trim(),
        color: nuevaColColor,
        sort_order: (columnas.length + 1) * 10,
      });
      toast({ title: 'Columna creada' });
      setNuevaColClave('');
      setNuevaColNombre('');
      setNuevaColColor('gray');
      await cargarTodo();
      onChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear columna';
      toast({ title: 'No se pudo crear la columna', description: msg, tone: 'destructive' });
    }
  }

  async function handleArchivarColumna(col: TaskColumn) {
    if (col.is_system) {
      toast({ title: 'Las columnas fijas del sistema no se pueden archivar', tone: 'destructive' });
      return;
    }
    try {
      await tasksApi.archiveColumn(col.id);
      toast({ title: `Columna «${col.name}» archivada` });
      await cargarTodo();
      onChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al archivar columna';
      toast({ title: 'No se pudo archivar la columna', description: msg, tone: 'destructive' });
    }
  }

  async function handleMoverColumna(index: number, direccion: 'up' | 'down') {
    const nuevoIndex = direccion === 'up' ? index - 1 : index + 1;
    if (nuevoIndex < 0 || nuevoIndex >= columnas.length) return;
    const nuevasCols = [...columnas];
    const [movida] = nuevasCols.splice(index, 1);
    nuevasCols.splice(nuevoIndex, 0, movida);
    setColumnas(nuevasCols);

    try {
      await tasksApi.reorderColumns(nuevasCols.map((c) => c.key));
      onChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al ordenar columnas';
      toast({ title: 'No se pudo reordenar', description: msg, tone: 'destructive' });
      await cargarTodo();
    }
  }

  /* --- Acciones de Áreas --- */

  async function handleCrearArea(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevaAreaNombre.trim()) return;
    try {
      const nueva = await tasksApi.createArea({
        name: nuevaAreaNombre.trim(),
        color: nuevaAreaColor,
        sort_order: (areas.length + 1) * 10,
      });
      toast({ title: 'Área de trabajo creada' });
      setNuevaAreaNombre('');
      setNuevaAreaColor('gray');
      await cargarTodo();
      setAreaSeleccionada(nueva.id);
      onChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear área';
      toast({ title: 'No se pudo crear el área', description: msg, tone: 'destructive' });
    }
  }

  async function handleToggleMiembroArea(userId: number) {
    if (!areaSeleccionada) return;
    const actuales = areaMiembros[areaSeleccionada] || [];
    const nuevoSet = actuales.includes(userId)
      ? actuales.filter((id) => id !== userId)
      : [...actuales, userId];

    setAreaMiembros((prev) => ({ ...prev, [areaSeleccionada]: nuevoSet }));

    try {
      await tasksApi.setUserAreas(userId, nuevoSet);
      onChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al asignar miembro';
      toast({ title: 'No se pudo actualizar la asignación', description: msg, tone: 'destructive' });
      await cargarTodo();
    }
  }

  /* --- Acciones de Proyectos Propios --- */

  async function handleCrearProyectoExt(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevoProyNombre.trim()) return;
    try {
      await tasksApi.createExternalProject({
        name: nuevoProyNombre.trim(),
        description: nuevoProyDesc.trim() || null,
        color: nuevoProyColor,
      });
      toast({ title: 'Proyecto propio creado' });
      setNuevoProyNombre('');
      setNuevoProyDesc('');
      setNuevoProyColor('gray');
      await cargarTodo();
      onChanged();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al crear proyecto';
      toast({ title: 'No se pudo crear el proyecto', description: msg, tone: 'destructive' });
    }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-xs">
        <div className="w-full max-w-3xl max-h-[90vh] flex flex-col bg-card rounded-xl border border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          
          {/* Cabecera */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
            <div>
              <h2 className="text-base font-bold text-foreground">Configurar Tablero de Tareas</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Personaliza las columnas de trabajo, áreas y proyectos propios del equipo.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <X size={18} />
            </button>
          </div>

          {/* Pestañas */}
          <div className="flex border-b border-border px-5 bg-muted/10 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('columnas')}
              className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'columnas'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Columns size={15} /> Columnas
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('areas')}
              className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'areas'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Globe size={15} /> Áreas y Equipos
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('proyectos')}
              className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === 'proyectos'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Folder size={15} /> Proyectos Propios
            </button>
          </div>

          {/* Contenido */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {cargando ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Cargando configuración…</div>
            ) : activeTab === 'columnas' ? (
              <div className="space-y-5">
                {/* Formulario Nueva Columna */}
                <form onSubmit={handleCrearColumna} className="p-4 rounded-lg bg-muted/30 border border-border space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Añadir nueva columna</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      required
                      placeholder="Nombre (ej. Esperando al cliente)"
                      value={nuevaColNombre}
                      onChange={(e) => setNuevaColNombre(e.target.value)}
                      className="px-3 py-1.5 text-sm bg-background border border-border rounded-md"
                    />
                    <select
                      value={nuevaColColor}
                      onChange={(e) => setNuevaColColor(e.target.value)}
                      className="px-3 py-1.5 text-sm bg-background border border-border rounded-md"
                    >
                      {Object.keys(COLUMN_COLORS).map((c) => (
                        <option key={c} value={c}>Color: {c}</option>
                      ))}
                    </select>
                    <Button type="submit" size="sm" className="h-8">
                      <Plus size={14} className="mr-1" /> Añadir columna
                    </Button>
                  </div>
                </form>

                {/* Lista de Columnas */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Columnas activas</h3>
                  <ul className="divide-y divide-border border border-border rounded-lg bg-card">
                    {columnas.map((col, idx) => (
                      <li key={col.id} className="p-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`w-3 h-3 rounded-full ${COLUMN_COLORS[col.color]?.dot || 'bg-slate-400'}`} />
                          <span className="font-semibold text-sm">{col.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                            {col.key}
                          </span>
                          {col.is_system && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-secondary text-muted-foreground px-1.5 py-0.5 rounded">
                              <Lock size={10} /> Sistema
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoverColumna(idx, 'up')}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
                            title="Subir orden"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={idx === columnas.length - 1}
                            onClick={() => handleMoverColumna(idx, 'down')}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
                            title="Bajar orden"
                          >
                            <ArrowDown size={14} />
                          </button>
                          {!col.is_system && (
                            <button
                              type="button"
                              onClick={() => handleArchivarColumna(col)}
                              className="p-1 rounded hover:bg-muted text-destructive"
                              title="Archivar columna"
                            >
                              <Trash size={14} />
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : activeTab === 'areas' ? (
              <div className="space-y-5">
                {/* Formulario Nueva Área */}
                <form onSubmit={handleCrearArea} className="p-4 rounded-lg bg-muted/30 border border-border space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Crear nueva área</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      required
                      placeholder="Nombre (ej. Contenido, Diseño)"
                      value={nuevaAreaNombre}
                      onChange={(e) => setNuevaAreaNombre(e.target.value)}
                      className="px-3 py-1.5 text-sm bg-background border border-border rounded-md"
                    />
                    <select
                      value={nuevaAreaColor}
                      onChange={(e) => setNuevaAreaColor(e.target.value)}
                      className="px-3 py-1.5 text-sm bg-background border border-border rounded-md"
                    >
                      {Object.keys(AREA_COLORS).map((c) => (
                        <option key={c} value={c}>Color: {c}</option>
                      ))}
                    </select>
                    <Button type="submit" size="sm" className="h-8">
                      <Plus size={14} className="mr-1" /> Crear área
                    </Button>
                  </div>
                </form>

                {/* Lista y Asignación de Miembros */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Selector de Área */}
                  <div className="md:col-span-1 border border-border rounded-lg bg-card p-2 space-y-1">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
                      Áreas
                    </h4>
                    {areas.map((ar) => (
                      <button
                        key={ar.id}
                        type="button"
                        onClick={() => setAreaSeleccionada(ar.id)}
                        className={`w-full text-left px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-between transition-colors ${
                          areaSeleccionada === ar.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'
                        }`}
                      >
                        <span className="truncate">{ar.name}</span>
                        <span className="text-[10px] opacity-80">
                          {(areaMiembros[ar.id] || []).length} miembros
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Asignación de Usuarios al Área Seleccionada */}
                  <div className="md:col-span-2 border border-border rounded-lg bg-card p-3 space-y-3">
                    <h4 className="text-xs font-bold text-foreground">
                      Miembros asignados a {areas.find((a) => a.id === areaSeleccionada)?.name || 'Área'}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Selecciona qué personas del equipo pertenecen a esta área de trabajo:
                    </p>
                    <div className="max-h-60 overflow-y-auto space-y-1 divide-y divide-border/40">
                      {assignees.map((user) => {
                        const esMiembro = (areaMiembros[areaSeleccionada || 0] || []).includes(user.id);
                        return (
                          <label
                            key={user.id}
                            className="flex items-center justify-between px-2 py-2 rounded hover:bg-muted/40 cursor-pointer text-xs"
                          >
                            <span className="font-medium text-foreground">{user.nombre} ({user.role})</span>
                            <input
                              type="checkbox"
                              checked={esMiembro}
                              onChange={() => handleToggleMiembroArea(user.id)}
                              className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Formulario Proyecto Propio */}
                <form onSubmit={handleCrearProyectoExt} className="p-4 rounded-lg bg-muted/30 border border-border space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Añadir proyecto propio</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      required
                      placeholder="Nombre del proyecto"
                      value={nuevoProyNombre}
                      onChange={(e) => setNuevoProyNombre(e.target.value)}
                      className="px-3 py-1.5 text-sm bg-background border border-border rounded-md"
                    />
                    <select
                      value={nuevoProyColor}
                      onChange={(e) => setNuevoProyColor(e.target.value)}
                      className="px-3 py-1.5 text-sm bg-background border border-border rounded-md"
                    >
                      <option value="gray">Gris</option>
                      <option value="blue">Azul</option>
                      <option value="purple">Morado</option>
                      <option value="emerald">Verde</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    placeholder="Descripción (opcional)"
                    value={nuevoProyDesc}
                    onChange={(e) => setNuevoProyDesc(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm bg-background border border-border rounded-md"
                  />
                  <Button type="submit" size="sm" className="h-8">
                    <Plus size={14} className="mr-1" /> Guardar proyecto
                  </Button>
                </form>

                {/* Lista de Proyectos Propios */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Proyectos registrados</h3>
                  <ul className="divide-y divide-border border border-border rounded-lg bg-card">
                    {proyectosExt.map((pe) => (
                      <li key={pe.id} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm text-foreground">{pe.name}</p>
                          {pe.description && <p className="text-xs text-muted-foreground">{pe.description}</p>}
                        </div>
                        <span className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground">
                          {pe.color}
                        </span>
                      </li>
                    ))}
                    {proyectosExt.length === 0 && (
                      <li className="p-4 text-center text-xs text-muted-foreground">
                        No hay proyectos propios registrados.
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* Pie */}
          <div className="flex items-center justify-end px-5 py-3 border-t border-border bg-muted/20">
            <Button type="button" size="sm" onClick={onClose}>
              Cerrar configuración
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
