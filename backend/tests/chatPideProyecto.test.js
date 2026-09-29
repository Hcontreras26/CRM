import { describe, it, expect, vi } from 'vitest';

/**
 * El chat con IA pide proyecto, y lo dice (#30).
 *
 * Salió comprobando si la lógica estaba lista para el día que llegue la clave.
 * Sin `projectId`, la petición llegaba hasta la base y contestaba con un 500 y
 * el error de Postgres en crudo:
 *
 *     null value in column "project_id" of relation "ai_conversations"
 *     violates not-null constraint
 *
 * Eso, en pantalla, a una gestora. Y no es un caso raro de laboratorio: el
 * contexto que se le da al modelo sale ENTERO de un proyecto —sus leads, sus
 * conversiones—, así que sin proyecto no hay nada que preguntar. Que lo pida es
 * la pregunta, no una limitación.
 *
 * Se comprueba además que corta ANTES de tocar la base: un error de validación
 * que ya ha escrito media conversación deja basura detrás.
 */

const consultas = [];
vi.mock('../src/shared/config/db.js', () => ({
  query: vi.fn(async (sql) => { consultas.push(sql); return { rows: [] }; }),
}));

const creadas = [];
vi.mock('../src/modules/claude-chat/chat.model.js', () => ({
  createConversation: vi.fn(async (...a) => { creadas.push(a); return { id: 1 }; }),
  findConversation: vi.fn(async () => null),
  listMessages: vi.fn(async () => []),
  addMessage: vi.fn(async (m) => m),
  countUserMessagesLastHour: vi.fn(async () => 0),
}));

vi.mock('../src/modules/credentials/credentials.model.js', () => ({
  getDecryptedValue: vi.fn(async () => null),
}));
vi.mock('../src/shared/utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('../src/shared/services/gastoIA.service.js', () => ({
  compruebaAntesDeGastar: vi.fn(async () => ({ permitido: true, motivo: null, estado: {} })),
  registrar: vi.fn(async () => ({ apuntado: true, usd: 0 })),
  estado: vi.fn(async () => ({ cerca: false })),
}));

const chat = await import('../src/modules/claude-chat/chat.controller.js');

/** Llama al controlador y devuelve el error que le pasó a `next`. */
async function pedir(body) {
  let err = null;
  const res = { setHeader() {}, flushHeaders() {}, write() {}, end() {} };
  await chat.chat({ body, user: { userId: 9 } }, res, (e) => { err = e; });
  return err;
}

describe('el chat con IA necesita un proyecto', () => {
  it('sin projectId lo dice en castellano, no con un error de Postgres', async () => {
    const err = await pedir({ message: 'hola' });
    expect(err).toBeTruthy();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('PROJECT_REQUIRED');
    expect(err.message).toMatch(/proyecto/i);
    // Y no se le enseña a nadie el nombre de la columna.
    expect(err.message).not.toMatch(/project_id|not-null|constraint/);
  });

  it('corta antes de tocar la base', async () => {
    // Fallar a mitad deja una conversación creada que nadie va a abrir.
    consultas.length = 0;
    creadas.length = 0;
    await pedir({ message: 'hola' });
    expect(creadas).toHaveLength(0);
    expect(consultas).toHaveLength(0);
  });

  it('un projectId de cero tampoco vale', async () => {
    // `0` es falsy y llegaba igual a la base. Es el mismo agujero.
    const err = await pedir({ message: 'hola', projectId: 0 });
    expect(err?.code).toBe('PROJECT_REQUIRED');
  });

  it('sin mensaje sigue quejándose de lo suyo, no del proyecto', async () => {
    const err = await pedir({ projectId: 1 });
    expect(err?.code).toBe('VALIDATION_ERROR');
  });
});
