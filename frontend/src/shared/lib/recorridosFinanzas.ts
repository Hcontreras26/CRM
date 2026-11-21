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
 *  · Esta tanda trae cuatro: Dashboard, Ingresos, Conversiones y Egresos. El
 *    resto de Finanzas va en otra PR.
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
  | 'egresos';

type RecorridoFinanzas = Omit<RecorridoCobros, 'id'> & { id: IdRecorridoFinanzas };

const anclaje = (nombre: string) => `[data-recorrido="${nombre}"]`;

const FINAL = 'No volverá a salir solo. Para repasarlo, pulsa «Ver recorrido» en esta pantalla cuando quieras.';

/** En el orden de la issue: Dashboard, Ingresos, Conversiones y Egresos. */
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
};
