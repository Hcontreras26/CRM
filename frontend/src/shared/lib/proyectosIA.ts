import { SOLO_EN_PRUEBAS } from './soloEnPruebas';

/**
 * Lo del #44 para los proyectos IA (PR #386 y #387), detrás de SOLO_EN_PRUEBAS.
 *
 * El apartado «Proyecto IA» del menú, el menú recortado de esos proyectos, el
 * resumen y los «Cobros» de IA, la conexión con Supabase y las pestañas de
 * Finanzas simplificadas se ven en /testeo y en local, no en /crm, hasta que
 * Diego lo apruebe. En /crm un proyecto de tipo `ia` se ve como hasta ahora.
 * Es el espejo de PROYECTOS_IA_EN_PRODUCCION del servidor.
 *
 * Para aprobarlo, se quita de detrás de esta bandera.
 */
export const PROYECTOS_IA: boolean = SOLO_EN_PRUEBAS;

/** ¿Se le enseña a este proyecto lo propio de un proyecto IA? */
export function esProyectoIA(proyecto?: { type?: string | null } | null, encendido: boolean = PROYECTOS_IA): boolean {
  return encendido && proyecto?.type === 'ia';
}

/**
 * El tipo de proyecto con el que se filtra el menú. Apagado, un proyecto IA
 * cuenta como uno más: ni sale «Proyecto IA» (`projectType: 'ia'`) ni se le
 * esconden las secciones (`salvoTipo: ['ia']`).
 */
export function tipoDelMenu(tipo?: string | null, encendido: boolean = PROYECTOS_IA): string | undefined {
  if (tipo === 'ia' && !encendido) return undefined;
  return tipo ?? undefined;
}
