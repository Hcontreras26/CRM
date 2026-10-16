import { describe, it, expect } from 'vitest';
import {
  createColumnSchema,
  updateColumnSchema,
  createAreaSchema,
  updateAreaSchema,
  updateExternalProjectSchema,
} from '../src/modules/tasks/tasks.validation.js';

describe('Ajustes de QA - Validaciones de sort_order (#210 / #258)', () => {
  it('sort_order negativo o mayor a 2147483647 es rechazado en createColumnSchema', () => {
    const invalidNegative = createColumnSchema.safeParse({
      key: 'col_test',
      name: 'Columna Test',
      sort_order: -1,
    });
    expect(invalidNegative.success).toBe(false);

    const invalidHuge = createColumnSchema.safeParse({
      key: 'col_test',
      name: 'Columna Test',
      sort_order: 99999999999,
    });
    expect(invalidHuge.success).toBe(false);

    const valid = createColumnSchema.safeParse({
      key: 'col_test',
      name: 'Columna Test',
      sort_order: 100,
    });
    expect(valid.success).toBe(true);
  });

  it('sort_order enorme es rechazado en updateColumnSchema', () => {
    const invalidHuge = updateColumnSchema.safeParse({
      sort_order: 99999999999,
    });
    expect(invalidHuge.success).toBe(false);

    const valid = updateColumnSchema.safeParse({
      sort_order: 50,
    });
    expect(valid.success).toBe(true);
  });

  it('sort_order enorme es rechazado en createAreaSchema y updateAreaSchema', () => {
    const invalidCreate = createAreaSchema.safeParse({
      name: 'Área Test',
      sort_order: 99999999999,
    });
    expect(invalidCreate.success).toBe(false);

    const invalidUpdate = updateAreaSchema.safeParse({
      sort_order: 99999999999,
    });
    expect(invalidUpdate.success).toBe(false);

    const validCreate = createAreaSchema.safeParse({
      name: 'Área Test',
      sort_order: 10,
    });
    expect(validCreate.success).toBe(true);
  });

  it('sort_order enorme es rechazado en updateExternalProjectSchema', () => {
    const invalidUpdate = updateExternalProjectSchema.safeParse({
      sort_order: 99999999999,
    });
    expect(invalidUpdate.success).toBe(false);

    const validUpdate = updateExternalProjectSchema.safeParse({
      sort_order: 20,
    });
    expect(validUpdate.success).toBe(true);
  });
});
