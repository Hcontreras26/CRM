import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Traer al CRM lo que la app de IA guarda en su Supabase (#44).
 *
 * Se conecta con un access token de la Management API, no con Stripe. Lo que
 * se fija aquí es lo que puede hacer daño:
 *
 *   - QUE NO DUPLIQUE. Cada suscripción se marca con su id en `notas_pago` y
 *     se comprueba antes de crear. Sin eso, cada sincronización volvería a
 *     crear las 23 de Tarot y el mes no pararía de subir. Es el fallo que no
 *     se ve hasta que las cifras ya están mal.
 *   - QUE SEA SOLO LECTURA contra la base ajena. El token tiene permiso para
 *     mucho más; la puerta se estrecha en el código, no en la confianza.
 *   - QUE `soloProbar` NO ESCRIBA. La pantalla lo usa para enseñar el número
 *     antes de que alguien pulse de verdad: si escribiera, el «previo» sería
 *     la importación.
 *   - QUE UNA SUSCRIPCIÓN SIN EMAIL NO ENTRE. Sin email no hay cliente al que
 *     atarla, y una venta suelta sin dueño ensucia más de lo que informa.
 */

const consultas = [];
const query = vi.fn(async (sql, params) => {
  consultas.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
  if (/FROM conversions WHERE project_id/.test(sql)) return { rows: [] };
  if (/FROM leads WHERE project_id/.test(sql)) return { rows: [] };
  if (/INSERT INTO leads/.test(sql)) return { rows: [{ id: 101 }] };
  if (/INSERT INTO conversions/.test(sql)) return { rows: [{ id: 201 }] };
  return { rows: [] };
});
vi.mock('../src/shared/config/db.js', () => ({ query: (...a) => query(...a), getClient: vi.fn() }));

const conversion = { create: vi.fn(async () => ({ id: 201 })) };
vi.mock('../src/modules/conversions/conversion.model.js', () => conversion);

const integraciones = { get: vi.fn() };
vi.mock('../src/modules/integrations/integrations.model.js', () => integraciones);
vi.mock('../src/shared/utils/crypto.js', () => ({
  decrypt: vi.fn(() => 'sbp_de_mentira'), encrypt: vi.fn(), maskSecret: vi.fn(),
}));

const { previo, importar } = await import('../src/modules/ia-monitor/supabase.service.js');

/** Una suscripción tal como la devuelve la base de la app. */
function suscripcion(extra = {}) {
  return {
    id: 'uuid-1', plan_type: 'monthly', status: 'expired', amount: '9.99', currency: 'EUR',
    stripe_payment_intent_id: 'pi_123', stripe_subscription_id: null,
    created_at: '2026-05-13 10:00:00+00', cancelled_at: null,
    email: 'cliente@correo.com', full_name: 'Cliente Uno',
    country_name: 'España', country_code: 'ES',
    ...extra,
  };
}

function respondeSupabase(filas) {
  global.fetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => JSON.stringify(filas), json: async () => filas }));
}

/** La implementación por defecto: ninguna venta repetida, ningún lead previo. */
function respuestasNormales() {
  query.mockImplementation(async (sql, params) => {
    consultas.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
    if (/FROM conversions WHERE project_id/.test(sql)) return { rows: [] };
    if (/FROM leads WHERE project_id/.test(sql)) return { rows: [] };
    if (/INSERT INTO leads/.test(sql)) return { rows: [{ id: 101 }] };
    return { rows: [] };
  });
}

beforeEach(() => {
  consultas.length = 0;
  // `mockReset` y no `mockClear`: el segundo borra las llamadas pero DEJA la
  // implementación puesta. Dos pruebas de aquí cambian la suya, y con
  // `mockClear` esa implementación se colaba en las siguientes — pasaban por
  // el orden en que corren, no porque el código hiciera lo que dicen.
  query.mockReset();
  respuestasNormales();
  conversion.create.mockReset();
  conversion.create.mockResolvedValue({ id: 201 });
  integraciones.get.mockResolvedValue({
    encrypted_value: 'x', iv: 'y', auth_tag: 'z', config_public: { project_ref: 'abc123' },
  });
  respondeSupabase([suscripcion()]);
});

describe('la puerta hacia la base ajena', () => {
  it('solo salen consultas de lectura', async () => {
    await previo(6);
    const enviado = JSON.parse(global.fetch.mock.calls[0][1].body).query;
    expect(enviado.trim().toUpperCase().startsWith('SELECT')).toBe(true);
    expect(enviado).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i);
  });

  it('sin credencial guardada no se llama a nadie', async () => {
    integraciones.get.mockResolvedValue(null);
    await expect(previo(6)).rejects.toThrow(/no tiene Supabase configurado/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sin la referencia del proyecto, tampoco', async () => {
    integraciones.get.mockResolvedValue({ encrypted_value: 'x', iv: 'y', auth_tag: 'z', config_public: {} });
    await expect(previo(6)).rejects.toThrow(/referencia/);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('mirar sin tocar', () => {
  it('`previo` cuenta y no escribe ni una fila', async () => {
    respondeSupabase([suscripcion(), suscripcion({ id: 'uuid-2', amount: '4.90', email: null })]);
    const r = await previo(6);
    expect(r.suscripciones).toBe(2);
    expect(r.conEmail).toBe(1);
    expect(r.sinEmail).toBe(1);
    expect(consultas.filter((c) => /^INSERT/i.test(c.sql))).toHaveLength(0);
  });

  it('`soloProbar` dice cuántas entrarían, sin escribir', async () => {
    respondeSupabase([suscripcion(), suscripcion({ id: 'uuid-2' })]);
    const r = await importar(6, { soloProbar: true });
    expect(r.ventasNuevas).toBe(2);
    expect(consultas.filter((c) => /^INSERT/i.test(c.sql))).toHaveLength(0);
    expect(conversion.create).not.toHaveBeenCalled();
  });
});

describe('importar de verdad', () => {
  it('crea el cliente, y la venta POR EL MODELO', async () => {
    // Por el modelo y no con un INSERT a mano: es lo que pone el IVA como
    // incluido —la columna tiene DEFAULT false, o sea «súmalo encima»—, mete
    // venta y cobro en la misma transacción y pasa el lead a convertido.
    await importar(6);
    expect(consultas.some((c) => /INSERT INTO leads/.test(c.sql))).toBe(true);
    expect(conversion.create).toHaveBeenCalledTimes(1);
    // Nada de escribir en `conversions` por fuera del modelo.
    expect(consultas.some((c) => /INSERT INTO conversions/.test(c.sql))).toBe(false);
    expect(consultas.some((c) => /INSERT INTO conversion_payments/.test(c.sql))).toBe(false);
  });

  it('el cobro va en la misma llamada, para que no se quede una venta sin él', async () => {
    await importar(6);
    expect(conversion.create.mock.calls[0][0]).toMatchObject({ importe_pagado: 9.99 });
  });

  it('deja la marca de la suscripción, que es lo que evita duplicarla', async () => {
    await importar(6);
    expect(conversion.create.mock.calls[0][0].notas_pago).toContain('[supabase:uuid-1]');
  });

  it('una suscripción en otra moneda no entra', async () => {
    // Sumar dólares con euros da un número que no es nada, y convertirlos a
    // ojo es inventarse el cambio del día que se cobró.
    respondeSupabase([suscripcion({ currency: 'USD' })]);
    const r = await importar(6);
    expect(r.otraMoneda).toBe(1);
    expect(r.ventasNuevas).toBe(0);
    expect(conversion.create).not.toHaveBeenCalled();
  });

  it('NO la vuelve a crear si ya está', async () => {
    // La segunda vuelta contra Tarot dio 0 nuevas y 23 ya estaban. Esto lo fija.
    query.mockImplementation(async (sql, params) => {
      consultas.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
      if (/FROM conversions WHERE project_id/.test(sql)) return { rows: [{ id: 999 }] };
      if (/INSERT INTO leads/.test(sql)) return { rows: [{ id: 101 }] };
      return { rows: [] };
    });
    const r = await importar(6);
    expect(r.ventasNuevas).toBe(0);
    expect(r.yaEstaban).toBe(1);
    expect(conversion.create).not.toHaveBeenCalled();
    expect(consultas.filter((c) => /^INSERT/i.test(c.sql))).toHaveLength(0);
  });

  it('reutiliza el cliente que ya existe en vez de crear otro', async () => {
    query.mockImplementation(async (sql, params) => {
      consultas.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params });
      if (/FROM conversions WHERE project_id/.test(sql)) return { rows: [] };
      if (/FROM leads WHERE project_id/.test(sql)) return { rows: [{ id: 55 }] };
      return { rows: [] };
    });
    const r = await importar(6);
    expect(r.clientesNuevos).toBe(0);
    expect(r.ventasNuevas).toBe(1);
    expect(consultas.some((c) => /INSERT INTO leads/.test(c.sql))).toBe(false);
  });

  it('una suscripción sin email se salta', async () => {
    respondeSupabase([suscripcion({ email: null })]);
    const r = await importar(6);
    expect(r.sinEmail).toBe(1);
    expect(r.ventasNuevas).toBe(0);
  });
});

/**
 * Cada app de IA guarda sus pagos a su manera: Tarot en `subscriptions`,
 * Nutricionista en `subscription_payments` y Psicologo en `pagos`. El servicio
 * mira que tabla hay y usa su consulta; las tres devuelven las mismas columnas.
 */
describe('cada app guarda sus pagos a su manera', () => {
  /** Responde a la consulta de tablas con las que se digan, y al resto con las filas. */
  function conTablas(tablas, filas) {
    global.fetch = vi.fn(async (_url, init) => {
      const q = JSON.parse(init.body).query;
      let cuerpo = filas;
      if (q.includes('information_schema.tables')) cuerpo = tablas.map((table_name) => ({ table_name }));
      else if (q.includes('information_schema.columns') && q.includes("column_name = 'tipo'")) cuerpo = [];
      return { ok: true, status: 200, text: async () => JSON.stringify(cuerpo), json: async () => cuerpo };
    });
  }
  const consultasEnviadas = () => global.fetch.mock.calls.map((c) => JSON.parse(c[1].body).query);

  it('Nutricionista: usa subscription_payments, con lo reembolsado dentro y lo fallido fuera', async () => {
    conTablas(['subscription_payments'], [suscripcion({ plan_type: 'monthly', status: 'completed' })]);
    const r = await previo(5);
    expect(r.suscripciones).toBe(1);
    const sql = consultasEnviadas().find((q) => /FROM subscription_payments/.test(q) && /AS amount/.test(q));
    expect(sql).toContain("payment_status IN ('completed', 'refunded')");
    expect(sql).toContain('amount_cents / 100.0');
  });

  it('Psicologo: usa pagos, con el correo de la propia fila', async () => {
    conTablas(['pagos'], [suscripcion({ plan_type: 'mensual', status: 'completado' })]);
    await previo(4);
    const sql = consultasEnviadas().find((q) => /FROM pagos pg/.test(q) && /AS amount/.test(q));
    expect(sql).toContain("pg.estado = 'completado'");
    expect(sql).toContain('COALESCE(pg.cliente_email, pr.email)');
  });

  it('con Tarot y sin pista, sigue usando subscriptions', async () => {
    conTablas(['subscriptions'], [suscripcion()]);
    await previo(6);
    expect(consultasEnviadas().some((q) => /FROM subscriptions s/.test(q))).toBe(true);
  });

  it('una app sin ninguna tabla de cobros (Trabajos Universitarios) se conecta y no trae ventas', async () => {
    conTablas([], []);
    const r = await previo(1548);
    expect(r.suscripciones).toBe(0);
    expect(r.importe).toBe(0);
    const i = await importar(1548);
    expect(i.ventasNuevas).toBe(0);
    expect(conversion.create).not.toHaveBeenCalled();
  });

  it('si la consulta de tablas falla, se usa la de siempre y no se rompe', async () => {
    let n = 0;
    global.fetch = vi.fn(async (_url, init) => {
      const q = JSON.parse(init.body).query;
      if (q.includes('information_schema.tables')) return { ok: false, status: 500, text: async () => 'caido', json: async () => ({}) };
      n++;
      return { ok: true, status: 200, text: async () => JSON.stringify([suscripcion()]), json: async () => [suscripcion()] };
    });
    const r = await previo(6);
    expect(n).toBeGreaterThan(0);
    expect(r.suscripciones).toBe(1);
  });

  it('todas las consultas son de solo lectura', async () => {
    for (const tablas of [['subscription_payments'], ['pagos'], ['subscriptions']]) {
      conTablas(tablas, [suscripcion()]);
      await previo(6);
      for (const q of consultasEnviadas()) expect(q).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i);
    }
  });

  it('un plan «mensual» o «anual» (Psicologo) se llama como el de Tarot', async () => {
    conTablas(['pagos'], [suscripcion({ id: 'p-1', plan_type: 'mensual' }), suscripcion({ id: 'p-2', plan_type: 'anual' })]);
    await importar(4);
    const productos = conversion.create.mock.calls.map((c) => c[0].producto_contratado);
    expect(productos).toEqual(['Suscripcion mensual', 'Suscripcion anual']);
  });
});

/**
 * Reembolsos y renovaciones: lo que se devolvio tiene que verse, no desaparecer.
 * La venta entra entera y la devolucion se apunta en `conversion_refunds`; el
 * neto lo calcula el CRM al leer.
 */
describe('reembolsos y renovaciones', () => {
  it('un pago reembolsado entra como venta y se apunta su devolucion', async () => {
    respondeSupabase([suscripcion({ id: 'r-1', amount: '9.99', reembolsado: true, reembolsado_en: '2026-06-01 10:00:00+00' })]);
    const r = await importar(5, { usuarioId: 1 });
    expect(r.ventasNuevas).toBe(1);
    expect(r.devueltas).toBe(1);
    const insercion = consultas.find((c) => /INSERT INTO conversion_refunds/.test(c.sql));
    expect(insercion).toBeTruthy();
    expect(insercion.params).toEqual([201, 9.99, '2026-06-01', 'Reembolsado en la app de origen [supabase:r-1]', 1]);
  });

  it('no apunta dos veces la misma devolucion', async () => {
    query.mockImplementation(async (sql, params) => {
      consultas.push({ sql: String(sql).replace(/s+/g, ' ').trim(), params });
      if (/FROM conversions WHERE project_id/.test(sql)) return { rows: [{ id: 300 }] };
      if (/FROM conversion_refunds/.test(sql)) return { rows: [{ id: 1 }] };
      return { rows: [] };
    });
    respondeSupabase([suscripcion({ id: 'r-1', reembolsado: true, reembolsado_en: '2026-06-01' })]);
    const r = await importar(5);
    expect(r.yaEstaban).toBe(1);
    expect(consultas.filter((c) => /INSERT INTO conversion_refunds/.test(c.sql))).toHaveLength(0);
  });

  it('un pago normal no genera ninguna devolucion', async () => {
    respondeSupabase([suscripcion()]);
    const r = await importar(6);
    expect(r.devueltas).toBe(0);
    expect(consultas.filter((c) => /conversion_refunds/.test(c.sql) && /INSERT/.test(c.sql))).toHaveLength(0);
  });

  it('una renovacion se llama como tal', async () => {
    respondeSupabase([suscripcion({ id: 'n-1', tipo: 'nueva' }), suscripcion({ id: 'n-2', tipo: 'renovacion' })]);
    await importar(5);
    const productos = conversion.create.mock.calls.map((c) => c[0].producto_contratado);
    expect(productos).toEqual(['Suscripcion mensual', 'Suscripcion mensual (renovacion)']);
  });

  it('previo separa el bruto, lo devuelto y el neto, y cuenta las renovaciones', async () => {
    respondeSupabase([
      suscripcion({ id: 'a', amount: '9.99', tipo: 'nueva' }),
      suscripcion({ id: 'b', amount: '9.99', tipo: 'renovacion' }),
      suscripcion({ id: 'c', amount: '9.99', tipo: 'nueva', reembolsado: true }),
    ]);
    const r = await previo(5);
    expect(r.importe).toBe(29.97);
    expect(r.reembolsadas).toEqual({ n: 1, importe: 9.99 });
    expect(r.neto).toBe(19.98);
    expect(r.renovaciones).toBe(1);
  });
});

/**
 * Psicologo IA (la app principal) guarda cada cobro como un evento en
 * `billing_events`. Solo son venta las altas y las renovaciones de verdad:
 * las activaciones manuales (sin cobro de Stripe) y las pruebas se quedan fuera,
 * y una disputa se apunta como devolucion del ultimo cobro de esa persona.
 */
describe('Psicologo IA principal: billing_events', () => {
  function conBilling(filas) {
    global.fetch = vi.fn(async (_url, init) => {
      const q = JSON.parse(init.body).query;
      const cuerpo = /information_schema\.tables/.test(q) ? [{ table_name: 'billing_events' }] : filas;
      return { ok: true, status: 200, text: async () => JSON.stringify(cuerpo), json: async () => cuerpo };
    });
  }
  const enviadas = () => global.fetch.mock.calls.map((c) => JSON.parse(c[1].body).query);

  it('detecta la tabla y pide solo altas y renovaciones que no sean de prueba', async () => {
    conBilling([suscripcion({ plan_type: 'monthly', tipo: 'nueva' })]);
    await previo(4);
    const sql = enviadas().find((q) => q.includes('FROM billing_events be') && q.includes('AS amount'));
    expect(sql).toContain("be.event_type IN ('subscription_creation', 'subscription_update')");
    expect(sql).toContain('NOT be.is_test');
    expect(sql).not.toContain("'manual_activation'");
  });

  it('las activaciones manuales y las pruebas se cuentan aparte, no como venta', async () => {
    conBilling([suscripcion()]);
    await previo(4);
    const fuera = enviadas().find((q) => q.includes('FROM billing_events be') && q.includes("'manual_activation'"));
    expect(fuera).toContain("be.is_test OR be.event_type = 'manual_activation'");
  });

  it('una disputa marca como devuelto el ultimo cobro de esa persona', async () => {
    conBilling([suscripcion()]);
    await previo(4);
    const sql = enviadas().find((q) => q.includes('FROM billing_events be') && q.includes('AS amount'));
    expect(sql).toContain("d.event_type = 'dispute'");
    expect(sql).toContain('ORDER BY p2.created_at DESC LIMIT 1');
  });

  it('el plan anual se reconoce por la duracion', async () => {
    conBilling([suscripcion()]);
    await previo(4);
    const sql = enviadas().find((q) => q.includes('FROM billing_events be') && q.includes('AS amount'));
    expect(sql).toContain("be.subscription_duration_days >= 300 THEN 'annual'");
  });

  it('todo lo que se envia es de solo lectura', async () => {
    conBilling([suscripcion()]);
    await previo(4);
    for (const q of enviadas()) expect(q).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i);
  });
});

/**
 * Veterinary AI llama igual a su tabla (`billing_events`) pero es otra: importe
 * en UNIDADES, correo en `user_email`, sin `is_test`. Se distingue por esa columna.
 */
describe('Veterinary AI: billing_events sin is_test', () => {
  function conVet(filas, conIsTest) {
    global.fetch = vi.fn(async (_url, init) => {
      const q = JSON.parse(init.body).query;
      let cuerpo = filas;
      if (q.includes('information_schema.tables')) cuerpo = [{ table_name: 'billing_events' }];
      else if (q.includes('information_schema.columns') && q.includes("column_name = 'is_test'")) cuerpo = conIsTest ? [{ column_name: 'is_test' }] : [];
      return { ok: true, status: 200, text: async () => JSON.stringify(cuerpo), json: async () => cuerpo };
    });
  }
  const sqlDeVentas = () => global.fetch.mock.calls.map((c) => JSON.parse(c[1].body).query).find((q) => q.includes('FROM billing_events be') && q.includes('AS amount'));

  it('sin is_test se usa el esquema de Veterinary', async () => {
    conVet([suscripcion()], false);
    await previo(1544);
    const sql = sqlDeVentas();
    expect(sql).toContain("be.event_type IN ('invoice_paid_initial', 'invoice_paid')");
    expect(sql).toContain('be.user_email');
    expect(sql).not.toContain('is_test');
  });

  it('con is_test sigue siendo el de Psicologo', async () => {
    conVet([suscripcion()], true);
    await previo(4);
    expect(sqlDeVentas()).toContain('NOT be.is_test');
  });

  it('el importe NO se divide entre 100 (ya viene en unidades) y checkout_completed no cuenta', async () => {
    conVet([suscripcion()], false);
    await previo(1544);
    const sql = sqlDeVentas();
    expect(sql).toContain('be.amount AS amount');
    expect(sql).not.toContain('be.amount / 100');
    expect(sql).not.toContain("event_type IN ('invoice_paid_initial', 'invoice_paid', 'checkout_completed'");
  });

  it('una devolucion se busca como charge_refunded del mismo usuario e importe', async () => {
    conVet([suscripcion()], false);
    await previo(1544);
    const sql = sqlDeVentas();
    expect(sql).toContain("r.event_type = 'charge_refunded'");
    expect(sql).toContain('r.amount = be.amount');
  });

  it('en dolares no se mezcla con euros: se cuenta aparte', async () => {
    conVet([suscripcion({ currency: 'USD', amount: '12' })], false);
    const r = await previo(1544);
    expect(r.otraMoneda).toBe(1);
    expect(r.importe).toBe(0);
  });
});

/**
 * Sexologo IA: ledger `pagos` con importe en CENTIMOS y `tipo` por fila. Se
 * distingue del `pagos` de Psicologo PRO por la columna `tipo`.
 */
describe('Sexologo IA: pagos con tipo', () => {
  function conSexologo(filas, conTipo) {
    global.fetch = vi.fn(async (_url, init) => {
      const q = JSON.parse(init.body).query;
      let cuerpo = filas;
      if (q.includes('information_schema.tables')) cuerpo = [{ table_name: 'pagos' }];
      else if (q.includes('information_schema.columns') && q.includes("column_name = 'tipo'")) cuerpo = conTipo ? [{ column_name: 'tipo' }] : [];
      return { ok: true, status: 200, text: async () => JSON.stringify(cuerpo), json: async () => cuerpo };
    });
  }
  const sqlDeVentas = () => global.fetch.mock.calls.map((c) => JSON.parse(c[1].body).query).find((q) => q.includes('FROM pagos pg') && q.includes('AS amount'));

  it('con la columna tipo se usa el esquema de Sexologo', async () => {
    conSexologo([suscripcion()], true);
    await previo(1546);
    const sql = sqlDeVentas();
    expect(sql).toContain("pg.tipo IN ('alta', 'renovacion')");
    expect(sql).toContain("pg.estado = 'paid'");
  });

  it('sin la columna tipo sigue siendo el de Psicologo PRO', async () => {
    conSexologo([suscripcion()], false);
    await previo(4);
    expect(sqlDeVentas()).toContain("pg.estado = 'completado'");
  });

  it('el importe se divide entre 100 (guarda centimos) y el reembolso se busca como fila aparte', async () => {
    conSexologo([suscripcion()], true);
    await previo(1546);
    const sql = sqlDeVentas();
    expect(sql).toContain('pg.importe / 100.0');
    expect(sql).toContain("r.tipo = 'reembolso'");
    expect(sql).toContain('r.importe = pg.importe');
  });

  it('los fallidos no cuentan como venta: van aparte', async () => {
    conSexologo([suscripcion()], true);
    await previo(1546);
    const fuera = global.fetch.mock.calls.map((c) => JSON.parse(c[1].body).query).find((q) => q.includes("pg.tipo = 'fallido'"));
    expect(fuera).toBeTruthy();
    expect(sqlDeVentas()).not.toContain("'fallido'");
  });

  it('todo es de solo lectura', async () => {
    conSexologo([suscripcion()], true);
    await previo(1546);
    for (const c of global.fetch.mock.calls) expect(JSON.parse(c[1].body).query).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\b/i);
  });
});
