/**
 * El freno de mano de los correos a tutores.
 *
 * Diego, 15/09/2026, con Vanessa dando de alta a una tutora y el correo de
 * Brevo llegando con un enlace roto: «quita esa opcion, que nadie reciba nada
 * aun / NO SE PUEDE ENVIAR LOS CORREOS A TUTORES NI NADA DE ESO».
 *
 * Vive aqui y no en cada modulo porque hay TRES caminos distintos al buzon de
 * un tutor, y el dia que se levante hay que levantarlo una vez:
 *
 *   1. darle de alta                 users/user.service.js
 *   2. cambiarle el correo           users/user.service.js
 *   3. «Avisar tutor», el mensual    tutores/avisarTutor.js
 *
 * Los dos primeros se cortaron el 15/09. El tercero llego ese mismo dia en la
 * rama de Angel, ya escrito: sin este fichero habria entrado en testeo mandando
 * correos, que es justo lo que se acababa de prohibir.
 *
 * Para levantarlo: `CORREOS_A_TUTORES=1` en el `.env` de cada CRM y reiniciar
 * (Diego, 06/11, en la #688: «que quitar el freno no exija tocar codigo»).
 * Sin la variable, o con cualquier otro valor, el freno SIGUE PUESTO: olvidarla
 * nunca suelta correos. Antes de levantarlo hay que arreglar el enlace de
 * contrasena de Brevo, que sigue roto.
 */
//
// El código para cambiar el propio correo (#211) TAMBIÉN pasa por el freno
// (Diego, 06/11): mientras siga puesto, a un tutor no se le manda; su correo lo
// cambia el superadmin. Se encenderá cuando esté el chat de Moodle (#679), para
// contestarles por allí. Ver `pedirCodigo` (users/cambio-de-correo.js).
export const NO_ESCRIBIR_A_TUTORES = process.env.CORREOS_A_TUTORES !== '1';
