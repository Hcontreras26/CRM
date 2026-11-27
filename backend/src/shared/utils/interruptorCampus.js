/**
 * El interruptor de una sincronización por campus (CRM#1210).
 *
 * Lo que se decide en la pantalla manda: `true` o `false` en la fila del campus.
 * Si nadie lo ha tocado (NULL), vale la variable del servidor como reserva
 * (GA4_SYNC_ACTIVO, GSC_SYNC_ACTIVO), para que un servidor que ya la tenía a 1
 * siga igual; y sin ella, apagado.
 *
 * `origen` es lo que enseña la tarjeta: de dónde sale lo que se está usando.
 *   pantalla · servidor · serie
 */
export function interruptorDelCampus(guardado, delServidor) {
  if (guardado === true || guardado === false) return { activo: guardado, origen: 'pantalla' };
  return delServidor ? { activo: true, origen: 'servidor' } : { activo: false, origen: 'serie' };
}

/** Lo que vale una variable de interruptor del `.env`: «1» o «true». */
export function envEncendido(valor) {
  const v = String(valor || '').trim().toLowerCase();
  return v === '1' || v === 'true';
}
