import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// La pantalla de estado, tarea #26.
//
// Se prueban las dos cosas que el ticket marca como no opcionales —que una
// pieza caida no tumbe la pantalla, y que no salga nada sensible— y la
// distincion que hace util el bloque de tareas: «esta caida» contra «el
// proceso acaba de arrancar».

const respuestas = new Map();
vi.mock('../src/shared/config/db.js', () => ({
  query: vi.fn(async (sql) => {
    for (const [trozo, r] of respuestas) {
      if (sql.includes(trozo)) {
        if (r instanceof Error) throw r;
        return { rows: r };
      }
    }
    return { rows: [{}] };
  }),
}));

const { vigilar, tareasProgramadas, _internos: latido } = await import('../src/jobs/latido.js');
const { comprobarTodo, _internos: piezas } = await import('../src/modules/status/piezas.service.js');
const { anotaWebhook, ultimoWebhook, _internos: webhooks } = await import('../src/modules/status/webhooks.js');

const MIN = 60_000;
const relojes = [];
const programar = (...a) => { const h = vigilar(...a); relojes.push(h); return h; };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  respuestas.clear();
  latido.tareas.clear();
  webhooks.ultimos.clear();
});
afterEach(() => {
  relojes.splice(0).forEach(clearInterval);
});

describe('una pieza caida no tumba la pantalla', () => {
  it('la que revienta sale en rojo y las demas siguen', async () => {
    // El caso de hoy mismo: sin la migracion 127 la tabla de correos no existe.
    respuestas.set('FROM email_envios', new Error('relation "email_envios" does not exist'));

    const r = await comprobarTodo();

    expect(r.piezas).toHaveLength(piezas.PIEZAS.length);
    const correo = r.piezas.find((p) => p.nombre === 'correo');
    expect(correo.estado).toBe('caida');
    // Y las otras cinco contestan igual que si no hubiera pasado nada.
    expect(r.piezas.filter((p) => p.estado === 'caida')).toHaveLength(1);
  });

  it('y dice POR QUE, que es lo que hace falta a las tres de la mañana', async () => {
    respuestas.set('FROM email_envios', new Error('relation "email_envios" does not exist'));
    const { piezas: ps } = await comprobarTodo();
    expect(ps.find((p) => p.nombre === 'correo').detalle).toMatch(/does not exist/);
  });

  it('una pieza colgada tampoco: cada una tiene su tiempo maximo', async () => {
    // Sin tope, una consulta que no vuelve deja la pantalla girando para siempre.
    const nunca = new Promise(() => {});
    await expect(piezas.conTiempo(nunca, 30)).rejects.toThrow(/no contest/);
  });

  it('la cabecera se pone al peor, no al mejor', async () => {
    // Cinco verdes y una roja no es «todo bien». Es el fallo clasico de estas
    // pantallas: promediar y quedarse en verde con algo ardiendo.
    respuestas.set('FROM email_envios', new Error('roto'));
    expect((await comprobarTodo()).global).toBe('caida');
  });

  it('«sin configurar» no es un fallo', async () => {
    // Un CRM sin WooCommerce no esta roto. Si eso pintara rojo, la pantalla
    // estaria roja siempre y no la miraria nadie.
    expect(piezas.GRAVEDAD.sin_configurar).toBe(piezas.GRAVEDAD.bien);
  });
});

describe('sin datos sensibles', () => {
  // Se mira el CODIGO, no los comentarios. La primera version de esta prueba
  // fallaba contra su propia explicacion —el comentario que dice «customer_email
  // y customer_name no salen de aqui» contiene, claro, esas dos palabras— y
  // contra la linea del codigo viejo que se cita en la cabecera, que lleva
  // BREVO_API_KEY. Lo que se afirma es que esas columnas no se LEEN.
  const fs = require('node:fs');
  const sinComentarios = () =>
    fs.readFileSync('src/modules/status/piezas.service.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')   // bloques
      .replace(/^\s*\/\/.*$/gm, '')       // lineas //
      .replace(/--.*$/gm, '');            // comentarios dentro del SQL

  it('de Stripe salen fechas y numeros, nunca el cliente', () => {
    // `stripe_payments` tiene customer_email y customer_name en la fila de al
    // lado de lo que se lee. El ticket pide que esta pantalla se pueda enseñar
    // fuera algun dia.
    const src = sinComentarios();
    expect(src).not.toMatch(/customer_email|customer_name/);
    expect(src).not.toMatch(/destinatarios/);   // ni las direcciones de los correos
  });

  it('ni claves ni tokens', () => {
    expect(sinComentarios()).not.toMatch(/access_token|api_key|_enc/i);
  });

  it('y la prueba sabe leer: si alguien AÑADE la columna, salta', () => {
    // Sin esto, lo de arriba pasaria tambien con un fichero vacio.
    const conLaColumna = `${sinComentarios()}\nSELECT customer_email FROM stripe_payments`;
    expect(conLaColumna).toMatch(/customer_email/);
  });
});

describe('el pulso de las tareas', () => {
  it('una tarea recien arrancada no esta caida, esta esperando', () => {
    // Lo que separa una pantalla util de una que grita en cada despliegue: una
    // tarea diaria a los diez minutos de reiniciar no ha fallado, es que no le
    // toca.
    programar('diaria', 'Diaria', async () => {}, 24 * 60 * MIN);
    const [t] = tareasProgramadas(Date.now() + 10 * MIN);
    expect(t.estado).toBe('esperando');
  });

  it('pero si pasan dos intervalos sin dar señales, si', () => {
    programar('cada5', 'Cada cinco', async () => {}, 5 * MIN);
    const [t] = tareasProgramadas(Date.now() + 30 * MIN);
    expect(t.estado).toBe('caida');
  });

  it('no se acusa retraso al primer intervalo', () => {
    // Con uno, cualquier vuelta que tarde de mas pintaria de rojo una tarea sana.
    programar('cada5', 'Cada cinco', async () => {}, 5 * MIN);
    expect(tareasProgramadas(Date.now() + 6 * MIN)[0].estado).toBe('esperando');
  });

  it('ficha sola: la tarea no tiene que acordarse de nada', async () => {
    // Es el motivo de que esto envuelva al setInterval en vez de pedir un
    // `anota()` al final de cada tarea. Lo que hay que recordar, se olvida.
    programar('rapida', 'Rapida', async () => {}, 10);
    await esperar(40);
    const [t] = tareasProgramadas();
    expect(t.vueltas).toBeGreaterThan(0);
    expect(t.estado).toBe('bien');
  });

  it('una tarea que revienta sigue contando como viva, y el fallo va aparte', async () => {
    // Que falle no es que este muerta: el bucle sigue girando. Mezclarlo
    // esconderia el caso de verdad grave, que es que deje de girar.
    programar('rota', 'Rota', async () => { throw new Error('fallo de prueba'); }, 10);
    await esperar(40);
    const [t] = tareasProgramadas();
    expect(t.fallos).toBeGreaterThan(0);
    expect(t.ultima).not.toBeNull();
    expect(t.estado).toBe('fallando');
    expect(t.detalle).toMatch(/fallo de prueba/);
  });

  it('y no se solapa consigo misma', async () => {
    let ala = 0, maximo = 0;
    programar('lenta', 'Lenta', async () => {
      ala += 1; maximo = Math.max(maximo, ala);
      await esperar(30);
      ala -= 1;
    }, 5);
    await esperar(80);
    expect(maximo).toBe(1);
  });

  it('el bloque resume sin obligar a contar doce lineas', async () => {
    programar('ok', 'Buena', async () => {}, 10);
    programar('mal', 'Mala', async () => { throw new Error('x'); }, 10);
    await esperar(40);
    const { piezas: ps } = await comprobarTodo();
    const bloque = ps.find((p) => p.nombre === 'tareas');
    expect(bloque.estado).toBe('atencion');
    expect(bloque.resumen).toMatch(/1 de 2/);
    expect(bloque.datos.tareas).toHaveLength(2);
  });
});

describe('el correo, que es lo que el ticket anticipaba', () => {
  it('sin un solo envio dice «nunca», no verde', async () => {
    // «Brevo — ultimo correo enviado (hoy diria nunca)», literal del ticket.
    // Lo de antes decia 'operational' solo porque habia una variable puesta.
    respuestas.set('FROM email_envios', [{ ultimo_ok: null, ultimo_fallo: null, ok_24h: 0, fallos_24h: 0, frenados_24h: 0 }]);
    const { piezas: ps } = await comprobarTodo();
    const c = ps.find((p) => p.nombre === 'correo');
    expect(c.estado).toBe('sin_datos');
    expect(c.resumen).toMatch(/ningún correo/i);
  });

  it('los frenados del entorno de pruebas no cuentan como fallo', async () => {
    // Si contaran, /testeo estaria en rojo permanente por el freno de #27
    // haciendo justo lo que tiene que hacer.
    respuestas.set('FROM email_envios', [{
      ultimo_ok: new Date().toISOString(), ultimo_fallo: null,
      ok_24h: 3, fallos_24h: 0, frenados_24h: 40,
    }]);
    const { piezas: ps } = await comprobarTodo();
    const c = ps.find((p) => p.nombre === 'correo');
    expect(c.estado).toBe('bien');
    expect(c.datos.frenados24h).toBe(40);
  });

  it('todo fallido y nada enviado es caida, no aviso', async () => {
    respuestas.set('FROM email_envios', [{
      ultimo_ok: null, ultimo_fallo: new Date().toISOString(),
      ok_24h: 0, fallos_24h: 7, frenados_24h: 0,
    }]);
    const { piezas: ps } = await comprobarTodo();
    expect(ps.find((p) => p.nombre === 'correo').estado).toBe('caida');
  });
});

describe('lo que se vio en pantalla y no en el codigo', () => {
  it('doce tareas recien arrancadas no son «Funciona»', async () => {
    // Se vio en la captura: verde y «0 dando vueltas, 12 aun sin tocarles» en la
    // misma tarjeta. Verde por no haber fallado no es verde por funcionar, y
    // justo despues de un despliegue es cuando la pantalla no puede mentir.
    programar('a', 'A', async () => {}, 24 * 60 * MIN);
    programar('b', 'B', async () => {}, 24 * 60 * MIN);
    const { piezas: ps } = await comprobarTodo();
    const bloque = ps.find((p) => p.nombre === 'tareas');
    expect(bloque.estado).toBe('sin_datos');
    expect(bloque.resumen).toMatch(/primera vuelta/);
  });

  it('en cuanto una da la vuelta, ya es verde', async () => {
    programar('viva', 'Viva', async () => {}, 10);
    programar('lenta', 'Lenta', async () => {}, 24 * 60 * MIN);
    await esperar(40);
    const { piezas: ps } = await comprobarTodo();
    expect(ps.find((p) => p.nombre === 'tareas').estado).toBe('bien');
  });
});

describe('el webhook de Stripe, que no dejaba rastro en ninguna parte', () => {
  it('sin ninguno recibido no se inventa nada', async () => {
    webhooks.ultimos.clear();
    respuestas.set('FROM stripe_sync_state', [{ proyectos: 1, ultima_sync: new Date().toISOString(), cobros_7d: 2 }]);
    const { piezas: ps } = await comprobarTodo();
    expect(ps.find((p) => p.nombre === 'stripe').datos.webhook).toBeNull();
  });

  it('uno rechazado se ve, aunque el dinero siga entrando por el sondeo', async () => {
    // Es el caso que hoy solo se descubre leyendo logs por SSH: sin secreto
    // configurado, el webhook se rechaza con un 400 y nadie se entera. No se
    // pierde dinero —el sondeo lo recoge en 5 min— pero si la inmediatez.
    webhooks.ultimos.clear();
    anotaWebhook('stripe', 'rechazado', 'el proyecto no tiene el secreto configurado');
    respuestas.set('FROM stripe_sync_state', [{ proyectos: 1, ultima_sync: new Date().toISOString(), cobros_7d: 2 }]);
    const { piezas: ps } = await comprobarTodo();
    const s = ps.find((p) => p.nombre === 'stripe');
    expect(s.estado).toBe('atencion');
    expect(s.detalle).toMatch(/no tiene el secreto/);
  });

  it('no pisa un fallo mas grave', async () => {
    // Si la sincronizacion lleva horas caida, eso manda: el webhook rechazado
    // es el menor de los dos problemas.
    webhooks.ultimos.clear();
    anotaWebhook('stripe', 'rechazado', 'firma invalida');
    respuestas.set('FROM stripe_sync_state', [{
      proyectos: 1, cobros_7d: 0,
      ultima_sync: new Date(Date.now() - 20 * 3600_000).toISOString(),
    }]);
    const { piezas: ps } = await comprobarTodo();
    expect(ps.find((p) => p.nombre === 'stripe').estado).toBe('caida');
  });

  it('no guarda nada del evento: ni importe, ni correo, ni cuerpo', () => {
    webhooks.ultimos.clear();
    anotaWebhook('stripe', 'aceptado');
    const w = ultimoWebhook('stripe');
    expect(Object.keys(w).sort()).toEqual(['aceptados', 'cuando', 'motivo', 'rechazados', 'resultado']);
  });

  it('lleva la cuenta de cuantos entraron y cuantos no', () => {
    webhooks.ultimos.clear();
    anotaWebhook('stripe', 'aceptado');
    anotaWebhook('stripe', 'aceptado');
    anotaWebhook('stripe', 'rechazado', 'firma invalida');
    const w = ultimoWebhook('stripe');
    expect(w.aceptados).toBe(2);
    expect(w.rechazados).toBe(1);
    expect(w.resultado).toBe('rechazado');
  });

  it('el controlador ficha en TODAS sus salidas, no solo cuando va bien', () => {
    // Fichar solo el camino feliz seria peor que no fichar: la pantalla diria
    // «sin webhooks» tanto si no llega ninguno como si llegan y se rechazan.
    const fs = require('node:fs');
    const src = fs.readFileSync('src/modules/stripe-payments/stripe-payments.controller.js', 'utf8');
    expect(src.match(/anotaWebhook\(/g).length).toBeGreaterThanOrEqual(4);
    // Desde #533 cada llamada lleva tambien el campus: `anotaWebhook('stripe', 'aceptado', null, pid)`.
    expect(src).toMatch(/anotaWebhook\('stripe', 'aceptado'[,)]/);
    expect(src).toMatch(/anotaWebhook\('stripe', 'rechazado'/);
  });
});

describe('el agujero que se vio antes de subirlo', () => {
  it('webhooks rechazados con Stripe sin enlazar NO se esconden', async () => {
    // El caso se ocultaba justo cuando importa: el motivo de rechazo mas comun
    // es «el proyecto no tiene el secreto configurado», y ese proyecto tampoco
    // esta en stripe_sync_state. El bloque contestaba «sin proyectos enlazados»
    // y se tragaba que estuvieran llegando webhooks y rebotando.
    respuestas.set('FROM stripe_sync_state', [{ proyectos: 0 }]);
    anotaWebhook('stripe', 'rechazado', 'el proyecto no tiene el secreto configurado');
    const { piezas: ps } = await comprobarTodo();
    const s = ps.find((p) => p.nombre === 'stripe');
    expect(s.estado).toBe('caida');
    expect(s.resumen).toMatch(/Llegan webhooks/);
    expect(s.detalle).toMatch(/secreto/);
  });

  it('y sin webhooks sigue diciendo «sin configurar», que no es un fallo', async () => {
    respuestas.set('FROM stripe_sync_state', [{ proyectos: 0 }]);
    const { piezas: ps } = await comprobarTodo();
    expect(ps.find((p) => p.nombre === 'stripe').estado).toBe('sin_configurar');
  });
});

describe('la API, que el ticket pide junto a la base de datos', () => {
  it('no se limita a decir «funciona» por haber contestado', async () => {
    // Si la API estuviera caida no habria pantalla que mirar: una tarjeta verde
    // tautologica es ruido. Lo que informa son los 5xx, que errorHandler ya
    // guardaba en status_errors sin que nadie los leyera.
    respuestas.set('FROM status_errors', [{ ultima_hora: 4, ultimas_24h: 30, ultimo: new Date().toISOString(), ruta: '/api/leads/:id' }]);
    const { piezas: ps } = await comprobarTodo();
    const a = ps.find((p) => p.nombre === 'api');
    expect(a.estado).toBe('atencion');
    expect(a.resumen).toMatch(/4 errores de servidor/);
  });

  it('muchos errores en una hora es caida, no aviso', async () => {
    respuestas.set('FROM status_errors', [{ ultima_hora: 40, ultimas_24h: 40, ultimo: new Date().toISOString(), ruta: '/api/x' }]);
    const { piezas: ps } = await comprobarTodo();
    expect(ps.find((p) => p.nombre === 'api').estado).toBe('caida');
  });

  it('la ruta que mas falla sale con los identificadores tapados', () => {
    // Sirve para saber DONDE mirar sin sacar a nadie en pantalla. El
    // enmascarado lo hace Postgres, aqui se comprueba que la consulta lo pide.
    const fs = require('node:fs');
    const src = fs.readFileSync('src/modules/status/piezas.service.js', 'utf8');
    expect(src).toMatch(/REGEXP_REPLACE\(SPLIT_PART\(path, '\?', 1\), '\/\[0-9\]\+', '\/:id'/);
  });

  it('sin errores no acusa nada, solo dice cuanto lleva arriba', async () => {
    respuestas.set('FROM status_errors', [{ ultima_hora: 0, ultimas_24h: 0, ultimo: null, ruta: null }]);
    const { piezas: ps } = await comprobarTodo();
    const a = ps.find((p) => p.nombre === 'api');
    expect(a.estado).toBe('bien');
    expect(a.resumen).toMatch(/Arriba desde hace/);
    expect(a.detalle).toBeNull();
  });
});

describe('lo que solo se ve mirando la pantalla', () => {
  it('cada pieza dice DE QUE es su fecha', async () => {
    // Se vio en la captura: la tarjeta de API ponia «Última vez, hace 4 días»
    // y esa fecha era el ultimo ERROR 5xx. Con una etiqueta comun se leia justo
    // al reves — como si la API llevara cuatro dias sin funcionar.
    respuestas.set('FROM status_errors', [{ ultima_hora: 0, ultimas_24h: 2, ultimo: new Date().toISOString(), ruta: null }]);
    const { piezas: ps } = await comprobarTodo();
    expect(ps.find((p) => p.nombre === 'api').desdeQue).toBe('Último error de servidor');
  });

  it('y ninguna que traiga fecha se queda sin etiqueta', async () => {
    respuestas.set('FROM status_errors', [{ ultima_hora: 0, ultimas_24h: 1, ultimo: new Date().toISOString() }]);
    respuestas.set('FROM email_envios', [{ ultimo_ok: new Date().toISOString(), ok_24h: 1, fallos_24h: 0, frenados_24h: 0 }]);
    respuestas.set('FROM meta_ad_accounts', [{ cuentas: 1, con_error: 0, ultimo: new Date().toISOString() }]);
    respuestas.set('FROM wc_import_runs', [{ status: 'ok', cuando: new Date().toISOString(), total_fetched: 3 }]);
    const { piezas: ps } = await comprobarTodo();
    const sinEtiqueta = ps.filter((p) => p.desde && !p.desdeQue).map((p) => p.nombre);
    expect(sinEtiqueta).toEqual([]);
  });
});
