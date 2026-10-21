/**
 * Qué permiso del catálogo pide cada ruta (#423, fase 2).
 *
 * Andamio entre la fase 2 y la 4: aquí se decide la clave de cada ruta y la
 * prueba `catalogoPermisos.test.js` comprueba, rol por rol, que los valores
 * por defecto del catálogo dan EXACTAMENTE el acceso de hoy. En la fase 4 cada
 * ruta pasa a llevar su `puede('clave')` en su propio fichero y esto se borra.
 *
 * Por módulo, «MÉTODO /ruta» relativa al prefijo del módulo →
 *   - 'recurso.accion'          un permiso
 *   - ['a.x', 'b.y']            cualquiera de ellos
 *   - PROPIA                    lo de cada uno (su sesión, sus avisos, su
 *                               foto): toda persona con sesión, no es permiso
 * Las rutas públicas (sin sesión) no se apuntan, salvo las que miran dentro a
 * quién pertenece la llave (el MCP).
 *
 * `CONDICIONES`: la clave de cada acción con condición (`manuales.js`), que
 * se pide además de la de su ruta.
 */
export const PROPIA = 'propia';

export const ASIGNACION = {
  accounting: {
    'GET /dashboard': 'accounting.view',
    'GET /receivable': 'accounting.por_cobrar',
  },
  'accounts-payable': {
    'GET /': 'accounts_payable.view', 'GET /stats': 'accounts_payable.view', 'GET /:id': 'accounts_payable.view',
    'POST /': 'accounts_payable.create', 'PATCH /:id': 'accounts_payable.edit',
    'POST /:id/payments': 'accounts_payable.edit', 'DELETE /:id': 'accounts_payable.delete',
  },
  audiences: {
    'POST /preview': 'audiences.view', 'GET /upload-meta/history': 'audiences.view',
    'GET /upload-meta/:uploadId/status': 'audiences.view',
    'POST /export': 'audiences.export', 'POST /upload-meta': 'audiences.export',
  },
  auth: {
    'POST /logout': PROPIA, 'GET /me': PROPIA, 'POST /change-password': PROPIA, 'PATCH /me': PROPIA,
    'PATCH /me/email': 'cuenta.cambiar_correo',
  },
  certifex: {
    'GET /emisiones/estado': 'diplomas.view', 'GET /emisiones/centros': 'diplomas.view',
    'GET /emisiones/cursos': 'diplomas.view', 'GET /emisiones/logo': 'diplomas.view',
    'GET /emisiones/diploma/:nexp': 'diplomas.view', 'GET /diplomas/resumen': 'diplomas.view',
    'GET /diplomas/solicitudes': 'diplomas.view', 'GET /diplomas/por-avisar': 'diplomas.view',
    'GET /diplomas/terminados': 'diplomas.view', 'GET /diplomas': 'diplomas.view',
    'GET /consultas': 'certifex_consultas.view', 'PATCH /consultas/:id': 'certifex_consultas.edit',
    'GET /emisiones': 'diplomas.view_emisiones', 'GET /diplomas/formaciones': 'diplomas.view_emisiones',
    'GET /diplomas/firma/:matriculaId': 'diplomas.view_emisiones',
    'POST /emisiones/decisiones': 'diplomas.aprobar', 'POST /emisiones/emitir': 'diplomas.aprobar',
    'POST /diplomas/aprobar-emitir': 'diplomas.aprobar', 'POST /diplomas/emitir': 'diplomas.aprobar',
    'POST /diplomas/rechazar': 'diplomas.aprobar', 'POST /diplomas/nuevo': 'diplomas.aprobar',
    'POST /diplomas/avisos': 'diplomas.avisar', 'POST /diplomas/avisos-rechazo': 'diplomas.avisar',
    'POST /diplomas/revocar': 'diplomas.revocar',
    'POST /diplomas/corregir': 'diplomas.edit', 'POST /diplomas/editar': 'diplomas.edit',
    'POST /diplomas/firma': 'diplomas.edit', 'POST /diplomas/formaciones/sincronizar': 'diplomas.edit',
  },
  'change-requests': {
    'GET /': 'change_requests.view', 'GET /:id': 'change_requests.view',
    'GET /approvals/:approvalId/signature': 'change_requests.view',
    'GET /attachments/:attachmentId/download': 'change_requests.view',
    'POST /': 'change_requests.create', 'PATCH /:id': 'change_requests.edit',
    'POST /:id/attachments': 'change_requests.edit', 'DELETE /attachments/:attachmentId': 'change_requests.edit',
    'POST /:id/approve': 'change_requests.approve',
    'DELETE /:id': 'change_requests.delete', 'POST /:id/reopen': 'change_requests.reopen',
  },
  'claude-chat': {
    'GET /status': 'chat_ia.usar', 'GET /conversations': 'chat_ia.usar',
    'GET /conversations/:conversationId': 'chat_ia.usar', 'POST /chat': 'chat_ia.usar',
  },
  commissions: {
    'GET /rules': 'commissions.view', 'GET /': 'commissions.view', 'GET /stats': 'commissions.view',
    'PATCH /:id/pay': 'commissions.pagar', 'POST /recalculate/:conversionId': 'commissions.edit',
    'POST /rules': 'commissions.reglas', 'PATCH /rules/:id': 'commissions.reglas', 'DELETE /rules/:id': 'commissions.reglas',
    'GET /me': PROPIA, 'GET /me/stats': PROPIA,
  },
  connectors: {
    'GET /': 'connectors.view', 'GET /:id': 'connectors.view',
    'POST /': 'connectors.create', 'PATCH /:id': 'connectors.edit', 'POST /:id/mcp-url': 'connectors.edit',
    'POST /:id/preview': 'connectors.edit', 'POST /:id/import': 'connectors.edit', 'DELETE /:id': 'connectors.delete',
  },
  conversions: {
    'GET /': 'conversions.view', 'GET /productos': 'conversions.view', 'GET /cuotas': 'conversions.view',
    'GET /filas': 'conversions.view', 'GET /by-lead/:leadId': 'conversions.view', 'GET /:id': 'conversions.view',
    'GET /:id/installments': 'conversions.view', 'GET /:id/reparto': 'conversions.view', 'GET /:id/refunds': 'conversions.view',
    'POST /': 'conversions.create', 'PATCH /:id': 'conversions.edit', 'DELETE /:id': 'conversions.delete',
    'POST /:id/payments': 'conversions.cobros', 'DELETE /payments/:paymentId': 'conversions.cobros',
    'POST /:id/installments/generate': 'conversions.cobros', 'PATCH /installments/:instId': 'conversions.cobros',
    'POST /installments/:instId/pay': 'conversions.cobros', 'PATCH /installments/:instId/paid': 'conversions.cobros',
    'POST /installments/:instId/unpay': 'conversions.cobros', 'DELETE /installments/:instId': 'conversions.cobros',
    'PUT /:id/reparto': 'conversions.reparto', 'DELETE /:id/reparto': 'conversions.reparto',
    'POST /:id/refunds': 'conversions.devoluciones', 'DELETE /refunds/:refundId': 'conversions.devoluciones',
  },
  convocatorias: {
    'GET /embudo': 'convocatorias.view', 'GET /pendientes': 'convocatorias.view',
    'GET /lead/:leadId': 'convocatorias.view', 'GET /': 'convocatorias.view',
    'POST /:id/ofrecer': 'convocatorias.ofrecer', 'PATCH /ofrecimientos/:id': 'convocatorias.ofrecer',
    'POST /': 'convocatorias.create', 'PATCH /:id': 'convocatorias.edit',
  },
  correos: {
    'GET /': 'correos.view', 'GET /recuento': 'correos.view', 'GET /:id': 'correos.view',
    'POST /sincronizar': 'correos.sincronizar',
  },
  credentials: {
    'GET /': 'credentials.view', 'GET /paridad': 'credentials.view', 'GET /registro': 'credentials.view',
    'POST /': 'credentials.edit', 'POST /:id/test': 'credentials.edit', 'DELETE /:id': 'credentials.edit',
    'GET /:id/revelar': 'credentials.revelar',
  },
  documents: {
    'GET /': 'documents.view', 'GET /:id/download': 'documents.view',
    'GET /:id/audit': 'documents.auditar',
    'GET /next-number': 'documents.numeracion', 'POST /set-number': 'documents.numeracion',
    'POST /preview': 'documents.create', 'POST /generate': 'documents.create',
    'POST /:id/regenerate': 'documents.create', 'POST /:id/resend-email': 'documents.create',
    'DELETE /:id': 'documents.delete',
  },
  dossiers: {
    'GET /:id/url': 'dossiers.view', 'GET /product/:productId/history': 'dossiers.view',
    'POST /upload': 'dossiers.upload',
  },
  'email-sequences': {
    'GET /': 'email_sequences.view', 'GET /runs': 'email_sequences.view', 'GET /:id': 'email_sequences.view',
    'POST /': 'email_sequences.create', 'PATCH /:id': 'email_sequences.edit', 'DELETE /:id': 'email_sequences.delete',
    'POST /runs/start': 'email_sequences.lanzar', 'POST /runs/:runId/stop': 'email_sequences.lanzar',
  },
  'email-templates': {
    'GET /variables': 'email_templates.view', 'GET /': 'email_templates.view', 'GET /:id': 'email_templates.view',
    'POST /:id/render': 'email_templates.view',
    'POST /': 'email_templates.create', 'PATCH /:id': 'email_templates.edit', 'DELETE /:id': 'email_templates.delete',
  },
  expenses: {
    'GET /': 'expenses.view', 'GET /resumen': 'expenses.view', 'GET /comprobante/:key': 'expenses.view', 'GET /:id': 'expenses.view',
    'POST /': 'expenses.create', 'POST /upload-comprobante': 'expenses.create',
    'PATCH /:id': 'expenses.edit', 'DELETE /:id': 'expenses.delete',
  },
  'facturas-colaborador': {
    'GET /mias': 'facturas_colaborador.subir', 'POST /mias/:id': 'facturas_colaborador.subir',
    'GET /mias/:id/archivo': 'facturas_colaborador.subir',
    'GET /empresas': ['facturas_colaborador.ver_todas', 'facturas_colaborador.gestionar'],
    'GET /colaboradores': 'facturas_colaborador.gestionar', 'POST /colaboradores': 'facturas_colaborador.gestionar',
    'GET /colaboradores/:id': 'facturas_colaborador.gestionar', 'PATCH /colaboradores/:id': 'facturas_colaborador.gestionar',
    'POST /colaboradores/:id/baja': 'facturas_colaborador.gestionar', 'POST /colaboradores/:id/alta': 'facturas_colaborador.gestionar',
    'GET /colaboradores/:id/registro': 'facturas_colaborador.gestionar', 'POST /facturas/:id/reenviar': 'facturas_colaborador.gestionar',
    'GET /mes': 'facturas_colaborador.ver_todas', 'GET /facturas': 'facturas_colaborador.ver_todas',
    'GET /coste-por-campus': 'facturas_colaborador.ver_todas', 'GET /zip': 'facturas_colaborador.ver_todas',
    'GET /facturas/:id/archivo': 'facturas_colaborador.ver_todas', 'GET /facturas/:id/registro': 'facturas_colaborador.ver_todas',
    'GET /facturas/:id/desglose': 'facturas_colaborador.ver_todas', 'GET /facturas/:id/justificante': 'facturas_colaborador.ver_todas',
    'POST /facturas/:id/anular': 'facturas_colaborador.anular',
    'POST /facturas/pagar': 'facturas_colaborador.pagar', 'POST /facturas/:id/deshacer-pago': 'facturas_colaborador.pagar',
  },
  feedback: {
    'GET /panel': 'feedback.view', 'GET /lista': 'feedback.view', 'GET /lead/:leadId': 'feedback.view',
    'POST /lead/:leadId/enviar': 'feedback.enviar', 'POST /lead/:leadId/no-enviar': 'feedback.enviar',
  },
  'field-definitions': {
    'GET /project/:projectId': 'field_defs.view',
    'POST /': 'field_defs.edit', 'PATCH /:id': 'field_defs.edit', 'DELETE /:id': 'field_defs.edit', 'POST /reorder': 'field_defs.edit',
  },
  forms: {
    'GET /': 'forms.view', 'GET /:id': 'forms.view', 'GET /:id/status': 'forms.view', 'GET /:id/events': 'forms.view',
    'POST /': 'forms.create', 'PATCH /:id': 'forms.edit', 'POST /:id/listen': 'forms.edit',
    'POST /:id/listen/stop': 'forms.edit', 'DELETE /:id': 'forms.delete',
  },
  'ia-monitor': { 'GET /metrics/:projectId': 'ia.view', 'GET /gasto': 'ia.view' },
  installation: { 'GET /': 'installation.view', 'PATCH /': 'installation.edit' },
  integrations: {
    'GET /': 'integrations.view', 'GET /:provider': 'integrations.view',
    'PUT /': 'integrations.edit', 'POST /:provider/test': 'integrations.edit', 'DELETE /:provider': 'integrations.edit',
  },
  invoices: {
    'GET /facturacion-al-dia': 'facturas.view', 'GET /': 'facturas.view', 'GET /stats': 'facturas.view',
    'GET /siguiente-numero': 'facturas.view', 'GET /ventas-sin-factura': 'facturas.view', 'GET /regimenes': 'facturas.view',
    'GET /resolve-regimen': 'facturas.view', 'GET /templates': 'facturas.view', 'GET /templates/:id': 'facturas.view',
    'GET /issuers': 'facturas.view', 'GET /config': 'facturas.view', 'GET /sequences': 'facturas.view',
    'GET /lead-fiscal/:leadId': 'facturas.view', 'GET /by-conversion/:conversionId': 'facturas.view',
    'GET /:id': 'facturas.view', 'GET /:id/pdf': 'facturas.view',
    'POST /': 'facturas.create',
    'PATCH /:id/entregada': 'facturas.completar', 'POST /:id/completar-datos': 'facturas.completar',
    'POST /:id/send': 'facturas.enviar', 'POST /:id/mark-paid': 'facturas.cobrar', 'POST /:id/cancel': 'facturas.anular',
    'POST /:id/emitir': 'facturas.emitir_borrador',
    'PUT /facturacion-al-dia': 'facturas.cola', 'POST /cola/generar': 'facturas.cola',
    'POST /cola/emitir-hasta': 'facturas.cola', 'POST /:id/cobrar-proforma': 'facturas.cola',
    'POST /regimenes': 'facturas.configurar', 'PATCH /regimenes/:id': 'facturas.configurar', 'DELETE /regimenes/:id': 'facturas.configurar',
    'POST /templates': 'facturas.configurar', 'PATCH /templates/:id': 'facturas.configurar', 'DELETE /templates/:id': 'facturas.configurar',
    'POST /issuers': 'facturas.configurar', 'PATCH /issuers/:id': 'facturas.configurar', 'DELETE /issuers/:id': 'facturas.configurar',
    'POST /issuers/:id/logo': 'facturas.configurar', 'DELETE /issuers/:id/logo': 'facturas.configurar',
    'PATCH /config': 'facturas.configurar', 'POST /sequences': 'facturas.configurar',
    'PATCH /:id': 'facturas.edit',
    'PATCH /:id/corregir': 'facturas.gestionar', 'PATCH /:id/asociar': 'facturas.gestionar',
    'DELETE /:id': 'facturas.gestionar', 'POST /:id/rectificar': 'facturas.gestionar',
    'PATCH /:id/fechas': 'facturas.editar_fechas',
  },
  leads: {
    'GET /': 'leads.view', 'GET /stats': 'leads.view', 'GET /quick-counts': 'leads.view', 'GET /revision': 'leads.view',
    'GET /today': 'leads.view', 'GET /lookup-by-email': 'leads.view', 'POST /check-duplicate': 'leads.view',
    'GET /:id/products': 'leads.view', 'GET /:id': 'leads.view', 'GET /:id/sequences': 'leads.view',
    'GET /:id/purchase-history': 'leads.view', 'GET /:id/emails': 'leads.view',
    'GET /export/wasapi': 'leads.exportar_wasapi',
    'POST /': 'leads.create', 'POST /bulk': 'leads.create',
    'PATCH /:id': 'leads.edit', 'PATCH /:id/status': 'leads.edit', 'POST /:id/products': 'leads.edit',
    'PATCH /:id/products/:lpId': 'leads.edit', 'DELETE /:id/products/:lpId': 'leads.edit',
    'POST /:id/merge': 'leads.edit', 'POST /:id/revisar': 'leads.edit',
    'POST /:id/interactions': 'leads.edit', 'PATCH /:id/interactions/:interactionId': 'leads.edit',
    'DELETE /:id/interactions/:interactionId': 'leads.edit', 'POST /:id/reminders': 'leads.edit',
    'PATCH /reminders/:reminderId/complete': 'leads.edit',
    'POST /:id/send-email': 'leads.enviar_correo',
    'GET /spam-reports': 'leads.spam', 'GET /spam-reports/count': 'leads.spam', 'PATCH /spam-reports/:reportId': 'leads.spam',
    'PATCH /:id/restore': 'leads.restaurar',
    'GET /review-queue': 'leads.duplicados', 'GET /duplicados': 'leads.duplicados',
    'POST /review-queue/:id/decide': 'leads.duplicados',
    'PATCH /:id/reassign': 'leads.assign', 'POST /reassign-pending': 'leads.assign',
    'POST /:id/report-spam': 'leads.reportar_spam',
    'DELETE /:id': 'leads.delete',
  },
  make: {
    'GET /': 'make.view', 'GET /:id': 'make.view', 'GET /:id/deliveries': 'make.view',
    'POST /': 'make.create', 'PATCH /:id': 'make.edit', 'POST /:id/rotate-secret': 'make.edit', 'DELETE /:id': 'make.delete',
  },
  matriculas: {
    'GET /': 'matriculas.view', 'GET /:id': 'matriculas.view',
    'POST /': 'matriculas.create', 'PATCH /:id': 'matriculas.edit', 'POST /:id/doc/:tipo': 'matriculas.edit',
    'DELETE /:id': 'matriculas.delete', 'POST /:id/estado': 'matriculas.cambiar_estado',
  },
  mcp: {
    'GET /panel/': PROPIA, 'DELETE /panel/tokens/:id': PROPIA, 'PATCH /panel/conexiones/:id': PROPIA,
    'POST /panel/tokens': 'mcp.usar', 'POST /panel/codigo': 'mcp.usar', 'POST /panel/tokens/:id/desbloquear': 'mcp.usar',
    'GET /panel/personas': 'mcp.administrar', 'PATCH /panel/personas/:id': 'mcp.administrar',
    'GET /panel/actividad': 'mcp.administrar',
    'POST /panel/interruptor': 'mcp.supervisar',
    // El MCP en sí no lleva sesión del CRM (lo llama Claude con la URL o el
    // token personal), pero dentro mira si la persona puede usarlo.
    'POST /': 'mcp.usar', 'POST /u/:secreto': 'mcp.usar',
  },
  messages: Object.fromEntries([
    'GET /conversations', 'GET /conversations/unread-count', 'POST /conversations', 'GET /conversations/:id/messages',
    'POST /conversations/:id/messages', 'PATCH /conversations/:id/read', 'POST /conversations/:id/typing',
    'GET /conversations/:id/typing', 'DELETE /messages/:msgId', 'GET /users/available', 'GET /users/online',
  ].map((r) => [r, 'mensajes.usar'])),
  'meta-ads': {
    'GET /accounts': 'meta_ads.view', 'GET /account': 'meta_ads.view', 'GET /campaigns': 'meta_ads.view',
    'GET /campaigns/:campaignId': 'meta_ads.view', 'GET /campaigns/:campaignId/adsets': 'meta_ads.view',
    'GET /adsets/:adsetId/ads': 'meta_ads.view', 'GET /dashboard': 'meta_ads.view', 'GET /associations': 'meta_ads.view',
    'GET /adset-associations': 'meta_ads.view', 'GET /roi': 'meta_ads.view', 'GET /products-view': 'meta_ads.view',
    'POST /connect': 'meta_ads.edit', 'PATCH /accounts/:accountId/token': 'meta_ads.edit',
    'DELETE /accounts/:accountId': 'meta_ads.edit', 'POST /accounts/:accountId/sync': 'meta_ads.edit',
    'POST /accounts/:accountId/backfill': 'meta_ads.edit', 'POST /associations': 'meta_ads.edit',
    'POST /adset-associations': 'meta_ads.edit',
  },
  notifications: Object.fromEntries([
    'GET /', 'GET /unread-count', 'GET /preferences', 'PUT /preferences', 'PATCH /read-group', 'PATCH /:id/read', 'PATCH /mark-all-read',
  ].map((r) => [r, PROPIA])),
  novedades: {
    'GET /': 'novedades.view', 'GET /:version/pdf': 'novedades.view',
    'GET /:version/envios': 'novedades.envios', 'POST /:version/enviar': 'novedades.enviar',
  },
  payroll: {
    'GET /plans': 'payroll.view', 'GET /hours': 'payroll.view', 'GET /periods': 'payroll.view', 'GET /periods/:id': 'payroll.view',
    'POST /hours': 'payroll.create',
    'PUT /plans': 'payroll.edit', 'POST /periods/generate': 'payroll.edit', 'POST /periods/:id/close': 'payroll.edit',
    'POST /periods/:id/pay': 'payroll.edit', 'POST /adjustments': 'payroll.edit',
    'DELETE /plans/:id': 'payroll.delete', 'DELETE /hours/:id': 'payroll.delete', 'DELETE /adjustments/:id': 'payroll.delete',
  },
  permissions: {
    'GET /catalogo': PROPIA,
    // La ficha: la suya, cualquiera; la de otro, con «Ver usuarios» (lo mira el controlador).
    'GET /personas/:id': PROPIA,
    // El catálogo de menú y bloques lo lee «Mis preferencias» de cualquiera.
    'GET /system-defaults': PROPIA, 'GET /role-views/:roleKey': PROPIA,
    'GET /custom-roles': 'roles.view', 'GET /custom-roles/:id': 'roles.view', 'GET /claves/:clave/rol/:roleKey': 'roles.view',
    'GET /role-permissions/:roleKey': 'roles.view',
    'POST /custom-roles': 'roles.edit', 'PUT /custom-roles/:id': 'roles.edit', 'DELETE /custom-roles/:id': 'roles.edit',
    'PUT /role-views/:roleKey': 'roles.edit', 'PUT /role-permissions/:roleKey': 'roles.edit',
    'PUT /claves/:clave/rol/:roleKey': 'roles.edit',
    'GET /users/:userId/permissions': 'users.excepciones', 'PUT /users/:userId/permissions': 'users.excepciones',
    'GET /claves/:clave/personas': 'users.excepciones', 'PUT /claves/:clave/personas/:userId': 'users.excepciones',
  },
  proceso: {
    'GET /pasos': 'proceso.view', 'GET /cola': 'proceso.view', 'GET /cola/resumen': 'proceso.view',
    'GET /seguimiento': 'proceso.view', 'GET /seguimiento/resumen': 'proceso.view',
    'GET /seguimiento/wasapi': 'proceso.view', 'GET /lead/:leadId': 'proceso.view',
    'PATCH /paso-lead/:id': 'proceso.trabajar', 'POST /lead/:leadId/seguimiento': 'proceso.trabajar',
    'POST /pasos': 'proceso.configurar_pasos', 'PATCH /pasos/orden': 'proceso.configurar_pasos',
    'PATCH /pasos/:id': 'proceso.configurar_pasos', 'DELETE /pasos/:id': 'proceso.configurar_pasos',
    'POST /lead/:leadId/replanificar': 'proceso.replanificar',
  },
  'product-categories': {
    'GET /tree': 'products.view', 'GET /project/:projectId': 'products.view', 'GET /:id/ancestors': 'products.view',
    'POST /': 'products.categorias', 'PATCH /:id': 'products.categorias', 'DELETE /:id': 'products.categorias',
  },
  products: {
    'GET /': 'products.view', 'GET /leads-stats': 'products.view', 'GET /:id': 'products.view',
    'GET /:id/image-url': 'products.view', 'GET /:id/modules': 'products.view',
    'GET /export': 'products.export',
    'POST /': 'products.create', 'DELETE /:id': 'products.delete',
    'PATCH /:id': 'products.edit', 'POST /:id/image': 'products.edit', 'DELETE /:id/image': 'products.edit',
    'POST /:id/modules': 'products.edit', 'PATCH /:id/modules/:moduleId': 'products.edit',
    'DELETE /:id/modules/:moduleId': 'products.edit', 'POST /:id/modules/reorder': 'products.edit',
  },
  'project-channels': {
    'GET /': 'channels.view', 'POST /': 'channels.edit', 'PATCH /:id': 'channels.edit', 'DELETE /:id': 'channels.edit',
  },
  projects: {
    'GET /shortcuts/catalog': 'projects.view', 'GET /types': 'projects.view', 'GET /sociedades': 'projects.view',
    'GET /': 'projects.view', 'GET /:id': 'projects.view', 'GET /:id/ultimo-lead': 'projects.view',
    'GET /:id/queue-state': 'projects.view',
    'POST /sociedades': 'projects.create', 'POST /': 'projects.create',
    'PATCH /:id': 'projects.edit', 'POST /:id/regenerate-webhook-key': 'projects.edit',
    'POST /:id/logo': 'projects.personalizar', 'DELETE /:id/logo': 'projects.personalizar',
    'PUT /:id/shortcuts': 'projects.personalizar',
  },
  registro: { 'GET /': 'registro.view', 'GET /fuentes': 'registro.view', 'GET /csv': 'registro.view' },
  reports: {
    'GET /overview': 'reports.view',
    ...Object.fromEntries([
      'GET /resumen-mensual', 'GET /prospectos', 'GET /ventas', 'GET /general', 'GET /general-facturacion',
      'GET /cobros-mensuales', 'GET /ventas-vendedora', 'GET /ventas-asesora', 'GET /asesoras-mes', 'GET /mi-puesto',
      'GET /panel', 'GET /seguimiento', 'GET /paises', 'GET /formaciones', 'GET /detalle', 'GET /aviso-sin-factura',
      'GET /tasa-cierre', 'GET /tasa-cierre/detalle', 'GET /resumen-del-dia',
    ].map((r) => [r, 'reports.mis_informes'])),
  },
  'reports-ia': {
    'GET /:projectId': 'reports_ia.view', 'GET /detail/:id': 'reports_ia.view',
    'POST /:projectId/generate': 'reports_ia.generar', 'POST /:id/export-pdf': 'reports_ia.generar',
  },
  sales: {
    'POST /': 'ventas.registrar',
    'GET /resumen': 'ventas.view_equipo', 'GET /por-asesora': 'ventas.view_equipo', 'GET /gestores-stats': 'ventas.view_equipo',
    'GET /por-cliente': 'ventas.view', 'GET /top-products': 'ventas.view', 'GET /facturado': 'ventas.view',
    'GET /desglose': 'ventas.view', 'GET /paises': 'ventas.view', 'GET /serie': 'ventas.view', 'GET /my-stats': 'ventas.view',
    'POST /goals': 'ventas.metas', 'DELETE /goals/:id': 'ventas.metas',
  },
  status: {
    'GET /errors': 'status.view', 'GET /piezas': 'status.view', 'GET /correos': 'status.view',
    'POST /incidents': 'status.edit', 'PUT /incidents/:id': 'status.edit', 'PUT /components/:slug': 'status.edit',
    'GET /correos/vista-previa': 'status.vista_previa_correos',
  },
  'stripe-payments': {
    'GET /': 'stripe.view', 'GET /stats': 'stripe.view', 'GET /:id': 'stripe.view', 'POST /sync': 'stripe.view',
    'POST /:id/link': 'stripe.edit', 'DELETE /:id/link': 'stripe.edit', 'PATCH /:id/dispute': 'stripe.edit',
  },
  // El tablero ya pregunta a sus claves dentro del servicio (tasks.service.js · permisosDe).
  // A la puerta del módulo basta con poder ver algún tablero.
  tasks: '*tasks',
  tutores: {
    'GET /colaboraciones': ['tutores.mis_cursos', 'tutores.gestionar'], 'GET /simulacion': ['tutores.mis_cursos', 'tutores.gestionar'],
    'GET /comisiones/resumen': ['tutores.mis_cursos', 'tutores.gestionar'], 'GET /comisiones': ['tutores.mis_cursos', 'tutores.gestionar'],
    'GET /curso/:productId': ['tutores.mis_cursos', 'tutores.gestionar'],
    'GET /curso/:productId/brochure': ['tutores.mis_cursos', 'tutores.gestionar'],
    ...Object.fromEntries([
      'POST /colaboraciones', 'PATCH /colaboraciones/:id', 'DELETE /colaboraciones/:id', 'GET /ajustes',
      'POST /comisiones/calcular', 'PATCH /comisiones/:id/estado', 'GET /formaciones-sin-tutor', 'GET /pagos-sin-formacion',
      'PUT /formaciones/:productId/busqueda', 'GET /anuncios', 'GET /', 'POST /', 'PATCH /:id/cobra-desde',
      'POST /:id/reactivar', 'DELETE /:id',
    ].map((r) => [r, 'tutores.gestionar'])),
    'PATCH /ajustes': 'tutores.ajustes',
    'POST /comisiones/liquidar': 'tutores.liquidar', 'POST /comisiones/:id/revertir': 'tutores.liquidar',
    'POST /:id/contrasena': 'tutores.contrasena',
    'GET /comisiones/aviso': 'tutores.avisar', 'POST /comisiones/avisar': 'tutores.avisar',
    // La ficha: la suya, cualquier tutor; la de otro, con «gestionar» (condición).
    'GET /:id': PROPIA, 'PATCH /:id/perfil': PROPIA,
  },
  users: {
    'POST /:id/avatar': PROPIA, 'DELETE /:id/avatar': PROPIA, 'GET /:id/views': PROPIA, 'PATCH /:id/views': PROPIA,
    'GET /mis-avisos': PROPIA, 'PATCH /mis-avisos': PROPIA,
    'GET /': 'users.view', 'GET /availability': 'users.view', 'GET /:id': 'users.view',
    'GET /:id/availability-blocks': 'users.view',
    'POST /': 'users.create', 'PATCH /:id': 'users.edit', 'PATCH /:id/reactivate': 'users.edit',
    'PATCH /:id/availability': 'users.edit', 'POST /:id/availability-blocks': 'users.edit',
    'DELETE /availability-blocks/:blockId': 'users.edit',
    'DELETE /:id': 'users.delete',
    'PATCH /:id/password': 'users.contrasena',
    'GET /:id/aviso-correo': 'users.aviso_correo',
  },
  'webhook-tokens': {
    'GET /': 'webhooks.view', 'GET /:id/status': 'webhooks.view',
    'POST /': 'webhooks.create', 'PATCH /:id': 'webhooks.edit', 'POST /:id/listen': 'webhooks.edit',
    'POST /:id/listen/stop': 'webhooks.edit', 'DELETE /:id': 'webhooks.delete',
  },
  'webhooks-salientes': {
    'GET /': 'webhooks_salientes.view', 'GET /ejemplo': 'webhooks_salientes.view', 'GET /envios': 'webhooks_salientes.view',
    'GET /:id': 'webhooks_salientes.view',
    'POST /': 'webhooks_salientes.create', 'PATCH /:id': 'webhooks_salientes.edit',
    'POST /envios/:envioId/reenviar': 'webhooks_salientes.edit', 'POST /:id/prueba': 'webhooks_salientes.edit',
    'DELETE /:id': 'webhooks_salientes.delete',
  },
  whatsapp: {
    'GET /templates': 'whatsapp.plantillas', 'POST /templates': 'whatsapp.plantillas',
    'PATCH /templates/:id': 'whatsapp.plantillas', 'DELETE /templates/:id': 'whatsapp.plantillas',
    'GET /cola': 'whatsapp.cola', 'GET /usuarios': PROPIA, 'GET /sonando': PROPIA,
    'GET /forma-avisos': 'whatsapp.forma_avisos', 'DELETE /forma-avisos': 'whatsapp.forma_avisos',
    'GET /banco': ['whatsapp.usar', 'whatsapp.supervisar'], 'GET /banco/numeros': ['whatsapp.usar', 'whatsapp.supervisar'],
    ...Object.fromEntries([
      'GET /etiquetas', 'GET /chats', 'POST /chats', 'GET /chats/:id', 'GET /chats/:id/ficha', 'POST /chats/:id/enviar',
      'POST /chats/:id/adjunto', 'POST /chats/:id/historial', 'POST /chats/:id/reenviar', 'POST /chats/:id/no-escribir',
      'POST /chats/:id/etiqueta', 'POST /chats/:id/llamada', 'POST /mensajes/:id/descargar', 'PATCH /mensajes/:id',
      'GET /conexion', 'GET /sincronizacion', 'POST /reintentar-archivos', 'POST /emparejar', 'POST /desconectar',
      'GET /sin-leer', 'GET /respuesta-llamada', 'POST /respuesta-llamada',
    ].map((r) => [r, 'whatsapp.usar'])),
  },
  widget: {
    'GET /config': 'widget.view', 'PATCH /config': 'widget.edit', 'PATCH /users/:userId/phone': 'widget.edit',
  },
  woocommerce: {
    'GET /credentials': 'woocommerce.view', 'GET /mappings': 'woocommerce.view', 'GET /runs': 'woocommerce.view',
    'GET /runs/current': 'woocommerce.view', 'GET /preview': 'woocommerce.view',
    'PUT /credentials': 'woocommerce.edit', 'DELETE /credentials': 'woocommerce.edit',
    'PUT /mappings': 'woocommerce.edit', 'PUT /mapping': 'woocommerce.edit',
    'POST /runs/start': 'woocommerce.sync', 'POST /auto-discover-cpts': 'woocommerce.sync',
    'POST /scrape-preview': 'woocommerce.sync',
  },
};

/** La clave de cada acción con condición (las `PUERTAS` con `condicion`). */
export const CONDICIONES = {
  'invoices.rectificativa': 'facturas.gestionar',
  'invoices.proforma_sin_aprobacion': 'facturas.emitir',
  'conversions.emitir_al_cobrar': 'facturas.emitir',
  'certifex.imprenta': 'diplomas.imprenta',
  'leads.borrar_cualquiera': 'leads.delete_cualquiera',
  'tutores.ficha_ajena': 'tutores.gestionar',
  'tutores.correo': 'tutores.cambiar_correo',
  'users.empresas': 'users.empresas',
  'mcp.rechazar_ajenas': 'mcp.supervisar',
  'whatsapp.supervisar': 'whatsapp.supervisar',
  'whatsapp.plantillas_compartidas': 'whatsapp.plantillas_compartidas',
  'connectors.sistema': 'connectors.sistema',
  'webhooks-salientes.todas': 'webhooks_salientes.todas',
  'sales.sin_gestora': 'conversions.sin_gestora',
  'reports.puesto_ajeno': 'reports.puesto_ajeno',
};

/**
 * La clave (o claves) de una fila del inventario. `undefined` si no está asignada.
 * Si la ruta ya lleva su `puede('…')` (fase 4), manda eso: es lo que hace el código.
 */
export function claveDe(fila) {
  if (fila.tipo === 'condicion') return CONDICIONES[fila.puerta];
  const delCodigo = (fila.guardias || []).find((g) => g.tipo === 'puede');
  if (delCodigo) return delCodigo.claves.length === 1 ? delCodigo.claves[0] : delCodigo.claves;
  const delModulo = ASIGNACION[fila.modulo];
  if (fila.publica) return (typeof delModulo === 'object' && delModulo[fila.relativa]) || null;
  if (delModulo === '*tasks') return ['tasks.view_own', 'tasks.view_all'];
  return delModulo?.[fila.relativa];
}
