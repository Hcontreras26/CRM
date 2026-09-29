import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';

const request = supertest(app);

let adminToken;
let superadminToken;
let gestorToken;
let createdUserId;

beforeAll(async () => {
  // Login como admin (Diego)
  const adminRes = await request.post('/api/auth/login')
    .send({ email: 'diego@empresa.com', password: 'CrmTemp2026!' });
  adminToken = adminRes.body.data.accessToken;

  // Login como superadmin (Manuel)
  const saRes = await request.post('/api/auth/login')
    .send({ email: 'manuel@empresa.com', password: 'CrmTemp2026!' });
  superadminToken = saRes.body.data.accessToken;
});

afterAll(async () => {
  // Cleanup created test users
  if (createdUserId) {
    await pool.query('DELETE FROM user_projects WHERE user_id = $1', [createdUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [createdUserId]);
  }
  await pool.query("DELETE FROM user_projects WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test-users.com')");
  await pool.query("DELETE FROM users WHERE email LIKE '%@test-users.com'");
  await pool.end();
});

// ============================================================
// GET /api/users
// ============================================================

describe('GET /api/users', () => {
  it('lista usuarios con auth admin', async () => {
    const res = await request.get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBeGreaterThan(0);
  });

  it('filtra por role', async () => {
    const res = await request.get('/api/users?role=admin')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    res.body.data.forEach(u => expect(u.role).toBe('admin'));
  });

  it('filtra por active', async () => {
    const res = await request.get('/api/users?active=true')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('falla sin auth', async () => {
    const res = await request.get('/api/users');
    expect(res.status).toBe(401);
  });
});

// ============================================================
// POST /api/users
// ============================================================

describe('POST /api/users', () => {
  it('crea usuario nuevo con proyectos', async () => {
    const res = await request.post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: 'Test QA User',
        email: 'qa-user@test-users.com',
        role: 'gestor',
        projectIds: [1, 2],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.nombre).toBe('Test QA User');
    expect(res.body.data.email).toBe('qa-user@test-users.com');
    expect(res.body.data.role).toBe('gestor');
    expect(res.body.data.setPasswordToken).toBeDefined();
    expect(res.body.data.projects.length).toBe(2);

    createdUserId = res.body.data.id;
  });

  it('falla con email duplicado', async () => {
    const res = await request.post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: 'Duplicado',
        email: 'qa-user@test-users.com',
        role: 'gestor',
        projectIds: [1],
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_EXISTS');
  });

  // El minimo de proyectos depende del rol, y lo decide `projectAccess`:
  // superadmin y soporte pasan por encima del filtro; admin y gestor no, asi
  // que sin proyectos reciben 403 en todo. Ver el comentario largo de
  // `user.validation.js`.
  it('falla sin projectIds', async () => {
    const res = await request.post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: 'Sin Proyectos',
        email: 'noproj@test-users.com',
        role: 'gestor',
        projectIds: [],
      });

    expect(res.status).toBe(400);
  });

  it('un admin sin proyectos tampoco: recibiria 403 en cada pantalla', async () => {
    const res = await request.post('/api/users')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        nombre: 'Admin Sin Proyectos',
        email: 'adminnoproj@test-users.com',
        role: 'admin',
        projectIds: [],
      });

    expect(res.status).toBe(400);
  });

  it('pero un soporte SI se puede crear sin proyectos', async () => {
    // No es un descuido de la regla: `projectAccess` deja pasar a soporte sin
    // mirar `user_projects`. Exigirselo seria pedir un dato que no usa.
    const res = await request.post('/api/users')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        nombre: 'Soporte Sin Proyectos',
        email: 'soportenoproj@test-users.com',
        role: 'soporte',
      });

    expect(res.status).toBe(201);
  });

  it('y vale que los proyectos vengan en `projects`, no solo en `projectIds`', async () => {
    const res = await request.post('/api/users')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        nombre: 'Gestor Con Projects',
        email: 'gestorprojects@test-users.com',
        role: 'gestor',
        projects: [{ projectId: 1, recibeLeads: true }],
      });

    expect(res.status).toBe(201);
  });

  it('falla con role superadmin', async () => {
    const res = await request.post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nombre: 'Fake SA',
        email: 'fakesa@test-users.com',
        role: 'superadmin',
        projectIds: [1],
      });

    expect(res.status).toBe(400);
  });

  it('falla sin nombre', async () => {
    const res = await request.post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: 'noname@test-users.com',
        role: 'gestor',
        projectIds: [1],
      });

    expect(res.status).toBe(400);
  });
});

// ============================================================
// GET /api/users/:id
// ============================================================

describe('GET /api/users/:id', () => {
  it('retorna usuario con proyectos', async () => {
    const res = await request.get(`/api/users/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdUserId);
    expect(res.body.data.projects).toBeInstanceOf(Array);
  });

  it('falla con ID inexistente', async () => {
    const res = await request.get('/api/users/99999')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  it('falla con ID invalido', async () => {
    const res = await request.get('/api/users/abc')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });
});

// ============================================================
// PATCH /api/users/:id
// ============================================================

describe('PATCH /api/users/:id', () => {
  it('actualiza nombre', async () => {
    const res = await request.patch(`/api/users/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Test QA Actualizado' });

    expect(res.status).toBe(200);
    expect(res.body.data.nombre).toBe('Test QA Actualizado');
  });

  it('actualiza proyectos', async () => {
    const res = await request.patch(`/api/users/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ projectIds: [1, 3] });

    expect(res.status).toBe(200);
    const slugs = res.body.data.projects.map(p => p.slug);
    expect(slugs).toContain('psiko-aprende');
    expect(slugs).toContain('fono-aprende');
  });

  it('no puede editar superadmin', async () => {
    const res = await request.patch('/api/users/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Hackeado' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CANNOT_EDIT_SUPERADMIN');
  });
});

// ============================================================
// DELETE /api/users/:id (soft delete)
// ============================================================

describe('DELETE /api/users/:id', () => {
  it('desactiva usuario', async () => {
    const res = await request.delete(`/api/users/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('Usuario desactivado');

    // Verificar en DB
    const check = await request.get(`/api/users/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(check.body.data.active).toBe(false);
  });

  it('no puede desactivar superadmin', async () => {
    const res = await request.delete('/api/users/1')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CANNOT_DEACTIVATE_SUPERADMIN');
  });

  it('desactivar revoca refresh tokens (cierra sesion inmediata - PDF spec)', async () => {
    // Reactivar primero para la prueba
    await pool.query(`UPDATE users SET active = true WHERE id = $1`, [createdUserId]);

    // Crear refresh token simulado
    const fakeHash = 'test-revoke-hash-' + Date.now();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    await pool.query(
      `INSERT INTO user_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
      [createdUserId, fakeHash, futureDate]
    );

    // Desactivar
    await request.delete(`/api/users/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Verificar que el token esta revoked
    const { rows } = await pool.query(
      `SELECT revoked FROM user_refresh_tokens WHERE token_hash = $1`,
      [fakeHash]
    );
    expect(rows[0].revoked).toBe(true);
  });
});

// ============================================================
// PATCH /api/users/:id/reactivate
// ============================================================

describe('PATCH /api/users/:id/reactivate', () => {
  it('reactiva usuario desactivado', async () => {
    const res = await request.patch(`/api/users/${createdUserId}/reactivate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    const check = await request.get(`/api/users/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(check.body.data.active).toBe(true);
  });
});
