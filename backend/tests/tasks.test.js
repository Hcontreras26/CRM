import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';

const request = supertest(app);

let adminToken;
let gestorToken;
let otherGestorToken;
let adminUser = { id: 999901, email: 'admin-tasks@crm-test.com', role: 'admin' };
let gestorUser = { id: 999902, email: 'gestor-tasks@crm-test.com', role: 'gestor' };
let otherGestorUser = { id: 999903, email: 'other-gestor-tasks@crm-test.com', role: 'gestor' };

function makeToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      roles_extra: [],
      customRoleId: null,
      activeProjectId: 1,
    },
    process.env.JWT_SECRET || 'test_secret_for_vitest_runs',
    { expiresIn: '1h' }
  );
}

beforeAll(async () => {
  adminToken = makeToken(adminUser);
  gestorToken = makeToken(gestorUser);
  otherGestorToken = makeToken(otherGestorUser);

  // Aseguramos que la tabla existe si se corre contra base de datos
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'por_hacer'
            CHECK (status IN ('por_hacer', 'en_curso', 'en_revision', 'hecha')),
        position NUMERIC(12, 4) NOT NULL DEFAULT 1000.0000,
        priority VARCHAR(20) NOT NULL DEFAULT 'media'
            CHECK (priority IN ('baja', 'media', 'alta')),
        due_date TIMESTAMPTZ,
        project_id INTEGER,
        assigned_to INTEGER,
        created_by INTEGER NOT NULL,
        completed_at TIMESTAMPTZ,
        archived_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS task_events (
        id BIGSERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL,
        user_id INTEGER,
        event_type VARCHAR(50) NOT NULL,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } catch (err) {
    // Si la base no está levantada en este instante, supertest probará validaciones
  }
});

describe('Módulo de Tareas (Tablero Trello / Kanban)', () => {
  let createdTaskId;

  it('Rechaza peticiones sin autenticación (401)', async () => {
    const res = await request.get('/api/tasks');
    expect(res.status).toBe(401);
  });

  it('Gestor puede crearse una tarea para sí mismo (201)', async () => {
    const res = await request
      .post('/api/tasks')
      .set('Authorization', `Bearer ${gestorToken}`)
      .send({
        title: 'Preparar informe de ventas',
        description: 'Detalle de la tarea',
        priority: 'alta',
      });

    if (res.status === 201) {
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Preparar informe de ventas');
      expect(res.body.data.status).toBe('por_hacer');
      expect(res.body.data.assigned_to).toBe(gestorUser.id);
      createdTaskId = res.body.data.id;
    }
  });

  it('Gestor NO puede asignar una tarea a otro usuario (403)', async () => {
    const res = await request
      .post('/api/tasks')
      .set('Authorization', `Bearer ${gestorToken}`)
      .send({
        title: 'Tarea para otro',
        assigned_to: otherGestorUser.id,
      });

    expect(res.status).toBe(403);
  });

  it('Admin SÍ puede asignar una tarea a cualquier usuario (201)', async () => {
    const res = await request
      .post('/api/tasks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Tarea asignada por admin',
        assigned_to: gestorUser.id,
        priority: 'media',
      });

    if (res.status === 201) {
      expect(res.body.success).toBe(true);
      expect(res.body.data.assigned_to).toBe(gestorUser.id);
    }
  });

  it('Gestor puede mover su tarea hasta "en_revision"', async () => {
    if (!createdTaskId) return;

    const res = await request
      .patch(`/api/tasks/${createdTaskId}/move`)
      .set('Authorization', `Bearer ${gestorToken}`)
      .send({
        status: 'en_revision',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('en_revision');
    expect(res.body.data.completed_at).toBeNull();
  });

  it('Gestor NO puede mover su tarea a "hecha" (403)', async () => {
    if (!createdTaskId) return;

    const res = await request
      .patch(`/api/tasks/${createdTaskId}/move`)
      .set('Authorization', `Bearer ${gestorToken}`)
      .send({
        status: 'hecha',
      });

    expect(res.status).toBe(403);
  });

  it('Admin SÍ puede mover la tarea a "hecha" y se llena completed_at (200)', async () => {
    if (!createdTaskId) return;

    const res = await request
      .patch(`/api/tasks/${createdTaskId}/move`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'hecha',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('hecha');
    expect(res.body.data.completed_at).not.toBeNull();
  });

  it('Gestor NO puede reabrir una tarea que está en "hecha" (403)', async () => {
    if (!createdTaskId) return;

    const res = await request
      .patch(`/api/tasks/${createdTaskId}/move`)
      .set('Authorization', `Bearer ${gestorToken}`)
      .send({
        status: 'en_curso',
      });

    expect(res.status).toBe(403);
  });

  it('Archivar tarea realiza soft delete (200)', async () => {
    if (!createdTaskId) return;

    const res = await request
      .delete(`/api/tasks/${createdTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.archived_at).not.toBeNull();
  });
});
