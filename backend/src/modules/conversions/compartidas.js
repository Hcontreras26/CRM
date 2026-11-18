/*
  FILTRAR LAS VENTAS COMPARTIDAS (#163, Diego 21/09).

  Una venta atendida entre dos gestoras tiene sus filas en
  `conversion_vendedoras`. En Ingresos y en Análisis de ventas salían mezcladas
  con el resto y solo se distinguían por la etiqueta A MEDIAS, fila a fila.

  Tres opciones: «Todas» (no filtra), «Solo compartidas» y «Solo enteras». Es un
  filtro sobre QUÉ ventas salen, no sobre cuánto cuentan: con una gestora
  elegida, la venta compartida le sigue contando la mitad (`conversion_reparto`
  y su peso, en cada consulta), igual que sin el filtro.
*/

export const OPCIONES = ['todas', 'solo', 'enteras'];

/** Lo que llega por la dirección, o null si es «todas» o algo que no se entiende. */
export function opcionDeCompartidas(valor) {
  const v = String(valor || '').trim().toLowerCase();
  return v === 'solo' || v === 'enteras' ? v : null;
}

/** La condición SQL para la venta con alias `alias`, o null si no hay que filtrar. */
export function condicionDeCompartidas(valor, alias = 'c') {
  const opcion = opcionDeCompartidas(valor);
  if (!opcion) return null;
  const existe = `EXISTS (SELECT 1 FROM conversion_vendedoras cvx WHERE cvx.conversion_id = ${alias}.id)`;
  return opcion === 'solo' ? existe : `NOT ${existe}`;
}
