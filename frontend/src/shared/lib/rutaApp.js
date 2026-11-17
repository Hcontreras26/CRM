/**
 * La dirección completa de una pantalla del CRM, para un `<a href>` corriente
 * (los que abren en otra pestaña, o los que viven fuera del Router).
 *
 * Un `href="/prospectos/5"` escrito a mano se salta la base de la compilación
 * (`/crm/` en producción, `/testeo/` en pruebas) y cae fuera del CRM; y uno con
 * `/crm/` puesto a mano manda a producción desde /testeo (CRM#633). Con esto
 * la base sale de la propia compilación.
 *
 * La prueba `enlacesSinRutasRotas` mira también las rutas que pasan por aquí.
 */
export function rutaApp(ruta) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  return `${base}${ruta.startsWith('/') ? ruta : `/${ruta}`}`;
}
