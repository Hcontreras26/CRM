import type { Colaboracion } from '../api/tutores.api';

/**
 * Las dos reglas del nudo de las formaciones desactivadas.
 *
 * Los tres fallos que anoto Diego el 14/09 eran uno solo, y salian de aqui:
 *
 *   1. se desactiva una formacion sin querer,
 *   2. en su fila solo hay «Quitar» —que borra el historico de por que se le
 *      pago al tutor lo que se le pago—,
 *   3. y al intentar añadirla otra vez, el dialogo dice que no existe ningun
 *      curso con ese nombre mientras la tabla de al lado lo esta enseñando.
 *
 * El 3 era consecuencia del 2: el dialogo escondia TODAS las formaciones que el
 * tutor ya tuviera, activas o no, asi que la desactivada no salia por ningun
 * lado. Sin salida: ni se reactiva ni se rehace.
 *
 * Viven aparte de la pantalla porque son cuentas, no pintura, y porque montar
 * `TutoresPage` para probarlas obliga a levantar el router, las llamadas y el
 * proyecto activo.
 */

/**
 * Las que el dialogo de «Añadir formación» debe esconder: solo las que YA
 * rigen. Una desactivada tiene que poder encontrarse para volver a ponerla.
 */
export function lasQueYaRigen(colabs: Colaboracion[]): number[] {
  return (colabs || []).filter((c) => c.activa).map((c) => c.product_id);
}

/**
 * ¿Este tutor ya tuvo esta formacion, y esta dormida?
 *
 * Si la hay, elegirla es REACTIVARLA y no crear otra: dos colaboraciones del
 * mismo tutor con el mismo curso dejarian «cuanto se le debe» con dos
 * respuestas, y ninguna forma de saber cual vale.
 */
export function laQueDuerme(colabs: Colaboracion[], productId: number): Colaboracion | null {
  return (colabs || []).find((c) => c.product_id === productId && !c.activa) || null;
}
