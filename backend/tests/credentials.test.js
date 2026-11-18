import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';
import { encrypt, decrypt, maskSecret } from '../src/shared/utils/crypto.js';

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
    await pool.query('DELETE FROM api_credentials WHERE id = $1', [id]);
  }
  await pool.end();
});

describe('Crypto utils', () => {
  it('encrypt y decrypt funcionan correctamente', () => {
    const plain = 'my-secret-api-key-12345';
    const { encrypted, iv, authTag } = encrypt(plain);
    expect(encrypted).toBeTruthy();
    expect(iv).toBeTruthy();
    expect(authTag).toBeTruthy();
    const decrypted = decrypt(encrypted, iv, authTag);
    expect(decrypted).toBe(plain);
  });

  it('maskSecret oculta valor', () => {
    expect(maskSecret('sk-test-abcdefghijk')).toMatch(/^sk-t\.+hijk$/);
    expect(maskSecret('short')).toBe('........');
  });
});

describe('POST /api/credentials (superadmin)', () => {
  it('superadmin puede crear credencial', async () => {
    const res = await request.post('/api/credentials')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({
        project_id: null,
        service: 'brevo',
        value: 'xkeysib-test-key-12345',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.masked_value).toBeTruthy();
    expect(res.body.data.masked_value).not.toContain('xkeysib-test-key-12345');
    createdIds.push(res.body.data.id);
  });

  it('admin NO puede crear credencial', async () => {
    const res = await request.post('/api/credentials')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ service: 'brevo', value: 'test-key-admin' });
    expect(res.status).toBe(403);
  });

  it('upsert actualiza si ya existe', async () => {
    // Crear primera vez
    const first = await request.post('/api/credentials')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ project_id: 1, service: 'meta', value: 'first-value-123' });
    const id1 = first.body.data.id;
    createdIds.push(id1);

    // Actualizar
    const second = await request.post('/api/credentials')
      .set('Authorization', `Bearer ${superadminToken}`)
      .send({ project_id: 1, service: 'meta', value: 'updated-value-456' });

    expect(second.body.data.id).toBe(id1);
    expect(second.body.data.masked_value).toContain('upda');
  });
});

describe('GET /api/credentials', () => {
  it('lista credenciales con valor enmascarado', async () => {
    const res = await request.get('/api/credentials')
      .set('Authorization', `Bearer ${superadminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    res.body.data.forEach(c => {
      expect(c.masked_value).toBeTruthy();
      expect(c.encrypted_value).toBeUndefined();
    });
  });

  // CRM#632 (03/11): el admin ve la lista, recortada a sus campus. Guardar, no.
  it('admin puede listar (las de sus campus)', async () => {
    const res = await request.get('/api/credentials')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/credentials/:id/test', () => {
  it('test registra resultado', async () => {
    const id = createdIds[0];
    const res = await request.post(`/api/credentials/${id}/test`)
      .set('Authorization', `Bearer ${superadminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.result).toBe('ok');
  });
});
