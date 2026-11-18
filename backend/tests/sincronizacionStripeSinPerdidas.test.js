import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El cron de Stripe, cuando es la ÚNICA vía por la que entra el dinero.
 *
 * Ángel: «hemos perdido todo de Stripe, por ende lo estaremos conectando con el
 * access token; habilitarás un cron para que la información sea correcta y
 * constante y sin pérdidas, no hay de otra».
 *
 * Sin webhook no hay segunda oportunidad: si una vuelta del cron se deja algo,
 * no llega por ningún otro sitio. Lo que se fija aquí son las dos formas en que
 * se perdían cosas EN SILENCIO, que es lo peor de todo — un cron que falla y se
 * ve igual que uno sano.
 *
 * 1 · UN FALLO NO SE APUNTABA EN NINGÚN SITIO. `stripe_sync_state.last_error`
 *     existía desde el principio y la única línea que lo tocaba lo ponía a
 *     null al terminar bien. El panel de Estado lee ese campo para decir si
 *     Stripe va (`piezas.service.js`): con la clave caducada —y estos access
 *     tokens caducan— el cron fallaría cada cinco minutos y el panel seguiría
 *     en verde.
 *
 * 2 · AL CORTARSE POR EL TOPE DE PÁGINAS, LA MARCA DE AGUA AVANZABA IGUAL.
 *     Stripe devuelve los cargos del más nuevo al más viejo. Parando en la
 *     página 200 se han visto los 20.000 más recientes y no los anteriores; si
 *     la marca de agua sube al más nuevo, la siguiente vuelta empieza por
 *     delante y esos cobros no se piden nunca más. Agujero permanente.
 */

const model = {
  getSyncState: vi.fn(async () => null),
  upsertSyncState: vi.fn(async () => {}),
  fechaDeCorte: vi.fn(async () => null),
  upsertPayment: vi.fn(async (p) => ({ id: 1, ...p })),
  listPendientesDeAsociar: vi.fn(async () => []),
  getById: vi.fn(async () => null),
};
vi.mock('../src/modules/stripe-payments/stripe-payments.model.js', () => model);

const integrations = { get: vi.fn(async () => null) };
vi.mock('../src/modules/integrations/integrations.model.js', () => integrations);
vi.mock('../src/shared/utils/crypto.js', () => ({
  encrypt: vi.fn(), decrypt: vi.fn(() => 'rk_test_de_mentira'), maskSecret: vi.fn(() => 'rk_…'),
}));

const consulta = vi.fn(async () => ({ rows: [] }));
vi.mock('../src/shared/config/db.js', () => ({
  query: (...a) => consulta(...a),
  getClient: vi.fn(),
  default: { query: (...a) => consulta(...a) },
}));

const { syncStripePayments } = await import('../src/modules/stripe-payments/stripe-payments.service.js');

/** Un cargo tal como lo devuelve Stripe, sin metadata (así no hay filtro que valga). */
function cargo(id, creadoSeg) {
  return {
    id, created: creadoSeg, amount: 5000, currency: 'eur', status: 'succeeded',
    paid: true, refunded: false, disputed: false, metadata: {},
    billing_details: { email: 'x@y.com', name: 'X' },
    balance_transaction: { amount: 5000, fee: 150, net: 4850 },
  };
}

/** Lo que se le escribió al estado en la última llamada. */
function ultimoEstado() {
  const llamadas = model.upsertSyncState.mock.calls;
  return llamadas.length ? llamadas[llamadas.length - 1][1] : null;
}

beforeEach(() => {
  for (const f of Object.values(model)) f.mockClear?.();
  model.getSyncState.mockResolvedValue(null);
  model.fechaDeCorte.mockResolvedValue(null);
  model.upsertPayment.mockImplementation(async (p) => ({ id: 1, ...p }));
  model.listPendientesDeAsociar.mockResolvedValue([]);
  integrations.get.mockResolvedValue({ encrypted_value: 'x', iv: 'y', auth_tag: 'z' });
  consulta.mockResolvedValue({ rows: [] });
  vi.stubGlobal('fetch', vi.fn());
});

describe('cuando la vuelta falla', () => {
  it('el fallo queda APUNTADO, no solo en el log', async () => {
    // El caso que viene: el access token caduca y Stripe contesta 401.
    global.fetch.mockResolvedValue({ ok: false, status: 401, text: async () => 'Invalid API Key' });

    await expect(syncStripePayments(7)).rejects.toThrow();

    expect(model.upsertSyncState).toHaveBeenCalled();
    const escrito = ultimoEstado();
    expect(escrito.last_error).toMatch(/401/);
  });

  it('y NO se toca `last_sync_at`: tiene que seguir diciendo la última que salió bien', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 401, text: async () => 'Invalid API Key' });
    await expect(syncStripePayments(7)).rejects.toThrow();
    expect(ultimoEstado()).not.toHaveProperty('last_sync_at');
  });

  it('sin clave configurada, también se apunta', async () => {
    // Antes esto salía por un `throw` seco y el estado se quedaba como estaba.
    integrations.get.mockResolvedValue(null);
    const antes = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    await expect(syncStripePayments(7)).rejects.toThrow(/no configurada/);
    expect(ultimoEstado().last_error).toMatch(/no configurada/);
    if (antes !== undefined) process.env.STRIPE_SECRET_KEY = antes;
  });
});

describe('cuando la vuelta va bien', () => {
  it('avanza la marca de agua y limpia el error anterior', async () => {
    const ahora = Math.floor(Date.now() / 1000);
    global.fetch.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ data: [cargo('ch_1', ahora - 100)], has_more: false }),
    });
    model.getSyncState.mockResolvedValue({ last_error: 'lo de ayer', total_imported: 4 });

    const r = await syncStripePayments(7);

    expect(r.completo).toBe(true);
    const e = ultimoEstado();
    expect(e.last_error).toBeNull();
    expect(new Date(e.last_synced_until).getTime()).toBe((ahora - 100) * 1000);
    expect(e.total_imported).toBe(5);
  });
});

describe('cuando se corta por el tope de páginas', () => {
  it('la marca de agua NO se mueve', async () => {
    // Stripe contesta siempre `has_more: true`: nunca se llega al final y la
    // vuelta sale por el tope de 200 páginas.
    const ahora = Math.floor(Date.now() / 1000);
    let n = 0;
    global.fetch.mockImplementation(async () => ({
      ok: true, status: 200,
      json: async () => ({ data: [cargo(`ch_${n++}`, ahora - n)], has_more: true }),
    }));
    model.getSyncState.mockResolvedValue({ last_synced_until: '2026-01-01T00:00:00.000Z', total_imported: 0 });

    const r = await syncStripePayments(7);

    expect(r.completo).toBe(false);
    // Lo que se ha traído se guarda —eso no se pierde— pero el punto por donde
    // se sigue leyendo se queda donde estaba: los más antiguos aún no se han
    // visto y la próxima vuelta tiene que volver a por ellos.
    expect(r.imported).toBeGreaterThan(0);
    expect(ultimoEstado().last_synced_until).toBe('2026-01-01T00:00:00.000Z');
  });

  it('y un `fullHistory` cortado no se apunta como histórico completo', async () => {
    const ahora = Math.floor(Date.now() / 1000);
    let n = 0;
    global.fetch.mockImplementation(async () => ({
      ok: true, status: 200,
      json: async () => ({ data: [cargo(`ch_${n++}`, ahora - n)], has_more: true }),
    }));
    model.getSyncState.mockResolvedValue({ last_full_sync_at: null, total_imported: 0 });

    await syncStripePayments(7, { fullHistory: true });

    // Decir «histórico traído» sin haberlo traído entero deja creer que no
    // falta nada.
    expect(ultimoEstado().last_full_sync_at).toBeNull();
  });
});

describe('el histórico absoluto', () => {
  it('por defecto NO se pide nada anterior al corte', async () => {
    // La regla que el #44 llama «la que no se negocia»: lo anterior al alta ya
    // se facturó fuera. 576 cobros en esa situación.
    model.fechaDeCorte.mockResolvedValue('2026-09-10');
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [], has_more: false }) });

    await syncStripePayments(7);

    const url = new URL(global.fetch.mock.calls[0][0]);
    const desde = Number(url.searchParams.get('created[gte]'));
    expect(desde).toBe(Math.floor(new Date('2026-09-10').getTime() / 1000));
  });

  it('con `desdeElPrincipio` se pide TODO, sin fecha de inicio', async () => {
    // Ángel: «el contenido de stripe sí que debe estar al día, saca el
    // completo, el histórico absoluto». Tener el dato y poder facturarlo pasan
    // a ser dos cosas distintas.
    model.fechaDeCorte.mockResolvedValue('2026-09-10');
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [], has_more: false }) });

    await syncStripePayments(7, { desdeElPrincipio: true });

    const url = new URL(global.fetch.mock.calls[0][0]);
    expect(url.searchParams.get('created[gte]')).toBeNull();
  });

  it('el corte se sigue consultando: no se olvida, se ignora a propósito', async () => {
    // Si dejara de consultarse, el día que alguien quite el `desdeElPrincipio`
    // no habría forma de saber si el corte sigue vivo.
    model.fechaDeCorte.mockResolvedValue('2026-09-10');
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [], has_more: false }) });
    await syncStripePayments(7, { desdeElPrincipio: true });
    expect(model.fechaDeCorte).toHaveBeenCalledWith(7);
  });
});
