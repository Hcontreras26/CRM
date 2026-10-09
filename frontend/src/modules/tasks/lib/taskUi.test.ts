import { describe, it, expect } from 'vitest';
import {
  armarCambiosDeTarea, dueInfo, fromDateInput, neighboursAt, puedeEditarTarea, toDateInput,
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
  // Un mediodía fijo: así «hoy» no depende de cuándo se pasen las pruebas.
  const ahora = new Date(2026, 9, 7, 12, 0, 0);
  const dia = (d: number, h = 18) => new Date(2026, 9, d, h, 0, 0).toISOString();

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

  it('vence al final del día elegido, en hora local', () => {
    const iso = fromDateInput('2026-10-31')!;
    const d = new Date(iso);
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 31, 23, 59]);
  });

  it('ida y vuelta: el formulario enseña el mismo día que se eligió', () => {
    for (const dia of ['2026-01-01', '2026-03-29', '2026-10-25', '2026-12-31']) {
      expect(toDateInput(fromDateInput(dia))).toBe(dia);
    }
  });
});

describe('armarCambiosDeTarea: lo que manda la ficha al guardar (QA de Diego, 08/10)', () => {
  const base = { title: 'Título', priority: 'media' as const };

  it('si cambia el estado, pide moverla, y el estado nunca va en el PATCH', () => {
    const r = armarCambiosDeTarea({ base, estadoAntes: 'en_curso', estadoNuevo: 'en_revision', canAssign: true, assignedTo: 3 });
    expect(r.mover).toBe('en_revision');
    expect(r.actualizar).not.toHaveProperty('status');
  });

  it('si no cambia el estado, no la mueve', () => {
    expect(armarCambiosDeTarea({ base, estadoAntes: 'en_curso', estadoNuevo: 'en_curso', canAssign: true, assignedTo: 3 }).mover)
      .toBeNull();
  });

  it('sin «Asignar» no manda assigned_to (el servidor daría 403)', () => {
    const r = armarCambiosDeTarea({ base, estadoAntes: 'por_hacer', estadoNuevo: 'por_hacer', canAssign: false, assignedTo: 3 });
    expect(r.actualizar).toEqual(base);
  });

  it('con «Asignar», sí', () => {
    const r = armarCambiosDeTarea({ base, estadoAntes: 'por_hacer', estadoNuevo: 'por_hacer', canAssign: true, assignedTo: 3 });
    expect(r.actualizar).toEqual({ ...base, assigned_to: 3 });
  });
});

describe('puedeEditarTarea: su responsable o quien tiene «Ver todo» (Diego, 08/10)', () => {
  const tarea = { assigned_to: 7 };
  it('su responsable con «Editar»', () => {
    expect(puedeEditarTarea(tarea, 7, { edit: true, viewAll: false })).toBe(true);
  });
  it('quien la creó pero no es su responsable ni ve todo: no', () => {
    expect(puedeEditarTarea(tarea, 5, { edit: true, viewAll: false })).toBe(false);
  });
  it('el admin («Editar» + «Ver todo»)', () => {
    expect(puedeEditarTarea(tarea, 5, { edit: true, viewAll: true })).toBe(true);
  });
  it('sin «Editar», nadie, ni su responsable', () => {
    expect(puedeEditarTarea(tarea, 7, { edit: false, viewAll: true })).toBe(false);
  });
});
