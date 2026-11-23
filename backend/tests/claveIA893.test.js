import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

/*
  CRM#893 · La clave de IA que se pega en «APIs globales» no la usaba nadie.

  La pantalla la guarda con el tipo `claude`; el chat, los informes, «Preguntar»
  y la lectura semanal la buscaban como `anthropic`, que ni siquiera existe en
  el enum `api_service` de la base: la consulta fallaba, el `catch` se lo
  tragaba y solo valía ANTHROPIC_API_KEY del servidor.

  Se prueba, SIN base, con una «base» que solo tiene lo que la pantalla puede
  guardar (`claude`) y que, como la de verdad, rechaza `anthropic`:
    · que con la clave pegada en la web y sin ANTHROPIC_API_KEY el chat y la
      página de estado dicen que la IA funciona;
    · el orden: campus, global de la web y servidor; y de dónde sale;
    · que ningún sitio que llama a Claude busca ya `anthropic`.
*/

const base = vi.hoisted(() => ({ claves: new Map(), lecturas: [], sellos: [], probadas: [] }));
const clave = (service, projectId) => `${service}:${projectId ?? 'global'}`;

vi.mock('../src/modules/credentials/credentials.model.js', () => ({
  getDecryptedValue: vi.fn(async (service, projectId = null, { marcar = true } = {}) => {
    base.lecturas.push(service);
    // Como el modelo de verdad: leer con `marcar` sella el «último uso».
    if (marcar && base.claves.has(clave(service, projectId))) base.sellos.push(clave(service, projectId));
    // Como Postgres: `anthropic` no es un valor del enum api_service.
    if (service !== 'claude') throw new Error(`invalid input value for enum api_service: "${service}"`);
    return base.claves.get(clave(service, projectId)) || null;
  }),
  recordTestResult: vi.fn(async (id, result) => { base.probadas.push({ id, result }); }),
}));
vi.mock('../src/shared/utils/crypto.js', () => ({ decrypt: vi.fn((v) => `descifrada:${v}`), encrypt: vi.fn() }));
vi.mock('../src/shared/config/db.js', () => ({ query: vi.fn(async () => ({ rows: [] })), getClient: vi.fn() }));
vi.mock('../src/modules/claude-chat/chat.model.js', () => ({ countUserMessagesLastHour: vi.fn(async () => 0) }));
vi.mock('../src/shared/services/gastoIA.service.js', () => ({ estado: vi.fn(async () => ({ puede: true })) }));
vi.mock('../src/modules/status/status.model.js', () => ({
  getComponents: vi.fn(async () => [{ slug: 'ia', status: 'operational' }]),
  getActiveIncidents: vi.fn(async () => []),
}));

const { claveDeIA, soloLaClave, probarClaveDeIA, SERVICIO_IA } = await import('../src/modules/credentials/clave-ia.js');
const credenciales = await import('../src/modules/credentials/credentials.controller.js');
const db = await import('../src/shared/config/db.js');
const chat = await import('../src/modules/claude-chat/chat.controller.js');
const estado = await import('../src/modules/status/status.service.js');

const SERVIDOR = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  base.claves.clear();
  base.lecturas.length = 0;
  base.sellos.length = 0;
  base.probadas.length = 0;
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  if (SERVIDOR === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = SERVIDOR;
});

async function estadoDelChat(query = {}) {
  let salida = null;
  let error = null;
  await chat.status({ user: { userId: 3 }, query }, { json: (d) => { salida = d; } }, (e) => { error = e; });
  if (error) throw error;
  return salida.data;
}

describe('la clave pegada en «APIs globales» se usa', () => {
  it('el chat la encuentra sin ANTHROPIC_API_KEY en el servidor, y dice de dónde sale', async () => {
    base.claves.set(clave('claude', null), 'sk-ant-web');
    const d = await estadoDelChat();
    expect(d.api_configured).toBe(true);
    expect(d.origen_clave).toBe('global');
    expect(d.warning).toBeNull();
  });

  it('la página de estado dice que la IA funciona (antes, «degradado»)', async () => {
    base.claves.set(clave('claude', null), 'sk-ant-web');
    const { components } = await estado.getSystemStatus();
    expect(components.find((c) => c.slug === 'ia').status).toBe('operational');
  });

  it('sin ninguna clave, el aviso dice dónde se pone (no el nombre de la variable)', async () => {
    const d = await estadoDelChat();
    expect(d.api_configured).toBe(false);
    expect(d.origen_clave).toBeNull();
    expect(d.warning).toMatch(/APIs globales/);
    expect(d.warning).not.toMatch(/ANTHROPIC_API_KEY/);
  });

  it('se busca con el tipo que guarda la pantalla, nunca con «anthropic»', async () => {
    await estadoDelChat({ projectId: '4' });
    expect(SERVICIO_IA).toBe('claude');
    expect(base.lecturas).toEqual(['claude', 'claude']);
  });
});

describe('el orden: campus, global de la web y servidor', () => {
  it('con las tres, la del campus', async () => {
    base.claves.set(clave('claude', 4), 'sk-campus');
    base.claves.set(clave('claude', null), 'sk-global');
    process.env.ANTHROPIC_API_KEY = 'sk-servidor';
    expect(await claveDeIA(4)).toEqual({ clave: 'sk-campus', origen: 'campus' });
  });

  it('sin la del campus, la global antes que la del servidor', async () => {
    base.claves.set(clave('claude', null), 'sk-global');
    process.env.ANTHROPIC_API_KEY = 'sk-servidor';
    expect(await claveDeIA(4)).toEqual({ clave: 'sk-global', origen: 'global' });
    expect(await claveDeIA(null)).toEqual({ clave: 'sk-global', origen: 'global' });
  });

  it('solo la del servidor', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-servidor';
    expect(await claveDeIA(4)).toEqual({ clave: 'sk-servidor', origen: 'servidor' });
  });

  it('ninguna', async () => {
    expect(await claveDeIA(4)).toEqual({ clave: null, origen: null });
  });

  it('si la guardada no se puede leer, sigue con la siguiente', async () => {
    const leer = vi.fn(async (_s, projectId) => {
      if (projectId) throw new Error('descifrado roto');
      return 'sk-global';
    });
    expect(await claveDeIA(4, { leer, env: {} })).toEqual({ clave: 'sk-global', origen: 'global' });
  });
});

describe('nadie busca ya «anthropic»', () => {
  const SRC = path.resolve(__dirname, '../src');
  function ficheros(dir, acc = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) ficheros(p, acc);
      else if (e.name.endsWith('.js')) acc.push(p);
    }
    return acc;
  }

  it('ninguna lectura de credenciales con el tipo «anthropic»', () => {
    const malos = ficheros(SRC).filter((f) => /getDecryptedValue\(\s*['"]anthropic['"]/.test(fs.readFileSync(f, 'utf8')));
    expect(malos.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('chat, informes, «Preguntar» y la lectura semanal sacan la clave de clave-ia.js', () => {
    for (const f of [
      'modules/claude-chat/chat.controller.js',
      'modules/reports-ia/report.controller.js',
      'modules/ia-analisis/preguntar.service.js',
      'modules/ia-analisis/lectura.js',
      'modules/status/status.service.js',
    ]) {
      expect(fs.readFileSync(path.join(SRC, f), 'utf8'), f).toMatch(/from '\.\.\/credentials\/clave-ia\.js'/);
    }
  });
});

describe('mirar qué clave hay no es usarla', () => {
  // En «Claves» el «último uso» delata la clave que ya no usa nadie. Si la
  // página de estado o una pantalla lo sellaran, nunca saldría como olvidada.
  it('la página de estado, el estado del chat y «qué clave usa la IA» no sellan el uso', async () => {
    base.claves.set(clave('claude', null), 'sk-ant-web');
    await estado.getSystemStatus();
    await estadoDelChat();
    let salida = null;
    await credenciales.iaEnUso({ user: { userId: 1, role: 'superadmin' }, query: {} }, { json: (d) => { salida = d; } }, (e) => { throw e; });
    expect(salida.data.origen).toBe('global');
    expect(salida.data.texto).toBe('La IA usa la global de la web.');
    expect(base.sellos).toEqual([]);
  });

  it('usarla de verdad (chat, informes, Preguntar) sí lo sella', async () => {
    base.claves.set(clave('claude', null), 'sk-ant-web');
    expect(await soloLaClave(null)).toBe('sk-ant-web');
    expect(base.sellos).toEqual(['claude:global']);
  });
});

describe('«Probar» la clave de Claude de verdad', () => {
  const respuesta = (status) => async () => ({ ok: status >= 200 && status < 300, status });

  it('pregunta a Anthropic la lista de modelos con la clave, sin gastar tokens', async () => {
    const pedir = vi.fn(respuesta(200));
    expect(await probarClaveDeIA('sk-ant-x', { fetch: pedir })).toEqual({ result: 'ok', message: 'Anthropic acepta la clave.' });
    const [url, opciones] = pedir.mock.calls[0];
    expect(url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/models/);
    expect(opciones.method ?? 'GET').toBe('GET');
    expect(opciones.headers['x-api-key']).toBe('sk-ant-x');
    expect(opciones.headers['anthropic-version']).toBeTruthy();
  });

  it.each([
    [401, /rechaza la clave/],
    [403, /no le deja usar la API/],
    [500, /contestó 500/],
  ])('Anthropic contesta %s: falla y dice por qué', async (status, mensaje) => {
    const r = await probarClaveDeIA('sk-ant-x', { fetch: respuesta(status) });
    expect(r.result).toBe('failed');
    expect(r.message).toMatch(mensaje);
  });

  it('sin red: falla, no revienta', async () => {
    const r = await probarClaveDeIA('sk-ant-x', { fetch: async () => { throw new Error('ENOTFOUND'); } });
    expect(r).toEqual({ result: 'failed', message: 'No se pudo hablar con Anthropic: ENOTFOUND' });
  });

  it('el botón «Probar» de una credencial claude la prueba (antes decía «ok» a todo)', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ service: 'claude', encrypted_value: 'v', iv: 'i', auth_tag: 't' }] });
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(respuesta(401));
    try {
      let salida = null;
      await credenciales.test({ params: { id: '9' }, user: { userId: 1 } }, { json: (d) => { salida = d; } }, (e) => { throw e; });
      expect(salida.data.result).toBe('failed');
      expect(globalThis.fetch.mock.calls[0][1].headers['x-api-key']).toBe('descifrada:v');
      expect(base.probadas).toEqual([{ id: 9, result: 'failed' }]);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('solo la clave de producción', () => {
  it('la IA pide la de producción, como el MCP de Moodle', async () => {
    const leer = vi.fn(async () => 'sk-ant-web');
    await claveDeIA(4, { leer, env: {} });
    expect(leer).toHaveBeenCalledWith('claude', 4, expect.objectContaining({ soloProduccion: true }));
  });

  it('la consulta deja fuera la de «pruebas» (y los demás servicios siguen igual)', async () => {
    const real = await vi.importActual('../src/modules/credentials/credentials.model.js');
    db.query.mockClear();
    await real.getDecryptedValue('claude', null, { soloProduccion: true });
    expect(db.query.mock.calls.at(-1)[0]).toMatch(/COALESCE\(metadata->>'entorno', 'produccion'\) = 'produccion'/);
    await real.getDecryptedValue('brevo', 3);
    expect(db.query.mock.calls.at(-1)[0]).not.toMatch(/entorno/);
  });
});
