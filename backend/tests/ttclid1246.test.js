import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';
import { guardarOrigenDeLaPagina } from '../src/modules/widget/widget.pulsaciones.js';
import { CANAL_DE_ORIGEN } from '../src/modules/reports/report.model.js';

/**
 * #1246, contra la base: el `ttclid` de TikTok se GUARDA en `lead_utms`, como
 * el `gclid` (338), venga pegado a la dirección o como campo suelto, en las
 * tres altas (formulario incrustado, webhook de formularios y webhook de Make)
 * y desde la página del botón de WhatsApp. Y un prospecto con solo `ttclid` no
 * sale «Sin origen» en el informe.
 *
 *   cd backend && npx vitest run tests/ttclid1246.test.js
 */

const request = supertest(app);
const DOMINIO = 'test-ttclid1246.com';
const SUFIJO = Date.now();
const EMBED = `ttclid_${SUFIJO}`;
const EMBED_WEBHOOK = `ttclidwh_${SUFIJO}`;
const formIds = [];
let proyecto;
let clave;
let clavePuesta = false;
let n = 0;
const email = () => `tt${(n += 1)}-${SUFIJO}@${DOMINIO}`;

beforeAll(async () => {
  const { rows: [p] } = await pool.query(
    `SELECT id, slug, webhook_api_key FROM projects WHERE active = true ORDER BY (slug = 'psiko-aprende') DESC, id LIMIT 1`);
  proyecto = p;
  clave = p.webhook_api_key;
  if (!clave) {
    clave = 'wk_ttclid1246_prueba';
    clavePuesta = true;
    await pool.query('UPDATE projects SET webhook_api_key = $2 WHERE id = $1', [p.id, clave]);
  }
  const { rows: [f1] } = await pool.query(
    `INSERT INTO form_templates (project_id, embed_id, nombre) VALUES ($1, $2, 'PRUEBA #1246 ttclid') RETURNING id`,
    [p.id, EMBED]);
  const { rows: [f2] } = await pool.query(
    `INSERT INTO form_templates (project_id, embed_id, nombre, kind) VALUES ($1, $2, 'PRUEBA #1246 ttclid webhook', 'webhook') RETURNING id`,
    [p.id, EMBED_WEBHOOK]);
  formIds.push(f1.id, f2.id);
});

afterAll(async () => {
  const ids = `(SELECT id FROM leads WHERE email LIKE '%@${DOMINIO}')`;
  for (const t of ['lead_utms', 'lead_interactions', 'lead_reminders', 'lead_status_history']) {
    await pool.query(`DELETE FROM ${t} WHERE lead_id IN ${ids}`).catch(() => {});
  }
  await pool.query(`DELETE FROM leads WHERE email LIKE '%@${DOMINIO}'`).catch(() => {});
  await pool.query('DELETE FROM form_events WHERE form_template_id = ANY($1)', [formIds]).catch(() => {});
  await pool.query('DELETE FROM form_templates WHERE id = ANY($1)', [formIds]);
  if (clavePuesta) await pool.query('UPDATE projects SET webhook_api_key = NULL WHERE id = $1', [proyecto.id]);
  await pool.end();
});

const origenDe = async (correo) => (await pool.query(
  `SELECT lu.lead_id, lu.ttclid, lu.canal_detectado::text AS canal
     FROM lead_utms lu JOIN leads l ON l.id = lu.lead_id WHERE l.email = $1`, [correo])).rows[0];

describe('el formulario incrustado guarda el ttclid', () => {
  it('con ?ttclid= en landing_url: guardado y canal tiktok_ads', async () => {
    const correo = email();
    const res = await request.post(`/api/forms/public/${EMBED}/submit`).send({
      nombre: 'TikTok Url', email: correo, landing_url: 'https://psikoaprende.com/curso/?ttclid=E.C.P.url-1246',
    });
    expect(res.status).toBe(200);
    expect(await origenDe(correo)).toMatchObject({ ttclid: 'E.C.P.url-1246', canal: 'tiktok_ads' });
  });

  it('con el ttclid como campo suelto: guardado y canal tiktok_ads', async () => {
    const correo = email();
    const res = await request.post(`/api/forms/public/${EMBED}/submit`).send({
      nombre: 'TikTok Suelto', email: correo, landing_url: 'https://psikoaprende.com/curso/', ttclid: 'suelto-1246',
    });
    expect(res.status).toBe(200);
    expect(await origenDe(correo)).toMatchObject({ ttclid: 'suelto-1246', canal: 'tiktok_ads' });
  });

  it('el de la dirección gana al suelto, y uno larguísimo se recorta a 500', async () => {
    const correo = email();
    await request.post(`/api/forms/public/${EMBED}/submit`).send({
      nombre: 'TikTok Largo', email: correo, landing_url: `https://psikoaprende.com/curso/?ttclid=${'x'.repeat(600)}`, ttclid: 'pierde',
    });
    expect((await origenDe(correo)).ttclid).toBe('x'.repeat(500));
  });
});

describe('el webhook de formularios (Elementor) guarda el ttclid suelto', () => {
  it('campo oculto ttclid: guardado y canal tiktok_ads', async () => {
    const correo = email();
    const res = await request.post(`/api/forms/webhook/${EMBED_WEBHOOK}`).send({
      nombre: 'TikTok Elementor', email: correo, landing_url: 'https://psikoaprende.com/curso/', ttclid: 'elementor-1246',
    });
    expect(res.status).toBe(200);
    expect(await origenDe(correo)).toMatchObject({ ttclid: 'elementor-1246', canal: 'tiktok_ads' });
  });
});

describe('el webhook de Make guarda el ttclid', () => {
  it('campo suelto: guardado y canal tiktok_ads', async () => {
    const correo = email();
    const res = await request.post(`/api/leads/webhooks/${proyecto.slug}`).set('X-API-Key', clave).send({
      nombre: 'TikTok Make', email: correo, telefono: '+34600124601', ttclid: 'make-1246',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.canal).toBe('tiktok_ads');
    expect(await origenDe(correo)).toMatchObject({ ttclid: 'make-1246', canal: 'tiktok_ads' });
  });
});

describe('la página del botón de WhatsApp y el informe', () => {
  it('guardarOrigenDeLaPagina rellena el ttclid sin tocar el canal', async () => {
    const correo = email();
    await request.post(`/api/leads/webhooks/${proyecto.slug}`).set('X-API-Key', clave).send({
      nombre: 'TikTok WhatsApp', email: correo, telefono: '+34600124602', canal: 'whatsapp',
    });
    const { lead_id: id } = await origenDe(correo);
    expect(await guardarOrigenDeLaPagina(id, 'https://psikoaprende.com/curso/?ttclid=wa-1246')).toBe(true);
    expect(await origenDe(correo)).toMatchObject({ ttclid: 'wa-1246', canal: 'whatsapp' });
  });

  it('con solo ttclid (sin canal ni nada más) no es «Sin origen»', async () => {
    const correo = email();
    await request.post(`/api/leads/webhooks/${proyecto.slug}`).set('X-API-Key', clave).send({
      nombre: 'TikTok Solo', email: correo, telefono: '+34600124603',
    });
    const { lead_id: id } = await origenDe(correo);
    const canal = async () => (await pool.query(
      `SELECT ${CANAL_DE_ORIGEN} AS c FROM leads l LEFT JOIN lead_utms lu ON lu.lead_id = l.id WHERE l.id = $1`, [id])).rows[0].c;
    await pool.query(`UPDATE lead_utms SET canal_detectado = NULL, landing_url = NULL, ttclid = NULL WHERE lead_id = $1`, [id]);
    expect(await canal()).toBe('sin_origen');
    await pool.query(`UPDATE lead_utms SET ttclid = 'solo-1246' WHERE lead_id = $1`, [id]);
    expect(await canal()).toBe('directo');
  });
});
