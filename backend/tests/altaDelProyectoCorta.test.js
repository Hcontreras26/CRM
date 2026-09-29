import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Lo anterior al alta de un proyecto NO entra (#44).
 *
 * «Cada proyecto factura desde el dia que entra al CRM, no desde antes. Si el
 * proyecto lleva meses cobrando, ese historico no se importa: entraria como
 * ventas nuevas de este mes e inflaria todas las cifras y todas las comisiones.»
 * Es la regla que la propia tarea llama innegociable.
 *
 * El corte existia, pero SOLO al listar lo pendiente de facturar. En la primera
 * sincronizacion de un proyecto no hay estado previo, asi que se le pedian a
 * Stripe todos los cobros de su historia —hasta veinte mil— y todos se
 * guardaban en `stripe_payments`. De ahi leen tambien las pantallas de dinero
 * y las comisiones, asi que filtrar al final no bastaba: hay que no traerlo.
 *
 * Esto importa ahora porque toca conectar los proyectos de IA, que llevan meses
 * cobrando antes de entrar al CRM.
 */

const pedidos = [];

const modelo = {
  fechaDeCorte: vi.fn(async () => '2026-08-01'),
  getSyncState: vi.fn(async () => null),
  upsertPayment: vi.fn(async (p) => ({ id: 1, ...p })),
  upsertSyncState: vi.fn(async () => ({})),
  getPaymentById: vi.fn(async () => null),
};
vi.mock('../src/modules/stripe-payments/stripe-payments.model.js', () => modelo);
const integraciones = {
  get: vi.fn(async () => ({ encrypted_value: 'x', iv: 'y', auth_tag: 'z' })),
};
vi.mock('../src/modules/integrations/integrations.model.js', () => integraciones);
vi.mock('../src/shared/utils/crypto.js', () => ({
  decrypt: () => 'sk_test_loquesea', encrypt: () => ({}),
}));
vi.mock('../src/shared/config/db.js', () => ({ query: async () => ({ rows: [] }) }));
vi.mock('../src/modules/tutores/tutor.model.js', () => ({}));

/** Lo que Stripe contesta en la siguiente peticion. */
let cobros = [];

/** Se apunta que rango se le pide a Stripe. */
global.fetch = vi.fn(async (url) => {
  pedidos.push(new URL(url));
  const data = cobros;
  cobros = [];                       // solo la primera pagina
  return { ok: true, json: async () => ({ data, has_more: false }) };
});

const servicio = await import('../src/modules/stripe-payments/stripe-payments.service.js');

/** El `created[gte]` de la primera peticion, como fecha. */
const desdeCuandoSePidio = () => {
  const v = pedidos[0]?.searchParams.get('created[gte]');
  return v ? new Date(Number(v) * 1000).toISOString().slice(0, 10) : null;
};

beforeEach(() => {
  pedidos.length = 0;
  cobros = [];
  modelo.fechaDeCorte.mockResolvedValue('2026-08-01');
  modelo.getSyncState.mockResolvedValue(null);
  modelo.upsertPayment.mockClear();
  integraciones.get.mockResolvedValue({ encrypted_value: 'x', iv: 'y', auth_tag: 'z' });
});

/**
 * Un cobro tal cual lo devuelve Stripe.
 *
 * Recien hecho, no con una fecha fija: hay reglas que dependen de la EDAD del
 * cobro —el dia de gracia para que la plataforma lo estampe— y con una fecha
 * escrita a mano las pruebas empiezan a fallar solas cuando pasa el tiempo.
 */
const cobro = (id, metadata = {}) => ({
  id, amount: 5000, currency: 'eur', status: 'succeeded',
  created: Math.floor(Date.now() / 1000) - 60,
  metadata, disputed: false,
});

describe('la primera sincronizacion de un proyecto', () => {
  it('NO pide toda la historia: corta por el alta', async () => {
    await servicio.syncStripePayments(7);
    expect(desdeCuandoSePidio(), 'se pedian todos los cobros de la historia').toBe('2026-08-01');
  });

  it('sin fecha de corte no se corta, que es lo prudente', async () => {
    // Perder un cobro en silencio es peor que traer de mas: si no se sabe desde
    // cuando cuenta el proyecto, se trae y ya se filtrara al facturar.
    modelo.fechaDeCorte.mockResolvedValue(null);
    await servicio.syncStripePayments(7);
    expect(desdeCuandoSePidio()).toBeNull();
  });
});

describe('las siguientes', () => {
  it('siguen desde donde se quedaron, no desde el alta', async () => {
    modelo.getSyncState.mockResolvedValue({ last_synced_until: '2026-09-01T00:00:00Z' });
    await servicio.syncStripePayments(7);
    // Se resta una hora de solape a proposito, asi que cae en el dia anterior.
    expect(desdeCuandoSePidio()).toBe('2026-08-31');
  });

  it('pero nunca por debajo del alta', async () => {
    // Un estado corrupto o movido a mano no puede abrir la puerta al historico.
    modelo.getSyncState.mockResolvedValue({ last_synced_until: '2020-01-01T00:00:00Z' });
    await servicio.syncStripePayments(7);
    expect(desdeCuandoSePidio()).toBe('2026-08-01');
  });
});

describe('«todo el historial» tambien respeta el alta', () => {
  it('fullHistory significa todo DESDE EL ALTA', async () => {
    await servicio.syncStripePayments(7, { fullHistory: true });
    expect(desdeCuandoSePidio(), 'fullHistory se saltaba el corte').toBe('2026-08-01');
  });

  it('la salida de emergencia es mover el corte, no saltarselo', async () => {
    // Es lo que ya decia el modelo: si hace falta recuperar algo anterior, se
    // mueve `al_dia_hasta` hacia atras y aparece.
    modelo.fechaDeCorte.mockResolvedValue('2025-01-01');
    await servicio.syncStripePayments(7, { fullHistory: true });
    expect(desdeCuandoSePidio()).toBe('2025-01-01');
  });
});

describe('cuando varios proyectos comparten la MISMA cuenta de Stripe', () => {
  // El indice unico es (project_id, stripe_id), asi que el mismo cobro
  // importado por dos proyectos crea DOS filas: el mismo dinero contado dos
  // veces, en dos proyectos, alimentando dos calculos de comision.
  //
  // Y no se puede adivinar: el checkout de las plataformas manda
  // `metadata: { user_id, plan_type }`, y `plan_type` es generico —monthly,
  // annual, single— o sea el mismo en todas. Dos cobros de dos plataformas
  // distintas son indistinguibles. Por eso se declara.

  const conFiltro = (valor) => integraciones.get.mockResolvedValue({
    encrypted_value: 'x', iv: 'y', auth_tag: 'z',
    config_public: { filtro_metadata: { clave: 'proyecto', valor } },
  });

  it('solo entra lo que lleva la marca del proyecto', async () => {
    conFiltro('tarot-ia');
    cobros = [
      cobro('ch_1', { proyecto: 'tarot-ia', plan_type: 'monthly' }),
      cobro('ch_2', { proyecto: 'nutricionista-ia', plan_type: 'monthly' }),
    ];
    const r = await servicio.syncStripePayments(7);
    expect(r.imported).toBe(1);
    expect(modelo.upsertPayment).toHaveBeenCalledTimes(1);
    expect(modelo.upsertPayment.mock.calls[0][0].stripe_id).toBe('ch_1');
  });

  it('y se dice CUANTOS eran de otro, para ver que el filtro trabaja', async () => {
    // Sin esto, «0 importados» se lee igual que «no llega nada» y se pierde
    // media hora mirando la clave.
    conFiltro('tarot-ia');
    cobros = [cobro('ch_2', { proyecto: 'nutricionista-ia' })];
    const r = await servicio.syncStripePayments(7);
    expect(r.imported).toBe(0);
    expect(r.ajenos).toBe(1);
  });

  it('un cobro SIN marca no se cuela', async () => {
    conFiltro('tarot-ia');
    cobros = [cobro('ch_3', { plan_type: 'annual' })];
    const r = await servicio.syncStripePayments(7);
    expect(r.imported).toBe(0);
  });
});

describe('el cobro sin marcar no se pierde, que es lo que costaria dinero', () => {
  // Una renovacion de suscripcion la genera Stripe sin pasar por el checkout,
  // asi que la plataforma solo puede marcarla A POSTERIORI desde su webhook.
  // Entre que Stripe la crea y la plataforma la estampa hay una ventana. Si el
  // CRM lee justo ahi y avanza la marca de agua, ese cobro no se vuelve a mirar
  // nunca: dinero perdido en silencio.

  const conFiltro = (valor) => integraciones.get.mockResolvedValue({
    encrypted_value: 'x', iv: 'y', auth_tag: 'z',
    config_public: { filtro_metadata: { clave: 'platform', valor } },
  });

  /** La fecha hasta la que se dio por sincronizado. */
  const marcaDeAgua = () => modelo.upsertSyncState.mock.calls.at(-1)[1].last_synced_until;

  it('la marca de agua NO pasa del mas antiguo sin marcar', async () => {
    // Las dos fechas son RELATIVAS a ahora, como en la prueba de aqui abajo.
    //
    // Antes eran fijas —el 10 y el 20 de septiembre de 2026— y eso la convirtio
    // en una bomba de reloj: el cobro sin marcar solo retiene la marca de agua
    // mientras esta DENTRO de la gracia de 24 horas, asi que en cuanto paso el
    // 11 de septiembre el codigo empezo a hacer lo correcto —darlo por perdido y
    // avanzar— y la prueba empezo a fallar. Rojo desde entonces, sin que nadie
    // hubiera tocado nada.
    conFiltro('tarot-ia');
    const haceDosHoras = Math.floor((Date.now() - 2 * 3600 * 1000) / 1000);
    const haceUnaHora = Math.floor((Date.now() - 1 * 3600 * 1000) / 1000);
    cobros = [
      { ...cobro('ch_marcado', { platform: 'tarot-ia' }), created: haceUnaHora },
      { ...cobro('ch_sin_marca', {}), created: haceDosHoras },
    ];
    await servicio.syncStripePayments(7);
    // Aunque se importo el de hace una hora, la marca se queda ANTES del sin
    // marcar, que es el de hace dos.
    expect(new Date(marcaDeAgua()).getTime() / 1000).toBe(haceDosHoras - 1);
  });

  it('se dice cuantos se dejaron para la proxima vuelta', async () => {
    conFiltro('tarot-ia');
    cobros = [cobro('ch_sin_marca', { plan_type: 'monthly' })];
    const r = await servicio.syncStripePayments(7);
    expect(r.sinMarcar).toBe(1);
    expect(r.imported).toBe(0);
  });

  it('pero solo un dia: pasado eso, no le van a poner marca', async () => {
    // Sin este limite, un cobro que no se marca NUNCA —de otra plataforma que
    // no marca, o con el webhook roto— dejaria la marca de agua clavada para
    // siempre, releyendo una ventana cada vez mas grande cada cinco minutos.
    conFiltro('tarot-ia');
    const haceDosDias = Math.floor((Date.now() - 48 * 3600 * 1000) / 1000);
    cobros = [{ ...cobro('ch_viejo', {}), created: haceDosDias }];
    const r = await servicio.syncStripePayments(7);
    expect(r.sinMarcarViejos).toBe(1);
    expect(r.sinMarcar, 'no deberia retener la marca de agua').toBe(0);
  });

  it('uno reciente SI la retiene: puede estar a punto de estamparse', async () => {
    conFiltro('tarot-ia');
    const haceUnaHora = Math.floor((Date.now() - 3600 * 1000) / 1000);
    cobros = [{ ...cobro('ch_reciente', {}), created: haceUnaHora }];
    const r = await servicio.syncStripePayments(7);
    expect(r.sinMarcar).toBe(1);
    expect(r.sinMarcarViejos).toBe(0);
  });

  it('uno de OTRO proyecto si deja avanzar: ese no va a cambiar', async () => {
    conFiltro('tarot-ia');
    const cuando = Math.floor(new Date('2026-09-15').getTime() / 1000);
    cobros = [
      { ...cobro('ch_ajeno', { platform: 'nutricionista-ia' }), created: cuando },
      { ...cobro('ch_mio', { platform: 'tarot-ia' }), created: cuando },
    ];
    await servicio.syncStripePayments(7);
    expect(new Date(marcaDeAgua()).getTime() / 1000).toBe(cuando);
  });
});

describe('con cuenta dedicada, que es el caso normal', () => {
  it('sin filtro declarado entra TODO', async () => {
    // No hay que configurar nada para el caso de siempre.
    cobros = [cobro('ch_1', {}), cobro('ch_2', { proyecto: 'otro' })];
    const r = await servicio.syncStripePayments(7);
    expect(r.imported).toBe(2);
    expect(r.ajenos).toBe(0);
  });
});
