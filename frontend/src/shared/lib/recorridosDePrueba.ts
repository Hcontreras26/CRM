import type { PasoRecorrido } from '@/shared/components/ui/RecorridoGuiado';
import { tienePermiso, type PasoCobros, type Permiso } from '@/shared/lib/recorridosCobros';

/**
 * RECORRIDOS PARA PROBAR LAS FUNCIONES NUEVAS DE STAGING (CRM#856, gemela
 * CRM-ISEIE#522). Diego, 17/11: «no tiene que escribir el tutorial, sino que
 * haga un tutorial guiado».
 *
 * El mismo `RecorridoGuiado` del tablero y de los cobros (#908), con tres
 * diferencias que pide la #856:
 *
 *  · NUNCA SE ABRE SOLO. Solo con «Ver cómo funciona» (lo del 27/10: un
 *    recorrido abierto solo encima de una ficha se tragaba los clics).
 *  · Si la función va detrás de un interruptor del servidor y está apagada, el
 *    botón no abre nada: dice «Esta función está apagada: la enciende Diego».
 *  · Cada recorrido es para PROBAR: incluye lo que tiene que fallar a propósito
 *    y termina con cómo dejarlo limpio (los datos de prueba llevan «[PRUEBA]»).
 *
 * Como en los de cobros: cada paso apunta a un `data-recorrido` de su pantalla
 * (nunca a un texto), sin el permiso del recorrido no se ofrece, un paso con
 * permiso propio no sale a quien no lo tiene, y un paso cuyo anclaje no está en
 * pantalla (no hay cola, la facturación no está pausada) se salta solo.
 * La prueba `recorridosDePrueba.test.jsx` lo comprueba.
 *
 * IGUAL EN LOS DOS CRM (paridad): mismos pasos y mismo texto.
 */

export type IdRecorridoPrueba =
  | 'factura-automatica'
  | 'auditoria-facturacion'
  | 'factura-duplicada'
  | 'cobros-paypal'
  | 'extractos-banco'
  | 'informe-mensual'
  | 'monitask'
  | 'brevo-bloqueados';

/** Los interruptores del .env del backend que apagan una función entera. */
export type Interruptor =
  | 'FACTURA_AUTOMATICA_ACTIVA'
  | 'FACTURACION_AUDITORIA_ACTIVA'
  | 'PAYPAL_COBROS_ACTIVO'
  | 'SANTANDER_EXTRACTOS_ACTIVO'
  | 'MONITASK_ACTIVO'
  | 'BREVO_BLOQUEADOS_ACTIVO';

export interface RecorridoPrueba {
  id: IdRecorridoPrueba;
  /** Qué se prueba (sale en el título del botón). */
  titulo: string;
  /** Sin este permiso (o ninguno de la lista), ni botón ni recorrido. */
  permiso: Permiso;
  /** Apagado, el botón lo dice en vez de abrir el recorrido. */
  interruptor?: Interruptor;
  /** Los ficheros de la pantalla donde viven sus `data-recorrido` (para la prueba). */
  pantalla: string[];
  pasos: PasoCobros[];
}

export const APAGADA = 'Esta función está apagada: la enciende Diego.';

/** Los pasos que esa persona puede ver. */
export const pasosDePrueba = (r: RecorridoPrueba, can: (p: string) => boolean): PasoRecorrido[] =>
  r.pasos.filter((p) => tienePermiso(p.permiso, can)).map(({ donde, titulo, texto }) => ({ donde, titulo, texto }));

/** La clave del navegador (por recorrido y persona). Aquí no decide nada: nunca se abre solo. */
export const claveRecorridoPrueba = (id: IdRecorridoPrueba, userId?: number | string | null) =>
  `recorrido-prueba-${id}-v1${userId != null ? `-u${userId}` : ''}`;

const anclaje = (nombre: string) => `[data-recorrido="${nombre}"]`;

const FINAL = 'Para repasarlo, pulsa «Ver cómo funciona» en esta pantalla cuando quieras.';

export const RECORRIDOS_PRUEBA: Record<IdRecorridoPrueba, RecorridoPrueba> = {
  // ─── 1 · Factura automática con datos fiscales (#764) ─────────────────────────
  'factura-automatica': {
    id: 'factura-automatica',
    titulo: 'Factura automática con datos fiscales',
    permiso: 'facturas.cola',
    interruptor: 'FACTURA_AUTOMATICA_ACTIVA',
    pantalla: [
      'modules/invoices/pages/InvoicesPage.tsx',
      'modules/invoices/components/FacturacionAlDiaCard.tsx',
    ],
    pasos: [
      {
        titulo: 'La factura que sale sola',
        texto: 'Cuando entra un cobro, el CRM manda al alumno un enlace para que rellene sus datos fiscales. Con ellos, su factura sale sola y en orden, sin que nadie la genere. Pruébalo solo en el CRM de pruebas (staging): una factura emitida no se borra. Son {pasos} pasos.',
      },
      {
        donde: anclaje('cola-facturacion'),
        titulo: 'La cola de facturación',
        texto: 'Aquí espera todo cobro sin factura, por orden de fecha. Registra un cobro en una venta de prueba («[PRUEBA]» en el nombre del alumno, con tu correo) y míralo aparecer aquí.',
      },
      {
        donde: anclaje('cola-datos-fiscales'),
        titulo: 'En qué está cada cobro',
        texto: 'Debajo del cliente: «Esperando datos del alumno» (con su plazo), «sale sola», «sale sola cuando le toque» o «no sale sola» con el motivo. «Revisar datos» pide a una persona.',
      },
      {
        titulo: 'El correo y el formulario',
        texto: 'Te llega el correo con el enlace. Rellénalo con datos de prueba. Lo que debe fallar: escribe un NIF español mal (cambia la letra del DNI). El formulario no lo acepta y te dice qué revisar.',
      },
      {
        donde: anclaje('cola-generar'),
        titulo: 'Si no sale sola',
        texto: 'Cuando dice «no sale sola», arregla lo que indica el motivo o pulsa «Generar factura» y emítela a mano, en su turno.',
      },
      {
        titulo: 'Dejarlo limpio',
        texto: 'Anula la factura de prueba con el motivo «[PRUEBA]» (sale su abono) y borra el cobro y la venta de prueba. Un número emitido no se puede reutilizar: por eso, solo en el CRM de pruebas.',
      },
      { titulo: 'Y listo', texto: FINAL },
    ],
  },

  // ─── 2 · Auditoría de facturación, pausa y reanudación (#765) ────────────────
  'auditoria-facturacion': {
    id: 'auditoria-facturacion',
    titulo: 'Auditoría de facturación y pausa',
    permiso: 'facturas.auditoria',
    interruptor: 'FACTURACION_AUDITORIA_ACTIVA',
    pantalla: [
      'modules/invoices/pages/InvoicesPage.tsx',
      'modules/invoices/components/AvisoFacturacionPausada.tsx',
    ],
    pasos: [
      {
        titulo: 'La auditoría de cada 2 horas',
        texto: 'Cada dos horas el CRM revisa las facturas: números repetidos en una serie, facturas emitidas sin datos fiscales y cobros que se quedaron sin factura. Si encuentra uno, para la emisión de facturas nuevas. Son {pasos} pasos.',
      },
      {
        donde: anclaje('facturacion-pausada'),
        titulo: 'El aviso de pausa',
        texto: 'Si está pausada, este aviso sale arriba en todas las pantallas a superadmin y admin: el motivo, desde cuándo y cuántos cobros esperan. Si no lo ves, la facturación va bien.',
      },
      {
        donde: anclaje('facturacion-errores'),
        titulo: 'Qué ha encontrado',
        texto: 'Despliega la lista: cada error dice la serie, la factura o el cobro. La auditoría no corrige nada; lo arreglas tú.',
      },
      {
        donde: anclaje('facturacion-solucionado'),
        titulo: 'Marcar como solucionado',
        texto: 'Lo que debe fallar: púlsalo sin arreglar nada. Dice «Sigue habiendo errores» y la pausa sigue. Arréglalo y vuelve a pulsar: solo reanuda si sale limpia, y entonces emite en orden lo que entró durante la pausa.',
      },
      {
        titulo: 'Para provocar una pausa',
        texto: 'En el CRM de pruebas, crea una venta «[PRUEBA]», regístrale un cobro y no generes su factura. En la siguiente auditoría sale como cobro sin factura.',
      },
      {
        titulo: 'Dejarlo limpio',
        texto: 'Emite o anula (motivo «[PRUEBA]») lo que hayas creado, borra la venta de prueba y pulsa «Marcar como solucionado» hasta que reanude.',
      },
      { titulo: 'Y listo', texto: FINAL },
    ],
  },

  // ─── 3 · Aviso de factura posiblemente duplicada (#819) ───────────────────────
  'factura-duplicada': {
    id: 'factura-duplicada',
    titulo: 'Aviso de factura duplicada',
    permiso: 'facturas.emitir',
    pantalla: [
      'modules/invoices/pages/InvoicesPage.tsx',
      'modules/invoices/components/FacturacionAlDiaCard.tsx',
    ],
    pasos: [
      {
        titulo: 'Una factura dos veces',
        texto: 'El CRM no emite una factura si ya hay otra del mismo cliente (mismo nombre, aunque cambie un espacio, o mismo NIF), por el mismo importe y a 7 días o menos. Antes, pregunta. Son {pasos} pasos.',
      },
      {
        donde: anclaje('cola-motivo'),
        titulo: 'La marca en la cola',
        texto: 'Si un cobro de la cola se parece a una factura ya emitida, lo dice aquí. Pon el ratón encima: sale el número y la fecha de la otra.',
      },
      {
        donde: anclaje('cola-generar'),
        permiso: 'facturas.cola',
        titulo: 'Lo que debe salir',
        texto: 'Para probarlo: dos ventas «[PRUEBA]» del mismo alumno con el mismo importe. Genera la primera factura. Lo que debe fallar: la segunda no se emite sin más; sale «Posible factura duplicada» con la otra.',
      },
      {
        titulo: 'Cancelar o emitir igualmente',
        texto: '«Cancelar» no emite nada: compruébalo, la segunda sigue en la cola. «Emitir igualmente» la emite, solo si de verdad son dos facturas distintas.',
      },
      {
        titulo: 'Dejarlo limpio',
        texto: 'Anula las facturas de prueba con el motivo «[PRUEBA]» y borra los cobros y las ventas de prueba.',
      },
      { titulo: 'Y listo', texto: FINAL },
    ],
  },

  // ─── 4 · Cobros de PayPal (#766) ─────────────────────────────────────────────
  'cobros-paypal': {
    id: 'cobros-paypal',
    titulo: 'Cobros de PayPal',
    permiso: 'cobros_externos.view',
    interruptor: 'PAYPAL_COBROS_ACTIVO',
    pantalla: ['modules/accounting/pages/CobrosExternosPage.tsx'],
    pasos: [
      {
        titulo: 'Los cobros de PayPal',
        texto: 'Los pagos de PayPal entran solos (cada 30 minutos y con el aviso de PayPal) y se registran en su venta si la referencia lleva «venta 123» o el correo es el de un alumno. Aquí ves qué se registró y qué no. Son {pasos} pasos.',
      },
      {
        donde: anclaje('cobros-pestanas'),
        titulo: 'PayPal y Banco',
        texto: 'Dos pestañas: PayPal y los extractos del banco. Este recorrido es el de PayPal.',
      },
      {
        donde: anclaje('paypal-filtro'),
        titulo: 'Sin registrar',
        texto: 'De serie ves los que no se han podido registrar en ninguna venta: son los que hay que mirar. Cambia a «Registrados en su venta» para comprobar los que entraron solos.',
      },
      {
        donde: anclaje('paypal-sincronizar'),
        permiso: 'cobros_externos.edit',
        titulo: 'Traerlos ahora',
        texto: 'Con un campus elegido arriba, «Sincronizar» pide a PayPal los cobros de ese campus en el momento. Paga con PayPal de pruebas una venta «[PRUEBA]» (en la referencia, «venta» y su número) y tráelo.',
      },
      {
        donde: anclaje('paypal-enlazar'),
        permiso: 'cobros_externos.edit',
        titulo: 'Registrar uno a mano',
        texto: 'Escribe el número de la venta y «Enlazar». Lo que debe fallar: un número de venta que no existe. Dice «No se ha podido enlazar» y no registra nada.',
      },
      {
        titulo: 'Dejarlo limpio',
        texto: 'En la venta «[PRUEBA]», borra el cobro que entró de PayPal y borra la venta. Si llegó a la cola de facturación, no emitas su factura.',
      },
      { titulo: 'Y listo', texto: FINAL },
    ],
  },

  // ─── 5 · Extractos del banco (#766) ──────────────────────────────────────────
  'extractos-banco': {
    id: 'extractos-banco',
    titulo: 'Extractos del banco',
    permiso: 'cobros_externos.view',
    interruptor: 'SANTANDER_EXTRACTOS_ACTIVO',
    pantalla: ['modules/accounting/pages/CobrosExternosPage.tsx'],
    pasos: [
      {
        titulo: 'Los extractos del banco',
        texto: 'Subes el extracto del banco y el CRM lee los abonos. Si un abono casa con UNA venta por nombre e importe, lo registra solo; si duda, te lo deja aquí para que decidas. Son {pasos} pasos.',
      },
      {
        donde: anclaje('banco-subir'),
        permiso: 'cobros_externos.edit',
        titulo: 'Subir un extracto',
        texto: 'Con un campus elegido arriba, sube un Norma 43 o el CSV de movimientos. Lo que debe fallar: un fichero que no es un extracto (un PDF). Dice «No se ha podido subir». Subir el mismo dos veces no duplica nada.',
      },
      {
        donde: anclaje('banco-estados'),
        titulo: 'Las cuatro bandejas',
        texto: '«A revisar»: tiene candidatos y hay que elegir. «Sin candidato»: no casa con ninguna venta. «Registrados»: ya están en su venta. «Descartados»: no son cobros de alumnos (las liquidaciones de Stripe y PayPal se descartan solas).',
      },
      {
        donde: anclaje('banco-candidatos'),
        permiso: 'cobros_externos.edit',
        titulo: 'Decidir un abono',
        texto: 'Pulsa la venta que es («✓✓» si casan nombre e importe), escribe otro número de venta o «Descartar».',
      },
      {
        titulo: 'Dejarlo limpio',
        texto: 'Para probar, usa un extracto con un abono a nombre de un alumno «[PRUEBA]». Después, borra en su venta el cobro que se registró y descarta los abonos de prueba que queden en las bandejas.',
      },
      { titulo: 'Y listo', texto: FINAL },
    ],
  },

  // ─── 6 · Informe mensual y ZIP de facturas (#772) ────────────────────────────
  'informe-mensual': {
    id: 'informe-mensual',
    titulo: 'Informe mensual para la gestoría',
    permiso: 'reports.informe_mensual',
    // Sin interruptor: verlo y descargarlo funciona siempre. INFORME_MENSUAL_ACTIVO
    // solo enciende el envío automático, y el propio informe dice si está apagado.
    pantalla: ['modules/reports/components/InformeMensual.tsx'],
    pasos: [
      {
        titulo: 'El informe para la gestoría',
        texto: 'El mes natural, por equipo y por comercial: ventas, cobrado (los pagos con fecha en el mes), facturado y vendido. No crea nada: se puede probar en cualquier momento. Son {pasos} pasos.',
      },
      {
        donde: anclaje('informe-periodo'),
        titulo: 'El mes y la empresa',
        texto: 'De serie, el mes anterior y todas tus empresas. Cambia el mes y comprueba que las cifras cuadran con Reportes de ese mes.',
      },
      {
        donde: anclaje('informe-excel'),
        titulo: 'El Excel',
        texto: 'Baja el informe en Excel, con las mismas cifras que ves aquí.',
      },
      {
        donde: anclaje('informe-zip'),
        titulo: 'El ZIP de facturas',
        texto: 'Los PDF de las facturas emitidas del mes, el listado y el informe. Lo que debe fallar: con «Todas mis empresas» el botón está apagado, porque el ZIP es de una empresa. Elige una y bájalo.',
      },
      {
        donde: anclaje('informe-envio'),
        titulo: 'El envío automático',
        texto: 'Dice si el informe se manda solo a la gestoría y qué día. Apagado, se descarga aquí igual. Lo enciende Diego.',
      },
      {
        titulo: 'Dejarlo limpio',
        texto: 'No hay nada que borrar en el CRM. Borra de tu ordenador el Excel y el ZIP: llevan datos de alumnos.',
      },
      { titulo: 'Y listo', texto: FINAL },
    ],
  },

  // ─── 7 · Monitask (#236) ─────────────────────────────────────────────────────
  monitask: {
    id: 'monitask',
    titulo: 'Actividad del equipo (Monitask)',
    permiso: 'monitask.view',
    interruptor: 'MONITASK_ACTIVO',
    pantalla: ['modules/monitask/pages/MonitaskActividadPage.tsx'],
    pasos: [
      {
        titulo: 'Lo que registra Monitask',
        texto: 'Las horas, el porcentaje de actividad, los proyectos y las tareas de cada colaborador, según Monitask. Sin capturas de pantalla. Son {pasos} pasos.',
      },
      {
        donde: anclaje('monitask-sin-conectar'),
        titulo: 'Si no está conectado',
        texto: 'Este aviso dice que Monitask no está conectado: lo que ves es lo último que se trajo. Se conecta en Integraciones › Monitask.',
      },
      {
        donde: anclaje('monitask-pestanas'),
        titulo: 'Tres vistas',
        texto: '«Actividad»: por persona y periodo. «Cotejo con facturas»: horas facturadas frente a horas en Monitask, en rojo si pasa del margen. «Personas»: quién del CRM es cada usuario de Monitask (solo quien lo configura).',
      },
      {
        donde: anclaje('monitask-sync'),
        titulo: 'Última sincronización',
        texto: 'Los datos se traen cada noche. Aquí, cuándo fue la última vez: si dice «nunca» o es de hace días, revisa la conexión.',
      },
      {
        donde: anclaje('monitask-actividad'),
        titulo: 'Probar la actividad',
        texto: 'Elige el periodo y abre una persona: sale día a día con sus tareas. Lo que debe fallar: elige un mes que aún no ha llegado; no sale nadie y no da error.',
      },
      {
        titulo: 'Dejarlo limpio',
        texto: 'Monitask solo se lee: no se crea nada. Si en «Personas» uniste a alguien a mano para probar, deshazlo.',
      },
      { titulo: 'Y listo', texto: FINAL },
    ],
  },

  // ─── 8 · Correos bloqueados en Brevo (#824) ──────────────────────────────────
  'brevo-bloqueados': {
    id: 'brevo-bloqueados',
    titulo: 'Correos bloqueados en Brevo',
    permiso: 'users.view',
    interruptor: 'BREVO_BLOQUEADOS_ACTIVO',
    pantalla: [
      'modules/users/components/UsersPanel.tsx',
      'modules/users/components/UsersTable.tsx',
    ],
    pasos: [
      {
        titulo: 'Correos que Brevo no entrega',
        texto: 'Si un buzón rebota, Brevo bloquea esa dirección y no le entrega ningún correo del CRM. Cada 6 horas el CRM lo mira, marca a esa persona aquí y avisa a superadmin y a los admins de sus campus. Son {pasos} pasos.',
      },
      {
        donde: anclaje('brevo-marca'),
        titulo: 'La marca en la lista',
        texto: '«Correo bloqueado en Brevo» al lado de la persona. Pon el ratón encima: desde cuándo y por qué (rebote, marcado como spam, baja…).',
      },
      {
        titulo: 'En su ficha',
        texto: 'Al abrir su ficha sale el mismo aviso arriba. Superadmin y admin ven además «Desbloquear en Brevo». Antes, comprueba que el buzón existe.',
      },
      {
        titulo: 'Para probarlo',
        texto: 'Da de alta un usuario «[PRUEBA]» con una dirección que no existe en un dominio real: le sale el correo de bienvenida o de invitación. Lo que debe fallar: el correo rebota y, en la siguiente revisión, sale la marca. Si lo desbloqueas, Brevo lo vuelve a bloquear.',
      },
      {
        titulo: 'Dejarlo limpio',
        texto: 'Desactiva el usuario «[PRUEBA]». La dirección inventada se queda bloqueada en Brevo: no pasa nada, no es de nadie.',
      },
      { titulo: 'Y listo', texto: FINAL },
    ],
  },
};
