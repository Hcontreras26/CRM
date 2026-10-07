import { describe, it, expect } from 'vitest';
import { neighboursAt, dueInfo, fromDateInput, toDateInput } from './taskUi';

describe('taskUi utilidades puras', () => {
  describe('neighboursAt', () => {
    it('devuelve null si se suelta en su misma posición previa o posterior', () => {
      const col = [{ id: 1 }, { id: 2 }, { id: 3 }];
      // Soltar en index 1 con draggedId 2 es su misma posición
      expect(neighboursAt(col, 1, 2)).toBeNull();
      // Soltar en index 2 con draggedId 2 es su misma posición
      expect(neighboursAt(col, 2, 2)).toBeNull();
    });

    it('calcula vecinos al mover al principio', () => {
      const col = [{ id: 1 }, { id: 2 }, { id: 3 }];
      // Mover id 3 al inicio (index 0)
      const res = neighboursAt(col, 0, 3);
      expect(res).toEqual({ prev_id: null, next_id: 1 });
    });

    it('calcula vecinos al mover al final', () => {
      const col = [{ id: 1 }, { id: 2 }, { id: 3 }];
      // Mover id 1 al final (index 3)
      const res = neighboursAt(col, 3, 1);
      expect(res).toEqual({ prev_id: 3, next_id: null });
    });

    it('calcula vecinos al soltar entre dos tarjetas', () => {
      const col = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
      // Mover id 4 a index 2 (entre 1 y 2)
      const res = neighboursAt(col, 2, 4);
      expect(res).toEqual({ prev_id: 2, next_id: 3 });
    });
  });

  describe('fromDateInput y toDateInput', () => {
    it('convierte formato fecha de input a ISO y recupera la fecha local', () => {
      expect(fromDateInput('')).toBeNull();
      const iso = fromDateInput('2026-10-31');
      expect(typeof iso).toBe('string');

      const formatted = toDateInput(iso);
      expect(formatted).toBe('2026-10-31');
    });
  });

  describe('dueInfo', () => {
    it('devuelve null si no hay fecha de vencimiento', () => {
      expect(dueInfo({ due_date: null, status: 'en_curso' })).toBeNull();
    });

    it('etiqueta como hecha si la tarea está completada', () => {
      const info = dueInfo({ due_date: '2026-10-01T00:00:00Z', status: 'hecha' });
      expect(info?.classes).toContain('bg-muted');
    });
  });
});
