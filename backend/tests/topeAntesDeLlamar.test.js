import {
  describe, it, expect, vi, beforeEach,
} from 'vitest';

/**
 * El tope se mira ANTES de llamar a Anthropic (#22).
 *
 * Esta prueba existe por una sola razon: comprobar el gasto DESPUES de la
 * llamada tambien pasa todas las pruebas del servicio —el contador sube, el
 * estado dice «agotado», el aviso sale— y no sirve absolutamente para nada,
 * porque la llamada que se pasa del tope ya esta pagada cuando vuelve.
 *
 * La diferencia entre un tope que funciona y uno decorativo no se ve en el
 * servicio: se ve en si `fetch` llego a salir. Eso es lo unico que se mira
 * aqui, en los dos sitios que llaman.
 */

const mensajesGuardados = [];

vi.mock('../src/modules/claude-chat/chat.model.js', () => ({
  createConversation: vi.fn(async () => ({ id: 1 })),
  findConversation: vi.fn(async () => ({ id: 1, user_id: 9 })),
  listMessages: vi.fn(async () => []),
  addMessage: vi.fn(async (m) => { mensajesGuardados.push(m); return m; }),
  countUserMessagesLastHour: vi.fn(async () => 0),
}));

vi.mock('../src/shared/config/db.js', () => ({
  query: vi.fn(async () => ({ rows: [{ nombre: 'X', type: 'educativo', total: 0, ultimos30: 0, facturado: 0 }] })),
}));

vi.mock('../src/modules/credentials/credentials.model.js', () => ({
  getDecryptedValue: vi.fn(async () => 'sk-ant-de-mentira'),
}));

vi.mock('../src/modules/reports-ia/report.model.js', () => ({
  // `null` a proposito: si contesta un reporte ya hecho, `generate` sale por la
  // rama de cache y no llega a mirar el tope — la prueba pasaria sin probar
  // nada.
  findByPeriodo: vi.fn(async () => null),
  findById: vi.fn(async () => null),
  listByProject: vi.fn(async () => []),
  upsert: vi.fn(async (r) => ({ id: 1, ...r })),
}));

vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

let permitido = true;
const registrar = vi.fn(async () => ({ apuntado: true, usd: 0 }));
const estadoFalso = {
  instalado: true, tope: 10, gastado: 10, queda: 0, porcentaje: 100,
  cerca: false, agotado: true, llamadas: 1, inciertas: 0, fallosAlApuntar: 0, aviso: null,
};

vi.mock('../src/shared/services/gastoIA.service.js', () => ({
  compruebaAntesDeGastar: vi.fn(async () => (permitido
    ? { permitido: true, motivo: null, estado: { ...estadoFalso, agotado: false, gastado: 1 } }
    : { permitido: false, motivo: 'Se alcanzo el tope de gasto en IA de este mes (10 de 10 USD).', estado: estadoFalso })),
  registrar,
  estado: vi.fn(async () => ({ ...estadoFalso, agotado: false, gastado: 1, porcentaje: 10 })),
}));

const chat = await import('../src/modules/claude-chat/chat.controller.js');
const reportes = await import('../src/modules/reports-ia/report.controller.js');

/** Un `res` de Express que se deja escribir SSE encima. */
function resDeMentira() {
  const enviado = [];
  return {
    enviado,
    setHeader() {},
    flushHeaders() {},
    write(txt) {
      const m = String(txt).match(/^data: (.*)\n\n$/s);
      if (m) enviado.push(JSON.parse(m[1]));
    },
    end() {},
    status() { return this; },
    json(payload) { this.payload = payload; return this; },
  };
}

let fetchLlamado;

beforeEach(() => {
  mensajesGuardados.length = 0;
  registrar.mockClear();
  permitido = true;
  fetchLlamado = 0;
  global.fetch = vi.fn(async () => {
    fetchLlamado += 1;
    throw new Error('no deberia haberse llamado');
  });
});

describe('el chat', () => {
  it('con el tope agotado NO llama a Anthropic', async () => {
    permitido = false;
    const res = resDeMentira();
    await chat.chat(
      { body: { message: 'hola', projectId: 1 }, user: { userId: 9 } },
      res,
      (err) => { throw err; }
    );
    expect(fetchLlamado).toBe(0);
  });

  it('y dice por que, en vez de quedarse callado o dar un error raro', async () => {
    permitido = false;
    const res = resDeMentira();
    await chat.chat({ body: { message: 'hola', projectId: 1 }, user: { userId: 9 } }, res, (e) => { throw e; });

    const texto = res.enviado.filter((e) => e.type === 'delta').map((e) => e.content).join('');
    expect(texto).toMatch(/tope/i);

    const fin = res.enviado.find((e) => e.type === 'done');
    expect(fin.warning).toBe('TOPE_AGOTADO');
    expect(fin.gasto.agotado).toBe(true);
  });

  it('lo que contesta queda guardado en la conversacion, no solo en pantalla', async () => {
    // Si el aviso solo se pinta, al recargar el chat aparece una pregunta del
    // usuario sin respuesta y parece que se perdio.
    permitido = false;
    await chat.chat(
      { body: { message: 'hola', projectId: 1 }, user: { userId: 9 } },
      resDeMentira(),
      (e) => { throw e; }
    );
    const delAsistente = mensajesGuardados.filter((m) => m.role === 'assistant');
    expect(delAsistente).toHaveLength(1);
    expect(delAsistente[0].content).toMatch(/tope/i);
  });

  it('no apunta gasto de una llamada que no se hizo', async () => {
    permitido = false;
    await chat.chat(
      { body: { message: 'hola', projectId: 1 }, user: { userId: 9 } },
      resDeMentira(),
      (e) => { throw e; }
    );
    expect(registrar).not.toHaveBeenCalled();
  });

  it('con margen si llama (y si falla, apunta lo gastado igual)', async () => {
    permitido = true;
    const res = resDeMentira();
    await chat.chat({ body: { message: 'hola', projectId: 1 }, user: { userId: 9 } }, res, (e) => { throw e; });
    expect(fetchLlamado).toBe(1);
    // El fetch de mentira revienta: es el camino de error, y ahi tambien se
    // apunta porque los tokens de entrada ya se pagaron.
    expect(registrar).toHaveBeenCalledWith(expect.objectContaining({ origen: 'chat' }));
  });
});

describe('el reporte mensual', () => {
  const req = (body = {}) => ({ params: { projectId: '1' }, body, user: { userId: 9 } });

  it('con el tope agotado NO llama a Anthropic', async () => {
    permitido = false;
    const res = resDeMentira();
    await reportes.generate(req(), res, (e) => { throw e; });
    expect(fetchLlamado).toBe(0);
  });

  it('pero el reporte sale igual, con los datos del CRM', async () => {
    // Quedarse sin reporte no es lo que pide el issue; lo que pide es no
    // gastar. El reporte basico no cuesta nada y sigue sirviendo.
    permitido = false;
    const res = resDeMentira();
    await reportes.generate(req(), res, (e) => { throw e; });
    expect(res.payload?.data?.content).toBeTruthy();
  });

  it('el aviso distingue «tope» de «falta la clave», que se arreglan distinto', async () => {
    permitido = false;
    const res = resDeMentira();
    await reportes.generate(req(), res, (e) => { throw e; });
    expect(res.payload.data.warning).toMatch(/tope/i);
    expect(res.payload.data.warning).not.toMatch(/ANTHROPIC_API_KEY no configurada/);
  });
});
