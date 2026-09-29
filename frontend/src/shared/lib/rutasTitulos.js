/*
  Cómo se llama cada pantalla.

  Estaba dentro de App.jsx y solo lo usaba el título de la pestaña del
  navegador. Ahora también lo usa la cabecera, así que vive aquí: una pantalla
  no puede llamarse de una forma en la pestaña y de otra encima del contenido.

  Al añadir una ruta, añadir aquí su nombre. Si falta, la cabecera no rompe —
  se queda sin título— pero la pantalla pierde la referencia de dónde está.
*/
export const ROUTE_TITLES = {
  '/': 'Dashboard',
  '/prospectos': 'Prospectos',
  '/whatsapp': 'Chat de WhatsApp',
  '/whatsapp/chat': 'Chat de WhatsApp',
  '/whatsapp/conexion': 'Conexion de WhatsApp',
  // Las tres de abajo son pantallas de WhatsApp que llegaron después del marco.
  // Sin su línea aquí, la cabecera busca hacia arriba y encuentra `/whatsapp`:
  // las tres se anunciarían como «Chat de WhatsApp», que es otra pantalla.
  '/whatsapp/plantillas': 'Plantillas de WhatsApp',
  '/whatsapp/banco': 'Banco de mensajes',
  '/whatsapp/ayuda': 'Como se usa WhatsApp',
  '/prospectos/pipeline': 'Pipeline',
  '/prospectos/audiencias': 'Audiencias',
  '/clientes': 'Clientes',
  '/clientes/matriculas': 'Matrículas',
  '/captacion': 'Captación',
  '/captacion/webhooks': 'Webhooks',
  '/captacion/make': 'Make',
  '/campanas': 'Campañas',
  '/campanas/meta': 'Meta Ads',
  '/campanas/google': 'Google Ads',
  '/campanas/seo': 'Tráfico orgánico',
  '/productos': 'Productos',
  // Cada pantalla se llama igual en el menú, en la ruta, en la pestaña del
  // navegador y en su propio título (#79). Aquí ponía «Árbol de categorías»
  // para /productos/arbol, que es OTRA pantalla.
  '/productos/arbol': 'Productos por categoría',
  '/productos/categorias': 'Árbol de categorías',
  '/productos/pendientes': 'Cursos pendientes',
  '/productos/woocommerce': 'WooCommerce',
  '/finanzas': 'Contabilidad',
  '/finanzas/ventas': 'Ventas',
  '/finanzas/ingresos': 'Ingresos',
  '/finanzas/conversiones': 'Conversiones',
  '/finanzas/egresos': 'Egresos',
  '/finanzas/ventas-analisis': 'Análisis de ventas',
  '/finanzas/por-cobrar': 'Cuentas por cobrar',
  '/finanzas/por-pagar': 'Cuentas por pagar',
  '/finanzas/comisiones': 'Comisiones',
  '/finanzas/nominas': 'Nóminas',
  '/finanzas/integraciones': 'Integraciones',
  '/finanzas/pendiente-facturar': 'Pendientes de facturar',
  '/finanzas/pagos-stripe': 'Pagos Stripe',
  '/finanzas/facturas': 'Facturas',
  '/finanzas/facturas/configuracion': 'Configuración de facturación',
  '/stripe': 'Stripe',
  '/soporte': 'Soporte',
  '/status': 'Estado del sistema',
  '/notificaciones': 'Notificaciones',
  '/secuencias-email': 'Email seguimiento',
  '/configuracion/campos': 'Campos personalizados',
  '/prospectos/proceso': 'Proceso comercial',
  '/configuracion/claves': 'Claves y variables',
  '/conexion/mcp': 'Conexión MCP',
  '/conexion/conectores': 'Conectores',
  '/configuracion/roles': 'Roles y Permisos',
  '/configuracion/canales': 'Canales del proyecto',
  '/configuracion/atajos': 'Atajos rápidos',
  '/configuracion/documentos': 'Numeración de documentos',
  '/configuracion/plantillas-email': 'Plantillas de email',
  '/informes': 'Reportes',
  '/mensajes': 'Mensajes',
  '/manual': 'Manual',
  '/configuracion': 'Configuración',
  '/perfil': 'Mi perfil',
  '/dev/components': 'Las 22 primitivas',
  '/prueba_ui': 'Laboratorio UI',
  '/prueba_ui_leads': 'Prueba UI Prospectos',
  '/prueba_ui_clientes': 'Prueba UI Clientes',
  '/prueba_ui_finanzas': 'Prueba UI Finanzas',
  '/prueba_ui_productos': 'Prueba UI Productos',
  '/prueba_ui_reportes': 'Prueba UI Reportes',
  '/prueba_ui_configuracion': 'Prueba UI Configuracion',
  '/testeo2': 'Prospectos',
  '/suite-dash': 'Maqueta SuiteDash',
};

/**
 * El nombre de la pantalla a la que corresponde una dirección.
 *
 * Busca la coincidencia MÁS LARGA: `/finanzas/facturas` gana a `/finanzas`,
 * que si no toda la sección se llamaría igual.
 */
export function tituloDeRuta(pathname) {
  const clave = Object.keys(ROUTE_TITLES)
    .sort((a, b) => b.length - a.length)
    .find((k) => pathname === k || pathname.startsWith(k + '/'));
  return clave ? ROUTE_TITLES[clave] : null;
}
