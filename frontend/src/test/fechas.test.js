import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { soloFecha, diasHasta, formatFecha, formatRelative, cuandoVence } from '@/shared/lib/fechas';

/*
  El caso que motivó juntar las tres copias.

  El servidor manda las columnas DATE en crudo —«2026-12-01», sin hora— porque
  `db.js` desactiva el parser de pg para el tipo 1082. La copia que tenía
  ClientsPage hacía `new Date('2026-12-01')`, que es UTC, y en España eso cae en
  el día anterior: la columna «Última compra» decía «30 nov».
*/

describe('fechas sin hora', () => {
  it('lee el día que dice el texto, no el de UTC', () => {
    const d = soloFecha('2026-12-01');
    expect(d.getDate()).toBe(1);
    expect(d.getMonth()).toBe(11);
    expect(d.getFullYear()).toBe(2026);
  });

  it('una fecha vieja se escribe con su día, no con el anterior', () => {
    // El caso exacto que fallaba: más de 30 días atrás, donde `formatRelative`
    // cae al día y mes. Con `new Date('2026-12-01')` salía «30 nov».
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2027, 1, 10, 12, 0));
    try {
      expect(formatRelative('2026-12-01')).toBe('01 dic');
      expect(formatFecha('2026-12-01')).toContain('01');
    } finally {
      vi.useRealTimers();
    }
  });

  it('sin fecha no inventa nada', () => {
    expect(soloFecha(null)).toBeNull();
    expect(soloFecha('')).toBeNull();
    expect(diasHasta(undefined)).toBeNull();
    expect(formatRelative(null)).toBeNull();
    expect(formatFecha(null)).toBeNull();
  });

  it('una fecha imposible no revienta', () => {
    expect(soloFecha('no es una fecha')).toBeNull();
    expect(formatRelative('no es una fecha')).toBeNull();
  });
});

describe('cuánto falta o cuánto hace', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Un miércoles cualquiera, a media tarde.
    vi.setSystemTime(new Date(2026, 8, 16, 17, 30));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('cuenta días enteros, no franjas de 24 horas', () => {
    expect(diasHasta('2026-09-16')).toBe(0);
    expect(diasHasta('2026-09-17')).toBe(1);
    expect(diasHasta('2026-09-15')).toBe(-1);
  });

  it('lo de hoy es «hoy» aunque falten horas para medianoche', () => {
    // Con la resta contra «ahora» esto salía «ayer» a partir de media tarde.
    expect(formatRelative('2026-09-16')).toBe('hoy');
    expect(cuandoVence('2026-09-16')).toEqual({ texto: 'hoy', urgente: true });
  });

  it('lo vencido se marca como urgente y dice cuánto lleva', () => {
    expect(cuandoVence('2026-09-13')).toEqual({ texto: 'vencido hace 3d', urgente: true });
  });

  it('lo que viene no es urgente', () => {
    expect(cuandoVence('2026-09-17')).toEqual({ texto: 'mañana', urgente: false });
    expect(cuandoVence('2026-09-20')).toEqual({ texto: 'en 4d', urgente: false });
  });

  it('sin fecha lo dice, en vez de colarse como vencido', () => {
    expect(cuandoVence(null)).toEqual({ texto: 'sin fecha', urgente: false });
  });

  it('hacia atrás y hacia delante usan las palabras de cada lado', () => {
    expect(formatRelative('2026-09-15')).toBe('ayer');
    expect(formatRelative('2026-09-17', { future: true })).toBe('mañana');
    expect(formatRelative('2026-09-13')).toBe('hace 3d');
    expect(formatRelative('2026-09-20', { future: true })).toBe('en 4d');
  });
});
