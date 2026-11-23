import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * Links de pago (#680) antes de producción (18/11):
 *
 *   1. `/auth/me` le dice a la pantalla si el servidor tiene los links
 *      encendidos (`user.funciones.links_pago`). En producción, solo con
 *      LINKS_PAGO_EN_PRODUCCION=1; en /testeo y en local, siempre. Antes la
 *      pantalla miraba `SOLO_EN_PRUEBAS` y en /crm no salía nunca.
 *
 *   2. CUENTAS DE STRIPE COMPARTIDAS. El cargo de un link lleva la marca de
 *      plataforma del campus (`filtro_metadata` de su tarjeta «Stripe»), la misma
 *      que mira el sondeo. Sin ella, el sondeo lo trataba como «sin marcar»: no lo
 *      importaba y frenaba la marca de agua del campus. Se prueba con el sondeo de
 *      verdad: el campus que creó el link lo importa como suyo y el otro campus de
 *      la misma cuenta lo descarta como ajeno.
 *
 * Stripe es de mentira: lo que no esté preparado revienta.
 *
 *   npx vitest run tests/linksPago680produccion.test.js
 */

process.env.LOG_LEVEL = 'silent';
const { default: pool } = await import('../src/shared/config/db.js');
const { errorHandler } = await import('../src/shared/middleware/errorHandler.js');
const { encrypt } = await import('../src/shared/utils/crypto.js');
const integrationsModel = await import('../src/modules/integrations/integrations.model.js');
const { default: linksPago } = await import('../src/modules/links-pago/index.js');
const { default: auth } = await import('../src/modules/auth/index.js');
const { conMarcaDePlataforma } = await import('../src/modules/links-pago/links-pago.service.js');
const { syncStripePayments, deQuienEs } = await import('../src/modules/stripe-payments/stripe-payments.service.js');

// ─── Stripe de mentira ──────────────────────────────────────────────────────
let preparadas = [];
const llamadas = [];
const fetchOriginal = globalThis.fetch;
globalThis.fetch = vi.fn(async (url, opciones = {}) => {
  const metodo = (opciones.method || 'GET').toUpperCase();
  const u = new URL(String(url));
  const cuerpo = opciones.body ? Object.fromEntries(new URLSearchParams(opciones.body)) : null;
  llamadas.push({ metodo, ruta: u.pathname, cuerpo, headers: opciones.headers || {} });
  const r = preparadas.find(([m, ruta]) => m === metodo && u.pathname === ruta);
  if (!r) throw new Error(`Stripe de mentira: sin respuesta para ${metodo} ${u.pathname}`);
  const [, , status, body] = r;
  return { ok: status < 400, status, json: async () => (typeof body === 'function' ? body(cuerpo) : body ?? {}) };
});

const app = express();
app.use(express.json());
app.use(linksPago.prefix, linksPago.router);
app.use(auth.prefix, auth.router);
app.use(errorHandler);
const api = supertest(app);

const MARCA = `LP680PR${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const one = async (sql, p) => (await q(sql, p))[0];
const ids = { users: [], projects: [], leads: [], products: [] };
const como = (u) => ({ Authorization: `Bearer ${jwt.sign({ userId: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '10m' })}` });

const CLAVE_RK = 'rk_' + 'test_EscrituraDeMentira680pr'; // partida: que no parezca una clave real
const CLAVE_LECTURA = 'rk_' + 'test_LecturaCompartida680pr';
// Dos campus en la MISMA cuenta de Stripe, cada uno con su marca de plataforma.
const FILTRO_D = { clave: 'plataforma', valor: 'campus-d' };
const FILTRO_E = { clave: 'plataforma', valor: 'campus-e' };

let D; let E; let F;
let gestora;
let leadD; let leadF;
let cursoD; let cursoF;

async function ponerClave(projectId, provider, clave, config = {}) {
  const e = encrypt(clave);
  await integrationsModel.upsert({ projectId, provider, active: true, encrypted_value: e.encrypted, iv: e.iv, auth_tag: e.authTag, config_public: config });
}

beforeAll(async () => {
  const campus = async (n) => {
    const r = await one('INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id',
      [`${MARCA} ${n}`, `${MARCA.toLowerCase()}-${n}`, `${MARCA}-k-${n}`]);
    ids.projects.push(r.id);
    return r.id;
  };
  D = await campus('d');
  E = await campus('e');
  F = await campus('f'); // cuenta propia, sin filtro: lo normal

  gestora = await one('INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, \'x\', \'gestor\') RETURNING id, role',
    [`${MARCA} gestora`, `gestora@${MARCA.toLowerCase()}.test`]);
  ids.users.push(gestora.id);
  for (const c of [D, F]) await q('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [gestora.id, c]);

  const nuevoLead = async (c) => {
    const l = await one('INSERT INTO leads (project_id, nombre, email, responsable_id) VALUES ($1, $2, $3, $4) RETURNING id',
      [c, `${MARCA} lead`, `lead${ids.leads.length}@${MARCA.toLowerCase()}.test`, gestora.id]);
    ids.leads.push(l.id);
    return l.id;
  };
  leadD = await nuevoLead(D);
  leadF = await nuevoLead(F);
  const curso = async (c) => {
    const r = await one('INSERT INTO products (project_id, nombre, precio, moneda) VALUES ($1, $2, 1, \'EUR\') RETURNING id',
      [c, `${MARCA} curso de prueba`]);
    ids.products.push(r.id);
    return r.id;
  };
  cursoD = await curso(D);
  cursoF = await curso(F);

  await ponerClave(D, 'stripe_links', CLAVE_RK);
  await ponerClave(F, 'stripe_links', CLAVE_RK);
  await ponerClave(D, 'stripe', CLAVE_LECTURA, { filtro_metadata: FILTRO_D });
  await ponerClave(E, 'stripe', CLAVE_LECTURA, { filtro_metadata: FILTRO_E });
}, 60_000);

afterAll(async () => {
  const limpiar = [
    ['DELETE FROM stripe_payments WHERE project_id = ANY($1)', ids.projects],
    ['DELETE FROM stripe_sync_state WHERE project_id = ANY($1)', ids.projects],
    ['DELETE FROM payment_links WHERE project_id = ANY($1)', ids.projects],
    ['DELETE FROM products WHERE id = ANY($1)', ids.products],
    ['DELETE FROM project_integrations WHERE project_id = ANY($1)', ids.projects],
    ['DELETE FROM leads WHERE id = ANY($1)', ids.leads],
    ['DELETE FROM user_projects WHERE user_id = ANY($1)', ids.users],
    ['DELETE FROM refresh_tokens WHERE user_id = ANY($1)', ids.users],
    ['DELETE FROM users WHERE id = ANY($1)', ids.users],
    ['DELETE FROM projects WHERE id = ANY($1)', ids.projects],
  ];
  for (const [sql, lista] of limpiar) {
    try { await q(sql, [lista]); } catch { /* el siguiente sigue */ }
  }
  globalThis.fetch = fetchOriginal;
});

beforeEach(() => { llamadas.length = 0; preparadas = []; });

let n = 0;
function stripeCreaBien() {
  preparadas = [
    ['POST', '/v1/prices', 200, () => ({ id: `price_680pr_${++n}` })],
    ['POST', '/v1/payment_links', 200, () => ({ id: `plink_680pr_${n}`, url: `https://buy.stripe.com/test_680pr_${n}` })],
  ];
}

/** Lo que Stripe pondría en el cargo: la `metadata` de `payment_intent_data`. */
function metadataDelCargo(cuerpoDelLink) {
  const pref = 'payment_intent_data[metadata][';
  return Object.fromEntries(Object.entries(cuerpoDelLink)
    .filter(([k]) => k.startsWith(pref))
    .map(([k, v]) => [k.slice(pref.length, -1), v]));
}

// ─── 0. Las monedas de arranque (migración 303) ─────────────────────────────

describe('la migración 303: cada campus admite las monedas en que ya cobra', () => {
  const AQUI = path.dirname(fileURLToPath(import.meta.url));
  const leerSql = () => fs.readFileSync(path.join(AQUI, '../migrations/303_links_pago_monedas_del_campus.sql'), 'utf8');
  /*
    La 303 recorre TODOS los campus. Pasada tal cual, tocaría los de las otras
    pruebas que corren a la vez (la de la fase 2 tiene un curso en USD y espera
    {EUR}). Así que, en esta conexión y solo en ella, `products` y
    `stripe_payments` se tapan con tablas temporales con las filas de D y F: las
    temporales van antes en la ruta de búsqueda de Postgres, y la migración, que
    no pone esquema, lee esas. `projects` sí es la de verdad.
  */
  async function aplicar() {
    const SQL_303 = leerSql();
    const c = await pool.connect();
    try {
      await c.query('SELECT pg_advisory_lock(680680)');
      await c.query('DROP TABLE IF EXISTS pg_temp.products, pg_temp.stripe_payments');
      await c.query('CREATE TEMP TABLE products AS SELECT * FROM public.products WHERE project_id = ANY($1)', [[D, F]]);
      await c.query('CREATE TEMP TABLE stripe_payments AS SELECT * FROM public.stripe_payments WHERE project_id = ANY($1)', [[D, F]]);
      await c.query(SQL_303);
    } finally {
      await c.query('DROP TABLE IF EXISTS pg_temp.products, pg_temp.stripe_payments').catch(() => {});
      await c.query('SELECT pg_advisory_unlock(680680)').catch(() => {});
      c.release();
    }
  }
  const monedas = (id) => one('SELECT links_pago_monedas::text[] AS m, links_pago_moneda_defecto AS d FROM projects WHERE id = $1', [id]);

  it('añade la del catálogo y la de los cargos de Stripe, deja EUR por defecto, y se puede pasar dos veces', async () => {
    const cursoUsd = await one('INSERT INTO products (project_id, nombre, precio, moneda) VALUES ($1, $2, 200, \' usd \') RETURNING id', [F, `${MARCA} en dólares`]);
    ids.products.push(cursoUsd.id);
    // Uno sin precio o inactivo no cuenta.
    const sinPrecio = await one('INSERT INTO products (project_id, nombre, precio, moneda) VALUES ($1, $2, NULL, \'GBP\') RETURNING id', [F, `${MARCA} sin precio`]);
    ids.products.push(sinPrecio.id);
    await q(`INSERT INTO stripe_payments (project_id, stripe_id, type, status, amount, currency, metadata, stripe_created_at)
             VALUES ($1, $2, 'charge', 'succeeded', 10, 'EUR', $3, $4)`,
    [F, `ch_${MARCA}_mxn`, JSON.stringify({ original_amount: 200, original_currency: 'MXN' }), new Date().toISOString()]);

    await aplicar();
    expect(await monedas(F)).toEqual({ m: ['EUR', 'MXN', 'USD'], d: 'EUR' });
    // Un campus que solo cobra en euros, como estaba.
    expect(await monedas(D)).toEqual({ m: ['EUR'], d: 'EUR' });

    await aplicar();
    expect((await monedas(F)).m).toEqual(['EUR', 'MXN', 'USD']);
  });
});

// ─── 1. /auth/me dice si el servidor tiene los links ────────────────────────

describe('/auth/me: los links de pago, según el interruptor del servidor', () => {
  const ENV = ['NODE_ENV', 'CRM_BASE_URL', 'LINKS_PAGO_EN_PRODUCCION'];
  async function conEntorno(valores) {
    const antes = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
    Object.assign(process.env, valores);
    for (const k of ENV) if (valores[k] === undefined) delete process.env[k];
    try {
      const r = await api.get('/api/auth/me').set(como(gestora));
      expect(r.status).toBe(200);
      // `funciones` lleva más interruptores (el plugin de Moodle, #850): aquí
      // solo se afirma el de los links.
      return r.body.data.user.funciones;
    } finally {
      for (const k of ENV) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; }
    }
  }

  it('producción sin el interruptor: apagados', async () => {
    expect(await conEntorno({ NODE_ENV: 'production', CRM_BASE_URL: 'https://crm.test/crm' }))
      .toMatchObject({ links_pago: false });
  });

  it('producción con LINKS_PAGO_EN_PRODUCCION=1: encendidos', async () => {
    expect(await conEntorno({ NODE_ENV: 'production', CRM_BASE_URL: 'https://crm.test/crm', LINKS_PAGO_EN_PRODUCCION: '1' }))
      .toMatchObject({ links_pago: true });
  });

  it('/testeo y local: encendidos sin tocar nada', async () => {
    expect(await conEntorno({ NODE_ENV: 'production', CRM_BASE_URL: 'https://crm.test/testeo' })).toMatchObject({ links_pago: true });
    expect(await conEntorno({ NODE_ENV: 'test' })).toMatchObject({ links_pago: true });
  });
});

// ─── 2. La marca de plataforma en el link y en su cargo ─────────────────────

describe('cuentas de Stripe compartidas: la marca de plataforma del campus', () => {
  it('conMarcaDePlataforma: añade la del campus, sin filtro no añade nada y nunca pisa una crm_*', () => {
    const meta = { crm_link_id: '1', crm_project_id: '2' };
    expect(conMarcaDePlataforma(meta, null)).toEqual(meta);
    expect(conMarcaDePlataforma(meta, FILTRO_D)).toEqual({ ...meta, plataforma: 'campus-d' });
    expect(conMarcaDePlataforma(meta, { clave: 'crm_link_id', valor: 'otro' })).toEqual(meta);
  });

  it('el link de un campus con cuenta compartida lleva su marca en el link y en el cargo', async () => {
    stripeCreaBien();
    const r = await api.post('/api/links-pago').set(como(gestora)).send({ leadId: leadD, productId: cursoD, importe: 1 });
    expect(r.status).toBe(201);
    const link = llamadas.find((c) => c.ruta === '/v1/payment_links');
    expect(link.cuerpo['metadata[plataforma]']).toBe('campus-d');
    expect(link.cuerpo['payment_intent_data[metadata][plataforma]']).toBe('campus-d');
    // Y siguen las del CRM.
    expect(link.cuerpo['payment_intent_data[metadata][crm_link_id]']).toBe(String(r.body.data.id));
  });

  it('en un campus con cuenta propia (sin filtro) no se añade ninguna marca de plataforma', async () => {
    stripeCreaBien();
    const r = await api.post('/api/links-pago').set(como(gestora)).send({ leadId: leadF, productId: cursoF, importe: 1 });
    expect(r.status).toBe(201);
    const link = llamadas.find((c) => c.ruta === '/v1/payment_links');
    expect(Object.keys(link.cuerpo).filter((k) => k.includes('plataforma'))).toEqual([]);
  });

  it('el sondeo de cada 5 minutos importa el cargo del link como «mío» en su campus y como ajeno en el otro de la misma cuenta', async () => {
    stripeCreaBien();
    const r = await api.post('/api/links-pago').set(como(gestora)).send({ leadId: leadD, productId: cursoD, importe: 1 });
    expect(r.status).toBe(201);
    const metadata = metadataDelCargo(llamadas.find((c) => c.ruta === '/v1/payment_links').cuerpo);
    expect(deQuienEs({ metadata }, FILTRO_D)).toBe('mio');
    expect(deQuienEs({ metadata }, FILTRO_E)).toBe('ajeno');

    // El cargo que crea Stripe al pagar el link, con la metadata del PaymentIntent.
    const cargo = {
      id: `ch_${MARCA}_${r.body.data.id}`, object: 'charge', status: 'succeeded', paid: true,
      amount: 100, currency: 'eur', created: Math.floor(Date.now() / 1000) - 60,
      billing_details: { email: `alumno@${MARCA.toLowerCase()}.test`, name: 'Alumno de prueba' },
      payment_method_details: { type: 'card' }, metadata,
      balance_transaction: { amount: 100, fee: 3, net: 97 },
    };
    preparadas = [['GET', '/v1/charges', 200, { data: [cargo], has_more: false }]];

    const enD = await syncStripePayments(D);
    expect(enD).toMatchObject({ imported: 1, ajenos: 0, sinMarcar: 0, completo: true });
    expect(await one('SELECT project_id FROM stripe_payments WHERE stripe_id = $1 AND project_id = $2', [cargo.id, D])).toBeTruthy();
    // La marca de agua avanza hasta el cargo: no se queda esperando a un «sin marcar».
    const estado = await one('SELECT last_synced_until FROM stripe_sync_state WHERE project_id = $1', [D]);
    expect(Math.floor(new Date(estado.last_synced_until).getTime() / 1000)).toBe(cargo.created);

    const enE = await syncStripePayments(E);
    expect(enE).toMatchObject({ imported: 0, ajenos: 1, sinMarcar: 0 });
    expect(await one('SELECT 1 FROM stripe_payments WHERE stripe_id = $1 AND project_id = $2', [cargo.id, E])).toBeFalsy();
  });
});
