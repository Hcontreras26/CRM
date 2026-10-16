import { describe, it, expect } from 'vitest';
import { normalizarImporte, subidaSchema } from '../src/modules/facturas-colaborador/facturas-colaborador.validation.js';

// #202 · el importe que escribe el colaborador. «1.200» se guardaba como 1,20 €
// y «1.234,56» daba error.
describe('facturas de colaboradores · el importe', () => {
  it('con coma decimal, los puntos son de miles', () => {
    expect(normalizarImporte('1.234,56')).toBe('1234.56');
    expect(normalizarImporte('600,50')).toBe('600.50');
  });
  it('sin coma, un punto que separa grupos de tres es de miles', () => {
    expect(normalizarImporte('1.200')).toBe('1200');
    expect(normalizarImporte('12.500')).toBe('12500');
    expect(normalizarImporte('1.234.567')).toBe('1234567');
  });
  it('con coma y punto, el decimal es el que va último', () => {
    expect(normalizarImporte('1,234.56')).toBe('1234.56');
    expect(normalizarImporte('1,500.00')).toBe('1500.00');
  });
  it('solo con coma, la coma es el decimal: «12,500» son 12,5', () => {
    expect(normalizarImporte('12,500')).toBe('12.500');
    expect(normalizarImporte('0,125')).toBe('0.125');
  });
  it('sin coma, si no, el punto es el decimal', () => {
    expect(normalizarImporte('600.50')).toBe('600.50');
    expect(normalizarImporte('0.5')).toBe('0.5');
  });
  it('lo que guarda el servidor', () => {
    const importe = (v) => subidaSchema.parse({ importe: v, numero_factura: 'F-1' }).importe;
    expect(importe('1.200')).toBe(1200);
    expect(importe('1.234,56')).toBe(1234.56);
    expect(importe(' 600,00 € ')).toBe(600);
    expect(importe('12,500')).toBe(12.5);
    expect(importe('1,234.56')).toBe(1234.56);
  });
});
