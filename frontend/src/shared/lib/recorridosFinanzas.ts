import type { RecorridoCobros } from '@/shared/lib/recorridosCobros';

/**
 * LOS RECORRIDOS DEL BLOQUE FINANZAS (#941, segunda tanda; Diego, 19/11: «las
 * que son así, dáselas a Ángel CEDIA»).
 *
 * El mismo modelo que `recorridosCobros.ts` (de donde se registran: allí se
 * suman a `RECORRIDOS_COBROS`, y así `VerRecorrido` y las pruebas de siempre los
 * ven sin tocar nada más). Van en su propio fichero para no pisarse con los de
 * las otras tandas (Comercial, Hoy, Captación, Académico).
 *
 *  · Cada paso apunta a un `data-recorrido` de su pantalla; lo que no está en ese
 *    momento (una tarjeta sin datos, la vista de calendario estando en la lista,
 *    un aviso sin nada que avisar) se salta solo.
 *  · El permiso de cada recorrido es el de la pantalla en el menú lateral.
 *  · La primera tanda (#963) trajo Dashboard, Ingresos, Conversiones y Egresos;
 *    la segunda, Cuentas por cobrar, Cuentas por pagar, Comisiones y Comisiones
 *    de tutores. El resto de Finanzas va en otra PR.
 *  · Cuentas por cobrar es la misma pantalla que en CRM-ISEIE (#635): mismo id,
 *    mismos anclajes y mismos textos.
 *  · Fuera, a propósito: Facturación, Links de pago, Pagos Stripe, Disputas,
 *    Integraciones y Conciliación (los hacen Diego y Claude) y Ventas (#955).
 *
 * Solo importa TIPOS de `recorridosCobros` (se borran al compilar): así no hay un
 * ciclo de módulos entre los dos ficheros.
 */

export type IdRecorridoFinanzas =
  | 'finanzas-dashboard'
  | 'ingresos'
  | 'conversiones'
  | 'egresos'
  | 'por-cobrar'
  | 'por-pagar'
  | 'comisiones'
  | 'comisiones-tutores';

type RecorridoFinanzas = Omit<RecorridoCobros, 'id'> & { id: IdRecorridoFinanzas };

const anclaje = (nombre: string) => `[data-recorrido="${nombre}"]`;

const FINAL = 'No volverá a salir solo. Para repasarlo, pulsa «Ver recorrido» en esta pantalla cuando quieras.';

/** En el orden de la issue: Dashboard, Ingresos, Conversiones, Egresos, Cuentas
 *  por cobrar, Cuentas por pagar, Comisiones y Comisiones de tutores. */
export const RECORRIDOS_FINANZAS: Record<IdRecorridoFinanzas, RecorridoFinanzas> = {
  // ─── Finanzas › Dashboard ──────────────────────────────────────────────────
  'finanzas-dashboard': {
    id: 'finanzas-dashboard',
    titulo: 'Dashboard de Finanzas',
    permiso: 'accounting.view',
    pantalla: ['modules/accounting/pages/AccountingDashboardPage.tsx'],
    pasos: [
      {
        titulo: 'La caja de un vistazo',
        texto: 'Lo que entra, lo que sale y lo que falta por cobrar, del campus o la empresa que tengas elegidos arriba. Son {pasos} pasos.',
      },
      {
        donde: anclaje('dashboard-fechas'),
        titulo: 'Las fechas',
        texto: 'Desde y hasta. Todas las cifras de la pantalla se calculan con ellas: cambia una y se recalcula todo.',
      },
      {
        donde: anclaje('dashboard-tarjetas'),
        titulo: 'Las tarjetas',
        texto: '«Ingresos cobrados»: lo que ha entrado. «Facturado»: las facturas emitidas. «Por cobrar» y «Vencido»: lo que deben las ventas y lo que ya pasó de fecha. «Egresos» y «Balance neto»: lo gastado y lo que queda.',
      },
      {
        donde: anclaje('dashboard-evolucion'),
        titulo: 'Evolución mensual',
        texto: 'Ingresos y egresos de los últimos 12 meses, mes a mes. Pasa el ratón por un punto para ver la cifra.',
      },
      {
        donde: anclaje('dashboard-egresos-categoria'),
        titulo: 'Egresos por categoría',
        texto: 'En qué se ha gastado en estas fechas: cada barra es una categoría.',
      },
      {
        donde: anclaje('dashboard-vendedoras'),
        titulo: 'Ventas por vendedora',
        texto: 'Ventas, clientes, lo cobrado y lo pendiente de cada vendedora en estas fechas.',
      },
      {
        donde: anclaje('dashboard-por-cobrar'),
        titulo: 'Cuentas por cobrar',
        texto: 'Las ventas con dinero pendiente, las que antes vencen primero; en rojo, las vencidas. Pulsa una para abrir la ficha del prospecto. «Ver todas» lleva a Cuentas por cobrar.',
      },
      { titulo: 'Y listo', texto: FINAL },
    ],
  },

  // ─── Finanzas › Ingresos (la misma pantalla que Ventas, con otro título) ───
  ingresos: {
    id: 'ingresos',
    titulo: 'Ingresos',
    permiso: 'conversions.view',
    pantalla: [
      'modules/accounting/pages/IncomePage.tsx',
      'modules/sales/components/MyGoalCard.tsx',
      'modules/sales/components/TopProductsCard.tsx',
    ],
    pasos: [
      {
        titulo: 'Los ingresos',
        texto: 'Lo que se vendió y lo que se facturó en unas fechas. Es la misma pantalla que Ventas, con el mismo filtro y la misma lista. Son {pasos} pasos.',
      },
      {
        donde: anclaje('ventas-filtros'),
        titulo: 'Los filtros',
        texto: 'Empresa o proyecto, curso y ventas compartidas. Abre con este mes: cambia las fechas o usa «Rápido». «Quitar filtros» lo deja como al entrar.',
      },
      {
        donde: anclaje('ventas-tarjetas'),
        titulo: 'Las tarjetas',
        texto: 'Las ventas nuevas de esas fechas, lo que suman y lo cobrado de ellas hasta hoy. Una venta a plazos se cobra durante meses: por eso vendido y cobrado no coinciden.',
      },
      {
        donde: anclaje('ventas-cuotas-facturadas'),
        titulo: 'Cuotas facturadas',
        texto: 'Las facturas de cuotas emitidas en estas fechas, de ventas que pueden ser anteriores. No son ventas nuevas y no se suman con ellas.',
      },
      {
        donde: anclaje('ventas-por-proyecto'),
        titulo: 'Por proyecto',
        texto: 'Con una empresa elegida, cada campus con sus ventas y sus cuotas. Pulsa uno para ver solo ese.',
      },
      {
        donde: anclaje('ventas-esperan-factura'),
        titulo: 'Ventas que esperan factura',
        texto: 'Las que piden factura y aún no la tienen. «Ir a facturarlas» te lleva a Facturación.',
      },
      {
        donde: anclaje('ventas-lista'),
        titulo: 'La lista',
        texto: 'Ventas y cuotas de estas fechas. VENTA es nueva; CUOTA, un cobro de una venta anterior; COMPARTIDO, atendida entre dos gestoras. Pulsa una fila para abrir la ficha del prospecto.',
      },
      { titulo: 'Y listo', texto: FINAL },
    ],
  },

  // ─── Finanzas › Conversiones ───────────────────────────────────────────────
  conversiones: {
    id: 'conversiones',
    titulo: 'Conversiones',
    permiso: 'conversions.view',
    pantalla: ['modules/revenue/pages/RevenuePage.tsx'],
    pasos: [
      {
        titulo: 'Las conversiones',
        texto: 'Las ventas registradas del campus o la empresa elegidos arriba: cuánto entra este mes y cómo han ido los últimos seis. Son {pasos} pasos.',
      },
      {
        donde: anclaje('conversiones-tarjetas'),
        titulo: 'Este mes',
        texto: 'Lo vendido en el mes en curso, cuántas ventas son y el ticket medio (lo vendido entre el número de ventas). Esta pantalla no tiene filtro de fechas: siempre es este mes.',
      },
      {
        donde: anclaje('conversiones-evolucion'),
        titulo: 'Evolución de ingresos',
        texto: 'Lo vendido cada mes en los últimos seis. Pasa el ratón por la gráfica para ver la cifra de un mes.',
      },
      {
        donde: anclaje('conversiones-lista'),
        titulo: 'Conversiones recientes',
        texto: 'Las 20 últimas ventas, con su importe, la fecha y si se pagó entera («Completo») o solo una parte («Parcial»).',
      },
      { titulo: 'Y listo', texto: FINAL },
    ],
  },

  // ─── Finanzas › Egresos ────────────────────────────────────────────────────
  egresos: {
    id: 'egresos',
    titulo: 'Egresos',
    permiso: 'expenses.view',
    pantalla: ['modules/expenses/pages/ExpensesPage.tsx'],
    pasos: [
      {
        titulo: 'Los egresos',
        texto: 'Los gastos del campus o la empresa elegidos arriba: cuánto, en qué y de quién. Son {pasos} pasos.',
      },
      {
        donde: anclaje('egresos-cifras'),
        titulo: 'Las cifras',
        texto: 'El total de lo que estás filtrando, lo que no es de ningún campus (gastos de la empresa o generales) y la categoría en la que más se gasta.',
      },
      {
        donde: anclaje('egresos-categorias'),
        titulo: 'Por categoría',
        texto: 'Cuánto se lleva cada categoría. Pulsa una para ver solo sus egresos; púlsala otra vez para quitar el filtro.',
      },
      {
        donde: anclaje('egresos-filtros'),
        titulo: 'Los filtros',
        texto: 'Busca por concepto o nota, elige la categoría, si son manuales o automáticos, y las fechas (debajo, atajos: este mes, el pasado o el año). «Quitar filtros» lo deja como al entrar.',
      },
      {
        donde: anclaje('egresos-lista'),
        titulo: 'La lista',
        texto: 'Cada egreso con su fecha, categoría, de quién es e importe. El clip abre el comprobante. Los marcados «auto» los crea el sistema: se corrigen desde su origen, no aquí.',
      },
      {
        donde: anclaje('egresos-csv'),
        titulo: 'Exportar a CSV',
        texto: 'Descarga todos los egresos que cumplen estos filtros, no solo los de esta página.',
      },
      {
        donde: anclaje('egresos-nuevo'),
        titulo: 'Nuevo egreso',
        texto: 'Para apuntar un gasto: concepto, importe, categoría y fecha, y si quieres su comprobante (PDF o imagen).',
        permiso: 'expenses.create',
      },
      { titulo: 'Y listo', texto: FINAL },
    ],
  },

  // ─── Finanzas › Cuentas por cobrar (igual que CRM-ISEIE#635) ───────────────
  'por-cobrar': {
    id: 'por-cobrar',
    titulo: 'Cuentas por cobrar',
    permiso: 'accounting.por_cobrar',
    pantalla: ['modules/accounting/pages/ReceivablePage.tsx'],
    pasos: [
      {
        titulo: 'Lo que falta por cobrar',
        texto: 'Las cuotas y los pagos pendientes de las ventas, con la fecha en que vencen. Son {pasos} pasos.',
      },
      {
        donde: anclaje('cobrar-vista'),
        titulo: 'Lista o calendario',
        texto: 'La lista enseña los cobros pendientes uno a uno; el calendario, cuánto vence cada día del mes.',
      },
      {
        donde: anclaje('cobrar-tarjetas'),
        titulo: 'Las tarjetas',
        texto: 'Cuántos cobros quedan y cuánto suman; y de ellos, los que ya pasaron de fecha (vencidas) y su importe.',
      },
      {
        donde: anclaje('cobrar-filtros'),
        titulo: 'Los filtros',
        texto: 'Proyecto, gestora y fechas de vencimiento. «Este mes», «Próx. mes» y «Todas» cambian las fechas de un clic; «Solo vencidas» deja las que ya pasaron.',
      },
      {
        donde: anclaje('cobrar-lista'),
        titulo: 'La lista',
        texto: 'Cada cobro con su cliente, concepto (y número de cuota), gestora, lo pendiente y cuándo vence; en rojo, los vencidos. Pulsa uno para abrir la ficha del prospecto.',
      },
      {
        donde: anclaje('cobrar-calendario'),
        titulo: 'El calendario',
        texto: 'Cada día, lo que vence y cuántos cobros son. Pulsa un día para ver cuáles; con ◀ ▶ cambias de mes.',
      },
      { titulo: 'Y listo', texto: FINAL },
    ],
  },

  // ─── Finanzas › Cuentas por pagar ──────────────────────────────────────────
  'por-pagar': {
    id: 'por-pagar',
    titulo: 'Cuentas por pagar',
    permiso: 'accounts_payable.view',
    pantalla: ['modules/accounting/pages/AccountsPayablePage.tsx'],
    pasos: [
      {
        titulo: 'Lo que se debe',
        texto: 'Las facturas y deudas con proveedores: cuánto se debe, cuánto se ha pagado y cuándo vence. Son {pasos} pasos.',
      },
      {
        donde: anclaje('pagar-tarjetas'),
        titulo: 'Las tarjetas',
        texto: 'Lo facturado por los proveedores, lo pagado, lo pendiente y cuántas facturas han vencido sin pagar.',
      },
      {
        donde: anclaje('pagar-filtros'),
        titulo: 'Estado y fechas',
        texto: 'Todas, pendientes, parciales, pagadas o canceladas, y entre qué fechas. «Quitar fechas» vuelve a todas.',
      },
      {
        donde: anclaje('pagar-lista'),
        titulo: 'La lista',
        texto: 'Cada factura con su proveedor, concepto, total, pagado, pendiente, vencimiento y estado. El botón € apunta un pago; la papelera la borra.',
      },
      {
        donde: anclaje('pagar-nueva'),
        titulo: 'Nueva factura',
        texto: 'Para apuntar una factura de un proveedor: quién, por qué, cuánto y cuándo hay que pagarla.',
        permiso: 'accounts_payable.create',
      },
      { titulo: 'Y listo', texto: FINAL },
    ],
  },

  // ─── Finanzas › Comisiones (del equipo comercial) ──────────────────────────
  comisiones: {
    id: 'comisiones',
    titulo: 'Comisiones',
    permiso: 'commissions.view',
    pantalla: ['modules/commissions/pages/CommissionsPage.tsx'],
    pasos: [
      {
        titulo: 'Las comisiones',
        texto: 'Lo que gana el equipo comercial por sus ventas: se generan solas con el porcentaje de cada gestor sobre lo cobrado. Son {pasos} pasos.',
      },
      {
        donde: anclaje('comisiones-periodo'),
        titulo: 'El periodo',
        texto: 'Un mes concreto o todo el histórico. «Mes anterior» y «Mes actual» te llevan de un clic. A la derecha, cuántas comisiones hay en ese periodo.',
      },
      {
        donde: anclaje('comisiones-tarjetas'),
        titulo: 'Las tarjetas',
        texto: 'Lo generado, lo pagado y lo pendiente, y cuántas comisiones son.',
      },
      {
        donde: anclaje('comisiones-estado'),
        titulo: 'Estado y gestor',
        texto: 'Todas, pendientes o pagadas y, si llevas el equipo, las de un gestor.',
      },
      {
        donde: anclaje('comisiones-lista'),
        titulo: 'La lista',
        texto: 'Cada comisión: fecha, gestor, cliente y programa, lo cobrado (base), el porcentaje y la comisión. «Pagar» la marca pagada con la fecha de hoy; con las casillas marcas varias a la vez. «Exportar», arriba, las descarga en Excel, CSV o JSON.',
      },
      {
        donde: anclaje('comisiones-cerrar-mes'),
        titulo: 'Cerrar mes',
        texto: 'Deja fijas las comisiones del mes elegido: ya no se pueden añadir, cambiar ni borrar. No se puede deshacer.',
      },
      {
        donde: anclaje('comisiones-reglas'),
        titulo: 'Reglas',
        texto: 'El porcentaje de cada gestor, con el que se calculan sus comisiones.',
        permiso: 'commissions.reglas',
      },
      { titulo: 'Y listo', texto: FINAL },
    ],
  },

  // ─── Tutores › Comisiones de tutores ───────────────────────────────────────
  'comisiones-tutores': {
    id: 'comisiones-tutores',
    titulo: 'Comisiones de tutores',
    permiso: 'tutores.gestionar',
    pantalla: ['modules/tutores/pages/ComisionesTutoresPage.tsx'],
    pasos: [
      {
        titulo: 'Lo que se debe a los tutores',
        texto: 'Cada tutor cobra un porcentaje de lo cobrado de verdad de sus formaciones (nunca de lo vendido), mes a mes. Aquí ves cuánto se le debe, se le avisa y se apunta como pagado. Son {pasos} pasos.',
      },
      {
        donde: anclaje('comtutores-periodo'),
        titulo: 'El mes',
        texto: 'Elige el mes. Con una empresa elegida arriba, también puedes mirar un solo campus sin cambiar el selector.',
      },
      {
        donde: anclaje('comtutores-calcular'),
        titulo: 'Calcular',
        texto: 'Crea las comisiones del mes a partir de los cobros. Se puede repetir: solo añade las de los cobros que aún no tenían la suya.',
      },
      {
        donde: anclaje('comtutores-tarjetas'),
        titulo: 'Las tarjetas',
        texto: 'Lo que queda por pagar, lo ya pagado este mes y lo cobrado de sus formaciones, que es la base del porcentaje.',
      },
      {
        donde: anclaje('comtutores-sin-formacion'),
        titulo: 'Cobros sin formación',
        texto: 'Dinero cobrado de ventas que no dicen de qué formación son: nadie cobra comisión por él. Se arregla eligiendo la formación en cada venta.',
      },
      {
        donde: anclaje('comtutores-lista'),
        titulo: 'Los tutores',
        texto: 'Uno por fila, con lo que se le debe. Pulsa su nombre para ver cada cobro, su estado y lo que tiene que facturar.',
      },
      {
        donde: anclaje('comtutores-fila'),
        titulo: 'Pagar y avisar',
        texto: '«Marcar pagado» apunta como pagado lo de ese mes. «Avisar tutor» te enseña antes el correo con su cuenta, y puedes retocarlo antes de mandarlo.',
        permiso: ['tutores.liquidar', 'tutores.avisar'],
      },
      { titulo: 'Y listo', texto: FINAL },
    ],
  },
};
