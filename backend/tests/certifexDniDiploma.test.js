import { describe, it, expect } from 'vitest';
import { dniDiploma, editarSchema } from '../src/modules/certifex/certifex.validation.js';

// El DNI en el diploma (Carlos, 20/10/2026: «los DNI se colocan en el diploma, eso es
// importante… que salga un rellenable»). Se escribe en «Revisar datos antes de aprobar» y va a
// Certifex, que es quien lo imprime. Sin base.

describe('DNI del diploma · validación', () => {
  it('acepta DNI, NIE y pasaportes, y los deja en mayúsculas y sin espacios de más', () => {
    expect(dniDiploma.parse('12345678z')).toBe('12345678Z');
    expect(dniDiploma.parse('  x1234567l ')).toBe('X1234567L');
    expect(dniDiploma.parse('AB-123.456')).toBe('AB-123.456');
    expect(dniDiploma.parse('PA1234567')).toBe('PA1234567');
  });

  it('vacío es quitarlo', () => {
    expect(dniDiploma.parse('')).toBeNull();
    expect(dniDiploma.parse('   ')).toBeNull();
    expect(dniDiploma.parse(null)).toBeNull();
  });

  it('rechaza lo que no es un documento', () => {
    for (const malo of ['1234', '12345678Z<script>', '-12345678', '12345678-', 'ÑÑÑÑÑÑ', '123456789012345678901', 'DNI 123']) {
      expect(dniDiploma.safeParse(malo).success, malo).toBe(false);
    }
  });

  it('«Editar» acepta el DNI solo, sin más cambios', () => {
    const r = editarSchema.safeParse({ matriculaId: 7, dni: '12345678z' });
    expect(r.success).toBe(true);
    expect(r.data.dni).toBe('12345678Z');
    expect(editarSchema.safeParse({ matriculaId: 7 }).success).toBe(false);
  });
});
