/**
 * Lo que todavía NO está aprobado para producción: se ve en /testeo (y en
 * local), no en /crm. Diego, 07/10, al ver la 2.1.0 publicada: «esto de tareas
 * no va, recuerda que era Claude y los errores» (y Convocatorias, «igual que
 * esto»). El código sigue ahí y se sigue probando en /testeo; no se borra nada.
 * Para aprobar una pantalla, se quita de detrás de esta bandera.
 */
export const SOLO_EN_PRUEBAS = import.meta.env.DEV
  || (import.meta.env.BASE_URL || '').startsWith('/testeo');
