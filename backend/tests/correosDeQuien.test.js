import { describe, it, expect, vi, beforeEach } from 'vitest';

// Diego, 09/10: Carlos vio en Sistema › Correos un «Recordatorio vencido»
// mandado a admisiones@academiaia.ai y no supo que era de María Eugenia.

const consultas = [];
let filas = [];
vi.mock('../src/shared/config/db.js', () => ({
  getClient: vi.fn(),
  query: vi.fn(async (sql, params) => { consultas.push({ sql, params }); return { rows: filas }; }),
}));
const enviados = [];
vi.mock('../src/shared/services/brevo.service.js', () => ({
  sendEmail: vi.fn(async (o) => { enviados.push(o); return { sent: true }; }),
}));
vi.mock('../src/modules/notifications/notifications.service.js', () => ({ notifyUsers: vi.fn(async () => {}) }));
vi.mock('../src/jobs/latido.js', () => ({ vigilar: vi.fn() }));

const correos = await import('../src/modules/correos/correos.model.js');
const { processDueReminders } = await import('../src/jobs/reminderScheduler.js');

beforeEach(() => { consultas.length = 0; enviados.length = 0; filas = []; });

describe('Sistema › Correos dice de quién es cada correo', () => {
  it('la lista trae el nombre de la persona detrás de la dirección y el campus', async () => {
    filas = [{ total: 0 }];
    await correos.listar({});
    const sql = consultas[1].sql;
    expect(sql).toMatch(/AS para_quien/);
    expect(sql).toMatch(/AS de_quien/);
    expect(sql).toMatch(/AS campus/);
    // Por dirección entera, no por trozo: «ana@x.com» no puede casar con «diana@x.com».
    expect(sql).toMatch(/lower\(u\.email\) = ANY \(regexp_split_to_array/);
  });
  it('y el detalle de un correo, también', async () => {
    await correos.uno(5);
    expect(consultas[0].sql).toMatch(/AS para_quien/);
    expect(consultas[0].sql).toMatch(/AS campus/);
  });
});

describe('el correo de un recordatorio guarda su campus', () => {
  it('con projectId y por la cuenta del CRM (no cambia por dónde sale)', async () => {
    filas = [{ id: 174, lead_id: 4007, fecha_recordatorio: '2026-10-08', nota: 'Enviar la invitación a Skool',
      lead_nombre: 'Carlos Daswani', responsable_id: 12, gestor_nombre: 'M@ Eugenia',
      gestor_email: 'admisiones@academiaia.ai', project_id: 5, proyecto_nombre: 'ACADEMIA IA' }];
    await processDueReminders();
    expect(enviados).toHaveLength(1);
    expect(enviados[0].projectId).toBe(5);
    expect(enviados[0].cuenta).toBe('crm');
    expect(consultas[0].sql).toMatch(/l\.project_id/);
  });
});
