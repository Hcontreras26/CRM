import { SOLO_EN_PRUEBAS } from './soloEnPruebas';

/**
 * El plugin del CRM en cada Moodle (#679, PR #689), detrás de SOLO_EN_PRUEBAS.
 *
 * El bloque «Plugin del CRM» de Integraciones › Campus (Moodle) —conectar un campus
 * con un código, ver si avisa, desconectarlo— se ve en /testeo y en local, no en
 * /crm, hasta que Diego lo apruebe. Es el espejo de PLUGIN_MOODLE_EN_PRODUCCION del
 * servidor: allí, sin aprobar, ni siquiera existen las rutas que llama el bloque.
 *
 * Para aprobarlo, se quita de detrás de esta bandera.
 */
export const PLUGIN_MOODLE: boolean = SOLO_EN_PRUEBAS;
