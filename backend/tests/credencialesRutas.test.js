// Las rutas del panel de claves contra la base de verdad, tarea #80.
//
// Existen porque probando el modelo directamente todo pasaba y las rutas
// contestaban 400: el esquema de Zod tenia su PROPIA lista de servicios, aparte
// del enum de la base, y le faltaban los cuatro que la #80 trae del .env. Dos
// sitios que hay que mantener a la par y nada que lo vigilara.
//
// Comprueban ademas las dos cosas que el ticket marca como innegociables: que
// el listado no traiga el valor, y que ningun rol de mas entre por las rutas
// nuevas.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';

const request = supertest(app);
let saToken, adminToken;
const creados = [];

beforeAll(async () => {
  const sa = await request.post('/api/auth/login').send({ email: 'manuel@empresa.com', password: 'CrmTemp2026!' });
  saToken = sa.body.data.accessToken;
  const ad = await request.post('/api/auth/login').send({ email: 'diego@empresa.com', password: 'CrmTemp2026!' });
  adminToken = ad.body.data.accessToken;
});
afterAll(async () => {
  for (const id of creados) await pool.query('DELETE FROM api_credentials WHERE id = $1', [id]);
  await pool.end();
});

describe('rutas del panel de claves', () => {
  it('POST guarda con entorno', async () => {
    const r = await request.post('/api/credentials').set('Authorization', `Bearer ${saToken}`)
      .send({ project_id: null, service: 'make', value: 'make-clave-de-prueba-1234', entorno: 'produccion' });
    expect(r.status).toBe(201);
    creados.push(r.body.data.id);
  });

  it('GET /paridad no se confunde con /:id', async () => {
    const r = await request.get('/api/credentials/paridad').set('Authorization', `Bearer ${saToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
  });

  it('GET /registro tampoco', async () => {
    const r = await request.get('/api/credentials/registro').set('Authorization', `Bearer ${saToken}`);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.data)).toBe(true);
  });

  it('GET /:id/revelar devuelve el valor y lo anota', async () => {
    const id = creados[0];
    const r = await request.get(`/api/credentials/${id}/revelar`).set('Authorization', `Bearer ${saToken}`);
    expect(r.status).toBe(200);
    expect(r.body.data.value).toBe('make-clave-de-prueba-1234');
    const { rows } = await pool.query(
      `SELECT action, details FROM user_activity_log WHERE action='credencial.ver' ORDER BY id DESC LIMIT 1`);
    expect(rows[0].details.servicio).toBe('make');
    expect(JSON.stringify(rows[0].details)).not.toMatch(/make-clave/);
  });

  it('el listado NO trae el valor', async () => {
    const r = await request.get('/api/credentials').set('Authorization', `Bearer ${saToken}`);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body.data)).not.toMatch(/make-clave-de-prueba/);
  });

  it('admin no entra por ninguna de las nuevas', async () => {
    for (const ruta of ['/api/credentials/paridad', '/api/credentials/registro', `/api/credentials/${creados[0]}/revelar`]) {
      const r = await request.get(ruta).set('Authorization', `Bearer ${adminToken}`);
      expect(r.status).toBe(403);
    }
  });
});
