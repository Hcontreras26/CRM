import { describe, it, expect } from 'vitest';
import {
  armarCambiosDeTarea, diaEnOficina, dueInfo, fromDateInput, neighboursAt, puedeEditarTarea, toDateInput,
} from './taskUi';

// Las funciones puras del tablero. `neighboursAt` es la que decide el orden al
// arrastrar: si se equivoca, la tarjeta cae donde no se soltó.

const col = (...ids: number[]) => ids.map((id) => ({ id }));

describe('neighboursAt: entre qué dos tarjetas cae la que se suelta', () => {
  it('en una columna vacía no hay vecinas', () => {
    expect(neighboursAt([], 0, 9)).toEqual({ prev_id: null, next_id: null });
  });

  it('al principio: solo la de después', () => {
    expect(neighboursAt(col(1, 2, 3), 0, 9)).toEqual({ prev_id: null, next_id: 1 });
  });

  it('al final: solo la de antes', () => {
    expect(neighboursAt(col(1, 2, 3), 3, 9)).toEqual({ prev_id: 3, next_id: null });
  });

  it('en medio, viniendo de otra columna', () => {
    expect(neighboursAt(col(1, 2, 3), 2, 9)).toEqual({ prev_id: 2, next_id: 3 });
  });

  it('soltarla justo donde estaba (encima o debajo de sí misma) no hace nada', () => {
    expect(neighboursAt(col(1, 2, 3), 1, 2)).toBeNull();
    expect(neighboursAt(col(1, 2, 3), 2, 2)).toBeNull();
  });

  it('bajarla dentro de su columna: la propia tarjeta no cuenta como vecina', () => {
    // [1, 2, 3, 4], se coge la 1 y se suelta entre la 3 y la 4 (índice 3).
    expect(neighboursAt(col(1, 2, 3, 4), 3, 1)).toEqual({ prev_id: 3, next_id: 4 });
  });

  it('subirla dentro de su columna', () => {
    // [1, 2, 3, 4], se coge la 4 y se suelta entre la 1 y la 2 (índice 1).
    expect(neighboursAt(col(1, 2, 3, 4), 1, 4)).toEqual({ prev_id: 1, next_id: 2 });
  });

  it('llevarla al final de su propia columna', () => {
    expect(neighboursAt(col(1, 2, 3), 3, 1)).toEqual({ prev_id: 3, next_id: null });
  });
});

describe('dueInfo: cómo se dice el vencimiento', () => {
  // Un mediodía fijo de Madrid (UTC+2 en octubre): así «hoy» no depende de
  // cuándo ni desde dónde se pasen las pruebas.
  const ahora = new Date('2026-10-07T10:00:00Z');
  const dia = (d: number, h = 18) => new Date(Date.UTC(2026, 9, d, h - 2, 0, 0)).toISOString();

  it('sin fecha, nada', () => {
    expect(dueInfo({ due_date: null, status: 'por_hacer' }, ahora)).toBeNull();
  });

  it('ayer: vencida, en rojo', () => {
    const r = dueInfo({ due_date: dia(6), status: 'en_curso' }, ahora);
    expect(r?.label).toMatch(/^Vencida · /);
    expect(r?.classes).toContain('destructive');
  });

  it('hoy, aunque sea a última hora: vence hoy', () => {
    const r = dueInfo({ due_date: dia(7, 23), status: 'en_curso' }, ahora);
    expect(r?.label).toBe('Vence hoy');
    expect(r?.classes).toContain('warning');
  });

  it('mañana', () => {
    expect(dueInfo({ due_date: dia(8), status: 'por_hacer' }, ahora)?.label).toBe('Mañana');
  });

  it('más adelante: la fecha', () => {
    expect(dueInfo({ due_date: dia(20), status: 'por_hacer' }, ahora)?.label).toMatch(/20/);
  });

  it('una tarea hecha nunca sale como vencida', () => {
    const r = dueInfo({ due_date: dia(1), status: 'hecha' }, ahora);
    expect(r?.label).not.toMatch(/Vencida/);
    expect(r?.classes).toContain('muted');
  });
});

describe('fromDateInput / toDateInput: la fecha del formulario', () => {
  it('vacío es sin fecha', () => {
    expect(fromDateInput('')).toBeNull();
    expect(toDateInput(null)).toBe('');
  });

  it('vence a las 23:59 de Madrid del día elegido, con horario de verano o sin él', () => {
    expect(fromDateInput('2026-10-14')).toBe('2026-10-14T21:59:00.000Z'); // verano, UTC+2
    expect(fromDateInput('2026-12-31')).toBe('2026-12-31T22:59:00.000Z'); // invierno, UTC+1
    // Los dos días de cambio de hora.
    expect(fromDateInput('2026-03-29')).toBe('2026-03-29T21:59:00.000Z');
    expect(fromDateInput('2026-10-25')).toBe('2026-10-25T22:59:00.000Z');
  });

  it('ida y vuelta: el formulario enseña el mismo día que se eligió', () => {
    for (const dia of ['2026-01-01', '2026-03-29', '2026-10-14', '2026-10-25', '2026-12-31']) {
      expect(toDateInput(fromDateInput(dia))).toBe(dia);
    }
  });

  it('el día es el de la oficina: el 14/10 a las 23:59 de Madrid es el 14/10 (en Caracas ya era el 15 en Madrid)', () => {
    expect(diaEnOficina('2026-10-14T21:59:00.000Z')).toBe('2026-10-14');
    // Lo que guardaba antes la ficha desde Caracas (23:59 de allí):
    expect(diaEnOficina('2026-10-15T03:59:00.000Z')).toBe('2026-10-15');
  });
});

describe('armarCambiosDeTarea: lo que manda la ficha al guardar (QA de Diego 08/10 y WhatsApp 09/10)', () => {
  const actual = { title: 'Título', priority: 'media', due_date: '2026-10-14T21:59:00.000Z', area_id: null, assigned_to: 3 };
  const base = { title: 'Título', priority: 'media', due_date: '2026-10-14T21:59:00.000Z', area_id: null };
  const sin = { estadoAntes: 'por_hacer' as const, estadoNuevo: 'por_hacer' as const };

  it('si cambia el estado, pide moverla, y el estado nunca va en el PATCH', () => {
    const r = armarCambiosDeTarea({ base, actual, estadoAntes: 'en_curso', estadoNuevo: 'en_revision', canAssign: true, assignedTo: 3 });
    expect(r.mover).toBe('en_revision');
    expect(r.actualizar).not.toHaveProperty('status');
  });

  it('si no cambia el estado, no la mueve', () => {
    expect(armarCambiosDeTarea({ base, actual, estadoAntes: 'en_curso', estadoNuevo: 'en_curso', canAssign: true, assignedTo: 3 }).mover)
      .toBeNull();
  });

  it('solo manda lo que cambia: sin cambios, nada', () => {
    expect(armarCambiosDeTarea({ base, actual, ...sin, canAssign: true, assignedTo: 3 }).actualizar).toEqual({});
    expect(armarCambiosDeTarea({ base: { ...base, title: 'Otro' }, actual, ...sin, canAssign: true, assignedTo: 3 }).actualizar)
      .toEqual({ title: 'Otro' });
  });

  it('la misma fecha a otra hora no es un cambio (se compara el día)', () => {
    const r = armarCambiosDeTarea({ base: { ...base, due_date: '2026-10-14T08:00:00.000Z' }, actual, ...sin, canAssign: false, assignedTo: 3 });
    expect(r.actualizar).toEqual({});
  });

  it('el admin reasigna: solo va assigned_to', () => {
    expect(armarCambiosDeTarea({ base, actual, ...sin, canAssign: true, assignedTo: 9 }).actualizar).toEqual({ assigned_to: 9 });
  });

  it('sin «Asignar» nunca manda assigned_to (el servidor daría 403)', () => {
    expect(armarCambiosDeTarea({ base, actual, ...sin, canAssign: false, assignedTo: 9 }).actualizar).toEqual({});
  });
});

describe('puedeEditarTarea: el admin y la persona asignada (Diego, 08/10 y WhatsApp 09/10)', () => {
  const tarea = { assigned_to: 7, created_by: 5 };
  it('la persona asignada con «Editar»', () => {
    expect(puedeEditarTarea(tarea, 7, { edit: true, viewAll: false })).toBe(true);
  });
  it('el admin («Editar» + «Ver todo»), aunque no la lleve', () => {
    expect(puedeEditarTarea(tarea, 1, { edit: true, viewAll: true })).toBe(true);
  });
  it('quien solo la creó, u otra persona del equipo: no', () => {
    expect(puedeEditarTarea(tarea, 5, { edit: true, viewAll: false })).toBe(false);
    expect(puedeEditarTarea(tarea, 9, { edit: true, viewAll: false })).toBe(false);
  });
  it('sin nadie asignado, quien la creó', () => {
    expect(puedeEditarTarea({ assigned_to: null, created_by: 5 }, 5, { edit: true, viewAll: false })).toBe(true);
  });
  it('sin «Editar», nadie, ni la persona asignada', () => {
    expect(puedeEditarTarea(tarea, 7, { edit: false, viewAll: true })).toBe(false);
  });
});
