import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';

const request = supertest(app);

const MARCA = `TASKSTEST_${Date.now().toString(36)}`;
let testProjectId;
let adminUser;
let gestorUser;
let otherGestorUser;
let adminToken;
let gestorToken;
let otherGestorToken;

function makeToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      roles_extra: [],
      customRoleId: null,
      activeProjectId: testProjectId,
    },
    process.env.JWT_SECRET || 'test_secret_for_vitest_runs',
    { expiresIn: '1h' }
  );
}

const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);
const one = async (sql, params) => (await q(sql, params))[0];

beforeAll(async () => {
  // 1. Crear proyecto de prueba
  const proj = await one(
    `INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
    [`${MARCA} Proyecto`, `${MARCA.toLowerCase()}-slug`, `${MARCA}-key`]
  );
  testProjectId = proj.id;

  // 2. Crear usuarios de prueba
  adminUser = await one(
    `INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', 'admin') RETURNING id, nombre, email, role`,
    [`${MARCA} Admin`, `admin_${MARCA.toLowerCase()}@test.local`]
  );

  gestorUser = await one(
    `INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', 'gestor') RETURNING id, nombre, email, role`,
    [`${MARCA} Gestor`, `gestor_${MARCA.toLowerCase()}@test.local`]
  );

  otherGestorUser = await one(
    `INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', 'gestor') RETURNING id, nombre, email, role`,
    [`${MARCA} Otro Gestor`, `other_${MARCA.toLowerCase()}@test.local`]
  );

  // 3. Asignar usuarios al proyecto
  for (const uid of [adminUser.id, gestorUser.id, otherGestorUser.id]) {
    await q(`INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)`, [uid, testProjectId]);
  }

  // 4. Tokens
  adminToken = makeToken(adminUser);
  gestorToken = makeToken(gestorUser);
  otherGestorToken = makeToken(otherGestorUser);
});

afterAll(async () => {
  try {
    if (adminUser?.id && gestorUser?.id && otherGestorUser?.id) {
      const uids = [adminUser.id, gestorUser.id, otherGestorUser.id];
      await q(`DELETE FROM tasks WHERE created_by = ANY($1) OR assigned_to = ANY($1)`, [uids]);
      await q(`DELETE FROM user_projects WHERE user_id = ANY($1)`, [uids]);
      await q(`DELETE FROM users WHERE id = ANY($1)`, [uids]);
    }
    if (testProjectId) {
      await q(`DELETE FROM projects WHERE id = $1`, [testProjectId]);
    }
  } catch (err) {
    // cleanup
  }
});

describe('Módulo de Tareas (Tablero Trello / Kanban)', () => {
  let createdTaskId;
  let checklistItemId;
  let commentId;
  let tagId;

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
        project_id: testProjectId,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Preparar informe de ventas');
    expect(res.body.data.status).toBe('por_hacer');
    expect(res.body.data.assigned_to).toBe(gestorUser.id);
    createdTaskId = res.body.data.id;
  });

  it('Gestor NO puede asignar una tarea a otro usuario (403)', async () => {
    const res = await request
      .post('/api/tasks')
      .set('Authorization', `Bearer ${gestorToken}`)
      .send({
        title: 'Tarea para otro',
        assigned_to: otherGestorUser.id,
        project_id: testProjectId,
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
        project_id: testProjectId,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.assigned_to).toBe(gestorUser.id);
  });

  it('Gestor puede mover su tarea hasta "en_revision"', async () => {
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
    const res = await request
      .patch(`/api/tasks/${createdTaskId}/move`)
      .set('Authorization', `Bearer ${gestorToken}`)
      .send({
        status: 'hecha',
      });

    expect(res.status).toBe(403);
  });

  it('Admin SÍ puede mover la tarea a "hecha" y se llena completed_at (200)', async () => {
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
    const res = await request
      .patch(`/api/tasks/${createdTaskId}/move`)
      .set('Authorization', `Bearer ${gestorToken}`)
      .send({
        status: 'en_curso',
      });

    expect(res.status).toBe(403);
  });

  it('Admin puede añadir un checklist item a la tarea (201)', async () => {
    const res = await request
      .post(`/api/tasks/${createdTaskId}/checklist`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Verificar pagos bancarios',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Verificar pagos bancarios');
    expect(res.body.data.is_completed).toBe(false);
    checklistItemId = res.body.data.id;
  });

  it('Gestor asignado puede marcar como completado el checklist item (200)', async () => {
    const res = await request
      .patch(`/api/tasks/${createdTaskId}/checklist/${checklistItemId}`)
      .set('Authorization', `Bearer ${gestorToken}`)
      .send({
        is_completed: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.is_completed).toBe(true);
  });

  it('Usuario puede añadir un comentario en la tarea (201)', async () => {
    const res = await request
      .post(`/api/tasks/${createdTaskId}/comments`)
      .set('Authorization', `Bearer ${gestorToken}`)
      .send({
        content: 'He verificado los justificantes y todo coincide.',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.content).toBe('He verificado los justificantes y todo coincide.');
    commentId = res.body.data.id;
  });

  it('Admin puede añadir una etiqueta a la tarea (201)', async () => {
    const res = await request
      .post(`/api/tasks/${createdTaskId}/tags`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Urgente',
        color: 'rose',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Urgente');
    tagId = res.body.data.id;
  });

  it('Admin puede consultar las métricas de equipo (200)', async () => {
    const res = await request
      .get(`/api/tasks/metrics?project_id=${testProjectId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('Gestor NO puede consultar las métricas de equipo (403)', async () => {
    const res = await request
      .get(`/api/tasks/metrics?project_id=${testProjectId}`)
      .set('Authorization', `Bearer ${gestorToken}`);

    expect(res.status).toBe(403);
  });

  it('Archivar tarea realiza soft delete (200)', async () => {
    const res = await request
      .delete(`/api/tasks/${createdTaskId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.archived_at).not.toBeNull();
  });
});
