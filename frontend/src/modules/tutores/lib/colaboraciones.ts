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

// ── El alta de un tutor (#206) ──────────────────────────────────────────────

/** Un curso tal como se asigna en el alta: cada uno con SU fecha. */
export interface CursoDelAlta { productId: number; pct: number; desde: string }

/**
 * Los cursos del alta MAS el que esta elegido en el buscador y sin «Añadir».
 *
 * Carlos, 01/10: «cuando se crea un tutor y se selecciona formación, NO SE
 * GUARDA». Elegir el curso no lo añadia: habia que pulsar «Añadir» despues, y
 * quien elige uno solo y da a «Dar de alta» lo perdia sin aviso. Marina Areny
 * se dio de alta asi y su curso hubo que ponerlo a mano desde su ficha.
 */
export function cursosParaElAlta(
  cursosAlta: CursoDelAlta[],
  elegido: string | number | null | undefined,
  pctTexto: string,
  desde: string,
  pctPorDefecto = 10,
): CursoDelAlta[] {
  const id = Number(elegido);
  if (!id || cursosAlta.some((c) => c.productId === id)) return cursosAlta;
  const pct = pctTexto === '' ? NaN : Number(pctTexto);
  return [...cursosAlta, {
    productId: id,
    pct: pct >= 0 && pct <= 100 ? pct : pctPorDefecto,
    desde,
  }];
}

export interface CursoQueFallo { nombre: string; motivo: string }

/**
 * El UNICO aviso al terminar el alta.
 *
 * Antes salian dos: el rojo de «Algún curso no se ha podido asignar» y, justo
 * detras, el verde de «Tutor dado de alta», que lo tapaba. Si algo fallo, el
 * aviso es rojo, dice cual y por que, y no se va solo: el tutor ya existe y hay
 * que ponerle ese curso desde su ficha.
 */
export function avisoDelAlta(entraYa: boolean, asignados: number, fallidos: CursoQueFallo[]) {
  // No promete un correo: mientras los correos a tutores esten parados, no
  // hay alta sin contraseña, y no le llega nada.
  const acceso = entraYa
    ? 'Ya puede entrar con el correo y la contraseña que le has puesto. No se le ha mandado ningún correo: pásasela tú.'
    : 'Todavía no puede entrar: ponle una contraseña desde «Cambiar contraseña» y pásasela.';
  if (!fallidos.length) {
    return {
      title: 'Tutor dado de alta',
      description: [acceso, asignados > 0 ? `Con ${asignados} ${asignados === 1 ? 'curso asignado' : 'cursos asignados'}.` : '']
        .filter(Boolean).join(' '),
      variant: 'default' as const,
      duration: 4000,
    };
  }
  const n = fallidos.length;
  return {
    title: `Tutor dado de alta, pero sin ${n === 1 ? 'un curso' : `${n} cursos`}`,
    description: [
      fallidos.map((f) => `«${f.nombre}»: ${f.motivo}`).join(' · '),
      `Pónselo desde su ficha.${asignados > 0 ? ` ${asignados === 1 ? 'El otro sí se asignó' : `Los otros ${asignados} sí se asignaron`}.` : ''}`,
      acceso,
    ].join(' '),
    variant: 'destructive' as const,
    duration: 0,
  };
}
