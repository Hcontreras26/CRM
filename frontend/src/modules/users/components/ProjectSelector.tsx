import { Buildings } from '@phosphor-icons/react';
import type { Project } from '@/shared/types';
import type { Empresa, ProjectAssignment } from '../api/users.api';

interface Props {
  projects: Project[];
  selected: ProjectAssignment[];
  role: string;
  onToggle: (projectId: number) => void;
  onToggleRecibeLeads: (projectId: number) => void;
  /** Marcar o quitar varios campus de golpe: los de una empresa (#220). */
  onSetMany: (projectIds: number[], marcar: boolean) => void;
  required?: boolean;
  /**
   * La casilla «todos los campus de esta empresa, también los que se creen»
   * (#220). Solo para un admin y solo la ve el super admin: dar una empresa
   * es dar los campus de mañana. Sin esto, la lista es la de siempre agrupada.
   */
  empresas?: Empresa[];
  empresasEnteras?: number[];
  onToggleEmpresa?: (issuerId: number) => void;
  /** La migración 203 no está: la casilla se enseña apagada y se dice por qué. */
  faltaMigracionEmpresas?: boolean;
}

interface Grupo {
  id: number | null;
  nombre: string;
  campus: Project[];
}

/**
 * Proyectos a los que accede el usuario, y en cuales entra en el reparto.
 *
 * Lo que hace de verdad el round-robin, en lead.model.js:
 *
 *     AND (u.role = 'gestor' OR (u.role IN ('admin','superadmin')
 *          AND up.recibe_leads = TRUE))
 *
 *  · gestor              — recibe siempre, el flag ni se mira
 *  · admin / superadmin  — solo si el flag esta marcado en ese proyecto
 *  · soporte / tutor     — no entran nunca en el reparto
 *
 * Por eso el interruptor solo sale para admin, y al gestor se le pinta fijo:
 * ensenar un interruptor que no cambia nada es peor que no ensenar ninguno.
 *
 * AGRUPADOS POR EMPRESA (#220). Con veinte campus en una lista suelta, dar de
 * alta a un admin de CEDIA era marcar siete casillas sin saber cuales eran de
 * CEDIA. Ahora cada empresa tiene su «marcar todos», y para un admin la
 * casilla de la empresa entera, que tambien le da los campus que se creen.
 */
export default function ProjectSelector({
  projects, selected, role, onToggle, onToggleRecibeLeads, onSetMany, required = false,
  empresas, empresasEnteras = [], onToggleEmpresa, faltaMigracionEmpresas = false,
}: Props) {
  const mostrarToggle = role === 'admin';
  // La casilla de empresa entera: solo admin, y solo si quien edita puede darla.
  const conEmpresas = role === 'admin' && !!onToggleEmpresa && !!empresas;

  // Las empresas con sus campus. Con la casilla, salen también las que todavía
  // no tienen ninguno: el admin puede ir antes que el primer campus.
  const porEmpresa = new Map<number | null, Grupo>();
  for (const p of projects) {
    const id = p.sociedad_emisora_id ? Number(p.sociedad_emisora_id) : null;
    if (!porEmpresa.has(id)) {
      porEmpresa.set(id, { id, nombre: p.sociedad_nombre || (id ? 'Empresa' : 'Sin empresa'), campus: [] });
    }
    porEmpresa.get(id)!.campus.push(p);
  }
  if (conEmpresas) {
    for (const e of empresas!) {
      const g = porEmpresa.get(e.id);
      if (g) g.nombre = e.razon_social;
      else porEmpresa.set(e.id, { id: e.id, nombre: e.razon_social, campus: [] });
    }
  }
  const grupos = [...porEmpresa.values()].sort((a, b) => {
    if (a.id === null) return 1;
    if (b.id === null) return -1;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
  // Con una sola empresa —o ninguna— los encabezados solo estorban.
  const conCabeceras = grupos.length > 1 || conEmpresas;

  return (
    <div>
      <p className="mb-1.5 block px-1 text-secundario text-muted-foreground">
        Proyectos asignados
        {required && <span className="text-destructive"> *<span className="sr-only"> (obligatorio)</span></span>}
      </p>
      <p className="text-secundario text-muted-foreground mb-2 px-1">
        {required
          ? (conEmpresas
            ? 'Selecciona al menos un campus o una empresa entera.'
            : 'Selecciona al menos un proyecto al que tendrá acceso.')
          : 'Selecciona los proyectos a los que tendrá acceso.'}
        {mostrarToggle && ' Marca "Recibe leads" para incluirlo en el reparto de ese proyecto.'}
      </p>

      <div className="space-y-3 mt-2">
        {grupos.map((g) => {
          const ids = g.campus.map((p) => p.id);
          const marcados = ids.filter((id) => selected.some((s) => s.projectId === id)).length;
          const todos = ids.length > 0 && marcados === ids.length;
          const entera = g.id !== null && empresasEnteras.includes(g.id);
          return (
            <div key={g.id ?? 'sin'} className="space-y-1.5">
              {conCabeceras && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1">
                  <Buildings size={13} className="text-muted-foreground flex-shrink-0" />
                  <span className="text-tabla uppercase text-muted-foreground truncate min-w-0 flex-1" title={g.nombre}>
                    {g.nombre}
                  </span>
                  <span className="text-secundario text-muted-foreground">
                    {ids.length} campus
                  </span>
                  {ids.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onSetMany(ids, !todos)}
                      disabled={entera && todos}
                      className="text-secundario font-semibold text-primary hover:underline disabled:opacity-40 disabled:no-underline"
                    >
                      {todos ? 'Quitar todos' : 'Marcar todos'}
                    </button>
                  )}
                </div>
              )}

              {conEmpresas && g.id !== null && (
                <label
                  className={`flex items-start gap-2 px-3 py-2 rounded-md border ${entera ? 'border-primary/50 bg-primary/5' : 'border-dashed border-border'} ${faltaMigracionEmpresas ? 'opacity-50' : 'cursor-pointer'}`}
                >
                  <input
                    type="checkbox"
                    checked={entera}
                    disabled={faltaMigracionEmpresas}
                    onChange={() => onToggleEmpresa!(g.id as number)}
                    className="mt-0.5 rounded border-border accent-primary w-4 h-4 flex-shrink-0"
                  />
                  <span className="text-sm">
                    Todos los campus de esta empresa, también los que se creen
                    <span className="block text-secundario text-muted-foreground">
                      {entera
                        ? 'Si la quitas, conserva los campus que ya tiene: solo deja de recibir los nuevos.'
                        : 'No es superadmin: no ve otras empresas ni gestiona usuarios.'}
                    </span>
                  </span>
                </label>
              )}

              {g.campus.map((p) => {
                const sel = selected.find((s) => s.projectId === p.id);
                const marcado = !!sel;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-muted/30 hover:bg-muted/60 transition-colors"
                  >
                    <label
                      className={`flex items-center gap-2 text-sm flex-1 min-w-0 ${entera ? '' : 'cursor-pointer'}`}
                      title={entera ? 'Va con la empresa entera. Para quitarlo, quita antes la casilla de la empresa.' : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={marcado || entera}
                        disabled={entera}
                        onChange={() => onToggle(p.id)}
                        className="rounded border-border accent-primary w-4 h-4 flex-shrink-0"
                      />
                      <span className="truncate">{p.nombre}</span>
                    </label>
                    {marcado && (mostrarToggle ? (
                      <label className="flex items-center gap-1.5 text-secundario cursor-pointer text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={!!sel?.recibeLeads}
                          onChange={() => onToggleRecibeLeads(p.id)}
                          className="rounded border-border accent-emerald-600 w-3.5 h-3.5"
                        />
                        <span>Recibe leads</span>
                      </label>
                    ) : role === 'gestor' ? (
                      <span className="text-secundario font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded flex-shrink-0">
                        Recibe leads
                      </span>
                    ) : null)}
                  </div>
                );
              })}

              {g.campus.length === 0 && (
                <p className="px-3 text-secundario text-muted-foreground">
                  Todavía sin campus. Con la casilla, el primero que se cree le llegará solo.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {conEmpresas && faltaMigracionEmpresas && (
        <p className="text-secundario text-amber-600 dark:text-amber-500 mt-2 px-1">
          Falta aplicar la migración 203. Hasta entonces la empresa entera no se
          puede guardar: marca sus campus uno a uno o con «Marcar todos».
        </p>
      )}
    </div>
  );
}
