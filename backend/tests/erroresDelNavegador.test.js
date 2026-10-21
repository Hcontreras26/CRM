// Los errores del navegador llegan al servidor (/api/client-errors).
//
// El ErrorBoundary del frontal los manda aquí y aquí se apuntan en el registro
// (pino). La misma prueba en los dos CRM (paridad, 15/10): ISEIE lo tenía desde el
// arranque y MultiCRM no.
//
// Lo que se fija:
//  · entra sin sesión (una pantalla rota puede ser la de login) y contesta 204;
//  · el límite es POR IP: 30 al minuto. Antes la clave se calculaba con
//    `ipKeyGenerator(req)` —el objeto entero, no la IP— y salía la misma para todo
//    el mundo: un navegador en bucle dejaba sin aviso a los demás.

import { describe, it, expect } from 'vitest';

const { default: supertest } = await import('supertest');
const { default: app } = await import('../src/app.js');
const request = supertest(app);

const error = { message: 'Cannot read properties of undefined', stack: 'at X', url: 'https://crm/x', userAgent: 'vitest' };

describe('POST /api/client-errors', () => {
  it('sin sesión, se apunta y contesta 204', async () => {
    const r = await request.post('/api/client-errors').set('X-Forwarded-For', '203.0.113.1').send(error);
    expect(r.status).toBe(204);
  });

  it('un mensaje enorme no la tumba', async () => {
    const r = await request.post('/api/client-errors').set('X-Forwarded-For', '203.0.113.2')
      .send({ ...error, message: 'x'.repeat(100_000), stack: 'y'.repeat(100_000) });
    expect(r.status).toBe(204);
  });

  it('el límite es por IP: la 31.ª del minuto de una IP da 429, y otra IP sigue entrando', async () => {
    const ip = '198.51.100.7';
    for (let i = 0; i < 30; i += 1) {
      const r = await request.post('/api/client-errors').set('X-Forwarded-For', ip).send(error);
      expect(r.status).toBe(204);
    }
    expect((await request.post('/api/client-errors').set('X-Forwarded-For', ip).send(error)).status).toBe(429);
    expect((await request.post('/api/client-errors').set('X-Forwarded-For', '198.51.100.8').send(error)).status).toBe(204);
  });
});
