/*
  EL NOMBRE DE UNA VENTA CON VARIAS LINEAS (#223, Diego 04/11/2026).

  El dialogo de venta lo componia como «1x Curso A + 2x Curso B». La cantidad
  ya se guarda en cada linea (`conversion_items`); en el nombre solo estorba:
  «2x» no es un curso, no cruza con el catalogo y en Ventas salia como un
  programa aparte.

  Diego decidio que una venta con cursos distintos se queda como UNA venta (no
  se parte: moveria cobros y facturas ya emitidas) y que solo se limpia el
  nombre. Asi que el nombre son los cursos de sus lineas, en su orden, sin
  cantidades y sin repetir: «Curso A + Curso B». Si todas son del mismo curso,
  queda solo «Curso A».

  La migracion 242 aplica esta misma regla a las ventas ya guardadas.
*/

const MAX = 255;

/** «Curso A + Curso B» de las lineas, o null si ninguna trae descripcion. */
export function nombreDeLasLineas(items) {
  if (!Array.isArray(items)) return null;
  const vistos = new Set();
  const cursos = [];
  for (const it of items) {
    const d = String(it?.descripcion ?? '').replace(/\s+/g, ' ').trim();
    const clave = d.toLowerCase();
    if (!d || vistos.has(clave)) continue;
    vistos.add(clave);
    cursos.push(d);
  }
  if (!cursos.length) return null;
  const nombre = cursos.join(' + ');
  // La columna es VARCHAR(255): con muchos cursos se corta, con «…» para que
  // se vea que sigue. La lista entera esta en las lineas.
  return nombre.length <= MAX ? nombre : `${nombre.slice(0, MAX - 1).trimEnd()}…`;
}
