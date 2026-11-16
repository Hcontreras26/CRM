import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';

const request = supertest(app);
let superadminToken, adminToken;
const createdIds = [];

beforeAll(async () => {
  const sa = await request.post('/api/auth/login').send({ email: 'manuel@empresa.com', password: 'CrmTemp2026!' });
  superadminToken = sa.body.data.accessToken;
  const ad = await request.post('/api/auth/login').send({ email: 'diego@empresa.com', password: 'CrmTemp2026!' });
  adminToken = ad.body.data.accessToken;
});

afterAll(async () => {
  for (const id of createdIds) {
    await pool.query('DELETE FROM project_queue_state WHERE project_id = $1', [id]);
    await pool.query('DELETE FROM projects WHERE id = $1', [id]);
  }
  await pool.end();
});

describe('GET /api/projects', () => {
  it('lista proyectos', async () => {
    const res = await request.get('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  // CRM#791: la clave, solo en SUS campus (webhooks.edit); el primero de la lista
  // puede ser de otro campus.
  it('incluye webhook_api_key a admin en sus campus', async () => {
    const res = await request.get('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.body.data.some((p) => p.webhook_api_key)).toBe(true);
  });
});

describe('POST /api/projects (superadmin)', () => {
  it('superadmin crea proyecto con webhook_api_key generado', async () => {
    const res = await request.post('/api/projects')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        nombre: 'Test Project QA',
        slug: 'test-qa-' + Date.now(),
        type: 'crm',
        dias_alerta_inactividad: 5,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.webhook_api_key).toMatch(/^whk_/);
    expect(res.body.data.slug).toContain('test-qa-');
    createdIds.push(res.body.data.id);
  });

  it('falla si slug duplicado', async () => {
    const slug = 'dup-test-' + Date.now();
    const r1 = await request.post('/api/projects')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ nombre: 'First', slug, type: 'crm' });
    createdIds.push(r1.body.data.id);

    const r2 = await request.post('/api/projects')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ nombre: 'Second', slug, type: 'crm' });
    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe('SLUG_EXISTS');
  });

  it('admin NO puede crear', async () => {
    const res = await request.post('/api/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'No permitido', slug: 'no-permit', type: 'crm' });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/projects/:id', () => {
  let pid;
  beforeAll(async () => {
    const res = await request.post('/api/projects')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ nombre: 'Para editar', slug: 'edit-' + Date.now(), type: 'crm' });
    pid = res.body.data.id;
    createdIds.push(pid);
  });

  it('superadmin puede editar', async () => {
    const res = await request.patch(`/api/projects/${pid}`)
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ nombre: 'Editado', dias_alerta_inactividad: 7 });
    expect(res.status).toBe(200);
    expect(res.body.data.nombre).toBe('Editado');
    expect(res.body.data.dias_alerta_inactividad).toBe(7);
  });
});

describe('POST /api/projects/:id/regenerate-webhook-key', () => {
  it('regenera webhook_api_key', async () => {
    const pid = createdIds[0];
    const before = await request.get(`/api/projects/${pid}`)
      .set('Authorization', `Bearer ${superadminToken}`);
    const oldKey = before.body.data.webhook_api_key;

    const res = await request.post(`/api/projects/${pid}/regenerate-webhook-key`)
      .set('Authorization', `Bearer ${superadminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.webhook_api_key).not.toBe(oldKey);
    expect(res.body.data.webhook_api_key).toMatch(/^whk_/);
  });
});

describe('GET /api/leads/today', () => {
  it('retorna estructura correcta', async () => {
    const res = await request.get('/api/leads/today?projectId=1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('reminders_pendientes');
    expect(res.body.data).toHaveProperty('nuevos_hoy');
    expect(res.body.data).toHaveProperty('nuevos_semana');
    expect(res.body.data).toHaveProperty('inactivos');
    expect(res.body.data).toHaveProperty('cobros_vencidos');
    expect(res.body.data).toHaveProperty('ingresos_hoy');
  });

  it('sin projectId funciona tambien', async () => {
    const res = await request.get('/api/leads/today')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});
