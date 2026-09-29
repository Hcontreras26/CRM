import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';

const request = supertest(app);
let adminToken, gestorToken;
const createdExpenseIds = [];

beforeAll(async () => {
  const a = await request.post('/api/auth/login').send({ email: 'diego@empresa.com', password: 'CrmTemp2026!' });
  adminToken = a.body.data.accessToken;

  // Crear gestor si no existe
  await pool.query(`
    INSERT INTO users (nombre, email, password_hash, role)
    VALUES ('Test Gestor Acc', 'gestor-acc@test.com',
      '$2b$12$djqxmZQ9GGhZJVYgy7bp4uVO2YkTm3sff5Eug0O7ll7SgaDayW5Ge', 'gestor')
    ON CONFLICT (email) DO NOTHING
  `);
  const g = await request.post('/api/auth/login').send({ email: 'gestor-acc@test.com', password: 'CrmTemp2026!' });
  gestorToken = g.body.data?.accessToken;
});

afterAll(async () => {
  for (const id of createdExpenseIds) await pool.query(`DELETE FROM expenses WHERE id = $1`, [id]);
  await pool.query(`DELETE FROM users WHERE email = 'gestor-acc@test.com'`);
  await pool.end();
});

describe('POST /api/accounting/expenses - crear egreso', () => {
  it('admin crea egreso', async () => {
    const res = await request.post('/api/accounting/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        project_id: 1,
        concepto: 'Alquiler oficina abril',
        importe: 1200,
        categoria: 'alquiler',
        fecha: '2026-04-01',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.concepto).toBe('Alquiler oficina abril');
    createdExpenseIds.push(res.body.data.id);
  });

  it('crea egreso sin proyecto (gasto general)', async () => {
    const res = await request.post('/api/accounting/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        concepto: 'Hosting cloudflare',
        importe: 25,
        categoria: 'software',
        // `fecha` es obligatoria desde 2d9816e (24-abr). La prueba es del 23 y
        // nunca se actualizo: llevaba rojo desde entonces.
        fecha: '2026-04-15',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.project_id).toBeNull();
    createdExpenseIds.push(res.body.data.id);
  });

  it('falla con importe negativo', async () => {
    const res = await request.post('/api/accounting/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ concepto: 'Test', importe: -100 });
    expect(res.status).toBe(400);
  });

  it('gestor NO puede crear egresos', async () => {
    if (!gestorToken) return;
    const res = await request.post('/api/accounting/expenses')
      .set('Authorization', `Bearer ${gestorToken}`)
      .send({ concepto: 'Test', importe: 50 });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/accounting/expenses - listar', () => {
  it('lista egresos con filtros', async () => {
    const res = await request.get('/api/accounting/expenses?categoria=alquiler')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  it('filtra por proyecto', async () => {
    const res = await request.get('/api/accounting/expenses?projectId=1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/accounting/expenses/:id - editar', () => {
  it('actualiza importe', async () => {
    const id = createdExpenseIds[0];
    const res = await request.patch(`/api/accounting/expenses/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ importe: 1250 });
    expect(res.status).toBe(200);
    expect(Number(res.body.data.importe)).toBe(1250);
  });
});

describe('DELETE /api/accounting/expenses/:id', () => {
  it('elimina egreso', async () => {
    const temp = await request.post('/api/accounting/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ concepto: 'Temp', importe: 10, fecha: '2026-04-15' });
    const id = temp.body.data.id;

    const res = await request.delete(`/api/accounting/expenses/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/accounting/dashboard', () => {
  it('retorna stats completas', async () => {
    const res = await request.get('/api/accounting/dashboard?projectId=1&from=2026-01-01&to=2026-12-31')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.ingresos).toBeDefined();
    expect(res.body.data.egresos).toBeDefined();
    expect(res.body.data.balance).toBeDefined();
    expect(res.body.data.cuentas_por_cobrar).toBeInstanceOf(Array);
    expect(res.body.data.trend.ingresos).toBeInstanceOf(Array);
    expect(res.body.data.trend.egresos).toBeInstanceOf(Array);
  });

  it('gestor NO puede ver dashboard accounting', async () => {
    if (!gestorToken) return;
    const res = await request.get('/api/accounting/dashboard')
      .set('Authorization', `Bearer ${gestorToken}`);
    expect(res.status).toBe(403);
  });
});
