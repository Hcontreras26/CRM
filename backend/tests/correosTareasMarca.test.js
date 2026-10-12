import { describe, it, expect, vi, beforeEach } from 'vitest';

// Diego, 12/10, viendo «CRM PRUEBAS <noresponder@360crm.tech>» y la cabecera «CRM» en el
// correo de una tarea de ISEIH: «no sería mejor que sea tipo no responder ISEIH, y sea
// desde el branding». Los correos del tablero llevan la marca del campus de la tarea.

const enviados = [];
vi.mock('../src/shared/services/brevo.service.js', () => ({
  sendEmail: vi.fn(async (args) => { enviados.push(args); return { sent: true }; }),
}));
vi.mock('../src/shared/config/db.js', () => ({
  query: vi.fn(async (sql, p) => (/FROM projects WHERE id = \$1/.test(sql) && p[0] === 1
    ? { rows: [{ id: 1, nombre: 'ISEIH', slug: 'iseih', logo_url: null, emoji: null }] }
    : { rows: [] })),
}));

const E = await import('../src/modules/tasks/tasks.emails.js');
const persona = { id: 3, nombre: 'Diego', email: 'diego@ejemplo.com' };
const quien = { nombre: 'Admin Principal' };

beforeEach(() => { enviados.length = 0; process.env.TAREAS_CORREOS_ACTIVOS = 'true'; });

describe('el correo de una tarea va con la marca de su campus', () => {
  it('asignada: cabecera con el logo y el nombre del campus, y sale por su cuenta con su nombre', async () => {
    await E.enviarCorreoAsignada({ persona, quien, tarea: { id: 65, title: 'Revisar diplomas', priority: 'alta', project_id: 1, project_name: 'ISEIH' } });
    const c = enviados[0];
    expect(c.projectId).toBe(1);
    expect(c.fromName).toBe('ISEIH');
    expect(c.htmlContent).toMatch(/CRM de ISEIH/);
    expect(c.htmlContent).toMatch(/\/projects\/iseih\.webp/);
  });
  it('devuelta, cerrada y comentario, igual', async () => {
    const tarea = { id: 66, title: 'T', priority: 'media', project_id: 1 };
    await E.enviarCorreoDevuelta({ persona, quien, tarea, comentario: 'Falta el H1' });
    await E.enviarCorreoCerrada({ persona, quien, tarea });
    await E.enviarCorreoComentario({ persona, quien, tarea, comentario: 'Hola', commentId: 9 });
    expect(enviados.map((c) => [c.projectId, c.fromName])).toEqual([[1, 'ISEIH'], [1, 'ISEIH'], [1, 'ISEIH']]);
    expect(enviados.every((c) => /CRM de ISEIH/.test(c.htmlContent))).toBe(true);
  });
  it('sin campus (o de un proyecto propio), la del CRM', async () => {
    await E.enviarCorreoAsignada({ persona, quien, tarea: { id: 67, title: 'Opynio', priority: 'baja', project_id: null, external_project_id: 2 } });
    expect(enviados[0].projectId).toBeNull();
    expect(enviados[0].fromName).toBeUndefined();
  });
  it('con los correos apagados no sale nada', async () => {
    process.env.TAREAS_CORREOS_ACTIVOS = '';
    const r = await E.enviarCorreoAsignada({ persona, quien, tarea: { id: 68, title: 'X', priority: 'baja', project_id: 1 } });
    expect(r.simulated).toBe(true);
    expect(enviados).toHaveLength(0);
  });
});
