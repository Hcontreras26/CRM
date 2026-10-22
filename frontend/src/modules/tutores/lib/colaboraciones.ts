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

// ── «Cobra desde» en Editar tutor (Diego, 13/10) ────────────────────────────
//
// Diego, al abrir «Editar tutor»: «ni me deja poner la fecha de inicio del
// tutor». Carlos queria «colocar fecha de ingreso en el CRM y poder cambiarla a
// más antes para que cuadren». El campo pone esa fecha en TODAS sus
// colaboraciones activas; estas son las cuentas que lo rodean.

/** Lo minimo de una colaboracion para saber desde cuando cobra. */
interface TramoDelTutor { activa: boolean; vigente_desde: string }

export interface CobraDesdeActual {
  /** La mas temprana de sus colaboraciones activas: el valor inicial del campo. */
  desde: string | null;
  /** Cuantas formaciones activas empiezan en cada fecha, de la mas antigua a la mas nueva. */
  grupos: Array<{ desde: string; formaciones: number }>;
  /** Si no todas empiezan el mismo dia. */
  distintas: boolean;
}

const aCastellano = (f: string) => {
  const [a, m, d] = String(f).slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : String(f);
};

export function cobraDesdeActual(colabs: TramoDelTutor[]): CobraDesdeActual {
  const cuenta = new Map<string, number>();
  for (const c of colabs || []) {
    if (!c.activa || !c.vigente_desde) continue;
    const f = String(c.vigente_desde).slice(0, 10);
    cuenta.set(f, (cuenta.get(f) || 0) + 1);
  }
  const grupos = [...cuenta.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([desde, formaciones]) => ({ desde, formaciones }));
  return { desde: grupos[0]?.desde ?? null, grupos, distintas: grupos.length > 1 };
}

/**
 * El texto de ayuda con lo que hay hoy. Con fechas distintas hay que decirlo:
 * guardar las pone TODAS en la misma, y quien no lo sepa iguala sin querer un
 * curso que empezo mas tarde.
 *
 *   «Ahora: 3 formaciones desde 20/10/2025, 1 desde 01/08/2026»
 */
export function textoCobraDesdeActual(actual: CobraDesdeActual): string | null {
  const { grupos } = actual;
  if (!grupos.length) return null;
  if (grupos.length === 1) {
    const n = grupos[0].formaciones;
    return `Ahora: ${n === 1 ? 'su formación activa cobra' : `sus ${n} formaciones activas cobran`} desde ${aCastellano(grupos[0].desde)}.`;
  }
  const partes = grupos.map((g, i) => (i === 0
    ? `${g.formaciones} ${g.formaciones === 1 ? 'formación' : 'formaciones'} desde ${aCastellano(g.desde)}`
    : `${g.formaciones} desde ${aCastellano(g.desde)}`));
  return `Ahora: ${partes.join(', ')}.`;
}

/**
 * Si al guardar «Editar tutor» hay que mandar la fecha.
 *
 * Solo si se TOCO el campo. El valor inicial es la fecha mas temprana, asi que
 * con fechas distintas, guardar el nombre o el IBAN sin mirar la fecha las
 * igualaria todas a la mas antigua y le regalaria meses a algun curso. Tocado
 * y con la misma fecha si se manda cuando habia distintas: es la forma de
 * decir «todas desde aqui».
 */
export function hayQueMandarCobraDesde(valor: string, tocado: boolean, actual: CobraDesdeActual): boolean {
  if (!tocado || !/^\d{4}-\d{2}-\d{2}$/.test(valor) || !actual.grupos.length) return false;
  return valor !== actual.desde || actual.distintas;
}

/** La pregunta antes de igualar fechas distintas. */
export function confirmacionCobraDesde(valor: string, actual: CobraDesdeActual): string | null {
  if (!actual.distintas) return null;
  const n = actual.grupos.reduce((s, g) => s + g.formaciones, 0);
  return `Sus formaciones empiezan en fechas distintas. Al guardar, las ${n} pasan a cobrar desde el ${aCastellano(valor)}.\n\n¿Seguir?`;
}

/** Lo que vuelve del servidor, en lo minimo que hace falta para el aviso. */
interface ResultadoDelCambio {
  desde: string;
  total: number;
  cambiadas: Array<{ formacion: string }>;
  noCambiadas: Array<{ formacion: string; motivo: string }>;
  sinCambio: number;
}

/**
 * El aviso al guardar: cuantas formaciones se cambiaron. Si alguna no se pudo,
 * en rojo, cual y por que, y no se va solo — es algo que hay que mirar.
 */
export function avisoCobraDesde(r: ResultadoDelCambio) {
  const fecha = aCastellano(r.desde);
  const n = r.cambiadas.length;
  const calcular = 'Pulsa Calcular en Comisiones para añadir las que falten.';
  if (!r.total) {
    return {
      title: 'No tiene formaciones activas',
      description: 'No había ninguna fecha que cambiar.',
      variant: 'default' as const, duration: 4000,
    };
  }
  const yaEstaban = r.sinCambio
    ? ` ${r.sinCambio === 1 ? 'Otra ya tenía' : `Otras ${r.sinCambio} ya tenían`} esa fecha.` : '';
  if (!r.noCambiadas.length) {
    if (!n) {
      return {
        title: `Ya cobraba desde el ${fecha}`,
        description: 'No había nada que cambiar.',
        variant: 'default' as const, duration: 4000,
      };
    }
    return {
      title: `Cobra desde el ${fecha}`,
      description: `${n} ${n === 1 ? 'formación cambiada' : 'formaciones cambiadas'}.${yaEstaban} ${calcular}`,
      variant: 'default' as const, duration: 6000,
    };
  }
  const m = r.noCambiadas.length;
  return {
    title: `Cobra desde el ${fecha}: ${n} ${n === 1 ? 'cambiada' : 'cambiadas'}, ${m} no`,
    description: [
      r.noCambiadas.map((x) => `«${x.formacion}»: ${x.motivo}`).join(' · '),
      yaEstaban.trim(),
      n ? calcular : '',
    ].filter(Boolean).join(' '),
    variant: 'destructive' as const,
    duration: 0,
  };
}

// ── Una formación de otro campus (#384) ─────────────────────────────────────

/** El campus de una formación, tal como lo devuelve el servidor en el 409. */
export interface CampusDeLaFormacion { projectId: number; proyecto: string | null }

/**
 * Si el error es «esa formación es de un campus en el que el tutor no está»,
 * de qué campus. Cualquier otro error, `null`.
 *
 * Diego (#384): «a Vanessa no le deja agregar formaciones de otro campus a una
 * tutora [...] debe de salir "¿deseas añadirla a este campus?"». El servidor
 * contesta 409 `OTRO_PROYECTO` con el campus en `data`; la pantalla lo pregunta
 * y, si se acepta, lo vuelve a pedir con `anadirAlCampus`.
 */
export function campusDelRechazo(err: unknown): CampusDeLaFormacion | null {
  const cuerpo = (err as { data?: { code?: string; data?: Partial<CampusDeLaFormacion> } } | null)?.data;
  if (cuerpo?.code !== 'OTRO_PROYECTO') return null;
  const projectId = Number(cuerpo.data?.projectId);
  if (!Number.isInteger(projectId) || projectId <= 0) return null;
  return { projectId, proyecto: cuerpo.data?.proyecto || null };
}

/** Una formación del buscador de «Añadir formación», con su campus. */
export interface FormacionConCampus { id: number; nombre: string; nota: string; projectId: number }

const eurosDe = (precio: unknown) => {
  const n = Number(precio);
  return precio == null || precio === '' || !Number.isFinite(n)
    ? '' : `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
};

/**
 * Las formaciones de TODOS los campus de quien asigna, cada una con el suyo.
 *
 * Antes salían solo las del campus elegido arriba, o las de la empresa juntadas
 * por nombre: un curso repetido en dos campus aparecía una vez, de uno
 * cualquiera, y si era de un campus en el que el tutor no estaba, el servidor lo
 * rechazaba sin que se viera por qué. Ahora cada fila dice de qué campus es, y
 * una de otro campus se puede elegir: al guardar se pregunta si añadirlo.
 */
export function formacionesConCampus(
  tandas: Array<{ projectId: number; campus: string; formaciones: Array<{ id: number; nombre: string; precio?: string | number | null }> }>,
): FormacionConCampus[] {
  const vistas = new Set<number>();
  const salida: FormacionConCampus[] = [];
  for (const t of tandas) {
    for (const f of t.formaciones || []) {
      if (!f?.id || vistas.has(f.id)) continue;
      vistas.add(f.id);
      salida.push({
        id: f.id,
        nombre: String(f.nombre || ''),
        nota: [t.campus, eurosDe(f.precio)].filter(Boolean).join(' · '),
        projectId: t.projectId,
      });
    }
  }
  return salida.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.nota.localeCompare(b.nota, 'es'));
}
