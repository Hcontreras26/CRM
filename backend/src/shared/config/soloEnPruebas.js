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
export function tareasActivas(env = process.env) {
  if (env.TAREAS_EN_PRODUCCION === '1') return true;
  if (env.NODE_ENV !== 'production') return true;
  return /\/testeo(\/|$)/.test(env.CRM_BASE_URL || '');
}
