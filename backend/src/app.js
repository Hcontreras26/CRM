import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { logger } from './shared/utils/logger.js';
import { errorHandler } from './shared/middleware/errorHandler.js';

// Modulos — cada uno exporta { prefix, router }
import authModule from './modules/auth/index.js';
import usersModule from './modules/users/index.js';
import leadsModule from './modules/leads/index.js';
import productsModule from './modules/products/index.js';
import dossiersModule from './modules/dossiers/index.js';
import conversionsModule from './modules/conversions/index.js';
import salesModule from './modules/sales/index.js';
import whatsappModule from './modules/whatsapp/index.js';
import tutoresModule from './modules/tutores/index.js';
import consultasModule from './modules/consultas/index.js';
import notificationsModule from './modules/notifications/index.js';
import metaAdsModule from './modules/meta-ads/index.js';
import accountingModule from './modules/accounting/index.js';
import expensesModule from './modules/expenses/index.js';
import integrationsModule from './modules/integrations/index.js';
import stripePaymentsModule from './modules/stripe-payments/index.js';
import invoicesModule from './modules/invoices/index.js';
import widgetModule from './modules/widget/index.js';
import fieldDefsModule from './modules/field-definitions/index.js';
import credentialsModule from './modules/credentials/index.js';
import projectsModule from './modules/projects/index.js';
import accountsPayableModule from './modules/accounts-payable/index.js';
import productCategoriesModule from './modules/product-categories/index.js';
import commissionsModule from './modules/commissions/index.js';
import reportsModule from './modules/reports/index.js';
import matriculasModule from './modules/matriculas/index.js';
import feedbackModule from './modules/feedback/index.js';
import novedadesModule from './modules/novedades/index.js';
import emailSequencesModule from './modules/email-sequences/index.js';
import formsModule from './modules/forms/index.js';
import payrollModule from './modules/payroll/index.js';
import woocommerceModule from './modules/woocommerce/index.js';
import webhookTokensModule from './modules/webhook-tokens/index.js';
import audiencesModule from './modules/audiences/index.js';
import procesoModule from './modules/proceso/index.js';
import convocatoriasModule from './modules/convocatorias/index.js';
import iaMonitorModule from './modules/ia-monitor/index.js';
import reportsIaModule from './modules/reports-ia/index.js';
import iaAnalisisModule from './modules/ia-analisis/index.js';
import claudeChatModule from './modules/claude-chat/index.js';
import documentsModule from './modules/documents/index.js';
import emailTemplatesModule from './modules/email-templates/index.js';
import installationModule from './modules/installation/index.js';
import projectChannelsModule from './modules/project-channels/index.js';
import permissionsModule from './modules/permissions/index.js';
import connectorsModule from './modules/connectors/index.js';
import webhooksSalientesModule from './modules/webhooks-salientes/index.js';
import asignacionModule from './modules/asignacion/index.js';
import { registrarActividad } from './shared/middleware/registrarActividad.js';
import makeModule from './modules/make/index.js';
import messagesModule from './modules/messages/index.js';
import statusModule from './modules/status/index.js';
import registroModule from './modules/registro/index.js';
import wcWebhook from './modules/woocommerce/wc.webhook.js';
import actividadModule from './modules/actividad/index.js';
import cursosPendientesModule from './modules/cursos-pendientes/index.js';
import correosModule from './modules/correos/index.js';
import certifexModule from './modules/certifex/index.js';
import soporteModule from './modules/soporte/index.js';
import changeRequestsModule from './modules/change-requests/index.js';
// Los errores del navegador (ErrorBoundary) llegan al registro del servidor, como en
// CRM-ISEIE (paridad, 15/10). Público y con límite por IP.
import clientErrorsModule from './modules/client-errors/index.js';
import mcpModule from './modules/mcp/index.js';
import moodleModule from './modules/moodle/index.js';
import tasksModule from './modules/tasks/index.js';
import facturasColaboradorModule from './modules/facturas-colaborador/index.js';
import { resolveActiveModules } from './bundles/manifest.js';
import { query } from './shared/config/db.js';
import { startEmailSequenceScheduler } from './jobs/emailSequenceScheduler.js';
import { startWooCommerceSyncScheduler } from './jobs/wooCommerceSyncScheduler.js';
import { startReminderScheduler } from './jobs/reminderScheduler.js';
import { startStripePaymentsSyncScheduler } from './jobs/stripePaymentsSyncScheduler.js';
import { startDocumentOrphanScheduler } from './jobs/documentOrphanScheduler.js';
import { startGoogleAdsTokenScheduler } from './jobs/googleAdsTokenScheduler.js';
import { startMetaAdsSyncScheduler } from './jobs/metaAdsSyncScheduler.js';
import { startTutorCommissionsScheduler } from './jobs/tutorCommissionsScheduler.js';
import { startTutoresCampusScheduler } from './jobs/tutoresCampusScheduler.js';
import { startConsultasCampusScheduler } from './jobs/consultasCampusScheduler.js';
import { startConsultasAlumnosScheduler } from './jobs/consultasAlumnosScheduler.js';
import { startConsultasResumenScheduler } from './jobs/consultasResumenScheduler.js';
import { startConsultasPlazoScheduler } from './jobs/consultasPlazoScheduler.js';
import { startConsultasCargaScheduler } from './jobs/consultasCargaScheduler.js';
import { startVigilanteCatalogoScheduler } from './jobs/vigilanteCatalogoScheduler.js';
import { startLeadSinTocarScheduler } from './jobs/leadSinTocarScheduler.js';
import { startCursosPendientesScheduler } from './jobs/cursosPendientesScheduler.js';
import { startResumenDiarioScheduler } from './jobs/resumenDiarioScheduler.js';
import { startReporteSemanalScheduler } from './jobs/reporteSemanalScheduler.js';
import { startMcpRotacionScheduler } from './jobs/mcpRotacionScheduler.js';
import { startMoodleAvisosScheduler } from './jobs/moodleAvisosScheduler.js';
import { startMcpVigilanciaScheduler } from './jobs/mcpVigilanciaScheduler.js';
import { startCorreoEntranteScheduler } from './jobs/correoEntranteScheduler.js';
import { startPasoVencidoScheduler } from './jobs/pasoVencidoScheduler.js';
import { startFeedbackDia7Scheduler } from './jobs/feedbackDia7Scheduler.js';
import { startWebhooksSalientesScheduler } from './jobs/webhooksSalientesScheduler.js';
import { startAsignacionScheduler } from './jobs/asignacionScheduler.js';
import { startNovedadesScheduler } from './jobs/novedadesScheduler.js';
import { startTasksDailySummaryScheduler } from './jobs/tasksDailySummaryJob.js';
import { startTareasResumenScheduler } from './jobs/tareasResumenJob.js';
import { startFacturasColaboradorScheduler } from './jobs/facturasColaboradorJob.js';
import { tareasActivas, facturasColaboradorActivas } from './shared/config/soloEnPruebas.js';
import { porteroDelWebhook, topeDelEnvio, traducirTope } from './modules/webhook-tokens/portero.js';
import { MAX_ENVIO_BYTES } from './modules/matriculas/admision.archivos.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Detrás de Nginx (un único hop). Necesario para que express-rate-limit
// y req.ip funcionen con X-Forwarded-For sin lanzar ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set('trust proxy', 1);

// Middleware global
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true,
}));
// El webhook de WhatsApp entra por su propia puerta, mas ancha.
//
// Evolution manda la foto o el audio dentro del propio aviso, en base64, y eso
// abulta un tercio mas que el archivo. Con el tope general de 5 MB, Express
// rechazaba el aviso ENTERO con «request entity too large»: no es que llegara el
// mensaje sin la foto, es que se perdia el mensaje. Paso el 21/08/2026.
//
// Se abre solo esta ruta y no el tope general: 25 MB en todos los endpoints es
// una invitacion a tumbar el servidor mandando cuerpos enormes. Los 25 MB son
// los mismos que deja pasar Nginx, para que no se rechace en dos sitios
// distintos con dos mensajes distintos.
app.use('/api/whatsapp/webhook', express.json({ limit: '25mb' }));
// El webhook de admisión (#198): el formulario puede mandar los documentos como
// imagen en texto (DNI por las dos caras, foto, título, firma), y con 5 MB se
// perdía la solicitud entera. Solo esta ruta, con 19 MB: por debajo de los 20 MB de
// Nginx (nginx/crm.conf), para que lo que no quepa lo rechace la aplicación con su
// motivo y no Nginx con un 413 sin explicación (QA de Diego, 22/10; antes eran 25 MB).
// Antes de leerlo, el portero: el token tiene que existir (si no, se leían 19 MB
// para nada con cualquier token inventado), y el envío no pasar del tope.
app.use('/api/webhook-tokens/receive/:token', porteroDelWebhook, topeDelEnvio,
  express.json({ limit: MAX_ENVIO_BYTES }), express.urlencoded({ extended: true, limit: MAX_ENVIO_BYTES }), traducirTope);

// El aviso de WooCommerce (#14) lleva su propio parser, en bruto, para poder comprobar la firma.
app.use('/api/woocommerce/webhook', wcWebhook);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));  // Elementor envía form-encoded
app.use(cookieParser());
// Lo que hace una gestora y no guarda su autor, para «activa en los últimos 15 min» (CRM#513).
app.use(registrarActividad);

// API root
app.get('/api', (_req, res) => {
  res.json({
    success: true,
    data: {
      name: 'CRM MultiProyecto API',
      version: '1.0.0',
      status: 'online',
      endpoints: {
        health: '/api/health',
        auth: '/api/auth (login, refresh, logout, set-password, me)',
        users: '/api/users',
        leads: '/api/leads',
        products: '/api/products',
        dossiers: '/api/dossiers',
      },
    },
  });
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// Traído de CRM-ISEIE (paridad, 15/10).
// Health detallado: DB ping + estado de credenciales externas + uptime +
// memoria. NO requiere auth (operativo para monitoring externo) pero NO
// expone secretos (solo presencia/ausencia y last_test_result).
app.get('/api/health/detailed', async (_req, res) => {
  const start = Date.now();
  const checks = { timestamp: new Date().toISOString() };

  // Uptime + memoria del proceso
  checks.process = {
    uptime_seconds: Math.round(process.uptime()),
    node_version: process.version,
    memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  };

  // DB connectivity (timeout 3s)
  try {
    const { query } = await import('./shared/config/db.js');
    const r = await Promise.race([
      query('SELECT 1 AS ping, COUNT(*)::int AS user_count FROM users'),
      new Promise((_, rej) => setTimeout(() => rej(new Error('DB timeout 3s')), 3000)),
    ]);
    checks.database = { status: 'ok', user_count: r.rows[0].user_count };
  } catch (err) {
    checks.database = { status: 'fail', error: err.message };
  }

  // Credenciales externas configuradas (sin exponer valores)
  try {
    const { query } = await import('./shared/config/db.js');
    const { rows } = await query(
      `SELECT service, last_test_result, last_tested_at
         FROM api_credentials
        WHERE active = true`
    );
    checks.integrations = rows.reduce((acc, r) => {
      acc[r.service] = {
        configured: true,
        last_test: r.last_test_result || 'never',
        last_tested_at: r.last_tested_at || null,
      };
      return acc;
    }, {});
    const expected = ['brevo', 'google_ads', 'gsc', 'stripe', 'claude', 'meta'];
    for (const svc of expected) {
      if (!checks.integrations[svc]) checks.integrations[svc] = { configured: false };
    }
  } catch (err) {
    checks.integrations = { error: err.message };
  }

  // Schedulers: leemos de variables de entorno qué están activos
  checks.schedulers = {
    email_sequence: process.env.EMAIL_SEQ_DISABLED !== '1',
    document_orphan: process.env.DOC_ORPHAN_DISABLED !== '1',
    google_ads_token: process.env.GOOGLE_ADS_TOKEN_DISABLED !== '1',
    reminder: process.env.REMINDER_DISABLED !== '1',
    woocommerce_sync: process.env.WC_SYNC_DISABLED !== '1',
  };

  checks.elapsed_ms = Date.now() - start;
  const overallOk = checks.database?.status === 'ok';
  res.status(overallOk ? 200 : 503).json({ success: overallOk, data: checks });
});

// Registro automatico de modulos
// Mapeo modulo-name -> { module, name }. El nombre debe coincidir con el manifest de bundles.
const ALL_MODULES = [
  { name: 'auth', mod: authModule },
  { name: 'users', mod: usersModule },
  { name: 'leads', mod: leadsModule },
  // El proceso comercial (#87). Va en el bundle `leads` y no en `comercial`
  // porque todo lo suyo cuelga del prospecto: el paso se deriva de sus
  // interacciones y la cola del dia es su lista. El catalogo solo lo enriquece.
  { name: 'proceso', mod: procesoModule },
  { name: 'convocatorias', mod: convocatoriasModule },
  { name: 'products', mod: productsModule },
  { name: 'dossiers', mod: dossiersModule },
  { name: 'conversions', mod: conversionsModule },
  { name: 'sales', mod: salesModule },
  { name: 'whatsapp', mod: whatsappModule },
  { name: 'tutores', mod: tutoresModule },
  // Consultas de alumnos (#188): la bandeja del tutor y el panel.
  { name: 'consultas', mod: consultasModule },
  { name: 'notifications', mod: notificationsModule },
  { name: 'meta-ads', mod: metaAdsModule },
  { name: 'accounting', mod: accountingModule },
  // Egresos, su propio modulo e igual que en CRM-ISEIE (#227). Va DESPUES de
  // `accounting`: su alias /api/accounting/expenses cuelga de ese prefijo.
  { name: 'expenses', mod: expensesModule },
  { name: 'integrations', mod: integrationsModule },
  { name: 'stripe-payments', mod: stripePaymentsModule },
  { name: 'invoices', mod: invoicesModule },
  { name: 'widget', mod: widgetModule },
  { name: 'field-definitions', mod: fieldDefsModule },
  { name: 'credentials', mod: credentialsModule },
  { name: 'projects', mod: projectsModule },
  { name: 'accounts-payable', mod: accountsPayableModule },
  { name: 'product-categories', mod: productCategoriesModule },
  { name: 'commissions', mod: commissionsModule },
  { name: 'reports', mod: reportsModule },
  { name: 'matriculas', mod: matriculasModule },
  { name: 'feedback', mod: feedbackModule },
  { name: 'novedades', mod: novedadesModule },
  { name: 'email-sequences', mod: emailSequencesModule },
  { name: 'forms', mod: formsModule },
  { name: 'payroll', mod: payrollModule },
  { name: 'woocommerce', mod: woocommerceModule },
  { name: 'webhook-tokens', mod: webhookTokensModule },
  { name: 'audiences', mod: audiencesModule },
  { name: 'ia-monitor', mod: iaMonitorModule },
  { name: 'reports-ia', mod: reportsIaModule },
  { name: 'ia-analisis', mod: iaAnalisisModule },
  { name: 'claude-chat', mod: claudeChatModule },
  { name: 'documents', mod: documentsModule },
  { name: 'email-templates', mod: emailTemplatesModule },
  { name: 'project-channels', mod: projectChannelsModule },
  { name: 'permissions', mod: permissionsModule },
  { name: 'connectors', mod: connectorsModule },
  // Conexión → «Webhook de transferencias» (Diego, 15/10): avisa a fuera de
  // los cobros por transferencia o depósito bancario. Migración 206.
  { name: 'webhooks-salientes', mod: webhooksSalientesModule },
  // Conexión → «Asignación de leads» por actividad (CRM#513, 27/10/2026). Migración 230.
  { name: 'asignacion', mod: asignacionModule },
  { name: 'make', mod: makeModule },
  { name: 'messages', mod: messagesModule },
  { name: 'registro', mod: registroModule },
  // «Qué ha pasado hoy», para cada gestora con lo suyo (#13). El Registro es para admin.
  { name: 'actividad', mod: actividadModule },
  // Cursos pendientes para las tutoras, por campus (#336).
  { name: 'cursos-pendientes', mod: cursosPendientesModule },
  { name: 'correos', mod: correosModule },
  // Conexion de Claude por MCP: solo consulta, con token personal.
  { name: 'mcp', mod: mcpModule },
  { name: 'moodle', mod: moodleModule },
  { name: 'certifex', mod: certifexModule },
  // El tablero aún no está aprobado para producción: solo en local y /testeo.
  ...(tareasActivas() ? [{ name: 'tasks', mod: tasksModule }] : []),
  // Facturas de colaboradores (#202): la lista, el enlace del mes y «Mi factura».
  // Facturas de colaboradores (#202): solo en pruebas también en el servidor, como el tablero.
  ...(facturasColaboradorActivas() ? [{ name: 'facturas-colaborador', mod: facturasColaboradorModule }] : []),
  { name: 'soporte', mod: soporteModule },
];
if (!tareasActivas()) logger.info('Modulo SKIP (solo en pruebas): /api/tasks');
if (!facturasColaboradorActivas()) logger.info('Modulo SKIP (solo en pruebas): /api/facturas-colaborador');

// Módulos siempre activos (fuera del sistema de bundles)
app.use(installationModule.prefix, installationModule.router);
logger.info(`Modulo registrado: ${installationModule.prefix} (siempre activo)`);
app.use(statusModule.prefix, statusModule.router);
logger.info(`Modulo registrado: ${statusModule.prefix} (siempre activo, incluye rutas publicas)`);
app.use(changeRequestsModule.prefix, changeRequestsModule.router);
logger.info(`Modulo registrado: ${changeRequestsModule.prefix} (siempre activo)`);
app.use(clientErrorsModule.prefix, clientErrorsModule.router);
logger.info(`Modulo registrado: ${clientErrorsModule.prefix} (siempre activo, sin sesion)`);

async function loadActiveBundles() {
  try {
    const { rows } = await query(`SELECT active_bundles FROM installation_bundles WHERE id = 1`);
    return rows[0]?.active_bundles || [];
  } catch (err) {
    logger.warn({ err: err.message }, 'No se pudo leer installation_bundles, registrando todos los modulos');
    return null;  // null = registrar todos (compat)
  }
}

const activeBundles = await loadActiveBundles();
const allowedModuleNames = activeBundles ? resolveActiveModules(activeBundles) : null;

for (const { name, mod } of ALL_MODULES) {
  if (allowedModuleNames && !allowedModuleNames.has(name)) {
    logger.info(`Modulo SKIP (bundle inactivo): ${mod.prefix}`);
    continue;
  }
  app.use(mod.prefix, mod.router);
  logger.info(`Modulo registrado: ${mod.prefix}`);
  // Nombres viejos que se siguen atendiendo. Al pasar las rutas al castellano
  // hubo pantallas pidiendo a direcciones que ya no existian; el alias evita
  // que vuelva a pasar mientras quede algo apuntando al nombre anterior.
  //
  // El `concat` NO es adorno: unos modulos declaran `alias` como cadena
  // ('/api/sales') y otros como lista (['/api/messages']). Recorrer una CADENA
  // con for...of da sus LETRAS, y la primera es '/', asi que el router de ese
  // modulo acababa montado en la raiz y se tragaba la API entera: el webhook de
  // Make paso a contestar 401 y los formularios dejaron de entrar. 04/09.
  for (const viejo of [].concat(mod.alias || [])) {
    app.use(viejo, mod.router);
    logger.info(`Modulo registrado (alias): ${viejo} -> ${mod.prefix}`);
  }
  // Algunos módulos exponen además rutas públicas (sin JWT) — registrarlas aparte
  if (mod.publicMount) {
    app.use(mod.publicMount.prefix, mod.publicMount.router);
    logger.info(`Modulo registrado (public): ${mod.publicMount.prefix}`);
  }
}

// Error handler (debe ir ultimo)
app.use(errorHandler);

/**
 * Vuelve a encolar los adjuntos que se quedaron a medias.
 *
 * La cola de descarga vive en memoria, asi que un reinicio la vacia. Habia un
 * boton para recuperarla, pero esperar a que una gestora lo pulse es esperar
 * sentado: lo que ve es que las fotos no llegan, no que hay una cola muerta.
 *
 * Se hace por sesion, porque para descifrar un adjunto hace falta el socket de
 * la sesion que lo recibio. Y con un retraso: al arrancar, Evolution todavia
 * esta levantando las suyas, y pedirle archivos antes de tiempo es tirar
 * peticiones que van a fallar.
 */
async function recuperarAdjuntosDeWhatsapp() {
  setTimeout(async () => {
    try {
      const { query } = await import('./shared/config/db.js');
      const media = await import('./modules/whatsapp/media.service.js');
      const { rows } = await query(
        `SELECT DISTINCT c.instancia
           FROM wa_mensajes m
           JOIN wa_conversaciones c ON c.id = m.conversacion_id
          WHERE m.media_url IS NULL
            AND m.tipo NOT IN ('texto', 'otro')
            AND m.wa_id IS NOT NULL`
      );
      let total = 0;
      for (const { instancia } of rows) total += await media.reencolarPendientes(instancia);
      if (total) logger.info({ sesiones: rows.length, archivos: total }, 'WhatsApp: adjuntos pendientes recuperados tras el arranque');
    } catch (err) {
      // Que no se pueda recuperar no puede impedir arrancar: el boton de
      // reintentar sigue estando para hacerlo a mano.
      logger.warn({ err: err.message }, 'WhatsApp: no se pudieron recuperar los adjuntos pendientes');
    }
  }, 45_000).unref();
}

// ── La red de seguridad del proceso ──────────────────────────────────────────
//
// No habia ninguna, y eso significa que UN fallo asincrono sin capturar en
// cualquier rincon tumba la API entera. Paso el 21/08/2026: un parpadeo de
// Postgres, el cron de Stripe lanzo dentro de su `setTimeout` —tenia
// `try/finally` pero no `catch`— y se llevo por delante el CRM completo.
//
// Y en WhatsApp eso duele el doble, porque la cola de descarga de adjuntos vive
// en memoria: al reiniciar, los archivos del historial que estaban en cola se
// quedan sin bajar y la gestora ve «⬇ Descargar» para siempre. Eso es lo que se
// veia como «la sincronizacion va fatal».
//
// Una promesa rota no puede tirar el servidor: se apunta y se sigue sirviendo.
// Una excepcion sincrona sin capturar SI se sale, porque ahi el proceso puede
// haber quedado a medias — pero por la puerta, dando tiempo a cerrar, y PM2 lo
// levanta. Al arrancar se recupera la cola, asi que reiniciar ya no pierde nada.
process.on('unhandledRejection', (motivo) => {
  logger.error(
    { err: motivo instanceof Error ? motivo.message : String(motivo),
      stack: motivo instanceof Error ? motivo.stack : undefined },
    'Promesa rechazada sin capturar — se sigue sirviendo'
  );
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'Excepcion sin capturar — se cierra');
  // Un margen para que el registro salga antes de irse.
  setTimeout(() => process.exit(1), 500).unref();
});

// Solo escuchar si no estamos en tests
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`CRM API corriendo en puerto ${PORT}`);
    startEmailSequenceScheduler();
    startWooCommerceSyncScheduler();
    startReminderScheduler();
    startStripePaymentsSyncScheduler();
    startDocumentOrphanScheduler();
    startGoogleAdsTokenScheduler();
    startMetaAdsSyncScheduler();
    startTutorCommissionsScheduler();
    startTutoresCampusScheduler();
    startConsultasCampusScheduler();
    startConsultasAlumnosScheduler();
    startConsultasResumenScheduler();
    startConsultasPlazoScheduler();
    startConsultasCargaScheduler();
    startVigilanteCatalogoScheduler();
    startLeadSinTocarScheduler();
    startCursosPendientesScheduler();
    startPasoVencidoScheduler();
    startFeedbackDia7Scheduler();
    startNovedadesScheduler();
    startResumenDiarioScheduler();
    startReporteSemanalScheduler();
    startMcpRotacionScheduler();
    startMoodleAvisosScheduler();
    startMcpVigilanciaScheduler();
    startCorreoEntranteScheduler();
    startWebhooksSalientesScheduler();
    startAsignacionScheduler();
    if (tareasActivas()) startTasksDailySummaryScheduler();
    // El resumen de la tarde y los correos de cambio de estado (26/10/2026).
    if (tareasActivas()) startTareasResumenScheduler();
    if (facturasColaboradorActivas()) startFacturasColaboradorScheduler();
    recuperarAdjuntosDeWhatsapp();
  });
}

export default app;
