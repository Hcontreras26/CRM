import { Router } from 'express';
import { verifyToken, roleGuard } from '../../shared/middleware/auth.js';
import * as leadController from './lead.controller.js';
import * as leadEmailsController from './lead-emails.controller.js';
import * as spamReportController from './spam-report.controller.js';

const router = Router();

// ============================================================
// WEBHOOK (publico, autenticado por X-API-Key header)
// ============================================================
router.post('/webhooks/:slug', leadController.webhook);

// ============================================================
// RUTAS PROTEGIDAS
// ============================================================
router.use(verifyToken);

// Listado y detalle
router.get('/', leadController.list);
router.get('/export/wasapi', leadController.exportWasapi);
router.get('/stats', leadController.stats);
// Antes de `/:id`, que si no se la come el comodin.
router.get('/quick-counts', leadController.quickCounts);
router.get('/revision', leadController.progresoRevision);
router.get('/today', leadController.today);
// Lookup público para gestores: devuelve metadata mínima de leads con el
// email indicado, ignorando el RBAC de listado normal. Para que un gestor
// pueda detectar duplicados de leads que pertenecen a otra asesora.
router.get('/lookup-by-email', leadController.lookupByEmail);

// Check duplicado antes de crear (manual).
router.post('/check-duplicate', leadController.checkDuplicate);

// Spam reports: rutas estáticas ANTES de /:id para que no las absorba
router.get('/spam-reports', roleGuard('superadmin'), spamReportController.listPending);
router.get('/spam-reports/count', roleGuard('superadmin'), spamReportController.countPending);
router.patch('/spam-reports/:reportId', roleGuard('superadmin'), spamReportController.resolveReport);

// #13 Cola de revisión de duplicados — admin/superadmin
router.get('/review-queue',              roleGuard('admin', 'superadmin'), leadController.listReviewQueue);
// #102 - Repaso de duplicados sobre lo que YA hay guardado. Va antes de
// '/:id' o Express se lo come como si 'duplicados' fuera un identificador.
router.get('/duplicados',                roleGuard('admin', 'superadmin'), leadController.listDuplicateGroups);
router.post('/review-queue/:id/decide',  roleGuard('admin', 'superadmin'), leadController.decideReviewQueue);

// #18 Multi-cursos por lead
router.get('/:id/products',              leadController.listLeadProducts);
router.post('/:id/products',             leadController.addLeadProduct);
router.patch('/:id/products/:lpId',      leadController.updateLeadProduct);
router.delete('/:id/products/:lpId',     leadController.removeLeadProduct);

router.get('/:id', leadController.getById);
router.post('/:id/merge', leadController.mergeLeads);
// El repaso de fin de mes (#132). Sin roleGuard: cada quien revisa lo suyo, y
// eso lo comprueba el controller contra el responsable de la ficha.
router.post('/:id/revisar', leadController.revisar);

// Creacion manual (formulario interno)
router.post('/', leadController.createManual);

// Import CSV (bulk)
router.post('/bulk', leadController.bulkCreate);

// Edicion general del lead
router.patch('/:id', leadController.update);

// Operaciones sobre lead
router.patch('/:id/status', leadController.changeStatus);
router.post('/:id/interactions', leadController.addInteraction);
router.patch('/:id/interactions/:interactionId', leadController.updateInteraction);
router.delete('/:id/interactions/:interactionId', leadController.deleteInteraction);
router.post('/:id/reminders', leadController.addReminder);
router.patch('/reminders/:reminderId/complete', leadController.completeReminder);

// Secuencias de email del lead (para popup de detalle)
router.get('/:id/sequences', leadController.getLeadSequences);

// Historial de compra del email del lead (cross-sell / propuesto)
router.get('/:id/purchase-history', leadController.getPurchaseHistory);

// Envío manual de email + historial (CRM-231)
router.post('/:id/send-email', leadEmailsController.sendLeadEmail);
router.get('/:id/emails', leadEmailsController.listLeadEmails);

// Reasignar (solo admin/superadmin)
router.patch('/:id/reassign', roleGuard('admin', 'superadmin'), leadController.reassign);

// #15: solo admin/superadmin reporta spam (antes era cualquier autenticado).
router.post('/:id/report-spam', roleGuard('admin', 'superadmin'), spamReportController.reportSpam);

// #15: admin y superadmin pueden eliminar (soft-delete). Restore solo superadmin.
router.delete('/:id', roleGuard('admin', 'superadmin'), leadController.softDelete);
router.patch('/:id/restore', roleGuard('superadmin'), leadController.restore);

// Asignar pendientes: re-aplica round-robin a leads con responsable_id IS NULL.
// Útil cuando llegan leads sin gestores activos y luego se activan.
router.post('/reassign-pending', roleGuard('admin', 'superadmin'), leadController.reassignPending);

export default router;
