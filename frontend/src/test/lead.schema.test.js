import { describe, it, expect } from 'vitest';
import { leadSchema, ORIGEN_OPTIONS, ESTADO_OPTIONS, PAIS_OPTIONS } from '@/modules/leads/validation/lead.schema';

describe('leadSchema', () => {
  const validLead = {
    nombre: 'Maria Garcia',
    email: 'maria@gmail.com',
    origen: 'meta_ads',
  };

  it('valid lead passes', () => {
    const result = leadSchema.safeParse(validLead);
    expect(result.success).toBe(true);
  });

  it('missing nombre fails', () => {
    const result = leadSchema.safeParse({ ...validLead, nombre: undefined });
    expect(result.success).toBe(false);
  });

  // QA de Diego, 22/10, punto 11: «con el nombre vacío dice «debe tener al menos 2 caracteres»».
  it('nombre vacío: «Falta el nombre»; con una letra, sigue «al menos 2 caracteres»', () => {
    const vacio = leadSchema.safeParse({ ...validLead, nombre: '' });
    expect(vacio.success).toBe(false);
    expect(vacio.error.issues.find((i) => i.path[0] === 'nombre').message).toBe('Falta el nombre');
    const corto = leadSchema.safeParse({ ...validLead, nombre: 'A' });
    expect(corto.error.issues.find((i) => i.path[0] === 'nombre').message).toBe('El nombre debe tener al menos 2 caracteres');
  });

  it('invalid email fails', () => {
    const result = leadSchema.safeParse({ ...validLead, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('valid estado values pass', () => {
    const estados = ['nuevo', 'por_contactar', 'contactado', 'en_seguimiento', 'convertido', 'no_interesado'];
    for (const estado of estados) {
      const result = leadSchema.safeParse({ ...validLead, estado });
      expect(result.success).toBe(true);
    }
  });

  it('invalid estado fails', () => {
    const result = leadSchema.safeParse({ ...validLead, estado: 'invalid_estado' });
    expect(result.success).toBe(false);
  });

  it('empty optional fields pass', () => {
    const result = leadSchema.safeParse({
      ...validLead,
      telefono: undefined,
      producto_interes: undefined,
      pais: undefined,
      notas: undefined,
      estado: undefined,
    });
    expect(result.success).toBe(true);
  });
});

// Contar elementos era la prueba equivocada: se rompe cada vez que el producto
// crece —paso de 5 origenes a 8 y de 6 estados a 7— y no dice nada cuando de
// verdad importa. Lo que hay que garantizar es que no falte ninguno de los que
// el CRM da por hechos y que no haya duplicados, no cuantos son. Tarea #70.
describe('ORIGEN_OPTIONS', () => {
  it('estan los origenes que el CRM da por hechos', () => {
    const valores = ORIGEN_OPTIONS.map((o) => o.value);
    for (const imprescindible of ['meta_ads', 'organico', 'referido']) {
      expect(valores, `falta el origen «${imprescindible}»`).toContain(imprescindible);
    }
  });

  it('no hay ninguno repetido', () => {
    // Un duplicado no rompe nada visible: sale dos veces en el desplegable y
    // los informes reparten el mismo origen en dos filas.
    const valores = ORIGEN_OPTIONS.map((o) => o.value);
    expect(new Set(valores).size).toBe(valores.length);
  });

  it('todos tienen etiqueta para enseñar', () => {
    for (const o of ORIGEN_OPTIONS) {
      expect(o.label, `«${o.value}» no tiene etiqueta`).toBeTruthy();
    }
  });
});

describe('ESTADO_OPTIONS', () => {
  it('estan los estados del embudo', () => {
    // Estos los usa el pipeline y las metricas de conversion: si falta uno,
    // hay prospectos que no caen en ninguna columna.
    const valores = ESTADO_OPTIONS.map((o) => o.value);
    for (const imprescindible of ['nuevo', 'contactado', 'convertido']) {
      expect(valores, `falta el estado «${imprescindible}»`).toContain(imprescindible);
    }
  });

  it('no hay ninguno repetido', () => {
    const valores = ESTADO_OPTIONS.map((o) => o.value);
    expect(new Set(valores).size).toBe(valores.length);
  });
});

describe('PAIS_OPTIONS', () => {
  it('has 22 items', () => {
    expect(PAIS_OPTIONS).toHaveLength(22);
  });
});
