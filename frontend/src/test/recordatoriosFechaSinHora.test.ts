// Diego, 15/10 (gestoras de ISEIE en Latinoamérica): «los pongo con fecha de
// mañana y todos me los pone con fecha de hoy». Un recordatorio es un DATE: ni
// hora ni zona. Se prueba desde Caracas (UTC-4) a las 22:00, la peor hora.
process.env.TZ = 'America/Caracas';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { formatDia, yaPaso, diasHasta } from '@/shared/lib/fechas';
import { formatRelative } from '@/modules/leads/lib/leadFormat';
import { getLeadPriority } from '@/modules/leads/lib/leadPriority';

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T02:00:00Z')); }); // 15/10 22:00 en Caracas
afterAll(() => { vi.useRealTimers(); });

describe('un recordatorio de mañana sigue siendo de mañana en Latinoamérica', () => {
  it('la ficha pinta el 16, no el «15 oct 20:00»', () => {
    expect(formatDia('2026-10-16')).toMatch(/16/);
    expect(formatDia('2026-10-16')).not.toMatch(/15/);
  });
  it('no sale vencido ni «hoy»', () => {
    expect(diasHasta('2026-10-16')).toBe(1);
    expect(yaPaso('2026-10-16')).toBe(false);
    expect(formatRelative('2026-10-16', { future: true })).toBe('mañana');
    expect(getLeadPriority({ next_reminder_at: '2026-10-16', status: 'contactado' } as any)).not.toBe('overdue');
  });
  it('el de hoy no está vencido y el de ayer sí', () => {
    expect(yaPaso('2026-10-15')).toBe(false);
    expect(yaPaso('2026-10-14')).toBe(true);
    expect(getLeadPriority({ next_reminder_at: '2026-10-14', status: 'contactado' } as any)).toBe('overdue');
  });
});
