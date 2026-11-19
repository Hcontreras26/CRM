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

const base = vi.hoisted(() => ({ claves: new Map(), lecturas: [] }));
const clave = (service, projectId) => `${service}:${projectId ?? 'global'}`;

vi.mock('../src/modules/credentials/credentials.model.js', () => ({
  getDecryptedValue: vi.fn(async (service, projectId = null) => {
    base.lecturas.push(service);
    // Como Postgres: `anthropic` no es un valor del enum api_service.
    if (service !== 'claude') throw new Error(`invalid input value for enum api_service: "${service}"`);
    return base.claves.get(clave(service, projectId)) || null;
  }),
}));
vi.mock('../src/shared/config/db.js', () => ({ query: vi.fn(async () => ({ rows: [] })), getClient: vi.fn() }));
vi.mock('../src/modules/claude-chat/chat.model.js', () => ({ countUserMessagesLastHour: vi.fn(async () => 0) }));
vi.mock('../src/shared/services/gastoIA.service.js', () => ({ estado: vi.fn(async () => ({ puede: true })) }));
vi.mock('../src/modules/status/status.model.js', () => ({
  getComponents: vi.fn(async () => [{ slug: 'ia', status: 'operational' }]),
  getActiveIncidents: vi.fn(async () => []),
}));

const { claveDeIA, SERVICIO_IA } = await import('../src/modules/credentials/clave-ia.js');
const chat = await import('../src/modules/claude-chat/chat.controller.js');
const estado = await import('../src/modules/status/status.service.js');

const SERVIDOR = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  base.claves.clear();
  base.lecturas.length = 0;
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
