/**
 * Espejo en el servidor de `frontend/src/shared/lib/soloEnPruebas.js`.
 *
 * Diego, 07/10: «esto de tareas no va». La pantalla del tablero ya se esconde
 * en /crm, pero la API seguía contestando en producción a quien la llamara a
 * mano. Con esto, lo que aún no está aprobado tampoco se monta en el servidor
 * de producción (ni sus trabajos programados).
 *
 * Está encendido:
 *   · fuera de producción (local, tests): NODE_ENV distinto de 'production';
 *   · en /testeo: CRM_BASE_URL apunta a /testeo (el servidor de pruebas DEBE
 *     tenerla así, o el tablero de /testeo dejaría de responder);
 *   · o si se aprueba: TAREAS_EN_PRODUCCION=1.
 *
 * Es una función y no una constante para que las pruebas puedan pasarle el
 * entorno que quieran.
 */
/**
 * ¿Está encendido lo que aún no está aprobado? Fuera de producción, en /testeo, o en
 * producción si se aprobó con su interruptor (`INTERRUPTOR=1`).
 */
export function enPruebasOAprobado(interruptor, env = process.env) {
  if (env[interruptor] === '1') return true;
  if (env.NODE_ENV !== 'production') return true;
  return /\/testeo(\/|$)/.test(env.CRM_BASE_URL || '');
}

export function tareasActivas(env = process.env) {
  return enPruebasOAprobado('TAREAS_EN_PRODUCCION', env);
}

/**
 * Facturas de colaboradores (#202, Diana): tampoco en el servidor de producción
 * mientras Diego no lo apruebe — ni la API (también la del enlace público) ni la
 * tarea del mes. Revisión de la PR #293, 10/10. Se aprueba con
 * FACTURAS_COLABORADOR_EN_PRODUCCION=1.
 */
export function facturasColaboradorActivas(env = process.env) {
  return enPruebasOAprobado('FACTURAS_COLABORADOR_EN_PRODUCCION', env);
}
