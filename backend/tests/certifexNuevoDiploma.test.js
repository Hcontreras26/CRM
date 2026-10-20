import { describe, it, expect } from 'vitest';
import { nuevoDiplomaSchema, mensajeDeValidacion } from '../src/modules/certifex/certifex.validation.js';

// «Nuevo diploma» (Diego, 19/10: «Academia IA está sin Moodle, así que tiene que crear el
// diploma desde 0, seleccionando el cliente; igual para los demás»). La validación de lo que
// manda el panel: campus, cliente, formación, el DNI (obligatorio desde el 20/10: Diego, «es
// obligatorio») y, opcional, el nombre que se imprimirá. Sin base.

const ok = { centro: 'academiaia', leadId: 12, productoId: 345, dni: '12345678z' };

describe('nuevo diploma · validación', () => {
  it('el DNI es obligatorio: sin él, vacío o con solo espacios, no', () => {
    const { dni, ...sinDni } = ok;
    expect(dni).toBeTruthy();
    for (const malo of [sinDni, { ...ok, dni: '' }, { ...ok, dni: '   ' }, { ...ok, dni: null }]) {
      const r = nuevoDiplomaSchema.safeParse(malo);
      expect(r.success, JSON.stringify(malo)).toBe(false);
      expect(mensajeDeValidacion(r.error)).toBe('Falta el DNI (o NIE o pasaporte) del alumno: es obligatorio en el diploma.');
    }
    // Con la misma regla que «Editar»: en mayúsculas, y lo que no es un documento no vale.
    expect(nuevoDiplomaSchema.parse(ok).dni).toBe('12345678Z');
    expect(nuevoDiplomaSchema.safeParse({ ...ok, dni: '1234' }).success).toBe(false);
    expect(nuevoDiplomaSchema.safeParse({ ...ok, dni: 'DNI 123' }).success).toBe(false);
  });

  it('acepta campus, cliente, formación y DNI, con o sin el nombre del diploma', () => {
    expect(nuevoDiplomaSchema.safeParse(ok).success).toBe(true);
    const r = nuevoDiplomaSchema.safeParse({ ...ok, nombre: '  María   José García ' });
    expect(r.success).toBe(true);
    expect(r.data.nombre).toBe('María José García');
  });

  it('exige el cliente y la formación como ids', () => {
    for (const malo of [{ ...ok, leadId: undefined }, { ...ok, leadId: 0 }, { ...ok, productoId: 'x' }, { ...ok, productoId: -1 }]) {
      expect(nuevoDiplomaSchema.safeParse(malo).success, JSON.stringify(malo)).toBe(false);
    }
  });

  it('el campus con su formato y el nombre con la regla del diploma', () => {
    expect(nuevoDiplomaSchema.safeParse({ ...ok, centro: 'campus con espacios' }).success).toBe(false);
    expect(nuevoDiplomaSchema.safeParse({ ...ok, nombre: 'Diego (pruebas)' }).success).toBe(false);
    expect(nuevoDiplomaSchema.safeParse({ ...ok, nombre: 'Ana' }).success).toBe(false);
  });
});
