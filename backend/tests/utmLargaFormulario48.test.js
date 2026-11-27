import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';

/**
 * #48, revisión de Diego (27/11/2026), contra la base: un alta por el
 * formulario incrustado con una UTM más larga que su columna de `lead_utms`
 * (utm_source/utm_medium VARCHAR(100); campaign/content/term VARCHAR(255))
 * ENTRA, y la UTM se guarda recortada. Antes el INSERT fallaba dentro de la
 * transacción del round-robin y el prospecto se perdía. Las pruebas de
 * origenYCategorias48.test.js simulan lead.model y no lo verían.
 *
 *   cd backend && npx vitest run tests/utmLargaFormulario48.test.js
 */

const request = supertest(app);
const DOMINIO = 'test-utm48.com';
const EMBED = `utm48_${Date.now()}`;
let formId;

beforeAll(async () => {
  // El campus de las semillas (CI); en una base local sin semillas, el primero que haya.
  const { rows: [p] } = await pool.query(
    `SELECT id FROM projects ORDER BY (slug = 'psiko-aprende') DESC, id LIMIT 1`);
  const { rows: [f] } = await pool.query(
    `INSERT INTO form_templates (project_id, embed_id, nombre) VALUES ($1, $2, 'PRUEBA #48 UTM larga') RETURNING id`,
    [p.id, EMBED]
  );
  formId = f.id;
});

afterAll(async () => {
  const ids = `(SELECT id FROM leads WHERE email LIKE '%@${DOMINIO}')`;
  for (const t of ['lead_utms', 'lead_interactions', 'lead_reminders', 'lead_status_history']) {
    await pool.query(`DELETE FROM ${t} WHERE lead_id IN ${ids}`).catch(() => {});
  }
  await pool.query(`DELETE FROM leads WHERE email LIKE '%@${DOMINIO}'`).catch(() => {});
  await pool.query('DELETE FROM form_templates WHERE id = $1', [formId]);
  await pool.end();
});

describe('una UTM larga en la dirección no deja fuera el alta por formulario', () => {
  it('utm_content de 300 caracteres: el prospecto entra y se guarda recortado a 255', async () => {
    const contenido = 'a'.repeat(300);
    const fuente = 's'.repeat(150);
    const res = await request.post(`/api/forms/public/${EMBED}/submit`).send({
      nombre: 'UTM Larga',
      email: `utm-${Date.now()}@${DOMINIO}`,
      landing_url: `https://psikoaprende.com/curso/?utm_source=${fuente}&utm_medium=cpc&utm_content=${contenido}`,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { rows: [u] } = await pool.query(
      'SELECT utm_source, utm_medium, utm_content FROM lead_utms WHERE lead_id = $1', [res.body.data.lead_id]);
    expect(u.utm_content).toBe(contenido.slice(0, 255));
    expect(u.utm_source).toBe(fuente.slice(0, 100));
    expect(u.utm_medium).toBe('cpc');
  });
});
