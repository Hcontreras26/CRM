// Sistema → Mensajes: el chat interno del equipo (/api/mensajes).
//
// Paridad (15/10): el mismo módulo en los dos CRM, y esta misma prueba en los dos.
// Va contra la base de verdad (la local desechable, o la de la CI): crea sus dos
// personas y las borra al acabar, así que no depende de los datos de ejemplo.
//
// Lo que se fija:
//  · sin sesión no se entra, y el nombre viejo (/api/messages) sigue contestando;
//  · una conversación directa entre dos es UNA: pedirla otra vez devuelve la misma;
//  · lo que manda uno le cuenta como «no leído» al otro, y deja de contar al leerlo;
//  · quien no está en la conversación no la lee.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const { default: supertest } = await import('supertest');
const { default: app } = await import('../src/app.js');
const { default: pool } = await import('../src/shared/config/db.js');
const { default: jwt } = await import('jsonwebtoken');

const request = supertest(app);
const sufijo = `${Date.now()}.${Math.floor(Math.random() * 1e6)}`;
const usuarios = [];
const token = (u) => jwt.sign({ userId: u.id, email: u.email, role: u.role, roles_extra: [] }, process.env.JWT_SECRET, { expiresIn: '10m' });

async function persona(nombre, role = 'gestor') {
  const { rows: [u] } = await pool.query(
    `INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, email, role`,
    [nombre, `mensajes.${nombre.toLowerCase()}.${sufijo}@prueba.test`, role]);
  usuarios.push(u.id);
  return u;
}

let ana;
let luis;
let otra;
beforeAll(async () => {
  ana = await persona('Ana');
  luis = await persona('Luis');
  otra = await persona('Otra');
});

afterAll(async () => {
  if (usuarios.length) {
    await pool.query(
      `DELETE FROM conversations WHERE id IN (
         SELECT conversation_id FROM conversation_participants WHERE user_id = ANY($1::int[]))`, [usuarios]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [usuarios]);
  }
  await pool.end();
});

const como = (u, req) => req.set('Authorization', `Bearer ${token(u)}`);

describe('Mensajes del equipo', () => {
  it('sin sesión, 401; y el nombre viejo /api/messages también responde', async () => {
    expect((await request.get('/api/mensajes/conversations')).status).toBe(401);
    expect((await request.get('/api/messages/conversations')).status).toBe(401);
    expect((await como(ana, request.get('/api/messages/conversations/unread-count'))).status).toBe(200);
  });

  it('una conversación directa entre dos es una sola', async () => {
    const a = await como(ana, request.post('/api/mensajes/conversations').send({ participantId: luis.id }));
    expect([200, 201]).toContain(a.status);
    const b = await como(luis, request.post('/api/mensajes/conversations').send({ participantId: ana.id }));
    expect(b.status).toBe(200);
    const idA = a.body.data.conversationId ?? a.body.data.id ?? a.body.data.conversation?.id;
    const idB = b.body.data.conversationId ?? b.body.data.id ?? b.body.data.conversation?.id;
    expect(idA).toBeTruthy();
    expect(idB).toBe(idA);
  });

  it('lo que manda uno es «no leído» para el otro hasta que lo lee', async () => {
    const c = await como(ana, request.post('/api/mensajes/conversations').send({ participantId: luis.id }));
    const id = c.body.data.conversationId ?? c.body.data.id ?? c.body.data.conversation?.id;
    const antes = (await como(luis, request.get('/api/mensajes/conversations/unread-count'))).body.data.count;

    const m = await como(ana, request.post(`/api/mensajes/conversations/${id}/messages`).send({ body: 'Hola, ¿la llamas tú?' }));
    expect(m.status).toBe(201);

    const despues = (await como(luis, request.get('/api/mensajes/conversations/unread-count'))).body.data.count;
    expect(despues).toBe(antes + 1);

    const lista = await como(luis, request.get(`/api/mensajes/conversations/${id}/messages`));
    expect(lista.status).toBe(200);
    expect(lista.body.data.map((x) => x.body)).toContain('Hola, ¿la llamas tú?');

    expect((await como(luis, request.patch(`/api/mensajes/conversations/${id}/read`))).status).toBe(200);
    const leido = (await como(luis, request.get('/api/mensajes/conversations/unread-count'))).body.data.count;
    expect(leido).toBe(antes);
  });

  it('quien no está en la conversación no la lee', async () => {
    const c = await como(ana, request.post('/api/mensajes/conversations').send({ participantId: luis.id }));
    const id = c.body.data.conversationId ?? c.body.data.id ?? c.body.data.conversation?.id;
    const r = await como(otra, request.get(`/api/mensajes/conversations/${id}/messages`));
    expect([403, 404]).toContain(r.status);
  });
});
