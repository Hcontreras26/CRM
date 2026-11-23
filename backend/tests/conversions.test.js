import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';

const request = supertest(app);
let adminToken, testLeadId, testProjectId = 1;
const createdConversionIds = [];

beforeAll(async () => {
  const res = await request.post('/api/auth/login')
    .send({ email: 'diego@empresa.com', password: 'CrmTemp2026!' });
  adminToken = res.body.data.accessToken;

  // Crear lead de test
  const { rows } = await pool.query(
    `INSERT INTO leads (project_id, nombre, email, status, responsable_id)
     VALUES ($1, 'Conv Test Lead', 'conv-test@test-conv.com', 'en_seguimiento', 2) RETURNING id`,
    [testProjectId]
  );
  testLeadId = rows[0].id;
});

afterAll(async () => {
  // Cleanup
  for (const id of createdConversionIds) {
    await pool.query('DELETE FROM conversion_payments WHERE conversion_id = $1', [id]);
    await pool.query('DELETE FROM conversions WHERE id = $1', [id]);
  }
  await pool.query('DELETE FROM lead_status_history WHERE lead_id = $1', [testLeadId]);
  await pool.query('DELETE FROM leads WHERE id = $1', [testLeadId]);
  await pool.end();
});

describe('POST /api/conversions - crear conversion', () => {
  it('crea conversion con importe total sin pago inicial', async () => {
    const res = await request.post('/api/conversions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lead_id: testLeadId,
        project_id: testProjectId,
        fecha_inicio: '2026-12-01',
        producto_contratado: 'Curso Test',
        importe_total: 1000,
        importe_pagado: 0,
        metodo_pago: 'fraccionado',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.importe_total).toBe('1000.00');
    expect(res.body.data.importe_pagado).toBe('0.00');
    createdConversionIds.push(res.body.data.id);
  });

  it('crea conversion con pago al contado y genera primer payment', async () => {
    const res = await request.post('/api/conversions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lead_id: testLeadId,
        project_id: testProjectId,
        fecha_inicio: '2026-12-01',
        producto_contratado: 'Curso Cash',
        importe_total: 500,
        importe_pagado: 500,
        metodo_pago: 'tarjeta',
      });

    expect(res.status).toBe(201);
    const id = res.body.data.id;
    createdConversionIds.push(id);

    const detail = await request.get(`/api/conversions/${id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.body.data.payments).toHaveLength(1);
    expect(Number(detail.body.data.payments[0].importe)).toBe(500);
  });

  it('convertir lead cambia status a convertido', async () => {
    const check = await request.get(`/api/leads/${testLeadId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(check.body.data.status).toBe('convertido');
  });

  it('falla con importe_pagado > importe_total', async () => {
    const res = await request.post('/api/conversions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lead_id: testLeadId,
        project_id: testProjectId,
        fecha_inicio: '2026-12-01',
        producto_contratado: 'Fail',
        importe_total: 100,
        importe_pagado: 200,
      });
    expect(res.status).toBe(400);
  });

  it('falla si lead no pertenece al proyecto', async () => {
    const res = await request.post('/api/conversions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lead_id: testLeadId,
        project_id: 999,
        fecha_inicio: '2026-12-01',
        producto_contratado: 'Fail',
        importe_total: 100,
      });
    expect(res.status).toBe(400);
  });

  it('falla sin auth', async () => {
    const res = await request.post('/api/conversions').send({});
    expect(res.status).toBe(401);
  });
});

describe('GET /api/conversions - listar', () => {
  it('lista conversiones del proyecto con paginacion', async () => {
    const res = await request.get(`/api/conversions?projectId=${testProjectId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.pagination).toBeDefined();
  });

  it('filtra por leadId', async () => {
    const res = await request.get(`/api/conversions?leadId=${testLeadId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.data.forEach(c => expect(c.lead_id).toBe(testLeadId));
  });

  it('filtra pendiente=true muestra solo con deuda', async () => {
    const res = await request.get(`/api/conversions?projectId=${testProjectId}&pendiente=true`)
      .set('Authorization', `Bearer ${adminToken}`);
    res.body.data.forEach(c => {
      expect(Number(c.importe_pagado)).toBeLessThan(Number(c.importe_total));
    });
  });
});

describe('GET /api/conversions/by-lead/:leadId - historial de compras', () => {
  it('retorna todas las conversiones de un lead', async () => {
    const res = await request.get(`/api/conversions/by-lead/${testLeadId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });
});

describe('POST /api/conversions/:id/payments - abonos parciales', () => {
  let convId;
  // Una venta nueva para cada prueba, cada una de un programa distinto: dos del
  // mismo programa para el mismo alumno son una venta repetida (CRM#898, 409).
  let vuelta = 0;
  beforeEach(async () => {
    vuelta += 1;
    const res = await request.post('/api/conversions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lead_id: testLeadId,
        project_id: testProjectId,
        fecha_inicio: '2026-12-01',
        producto_contratado: `Para abonos ${vuelta}`,
        importe_total: 1000,
        importe_pagado: 0,
        metodo_pago: 'fraccionado',
      });
    convId = res.body.data.id;
    createdConversionIds.push(convId);
  });

  it('registra abono y recalcula importe_pagado', async () => {
    const r1 = await request.post(`/api/conversions/${convId}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ importe: 300, notas: 'Primer plazo' });
    expect(r1.status).toBe(201);
    expect(r1.body.data.nuevoImportePagado).toBe(300);

    const r2 = await request.post(`/api/conversions/${convId}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ importe: 400 });
    expect(r2.body.data.nuevoImportePagado).toBe(700);

    const detail = await request.get(`/api/conversions/${convId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(Number(detail.body.data.importe_pagado)).toBe(700);
    expect(Number(detail.body.data.importe_pendiente)).toBe(300);
    expect(detail.body.data.payments).toHaveLength(2);
  });

  it('falla si abono excede importe_pendiente', async () => {
    const res = await request.post(`/api/conversions/${convId}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ importe: 2000 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OVERPAY');
  });

  it('admin puede eliminar un pago y el total se recalcula', async () => {
    const r1 = await request.post(`/api/conversions/${convId}/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ importe: 500 });
    const paymentId = r1.body.data.payment.id;

    const del = await request.delete(`/api/conversions/payments/${paymentId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(200);

    const detail = await request.get(`/api/conversions/${convId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(Number(detail.body.data.importe_pagado)).toBe(0);
  });
});

describe('PATCH /api/conversions/:id - editar', () => {
  let convId;
  beforeEach(async () => {
    const res = await request.post('/api/conversions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        lead_id: testLeadId,
        project_id: testProjectId,
        fecha_inicio: '2026-12-01',
        producto_contratado: 'Para editar',
        importe_total: 1500,
        importe_pagado: 500,
        metodo_pago: 'fraccionado',
      });
    convId = res.body.data.id;
    createdConversionIds.push(convId);
  });

  it('actualiza producto_contratado', async () => {
    const res = await request.patch(`/api/conversions/${convId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ producto_contratado: 'Renombrado' });
    expect(res.status).toBe(200);
    expect(res.body.data.producto_contratado).toBe('Renombrado');
  });

  it('falla si nuevo importe_total < importe_pagado', async () => {
    const res = await request.patch(`/api/conversions/${convId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ importe_total: 300 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TOTAL');
  });
});
