import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Lo anterior al corte no entra por la importación de Supabase (#44).
 *
 * «Cada proyecto factura desde el día que entra al CRM, no desde antes.» El
 * sondeo de Stripe ya lo cumplía; la importación desde la base de la app leía
 * su tabla de pagos ENTERA. Conectar un proyecto IA que lleva meses cobrando
 * metía todo su histórico como ventas.
 *
 * Lo que se fija aquí:
 *   - QUE USE EL MISMO CORTE QUE EL SONDEO (`fechaDeCorte`), no uno propio.
 *   - LA FRONTERA: lo del día del corte entra; lo del día anterior, no.
 *   - QUE LO DE ANTES NI SE TOQUE: ni cliente, ni venta, ni devolución.
 *   - QUE SE DIGA: cuántas se quedan fuera y cuánto suman, en `previo` y en
 *     `importar`. Sin el número, «0 ventas nuevas» se lee igual que «no llega
 *     nada».
 *   - QUE SIN CORTE NO SE PIERDA NADA, como en el sondeo.
 */

const consultas = [];
const query = vi.fn();
vi.mock('../src/shared/config/db.js', () => ({ query: (...a) => query(...a), getClient: vi.fn() }));

const conversion = { create: vi.fn() };
vi.mock('../src/modules/conversions/conversion.model.js', () => conversion);

const integraciones = { get: vi.fn() };
vi.mock('../src/modules/integrations/integrations.model.js', () => integraciones);
vi.mock('../src/shared/utils/crypto.js', () => ({
  decrypt: vi.fn(() => 'sbp_de_mentira'), encrypt: vi.fn(), maskSecret: vi.fn(),
}));

const stripeModelo = { fechaDeCorte: vi.fn() };
vi.mock('../src/modules/stripe-payments/stripe-payments.model.js', () => stripeModelo);

const { previo, importar, esAnteriorAlCorte } = await import('../src/modules/ia-monitor/supabase.service.js');

function pago(id, created_at, extra = {}) {
  return {
    id, plan_type: 'monthly', status: 'completed', amount: '9.99', currency: 'EUR',
    stripe_payment_intent_id: `pi_${id}`, stripe_subscription_id: null,
    created_at, cancelled_at: null,
    email: `${id}@correo.test`, full_name: `Cliente ${id}`,
    country_name: null, country_code: null,
    ...extra,
  };
}

/** La base de la app: la primera consulta (qué tablas hay) no trae ninguna
 *  conocida salvo `subscriptions`; el resto devuelve los pagos. */
function respondeSupabase(filas) {
  global.fetch = vi.fn(async (_url, init) => {
    const sql = JSON.parse(init.body).query;
    const datos = /information_schema\.tables/.test(sql) ? [{ table_name: 'subscriptions' }] : filas;
    return { ok: true, status: 200, text: async () => JSON.stringify(datos), json: async () => datos };
  });
}

beforeEach(() => {
  consultas.length = 0;
  query.mockReset();
  query.mockImplementation(async (sql, params) => {
    consultas.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
    if (/INSERT INTO leads/.test(sql)) return { rows: [{ id: 101 }] };
    return { rows: [] };
  });
  conversion.create.mockReset();
  conversion.create.mockResolvedValue({ id: 201 });
  integraciones.get.mockResolvedValue({
    encrypted_value: 'x', iv: 'y', auth_tag: 'z', config_public: { project_ref: 'abc123' },
  });
  stripeModelo.fechaDeCorte.mockReset();
  stripeModelo.fechaDeCorte.mockResolvedValue('2026-09-10');
});

describe('la frontera del corte', () => {
  it('lo del día del corte entra; lo del día anterior, no', () => {
    expect(esAnteriorAlCorte({ created_at: '2026-09-09 23:59:59+00' }, '2026-09-10')).toBe(true);
    expect(esAnteriorAlCorte({ created_at: '2026-09-10 00:00:00+00' }, '2026-09-10')).toBe(false);
    expect(esAnteriorAlCorte({ created_at: '2026-09-11T08:00:00+00:00' }, '2026-09-10')).toBe(false);
  });

  it('sin corte no se deja nada fuera', () => {
    expect(esAnteriorAlCorte({ created_at: '2020-01-01 00:00:00+00' }, null)).toBe(false);
  });
});

describe('importar', () => {
  it('usa el corte del proyecto, el mismo que el sondeo de Stripe', async () => {
    respondeSupabase([pago('nuevo', '2026-09-15 10:00:00+00')]);
    await importar(7);
    expect(stripeModelo.fechaDeCorte).toHaveBeenCalledWith(7);
  });

  it('lo anterior al corte no crea ni cliente ni venta', async () => {
    respondeSupabase([
      pago('viejo1', '2026-03-01 10:00:00+00'),
      pago('viejo2', '2026-09-09 10:00:00+00'),
      pago('nuevo', '2026-09-10 10:00:00+00'),
    ]);
    const r = await importar(7);

    expect(r.anterioresAlCorte).toBe(2);
    expect(r.ventasNuevas).toBe(1);
    expect(r.corte).toBe('2026-09-10');
    expect(conversion.create).toHaveBeenCalledTimes(1);
    expect(conversion.create.mock.calls[0][0].notas_pago).toContain('[supabase:nuevo]');
    // Ni siquiera se busca si ya estaban: lo de antes no se mira.
    const buscadas = consultas.filter((c) => /FROM conversions WHERE project_id/.test(c.sql)).map((c) => c.params[1]);
    expect(buscadas).toEqual(['%[supabase:nuevo]%']);
    expect(consultas.filter((c) => /INSERT INTO leads/.test(c.sql))).toHaveLength(1);
  });

  it('un pago de antes del corte que se devolvió tampoco apunta devolución', async () => {
    respondeSupabase([pago('viejo', '2026-08-01 10:00:00+00', { reembolsado: true, reembolsado_en: '2026-09-20' })]);
    const r = await importar(7);
    expect(r.anterioresAlCorte).toBe(1);
    expect(r.devueltas).toBe(0);
    expect(consultas.some((c) => /conversion_refunds/.test(c.sql))).toBe(false);
  });

  it('con `soloProbar` también se cuentan aparte, sin escribir', async () => {
    respondeSupabase([pago('viejo', '2026-01-01 10:00:00+00'), pago('nuevo', '2026-10-01 10:00:00+00')]);
    const r = await importar(7, { soloProbar: true });
    expect(r).toMatchObject({ anterioresAlCorte: 1, ventasNuevas: 1, soloProbar: true });
    expect(conversion.create).not.toHaveBeenCalled();
    expect(consultas.filter((c) => /^INSERT/i.test(c.sql))).toHaveLength(0);
  });

  it('sin corte (proyecto sin fecha) entra todo, como en el sondeo', async () => {
    stripeModelo.fechaDeCorte.mockResolvedValue(null);
    respondeSupabase([pago('viejo', '2025-01-01 10:00:00+00'), pago('nuevo', '2026-10-01 10:00:00+00')]);
    const r = await importar(7);
    expect(r).toMatchObject({ corte: null, anterioresAlCorte: 0, ventasNuevas: 2 });
  });
});

describe('previo', () => {
  it('dice el corte y cuánto se queda fuera, sin escribir nada', async () => {
    respondeSupabase([
      pago('viejo1', '2026-02-01 10:00:00+00', { amount: '9.99' }),
      pago('viejo2', '2026-05-01 10:00:00+00', { amount: '99.99' }),
      pago('nuevo', '2026-09-12 10:00:00+00', { amount: '9.99' }),
    ]);
    const r = await previo(7);
    expect(r.corte).toBe('2026-09-10');
    expect(r.anterioresAlCorte).toEqual({ n: 2, importe: 109.98 });
    // Las cifras de siempre siguen siendo de todo lo que hay en la app.
    expect(r.suscripciones).toBe(3);
    expect(consultas.filter((c) => /^INSERT/i.test(c.sql))).toHaveLength(0);
  });
});
