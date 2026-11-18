import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * #188 · revisión en /testeo (06/11): `GET /api/consultas/<algo que no es un
 * número>` daba 500 (Postgres 22P02, `parseInt` → NaN). Tiene que ser 404, y
 * sin llegar a la base. El caso que se vio: `/api/consultas/tutores`.
 */

const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../src/shared/config/db.js', () => ({
  query: (...a) => db.query(...a),
  getClient: async () => ({ query: (...a) => db.query(...a), release: () => {} }),
  default: { query: (...a) => db.query(...a) },
}));

const { errorHandler } = await import('../src/shared/middleware/errorHandler.js');
const { default: consultasModule } = await import('../src/modules/consultas/index.js');

const app = express();
app.use(express.json());
app.use(consultasModule.prefix, consultasModule.router);
app.use(errorHandler);

const token = jwt.sign({ userId: 41, role: 'tutor' }, process.env.JWT_SECRET);
const como = (metodo, url) => supertest(app)[metodo](url).set('Authorization', `Bearer ${token}`);

beforeEach(() => {
  db.query.mockReset();
  // Si algo llega a la base con un id malo, que se note como el 22P02 de verdad.
  db.query.mockRejectedValue(Object.assign(new Error('invalid input syntax for type integer: "NaN"'), { code: '22P02' }));
});

describe('#188 · un :id que no es un número da 404, no 500', () => {
  it.each([
    ['get', '/api/consultas/tutores'],
    ['get', '/api/consultas/abc'],
    ['get', '/api/consultas/12abc'],
    ['get', '/api/consultas/0'],
    ['get', '/api/consultas/99999999999'],
    ['post', '/api/consultas/abc/responder'],
    ['post', '/api/consultas/abc/cerrar'],
    ['get', '/api/consultas/abc/tutores'],
    ['post', '/api/consultas/abc/reasignar'],
  ])('%s %s', async (metodo, url) => {
    const r = await como(metodo, url);
    expect(r.status).toBe(404);
    expect(r.body.error?.code ?? r.body.code).toBe('NOT_FOUND');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('un id que sí es un número sigue llegando a la consulta', async () => {
    db.query.mockResolvedValue({ rows: [] });
    const r = await como('get', '/api/consultas/123');
    // No existe en la base simulada: el 404 de siempre, pero después de mirarla.
    expect(r.status).toBe(404);
    expect(db.query).toHaveBeenCalled();
  });
});
