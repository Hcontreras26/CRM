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

/**
 * Links de pago (#680): ni `/api/links-pago` ni el hueco `stripe_links` de
 * Integraciones en el servidor de producción mientras Diego no lo apruebe (revisión
 * de la fase 1). Se aprueba con LINKS_PAGO_EN_PRODUCCION=1.
 */
export function linksPagoActivos(env = process.env) {
  return enPruebasOAprobado('LINKS_PAGO_EN_PRODUCCION', env);
}

/**
 * Lo que el #44 añade para los proyectos IA (PR #386 y #387): sus cobros
 * (`/api/ia/cobros`) y la conexión con su Supabase (`/api/ia/supabase/*` y el
 * proveedor `supabase` de Integraciones). Está en /testeo y aún no aprobado:
 * sin esto, al pasar `staging` a `main` saldría en /crm sin que nadie lo
 * hubiera visto. Se aprueba con PROYECTOS_IA_EN_PRODUCCION=1.
 *
 * NO apaga lo que ya estaba en producción antes del #44: `/api/ia/metrics` (el
 * «Monitor SaaS» del Dashboard y la pestaña Stripe de un proyecto IA) ni
 * `/api/ia/gasto` (el tope de gasto de la IA del propio CRM, #22). Tampoco el
 * sondeo de Stripe: es de todos los campus, no solo de los proyectos IA.
 */
export function proyectosIAActivos(env = process.env) {
  return enPruebasOAprobado('PROYECTOS_IA_EN_PRODUCCION', env);
}

/**
 * El plugin del CRM en cada Moodle (#679, PR #689): todo lo que ESCRIBE en un
 * campus o lo cambia — la respuesta de la tutora por el plugin, el aviso de
 * disponibilidad, el código de conexión, el repaso de los campus conectados y
 * el aviso que el plugin manda al CRM (`/api/moodle-avisos`). Diego, revisión
 * de la #689: «que no salga a producción sin verlo». Sin esto, al pasar
 * `staging` a `main` el CRM de producción empezaría a escribir en los Moodle
 * de los alumnos. Se aprueba con PLUGIN_MOODLE_EN_PRODUCCION=1.
 *
 * Apagado, la respuesta de la tutora sale como hasta ahora (con su token del
 * campus) y el CRM no acepta avisos del plugin. El plugin también viene
 * apagado de serie en el propio Moodle (ajustes del plugin).
 */
export function pluginMoodleActivo(env = process.env) {
  return enPruebasOAprobado('PLUGIN_MOODLE_EN_PRODUCCION', env);
}
