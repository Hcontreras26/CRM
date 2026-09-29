/*
  Cómo se llama aquí lo que se vende (#44).

  Cada proyecto le pone nombre a su producto: Psiko vende «Formaciones» y
  Psicólogo IA vende «Planes». La columna lo dice desde la migración 009 y hay
  una pantalla para editarlo.

  El problema era que ese nombre solo se usaba en Productos y en el alta de un
  prospecto. Clientes y Ventas llevaban «Curso» escrito a mano, así que un
  suscriptor de una plataforma de IA aparecía habiendo comprado «cursos» — que
  es justo lo que el #44 pide arreglar: «que las pantallas de Ventas, Clientes y
  Finanzas los distingan bien».

  Con varios proyectos a la vez —o una sociedad— no hay UN nombre que valga
  para todos: ahí se dice «Productos», que es lo genérico y no miente.
*/

export interface ProyectoConEtiqueta {
  producto_label?: string | null;
  producto_label_plural?: string | null;
  type?: string | null;
  id?: number | null;
}

/** «Todos los proyectos» es el id -1, un valor interno del CRM. */
const TODOS = -1;

export function etiquetaProducto(proyecto?: ProyectoConEtiqueta | null): {
  singular: string;
  plural: string;
} {
  const suelto = proyecto?.id != null && proyecto.id !== TODOS;
  const singular = suelto ? proyecto?.producto_label?.trim() : '';
  const plural = suelto ? proyecto?.producto_label_plural?.trim() : '';
  return {
    singular: singular || 'Producto',
    plural: plural || 'Productos',
  };
}

/**
 * ¿Este proyecto vende suscripciones en vez de cursos?
 *
 * El catálogo de tipos lo dice de la plataforma de IA: «producto de suscripción,
 * SIN matrículas ni catálogo de cursos». Aquí sirve para no ofrecer pantallas
 * que en esa marca no significan nada.
 */
export function esDeSuscripcion(proyecto?: ProyectoConEtiqueta | null): boolean {
  return proyecto?.type === 'ia';
}

/**
 * ¿Se le ofrecen matrículas a este proyecto?
 *
 * Dos señales, y hacen falta las dos porque dicen cosas distintas:
 *
 *   `modules.matriculas === false`  alguien lo apagó a mano. Es lo que ya mira
 *                                   el menú, y hay un preajuste «ia» que lo deja
 *                                   así.
 *   el tipo es `ia`                 no hace falta que nadie lo apague: una
 *                                   plataforma de suscripción no tiene
 *                                   matrículas, lo diga o no su configuración.
 *
 * La segunda es la red: un proyecto de IA al que nadie le aplicó el preajuste
 * seguiría ofreciendo una lista que siempre estará vacía.
 */
export function ofreceMatriculas(proyecto?: (ProyectoConEtiqueta & {
  modules?: Record<string, boolean> | null;
}) | null): boolean {
  if (esDeSuscripcion(proyecto)) return false;
  return proyecto?.modules?.matriculas !== false;
}
