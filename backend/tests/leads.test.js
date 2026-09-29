import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';

const request = supertest(app);

let adminToken;
let webhookApiKey;
const PROJECT_SLUG = 'psiko-aprende';
const PROJECT_ID = 1;
let createdLeadId;

beforeAll(async () => {
  // Login
  const res = await request.post('/api/auth/login')
    .send({ email: 'diego@empresa.com', password: 'CrmTemp2026!' });
  adminToken = res.body.data.accessToken;

  // Get webhook key
  const { rows } = await pool.query(`SELECT webhook_api_key FROM projects WHERE slug = $1`, [PROJECT_SLUG]);
  webhookApiKey = rows[0].webhook_api_key;
});

afterAll(async () => {
  // Cleanup test leads
  await pool.query("DELETE FROM lead_utms WHERE lead_id IN (SELECT id FROM leads WHERE email LIKE '%@test-leads.com')");
  await pool.query("DELETE FROM lead_interactions WHERE lead_id IN (SELECT id FROM leads WHERE email LIKE '%@test-leads.com')");
  await pool.query("DELETE FROM lead_reminders WHERE lead_id IN (SELECT id FROM leads WHERE email LIKE '%@test-leads.com')");
  await pool.query("DELETE FROM lead_status_history WHERE lead_id IN (SELECT id FROM leads WHERE email LIKE '%@test-leads.com')");
  await pool.query("DELETE FROM leads WHERE email LIKE '%@test-leads.com'");
  await pool.end();
});

// ============================================================
// POST /api/leads/webhooks/:slug (WEBHOOK)
// ============================================================

describe('POST /api/leads/webhooks/:slug', () => {
  it('crea lead via webhook con round-robin', async () => {
    const res = await request
      .post(`/api/leads/webhooks/${PROJECT_SLUG}`)
      .set('X-API-Key', webhookApiKey)
      .send({
        nombre: 'Lead Test 1',
        email: 'lead1@test-leads.com',
        telefono: '+34612345678',
        utm_source: 'facebook',
        utm_medium: 'cpc',
        utm_campaign: 'test-campaign',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.lead_id).toBeDefined();
    expect(res.body.data.responsable_id).toBeDefined();
    expect(res.body.data.canal).toBe('meta_ads');
    expect(res.body.data.duplicado).toBe(false);

    createdLeadId = res.body.data.lead_id;
  });

  it('detecta duplicado por email', async () => {
    const res = await request
      .post(`/api/leads/webhooks/${PROJECT_SLUG}`)
      .set('X-API-Key', webhookApiKey)
      .send({ nombre: 'Lead Test 1 Dup', email: 'lead1@test-leads.com' });

    expect(res.status).toBe(201);
    expect(res.body.data.duplicado).toBe(true);
    expect(res.body.data.duplicado_de).toBe(createdLeadId);
  });

  it('round-robin rota entre gestores', async () => {
    const res1 = await request.post(`/api/leads/webhooks/${PROJECT_SLUG}`)
      .set('X-API-Key', webhookApiKey)
      .send({ nombre: 'RR Test A', email: 'rr-a@test-leads.com' });

    const res2 = await request.post(`/api/leads/webhooks/${PROJECT_SLUG}`)
      .set('X-API-Key', webhookApiKey)
      .send({ nombre: 'RR Test B', email: 'rr-b@test-leads.com' });

    // Los dos leads deben tener responsables diferentes (o iguales si solo hay 1 gestor)
    expect(res1.body.data.responsable_id).toBeDefined();
    expect(res2.body.data.responsable_id).toBeDefined();
  });

  it('detecta canal google_ads', async () => {
    const res = await request.post(`/api/leads/webhooks/${PROJECT_SLUG}`)
      .set('X-API-Key', webhookApiKey)
      .send({ nombre: 'Google Lead', email: 'google@test-leads.com', utm_source: 'google', utm_medium: 'cpc' });

    expect(res.body.data.canal).toBe('google_ads');
  });

  it('detecta canal organico', async () => {
    const res = await request.post(`/api/leads/webhooks/${PROJECT_SLUG}`)
      .set('X-API-Key', webhookApiKey)
      .send({ nombre: 'Organic Lead', email: 'organic@test-leads.com', utm_source: 'google', utm_medium: 'organic' });

    expect(res.body.data.canal).toBe('organico');
  });

  it('canal directo sin UTMs', async () => {
    const res = await request.post(`/api/leads/webhooks/${PROJECT_SLUG}`)
      .set('X-API-Key', webhookApiKey)
      .send({ nombre: 'Direct Lead', email: 'direct@test-leads.com' });

    expect(res.body.data.canal).toBe('directo');
  });

  it('falla con API key invalida', async () => {
    const res = await request.post(`/api/leads/webhooks/${PROJECT_SLUG}`)
      .set('X-API-Key', 'fake-key')
      .send({ nombre: 'Fail', email: 'fail@test-leads.com' });

    expect(res.status).toBe(401);
  });

  it('falla sin API key', async () => {
    const res = await request.post(`/api/leads/webhooks/${PROJECT_SLUG}`)
      .send({ nombre: 'Fail', email: 'fail@test-leads.com' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('API_KEY_REQUIRED');
  });

  it('falla con slug inexistente', async () => {
    const res = await request.post('/api/leads/webhooks/no-existe')
      .set('X-API-Key', 'any-key')
      .send({ nombre: 'Fail', email: 'fail@test-leads.com' });

    expect(res.status).toBe(404);
  });

  it('falla sin email', async () => {
    const res = await request.post(`/api/leads/webhooks/${PROJECT_SLUG}`)
      .set('X-API-Key', webhookApiKey)
      .send({ nombre: 'Sin Email' });

    expect(res.status).toBe(400);
  });

  it('acepta Authorization Bearer como header alternativo (PDF spec)', async () => {
    const res = await request.post(`/api/leads/webhooks/${PROJECT_SLUG}`)
      .set('Authorization', `Bearer ${webhookApiKey}`)
      .send({ nombre: 'Bearer Lead', email: 'bearer@test-leads.com' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('marca reincidente si mismo email + mismo producto', async () => {
    // Primero obtener un producto del proyecto
    const { rows } = await pool.query(`SELECT id FROM products WHERE project_id = $1 LIMIT 1`, [PROJECT_ID]);
    const productoInteres = rows[0];
    const { rows: prodNombre } = await pool.query(`SELECT nombre FROM products WHERE id = $1`, [productoInteres.id]);

    // Crear primer lead
    const res1 = await request.post(`/api/leads/webhooks/${PROJECT_SLUG}`)
      .set('X-API-Key', webhookApiKey)
      .send({ nombre: 'Reinc 1', email: 'reinc@test-leads.com', producto_interes: prodNombre[0].nombre });

    expect(res1.body.data.reincidente).toBe(false);

    // Crear duplicado con MISMO producto
    const res2 = await request.post(`/api/leads/webhooks/${PROJECT_SLUG}`)
      .set('X-API-Key', webhookApiKey)
      .send({ nombre: 'Reinc 2', email: 'reinc@test-leads.com', producto_interes: prodNombre[0].nombre });

    expect(res2.body.data.duplicado).toBe(true);
    expect(res2.body.data.reincidente).toBe(true);
  });

  it('NO marca reincidente si mismo email pero DIFERENTE producto', async () => {
    const { rows: prods } = await pool.query(`SELECT id, nombre FROM products WHERE project_id = $1 ORDER BY id LIMIT 2`, [PROJECT_ID]);
    if (prods.length < 2) return; // skip si no hay 2 productos

    await request.post(`/api/leads/webhooks/${PROJECT_SLUG}`)
      .set('X-API-Key', webhookApiKey)
      .send({ nombre: 'NoReinc 1', email: 'noreinc@test-leads.com', producto_interes: prods[0].nombre });

    const res2 = await request.post(`/api/leads/webhooks/${PROJECT_SLUG}`)
      .set('X-API-Key', webhookApiKey)
      .send({ nombre: 'NoReinc 2', email: 'noreinc@test-leads.com', producto_interes: prods[1].nombre });

    expect(res2.body.data.duplicado).toBe(true);
    expect(res2.body.data.reincidente).toBe(false);
  });
});

// ============================================================
// GET /api/leads (listado)
// ============================================================

describe('GET /api/leads', () => {
  it('lista leads del proyecto con paginacion', async () => {
    const res = await request.get(`/api/leads?projectId=${PROJECT_ID}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.pagination).toBeDefined();
    expect(res.body.pagination.total).toBeGreaterThan(0);
  });

  it('falla sin projectId', async () => {
    const res = await request.get('/api/leads')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it('falla sin auth', async () => {
    const res = await request.get(`/api/leads?projectId=${PROJECT_ID}`);
    expect(res.status).toBe(401);
  });
});

// ============================================================
// GET /api/leads/:id (detalle)
// ============================================================

describe('GET /api/leads/:id', () => {
  it('retorna lead completo con UTMs, historial, interacciones', async () => {
    const res = await request.get(`/api/leads/${createdLeadId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdLeadId);
    expect(res.body.data.utms).toBeDefined();
    expect(res.body.data.utms.canal_detectado).toBe('meta_ads');
    expect(res.body.data.statusHistory).toBeInstanceOf(Array);
    expect(res.body.data.interactions).toBeInstanceOf(Array);
    expect(res.body.data.reminders).toBeInstanceOf(Array);
  });

  it('falla con ID inexistente', async () => {
    const res = await request.get('/api/leads/99999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });
});

// ============================================================
// PATCH /api/leads/:id/status
// ============================================================

describe('PATCH /api/leads/:id/status', () => {
  it('cambia status con motivo', async () => {
    const res = await request.patch(`/api/leads/${createdLeadId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'contactado', motivo: 'Se le llamo por telefono' });

    expect(res.status).toBe(200);
    // Un lead nace 'por_contactar', no 'nuevo': lo cambio la migracion
    // 076_default_por_contactar.sql.
    expect(res.body.data.previous).toBe('por_contactar');
    expect(res.body.data.current).toBe('contactado');
  });

  // El motivo dejo de ser obligatorio para avanzar el pipeline (aa783bc,
  // 5-jun: el cambio rapido de estado guardaba 400). Solo se exige donde
  // importa, que es al descartar. La prueba comprueba las dos mitades de esa
  // regla, no solo la que ya no se cumple.
  it('deja avanzar sin motivo', async () => {
    const res = await request.patch(`/api/leads/${createdLeadId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'en_seguimiento' });

    expect(res.status).toBe(200);
  });

  it('pero exige motivo para marcar no interesado', async () => {
    const res = await request.patch(`/api/leads/${createdLeadId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'no_interesado' });

    expect(res.status).toBe(400);
  });

  it('falla con mismo status', async () => {
    const res = await request.patch(`/api/leads/${createdLeadId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'en_seguimiento', motivo: 'Repetido' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SAME_STATUS');
  });
});

// ============================================================
// POST /api/leads/:id/interactions
// ============================================================

describe('POST /api/leads/:id/interactions', () => {
  it('crea interaccion tipo llamada', async () => {
    const res = await request.post(`/api/leads/${createdLeadId}/interactions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tipo: 'llamada', nota: 'Hable con el lead, interesado en el curso' });

    expect(res.status).toBe(201);
    expect(res.body.data.tipo).toBe('llamada');
    expect(res.body.data.nota).toBe('Hable con el lead, interesado en el curso');
  });

  it('falla con tipo invalido', async () => {
    const res = await request.post(`/api/leads/${createdLeadId}/interactions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ tipo: 'sms' });

    expect(res.status).toBe(400);
  });
});

// ============================================================
// POST /api/leads/:id/reminders
// ============================================================

describe('POST /api/leads/:id/reminders', () => {
  let reminderId;

  it('crea recordatorio', async () => {
    const res = await request.post(`/api/leads/${createdLeadId}/reminders`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fecha_recordatorio: '2026-04-15', nota: 'Llamar de nuevo' });

    expect(res.status).toBe(201);
    expect(res.body.data.fecha_recordatorio).toBeDefined();
    expect(res.body.data.completado).toBe(false);
    reminderId = res.body.data.id;
  });

  it('completa recordatorio', async () => {
    const res = await request.patch(`/api/leads/reminders/${reminderId}/complete`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.message).toBe('Recordatorio completado');
  });
});

// ============================================================
// PATCH /api/leads/:id (editar lead)
// ============================================================

describe('PATCH /api/leads/:id', () => {
  it('actualiza nombre y telefono', async () => {
    const res = await request.patch(`/api/leads/${createdLeadId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Lead Test 1 Editado', telefono: '+34611111111' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.nombre).toBe('Lead Test 1 Editado');
    expect(res.body.data.telefono).toBe('+34611111111');
  });

  it('actualiza solo notas', async () => {
    const res = await request.patch(`/api/leads/${createdLeadId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notas: 'Notas actualizadas via PATCH' });

    expect(res.status).toBe(200);
    expect(res.body.data.notas).toBe('Notas actualizadas via PATCH');
  });

  it('falla con body vacio', async () => {
    const res = await request.patch(`/api/leads/${createdLeadId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it('falla con ID inexistente', async () => {
    const res = await request.patch('/api/leads/99999')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: 'Inexistente' });

    expect(res.status).toBe(404);
  });

  it('falla sin auth', async () => {
    const res = await request.patch(`/api/leads/${createdLeadId}`)
      .send({ nombre: 'Sin auth' });

    expect(res.status).toBe(401);
  });

  it('falla con nombre vacio', async () => {
    const res = await request.patch(`/api/leads/${createdLeadId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nombre: '' });

    expect(res.status).toBe(400);
  });
});

// ============================================================
// GET /api/leads/stats
// ============================================================

describe('GET /api/leads/stats', () => {
  it('retorna stats del proyecto', async () => {
    const res = await request.get(`/api/leads/stats?projectId=${PROJECT_ID}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBeDefined();
    expect(Number(res.body.data.total)).toBeGreaterThan(0);
  });
});
