import { describe, it, expect } from 'vitest';
import {
  createTaskSchema,
  listTasksQuerySchema,
  isValidIsoDate,
  isValidIsoDay,
} from '../src/modules/tasks/tasks.validation.js';
import {
  armarCorreoAsignada,
  armarCorreoDevuelta,
  armarCorreoCerrada,
  armarCorreoComentario,
  armarCorreoDelDia,
  correosActivos,
} from '../src/modules/tasks/tasks.emails.js';

describe('Validación estricta de fechas en tareas (Bloque A)', () => {
  it('isValidIsoDate valida correctamente fechas y rechaza días inexistentes o texto inválido', () => {
    // Casos válidos
    expect(isValidIsoDate('2026-10-31')).toBe(true);
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2026-10-07T12:00:00Z')).toBe(true);

    // Casos que daban error 500 y deben dar false (400)
    expect(isValidIsoDate('1')).toBe(false);
    expect(isValidIsoDate('hola 2026')).toBe(false);
    expect(isValidIsoDate('2026-02-31')).toBe(false);
    expect(isValidIsoDate('2026-04-31')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });

  it('createTaskSchema rechaza due_date inválido como 2026-02-31, 1, hola 2026', () => {
    const r1 = createTaskSchema.safeParse({ title: 'T1', due_date: '2026-02-31' });
    expect(r1.success).toBe(false);

    const r2 = createTaskSchema.safeParse({ title: 'T1', due_date: '1' });
    expect(r2.success).toBe(false);

    const r3 = createTaskSchema.safeParse({ title: 'T1', due_date: 'hola 2026' });
    expect(r3.success).toBe(false);

    const rValida = createTaskSchema.safeParse({ title: 'T1', due_date: '2026-10-07T10:00:00Z' });
    expect(rValida.success).toBe(true);
  });

  it('listTasksQuerySchema rechaza parámetros desde/hasta con fechas inexistentes', () => {
    const r1 = listTasksQuerySchema.safeParse({ desde: '2026-02-31' });
    expect(r1.success).toBe(false);

    const r2 = listTasksQuerySchema.safeParse({ hasta: 'invalida' });
    expect(r2.success).toBe(false);

    const rValida = listTasksQuerySchema.safeParse({ desde: '2026-10-01', hasta: '2026-10-31' });
    expect(rValida.success).toBe(true);
  });

  it('createTaskSchema no permite project_id y external_project_id a la vez', () => {
    const r = createTaskSchema.safeParse({
      title: 'T1',
      project_id: 1,
      external_project_id: 2,
    });
    expect(r.success).toBe(false);
  });
});

describe('Plantillas de correo y toggle TAREAS_CORREOS_ACTIVOS (Bloque C)', () => {
  it('arma correctamente el correo de tarea devuelta', () => {
    const c = armarCorreoDevuelta({
      persona: { nombre: 'QA Colaborador', email: 'colaborador@local.test' },
      tarea: { id: 10, title: 'Revisión técnica' },
      quien: { nombre: 'QA Admin' },
      comentario: 'Falta añadir los enlaces de documentación.',
    });
    expect(c.asunto).toContain('Tarea devuelta');
    expect(c.htmlContent).toContain('Falta añadir los enlaces de documentación.');
    expect(c.htmlContent).toContain('QA Colaborador');
  });

  it('arma correctamente el correo de tarea cerrada', () => {
    const c = armarCorreoCerrada({
      persona: { nombre: 'QA Colaborador', email: 'colaborador@local.test' },
      tarea: { id: 10, title: 'Revisión técnica' },
      quien: { nombre: 'QA Admin' },
    });
    expect(c.asunto).toContain('Tarea completada');
    expect(c.htmlContent).toContain('marcado «Revisión técnica» como Hecha');
  });

  it('arma correctamente el correo de nuevo comentario', () => {
    const c = armarCorreoComentario({
      persona: { nombre: 'QA Colaborador', email: 'colaborador@local.test' },
      tarea: { id: 10, title: 'Revisión técnica' },
      quien: { nombre: 'QA Admin' },
      comentario: 'Buen avance en este paso.',
    });
    expect(c.asunto).toContain('Comentario en');
    expect(c.htmlContent).toContain('Buen avance en este paso.');
  });
});
