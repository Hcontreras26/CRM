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
import notificationsModule from './modules/notifications/index.js';
import metaAdsModule from './modules/meta-ads/index.js';
import accountingModule from './modules/accounting/index.js';
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
import claudeChatModule from './modules/claude-chat/index.js';
import documentsModule from './modules/documents/index.js';
import emailTemplatesModule from './modules/email-templates/index.js';
import installationModule from './modules/installation/index.js';
import projectChannelsModule from './modules/project-channels/index.js';
import permissionsModule from './modules/permissions/index.js';
import connectorsModule from './modules/connectors/index.js';
import makeModule from './modules/make/index.js';
import messagesModule from './modules/messages/index.js';
import statusModule from './modules/status/index.js';
import registroModule from './modules/registro/index.js';
import correosModule from './modules/correos/index.js';
import certifexModule from './modules/certifex/index.js';
import changeRequestsModule from './modules/change-requests/index.js';
import mcpModule from './modules/mcp/index.js';
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
import { startVigilanteCatalogoScheduler } from './jobs/vigilanteCatalogoScheduler.js';
import { startLeadSinTocarScheduler } from './jobs/leadSinTocarScheduler.js';
import { startResumenDiarioScheduler } from './jobs/resumenDiarioScheduler.js';
import { startReporteSemanalScheduler } from './jobs/reporteSemanalScheduler.js';
import { startMcpRotacionScheduler } from './jobs/mcpRotacionScheduler.js';
import { startCorreoEntranteScheduler } from './jobs/correoEntranteScheduler.js';
import { startPasoVencidoScheduler } from './jobs/pasoVencidoScheduler.js';
import { startFeedbackDia7Scheduler } from './jobs/feedbackDia7Scheduler.js';
import { startNovedadesScheduler } from './jobs/novedadesScheduler.js';

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

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));  // Elementor envía form-encoded
app.use(cookieParser());

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
  { name: 'notifications', mod: notificationsModule },
  { name: 'meta-ads', mod: metaAdsModule },
  { name: 'accounting', mod: accountingModule },
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
  { name: 'claude-chat', mod: claudeChatModule },
  { name: 'documents', mod: documentsModule },
  { name: 'email-templates', mod: emailTemplatesModule },
  { name: 'project-channels', mod: projectChannelsModule },
  { name: 'permissions', mod: permissionsModule },
  { name: 'connectors', mod: connectorsModule },
  { name: 'make', mod: makeModule },
  { name: 'messages', mod: messagesModule },
  { name: 'registro', mod: registroModule },
  { name: 'correos', mod: correosModule },
  // Conexion de Claude por MCP: solo consulta, con token personal.
  { name: 'mcp', mod: mcpModule },
  { name: 'certifex', mod: certifexModule },
];

// Módulos siempre activos (fuera del sistema de bundles)
app.use(installationModule.prefix, installationModule.router);
logger.info(`Modulo registrado: ${installationModule.prefix} (siempre activo)`);
app.use(statusModule.prefix, statusModule.router);
logger.info(`Modulo registrado: ${statusModule.prefix} (siempre activo, incluye rutas publicas)`);
app.use(changeRequestsModule.prefix, changeRequestsModule.router);
logger.info(`Modulo registrado: ${changeRequestsModule.prefix} (siempre activo)`);

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
    startVigilanteCatalogoScheduler();
    startLeadSinTocarScheduler();
    startPasoVencidoScheduler();
    startFeedbackDia7Scheduler();
    startNovedadesScheduler();
    startResumenDiarioScheduler();
    startReporteSemanalScheduler();
    startMcpRotacionScheduler();
  startCorreoEntranteScheduler();
    recuperarAdjuntosDeWhatsapp();
  });
}

export default app;
