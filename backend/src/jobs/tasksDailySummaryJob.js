import { logger } from '../shared/utils/logger.js';
import { query } from '../shared/config/db.js';
import { sendEmail } from '../shared/services/brevo.service.js';
import { notifyUsers } from '../modules/notifications/notifications.service.js';

const ENABLED = String(process.env.TASKS_DAILY_SUMMARY_ENABLED || 'true').toLowerCase() === 'true';
const TICK_MS = parseInt(process.env.TASKS_DAILY_SUMMARY_TICK_MS || String(60 * 60 * 1000), 10); // Cada hora comprueba

let running = false;
let lastRunDate = null;

export async function runTasksDailySummary() {
  if (!ENABLED) return;
  const today = new Date().toISOString().slice(0, 10);
  const currentHour = new Date().getHours();

  // Se ejecuta a las 08:00 de la mañana
  if (currentHour < 8 || lastRunDate === today) {
    return;
  }

  if (running) return;
  running = true;

  try {
    logger.info('Iniciando resumen diario de tareas pendientes...');

    // Obtener usuarios con tareas pendientes (por_hacer o en_curso)
    const { rows: userTasks } = await query(`
      SELECT 
        u.id AS user_id,
        u.nombre,
        u.email,
        COUNT(t.id)::int AS total_pending,
        COUNT(t.id) FILTER (WHERE t.due_date < NOW())::int AS overdue_count
      FROM users u
      JOIN tasks t ON t.assigned_to = u.id
      WHERE u.active = true 
        AND t.archived_at IS NULL 
        AND t.status IN ('por_hacer', 'en_curso')
      GROUP BY u.id, u.nombre, u.email
      HAVING COUNT(t.id) > 0
    `);

    for (const ut of userTasks) {
      // 1. Notificación en campana
      await notifyUsers({
        targetUserIds: [ut.user_id],
        type: 'task_estado_cambiado',
        title: `Resumen de tareas: ${ut.total_pending} pendientes`,
        message: `Tienes ${ut.total_pending} tareas activas (${ut.overdue_count} vencidas). Revisa tu tablero.`,
        link_path: '/tareas',
      });

      // 2. Correo si tiene Brevo configurado
      if (ut.email) {
        try {
          await sendEmail({
            to: ut.email,
            subject: `📋 Tus tareas de hoy (${ut.total_pending} pendientes)`,
            htmlContent: `
              <h2>Hola ${ut.nombre},</h2>
              <p>Este es tu resumen diario de tareas en 360 CRM:</p>
              <ul>
                <li><strong>Total pendientes:</strong> ${ut.total_pending}</li>
                <li><strong>Tareas vencidas:</strong> ${ut.overdue_count}</li>
              </ul>
              <p><a href="${process.env.APP_URL || 'https://crm.local'}/tareas" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;">Ir a mi Tablero de Tareas</a></p>
            `,
          });
        } catch (mailErr) {
          logger.warn({ err: mailErr.message, userId: ut.user_id }, 'No se pudo enviar correo de resumen diario de tareas');
        }
      }
    }

    lastRunDate = today;
    logger.info({ usersNotified: userTasks.length }, 'Resumen diario de tareas completado');
  } catch (err) {
    logger.error({ err: err.message }, 'Error en resumen diario de tareas');
  } finally {
    running = false;
  }
}

export function startTasksDailySummaryScheduler() {
  if (!ENABLED) return;
  setInterval(runTasksDailySummary, TICK_MS);
  // Intentar una ejecución inicial tras arranque
  setTimeout(runTasksDailySummary, 5000);
}
