// ============================================================
// BETA 1.0.1 — Allowlist de rutas visibles
// ============================================================
// En producción solo deben funcionar:
//   - Prospectos
//   - Captación (Webhooks + Forms + Mailhook)
//   - Clientes
//   - Productos
//
// El resto del sidebar se muestra deshabilitado con badge "Próximamente".
// Se activa con VITE_BETA_MODE=true (lo pone el build de producción).
// ============================================================

export const BETA_VERSION = '2.0.0';

export const BETA_MODE: boolean = String(import.meta.env.VITE_BETA_MODE || '').toLowerCase() === 'true';

// Rutas (prefijos `to=`) que están operativas en BETA 1.0.1.
// Cualquier `to` que empiece por uno de estos prefijos se considera activo.
export const BETA_ROUTES: readonly string[] = [
  '/',                       // Dashboard
  '/prospectos',             // Prospectos (listado, pipeline, audiencias)
  '/clientes',               // Clientes + Matrículas
  '/finanzas',               // Finanzas completo: dashboard, ventas, ingresos, conversiones,
                             // egresos, por-cobrar, por-pagar, comisiones, nóminas, integraciones
  '/ventas',                  // Ventas (ruta alternativa)
  '/meta-ads',               // Meta Ads (metricas + ROI manual)
  '/informes',                // Análisis › Reportes (overview + descargables prospectos/ventas)
  '/productos',              // Productos (catálogo, árbol, pendientes, woocommerce)
  '/captacion',              // Captación: Formularios, Webhooks, Make
  '/whatsapp',               // WhatsApp: cola, plantillas y el panel del equipo
  '/tutores',                // Tutores: alta, colaboraciones y comisiones
  '/mis-cursos',             // La pantalla del propio tutor
  '/secuencias-email',         // Email de seguimiento
  '/documentos',              // Documentos comerciales
  '/solicitudes-cambio',     // RFC — Solicitud de Cambio (todos los roles)
  '/notificaciones',         // Sistema básico
  '/manual',                 // Manual de usuario
  '/preferencias',            // Mis preferencias
  '/perfil',                // Perfil
  '/configuracion',               // Ajustes (gestión de usuarios, proyectos, etc.)
  '/set-password',           // Flujo de bienvenida
];

export function isBetaAllowed(to?: string): boolean {
  if (!BETA_MODE) return true;
  if (!to) return false;
  if (to === '/') return true;
  return BETA_ROUTES.some((p) => p !== '/' && (to === p || to.startsWith(p + '/')));
}
