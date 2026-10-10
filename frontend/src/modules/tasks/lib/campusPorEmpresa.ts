// Los campus del tablero, por empresa. Diego, 10/10: «los proyectos y ámbitos
// que sean por empresa, y si quiere poner de otras empresas debe tener
// seleccionados todos los proyectos o ese, para que se puedan diferenciar entre
// las empresas, no por campus».
//
// - Con una empresa en la cabecera: solo sus campus.
// - Con un campus en la cabecera: los de su empresa (o él solo, si no tiene).
// - Con «Todos los proyectos»: todos, agrupados por empresa.

export interface CampusDeEmpresa {
  id: number;
  nombre: string;
  sociedad_emisora_id: number | null;
  sociedad_nombre: string | null;
}

export interface GrupoDeEmpresa {
  empresaId: number | null;
  empresa: string;
  campus: CampusDeEmpresa[];
}

interface ProyectoDelContexto {
  id: number;
  nombre: string;
  isAll?: boolean;
  sociedad_emisora_id?: number | null;
  sociedad_nombre?: string | null;
}

const SIN_EMPRESA = 'Sin empresa';

/** Los campus de verdad (sin «Todos los proyectos»), con su empresa. */
export function campusConEmpresa(projects: ProyectoDelContexto[] | null | undefined): CampusDeEmpresa[] {
  return (projects || [])
    .filter((p) => p.id > 0 && !p.isAll)
    .map((p) => ({
      id: p.id,
      nombre: p.nombre,
      sociedad_emisora_id: p.sociedad_emisora_id == null ? null : Number(p.sociedad_emisora_id),
      sociedad_nombre: p.sociedad_nombre || null,
    }));
}

/** Los campus que se pueden elegir con lo que hay puesto en la cabecera. */
export function campusDelAmbito(
  todos: CampusDeEmpresa[],
  { activeIssuerId, activeProject }: { activeIssuerId: number | null; activeProject: ProyectoDelContexto | null },
): CampusDeEmpresa[] {
  if (activeIssuerId != null) return todos.filter((c) => c.sociedad_emisora_id === Number(activeIssuerId));
  if (activeProject && !activeProject.isAll && activeProject.id > 0) {
    const elegido = todos.find((c) => c.id === activeProject.id);
    if (!elegido) return [];
    if (elegido.sociedad_emisora_id == null) return [elegido];
    return todos.filter((c) => c.sociedad_emisora_id === elegido.sociedad_emisora_id);
  }
  return todos;
}

/** Agrupados por empresa, por nombre de empresa y luego de campus; los sin empresa, al final. */
export function agruparPorEmpresa(campus: CampusDeEmpresa[]): GrupoDeEmpresa[] {
  const grupos = new Map<string, GrupoDeEmpresa>();
  for (const c of campus) {
    const clave = c.sociedad_emisora_id == null ? 'sin' : String(c.sociedad_emisora_id);
    if (!grupos.has(clave)) {
      grupos.set(clave, { empresaId: c.sociedad_emisora_id, empresa: c.sociedad_nombre || SIN_EMPRESA, campus: [] });
    }
    grupos.get(clave)!.campus.push(c);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, campus: [...g.campus].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) }))
    .sort((a, b) => {
      if ((a.empresaId == null) !== (b.empresaId == null)) return a.empresaId == null ? 1 : -1;
      return a.empresa.localeCompare(b.empresa, 'es');
    });
}

/** La primera palabra de la razón social: «CEDIA Investigación y Desarrollo SL» → «CEDIA». */
export const empresaCorta = (razonSocial: string | null) =>
  String(razonSocial || '').trim().split(/[\s,]+/)[0] || SIN_EMPRESA;
