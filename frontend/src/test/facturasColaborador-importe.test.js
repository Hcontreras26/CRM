import { describe, it, expect } from 'vitest';
import { normalizarImporte } from '@/modules/facturas-colaborador/api/facturasColaborador.api';

// #202 · el importe que escribe el colaborador. «600.50» se convertía en 60050.
describe('facturas de colaboradores · el importe', () => {
  it('con coma decimal, los puntos son de miles', () => {
    expect(normalizarImporte('600,50')).toBe('600.50');
    expect(normalizarImporte('1.234,56')).toBe('1234.56');
    expect(normalizarImporte(' 1.234,56 € ')).toBe('1234.56');
  });
  it('sin coma, un punto que separa grupos de tres es de miles: «1.200» son mil doscientos', () => {
    expect(normalizarImporte('1.200')).toBe('1200');
    expect(normalizarImporte('12.500')).toBe('12500');
  });
  it('con coma y punto, el decimal es el último; solo con coma, la coma', () => {
    expect(normalizarImporte('1,234.56')).toBe('1234.56');
    expect(normalizarImporte('12,500')).toBe('12.500');
  });
  it('sin coma, el punto es el decimal', () => {
    expect(normalizarImporte('600.50')).toBe('600.50');
    expect(normalizarImporte('600')).toBe('600');
  });
});
