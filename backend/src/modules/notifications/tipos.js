/**
 * Que es cada aviso: si pide hacer algo o solo contarlo (#111).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTO EXISTE
 *
 * Diego, el 07/09, mirando el centro de notificaciones: 98 sin leer y casi
 * todas la misma —«Revisión diaria: hay cosas sin atar»—, repetida cada día
 * con el mismo texto. Lo dijo asi: «si todo avisa, nada avisa».
 *
 * El problema de fondo no es el numero. Es que «Tienes un prospecto nuevo» y
 * «revision diaria» estan en la misma lista, y no son lo mismo: uno pide que
 * alguien haga algo, el otro solo cuenta que ha pasado. Mezclados, el que pide
 * accion se pierde entre los que no.
 *
 * Asi que cada tipo dice de que va, y eso lo usan la campana, la lista y las
 * preferencias. Aqui y en ningun otro sitio: si la clasificacion vive en tres
 * ficheros, acaba diciendo tres cosas distintas —ya paso con las consultas del
 * reparto—.
 *
 * SOBRE `agrupa`
 *
 * Un aviso que se repite con el mismo texto se agrupa en una fila («×98, la
 * ultima hace 2h»). Uno que habla de una ficha concreta, no: seis prospectos
 * nuevos son seis cosas que hacer, no una.
 *
 * AL PORTARLO: ESTE MAPA NO SE COPIA TAL CUAL
 *
 * Aqui hay once porque este CRM emite once. ISEIE emite cinco: no tiene el
 * vigilante de catalogo —de donde salen las «Revisión diaria» repetidas—, ni el
 * reparto que avisa de prospecto asignado, ni el cobro de Stripe que cierra
 * ventas solo.
 *
 * Copiar los once alli seria repetir el fallo que este ticket arregla: la
 * pantalla de preferencias tenia siete interruptores para tipos que no existen,
 * asi que apagabas y no apagabas nada. El mapa se rehace con
 * `grep -rn "notifyAdmins({\|notifyUsers({" -A 6 backend/src` de cada
 * repositorio. Todo lo demas de este fichero vale igual en los dos.
 *
 * SOBRE LOS TIPOS QUE NO ESTAN AQUI
 *
 * Salen igual, como aviso y sin agrupar, con el nombre crudo por etiqueta. Un
 * tipo nuevo que se le olvide a alguien apuntar aqui tiene que verse —feo,
 * pero verse—, no desaparecer de la campana.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Pide que alguien haga algo. Va arriba y cuenta para el globo de la campana. */
export const ACCION = 'accion';
/** Solo cuenta lo que ha pasado. Va aparte y no marca el globo. */
export const AVISO = 'aviso';

export const TIPOS = {
  // ── Hacer ──
  lead_asignado: {
    clase: ACCION, etiqueta: 'Prospecto asignado', agrupa: false,
    descripcion: 'Cuando el reparto te adjudica una ficha',
  },
  lead_reasignado: {
    clase: ACCION, etiqueta: 'Prospecto reasignado', agrupa: false,
    descripcion: 'Cuando una ficha cambia de responsable, a quien la recibe y a quien la pierde',
  },
  lead_sin_tocar: {
    clase: ACCION, etiqueta: 'Prospecto sin tocar', agrupa: false,
    descripcion: 'Lleva demasiados días sin una interacción',
  },
  lead_reminder: {
    clase: ACCION, etiqueta: 'Recordatorio', agrupa: false,
    descripcion: 'Un recordatorio que pusiste ha vencido',
  },
  dup_review_pending: {
    clase: ACCION, etiqueta: 'Duplicados por revisar', agrupa: true,
    descripcion: 'Hay fichas esperando en la cola de revisión',
  },
  // Una versión nueva del CRM (Diego, 28/09). Pide algo —leerla— y por eso va
  // arriba y cuenta en la campana hasta que se abre. Una por versión.
  novedades: {
    clase: ACCION, etiqueta: 'Novedades del CRM', agrupa: false,
    descripcion: 'Cuando sale una versión nueva, con todo lo que trae',
  },
  // Una consulta desde la web de Certifex: un centro que quiere inscribir su campus,
  // o cualquier otra. Alguien tiene que contestar (modulo certifex).
  certifex_consulta: {
    clase: ACCION, etiqueta: 'Consulta desde Certifex', agrupa: false,
    descripcion: 'Un centro quiere inscribir su campus, o alguien escribe desde la web de Certifex',
  },
  rfc_created: {
    clase: ACCION, etiqueta: 'Solicitud de cambio', agrupa: false,
    descripcion: 'Alguien pide un cambio y hace falta aprobarlo',
  },
  task_asignada: {
    clase: ACCION, etiqueta: 'Tarea asignada', agrupa: false,
    descripcion: 'Cuando te asignan una tarea del equipo',
  },

  // ── Saber ──
  task_estado_cambiado: {
    clase: AVISO, etiqueta: 'Estado de tarea', agrupa: false,
    descripcion: 'Cuando una tarea creada o seguida por ti cambia de estado',
  },
  task_comentario: {
    clase: AVISO, etiqueta: 'Comentario en tarea', agrupa: false,
    descripcion: 'Cuando alguien comenta en una tarea que tienes asignada o creaste',
  },
  venta_automatica: {
    clase: AVISO, etiqueta: 'Venta automática', agrupa: false,
    descripcion: 'Un cobro de Stripe crea o cierra una venta solo',
  },
  catalogo_revision: {
    clase: AVISO, etiqueta: 'Revisión diaria', agrupa: true,
    descripcion: 'El repaso diario de catálogo y cobros sin atar',
  },
  lead_deleted: {
    clase: AVISO, etiqueta: 'Prospecto eliminado', agrupa: false,
    descripcion: 'Alguien borra una ficha',
  },
  lead_merged: {
    clase: AVISO, etiqueta: 'Fichas fusionadas', agrupa: false,
    descripcion: 'Dos fichas duplicadas se unen en una',
  },
  lead: {
    clase: AVISO, etiqueta: 'Prospectos', agrupa: true,
    descripcion: 'Avisos sueltos de prospecto',
  },
};

const DESCONOCIDO = { clase: AVISO, agrupa: false, descripcion: null };

/** Lo que sabemos de un tipo. Nunca devuelve `undefined`. */
export function metaDe(tipo) {
  const m = TIPOS[tipo];
  if (m) return m;
  return { ...DESCONOCIDO, etiqueta: tipo };
}

/** `true` si este tipo se colapsa en una sola fila cuando se repite. */
export function seAgrupa(tipo) {
  return metaDe(tipo).agrupa === true;
}

/** `'accion'` o `'aviso'`. */
export function claseDe(tipo) {
  return metaDe(tipo).clase;
}

/**
 * Los tipos que se pueden apagar, para pintar la pantalla de preferencias.
 *
 * Van todos los conocidos. Incluso los de accion: si alguien no quiere que le
 * avisen de los recordatorios que el mismo puso, es su decision, y prefiero
 * que la tome en la pantalla a que acabe ignorando la campana entera.
 */
export function tiposApagables() {
  return Object.entries(TIPOS).map(([tipo, m]) => ({
    tipo, clase: m.clase, etiqueta: m.etiqueta, descripcion: m.descripcion,
  }));
}
