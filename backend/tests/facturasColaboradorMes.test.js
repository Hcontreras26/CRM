import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// R2 simulado: estas pruebas no suben nada a ningún almacén.
vi.mock('../src/shared/services/r2.service.js', () => ({
  uploadToR2: vi.fn(async (key) => key),
  getFromR2: vi.fn(),
  deleteFromR2: vi.fn(),
}));
vi.mock('../src/shared/utils/presignedUrl.js', () => ({
  generatePresignedUrl: vi.fn(async (key) => `https://r2.prueba/${key}?firma=15min`),
}));

import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';
import { uploadToR2 } from '../src/shared/services/r2.service.js';
import { prepararMes, huella, caducidad } from '../src/modules/facturas-colaborador/facturas.service.js';

/**
 * Facturas de colaboradores (#202) · el mes, el enlace y la subida, contra la base.
 *
 * Laura factura a las empresas A y B; Pedro, solo a B. Se prepara septiembre,
 * cada uno sube por su enlace y administración lo ve. Lo borra todo al final.
 *
 *   npm --prefix backend run db:preparar
 *   cd backend && npx vitest run tests/facturasColaboradorMes.test.js
 */

// R2 «configurado» con valores de prueba: así almacen.js (revisión del 10/10) usa el
// R2 simulado de arriba también en la CI, que no tiene R2. El camino del disco lo
// prueba facturasColaboradorRevision.test.js.
process.env.CLOUDFLARE_R2_ACCOUNT_ID = 'cuenta-de-prueba';
process.env.CLOUDFLARE_R2_ACCESS_KEY = 'clave-de-prueba';
process.env.CLOUDFLARE_R2_BUCKET = 'cubo-de-prueba';

const request = supertest(app);
const MARCA = `FCMES_${Date.now().toString(36)}`;
const PERIODO = '2026-09-01';
const API = '/api/facturas-colaborador';

// La caducidad que dio la regla en algún momento de la llamada. Sin contar horas:
// la semana del cambio de hora los «6 días enteros» tienen una hora más o menos.
const caducaSegunLaRegla = (caduca, antes, despues) =>
  [caducidad(PERIODO, antes), caducidad(PERIODO, despues)].some((c) => c.getTime() === new Date(caduca).getTime());

const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);
const one = async (sql, params) => (await q(sql, params))[0];

const U = {};
const T = {};
const E = {};
const P = {};
const C = {};       // colaboradores
const enlace = {};  // 'laura-A', 'laura-B', 'pedro-B' → token en claro

const PDF = Buffer.from('%PDF-1.4\n% factura de prueba\n');
const TEXTO = Buffer.from('esto no es una factura');

function token(user, projectId) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, roles_extra: [], customRoleId: null, activeProjectId: projectId },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
}

async function crearPersona(clave, role, campus) {
  const u = await one(
    `INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3)
     RETURNING id, nombre, email, role`,
    [`${MARCA} ${clave}`, `${clave}_${MARCA.toLowerCase()}@test.local`, role],
  );
  for (const p of campus) await q('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [u.id, p.id]);
  U[clave] = u;
  T[clave] = token(u, campus[0]?.id ?? P.A.id);
}

const como = (clave) => ({ Authorization: `Bearer ${T[clave]}` });

const subir = (t, { archivo = PDF, nombre = 'factura.pdf', importe = '600', numero = 'F-2026-09' } = {}) => {
  const r = request.post(`${API}/enlace/${t}`).field('importe', importe).field('numero_factura', numero);
  return archivo ? r.attach('archivo', archivo, nombre) : r;
};

async function colaborador(nombre, empresas) {
  const c = await one(
    // Solo en septiembre: las demás pruebas preparan otros meses a la vez y no los tocan.
    `INSERT INTO colaboradores (nombre, email, area, alta_desde, baja_desde)
     VALUES ($1, $2, 'seo', '2026-09-01', '2026-10-01') RETURNING id`,
    [`${MARCA} ${nombre}`, `${nombre.toLowerCase()}_${MARCA.toLowerCase()}@test.local`],
  );
  for (const [issuer, importe] of empresas) {
    await q('INSERT INTO colaborador_empresas (colaborador_id, issuer_id, importe_acordado) VALUES ($1, $2, $3)',
      [c.id, issuer.id, importe]);
  }
  return c;
}

/** El id de la fila viva de un colaborador y una empresa ese mes. */
const filaViva = async (c, e) => (await one(
  `SELECT id FROM facturas_colaborador
    WHERE colaborador_id = $1 AND issuer_id = $2 AND periodo = $3 AND anulada_at IS NULL`,
  [c.id, e.id, PERIODO])).id;

/** Pone a una fila un enlace conocido (en la base, solo su huella). */
async function enlaceConocido(facturaId) {
  const t = `prueba${MARCA.toLowerCase().replace(/[^a-z0-9]/g, '')}${facturaId}`.padEnd(43, 'x');
  await q('UPDATE facturas_colaborador SET token_hash = $2 WHERE id = $1', [facturaId, huella(t)]);
  return t;
}

beforeAll(async () => {
  for (const k of ['A', 'B']) {
    E[k] = await one(
      'INSERT INTO invoice_issuers (razon_social, nif, direccion) VALUES ($1, $2, $3) RETURNING id',
      [`${MARCA} Empresa ${k}`, `B${k}${Date.now().toString().slice(-7)}`, `Calle ${k}, 1`],
    );
    P[k] = await one(
      `INSERT INTO projects (nombre, slug, webhook_api_key, sociedad_emisora_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [`${MARCA} Campus ${k}`, `${MARCA.toLowerCase()}-${k.toLowerCase()}`, `${MARCA}-key-${k}`, E[k].id],
    );
  }
  await crearPersona('super', 'superadmin', []);
  await crearPersona('adminA', 'admin', [P.A]);
  await crearPersona('gestora', 'gestor', [P.A]);
  await crearPersona('colaborador', 'colaborador', []);

  C.laura = await colaborador('Laura', [[E.A, 600], [E.B, null]]);
  C.pedro = await colaborador('Pedro', [[E.B, 300]]);
});

afterAll(async () => {
  const cs = Object.values(C).map((c) => c.id);
  await q(`DELETE FROM facturas_colaborador_registro
            WHERE colaborador_id = ANY($1::int[])
               OR factura_id IN (SELECT id FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[]))`, [cs]);
  await q(`DELETE FROM admin_notifications WHERE type = 'factura_colaborador'
            AND (metadata->>'factura_id')::int IN (SELECT id FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[]))`, [cs]);
  await q('DELETE FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[])', [cs]);
  await q('DELETE FROM colaboradores WHERE id = ANY($1::int[])', [cs]);
  const ids = Object.values(U).map((u) => u.id);
  await q('DELETE FROM user_projects WHERE user_id = ANY($1::int[])', [ids]);
  await q('DELETE FROM users WHERE id = ANY($1::int[])', [ids]);
  await q('DELETE FROM projects WHERE id = ANY($1::int[])', [Object.values(P).map((p) => p.id)]);
  await q('DELETE FROM invoice_issuers WHERE id = ANY($1::int[])', [Object.values(E).map((e) => e.id)]);
  await pool.end();
});

describe('facturas de colaboradores (#202) · preparar el mes', () => {
  it('una fila y un enlace por colaborador y empresa; en la base, solo la huella', async () => {
    const antes = new Date();
    const preparados = (await prepararMes(PERIODO)).filter((p) => Object.values(C).some((c) => c.id === p.colaboradorId));
    const despues = new Date();
    expect(preparados).toHaveLength(3);
    for (const p of preparados) {
      const clave = `${p.colaboradorId === C.laura.id ? 'laura' : 'pedro'}-${p.issuerId === E.A.id ? 'A' : 'B'}`;
      enlace[clave] = p.token;
      const fila = await one('SELECT token_hash, caduca_at FROM facturas_colaborador WHERE id = $1', [p.facturaId]);
      expect(fila.token_hash).toBe(huella(p.token));
      expect(fila.token_hash).not.toContain(p.token);
      // Septiembre se prepara después del 6 de octubre: vale 6 días enteros desde hoy
      // (la regla, día a día, en facturasColaboradorCaducidad.test.js).
      expect(caducaSegunLaRegla(fila.caduca_at, antes, despues)).toBe(true);
    }
    expect(Object.keys(enlace).sort()).toEqual(['laura-A', 'laura-B', 'pedro-B']);
  });

  it('prepararlo dos veces no duplica nada', async () => {
    const otra = (await prepararMes(PERIODO)).filter((p) => Object.values(C).some((c) => c.id === p.colaboradorId));
    expect(otra).toHaveLength(0);
  });

  it('una segunda factura viva del mismo colaborador, empresa y mes la impide la base', async () => {
    await expect(q(
      `INSERT INTO facturas_colaborador (colaborador_id, issuer_id, periodo) VALUES ($1, $2, $3)`,
      [C.laura.id, E.A.id, PERIODO],
    )).rejects.toThrow(/uq_facturas_colaborador_mes/);
  });
});

describe('facturas de colaboradores (#202) · el enlace', () => {
  it('sin enlace, o con uno inventado, no se ve nada', async () => {
    expect((await request.get(`${API}/enlace/`)).status).toBe(404);
    expect((await request.get(`${API}/enlace/${'x'.repeat(43)}`)).status).toBe(404);
  });

  it('el colaborador ve su mes, la empresa y lo acordado, y queda «abierto»', async () => {
    const res = await request.get(`${API}/enlace/${enlace['laura-A']}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({
      estado: 'abierto', periodo: '2026-09', mes: 'septiembre de 2026', importe_acordado: 600,
      empresa: { razon_social: `${MARCA} Empresa A`, direccion: 'Calle A, 1' },
    });
    // Nada de huellas, claves de archivo ni correos.
    const texto = JSON.stringify(res.body);
    expect(texto).not.toMatch(/token_hash|archivo_key|@test\.local/);

    const reg = await q(`SELECT evento FROM facturas_colaborador_registro WHERE factura_id = $1`, [await filaViva(C.laura, E.A)]);
    expect(reg.map((r) => r.evento)).toEqual(['abierto']);
  });

  it('sin archivo, con un archivo que no es PDF ni foto, o de más de 10 MB, se rechaza', async () => {
    expect((await subir(enlace['laura-A'], { archivo: null })).status).toBe(400);
    const otro = await subir(enlace['laura-A'], { archivo: TEXTO, nombre: 'factura.pdf' });
    expect(otro.status).toBe(400);
    expect(otro.body.error || otro.body.message).toMatch(/PDF o una foto/);
    const grande = Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]);
    expect((await subir(enlace['laura-A'], { archivo: grande })).status).toBe(400);
    expect(uploadToR2).not.toHaveBeenCalled();
  });

  it('sube la factura: queda recibida con su número de recepción', async () => {
    const res = await subir(enlace['laura-A'], { importe: '600,00' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.estado).toBe('recibida');
    expect(res.body.data.recibida).toMatchObject({ importe: 600, numero_factura: 'F-2026-09' });
    expect(res.body.data.recibida.numero_recepcion).toMatch(/^REC-2026-09-\d{4}$/);

    expect(uploadToR2).toHaveBeenCalledTimes(1);
    const [key, , mime] = uploadToR2.mock.calls[0];
    expect(mime).toBe('application/pdf');
    // 2026-09_<empresa>_<colaborador>_<n.º de factura>.pdf, sin tildes ni símbolos.
    expect(key).toMatch(/^facturas-colaborador\/2026-09\/\d+-[0-9a-f]{8}\/2026-09_FCMES-[a-z0-9]+_FCMES-[a-z0-9]+-Laura_F-2026-09\.pdf$/);
  });

  it('a administración le llega el aviso en la campana: al admin de esa empresa y al super admin', async () => {
    // Sale justo después de responder (revisión del 10/10): se espera a que esté.
    const id = await filaViva(C.laura, E.A);
    const aviso = await vi.waitFor(async () => {
      const a = await one(
        `SELECT title, link_path, target_user_ids FROM admin_notifications
          WHERE type = 'factura_colaborador' AND (metadata->>'factura_id')::int = $1`,
        [id],
      );
      expect(a).toBeTruthy();
      return a;
    });
    expect(aviso.title).toBe(`Factura recibida: ${MARCA} Laura`);
    expect(aviso.link_path).toBe('/finanzas/facturas-colaboradores?periodo=2026-09');
    expect(aviso.target_user_ids).toEqual(expect.arrayContaining([U.adminA.id, U.super.id]));
    expect(aviso.target_user_ids).not.toContain(U.gestora.id);
  });

  it('una segunda factura del mismo mes se rechaza, con un mensaje claro', async () => {
    const res = await subir(enlace['laura-A']);
    expect(res.status).toBe(409);
    expect(res.body.error || res.body.message).toMatch(/Ya subiste la factura de septiembre de 2026/);
  });

  it('un enlace caducado no sirve', async () => {
    await q(`UPDATE facturas_colaborador SET caduca_at = NOW() - INTERVAL '1 day' WHERE id = $1`, [await filaViva(C.laura, E.B)]);
    const ver = await request.get(`${API}/enlace/${enlace['laura-B']}`);
    expect(ver.body.data.estado).toBe('caducado');
    expect((await subir(enlace['laura-B'])).status).toBe(410);
    // Queda en el registro, una sola vez aunque se intente varias.
    const lineas = await q(`SELECT 1 FROM facturas_colaborador_registro WHERE factura_id = $1 AND evento = 'caducado'`, [await filaViva(C.laura, E.B)]);
    expect(lineas).toHaveLength(1);
  });
});

describe('facturas de colaboradores (#202) · administración', () => {
  it('gestora y colaborador no ven la lista del mes', async () => {
    expect((await request.get(`${API}/mes?periodo=2026-09`).set(como('gestora'))).status).toBe(403);
    expect((await request.get(`${API}/mes?periodo=2026-09`).set(como('colaborador'))).status).toBe(403);
  });

  it('el admin de A ve solo lo de A: quién la ha mandado y cuánto', async () => {
    const res = await request.get(`${API}/mes?periodo=2026-09`).set(como('adminA'));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const mias = res.body.data.facturas.filter((f) => f.colaborador_nombre.startsWith(MARCA));
    expect(mias.map((f) => [f.colaborador_nombre, f.empresa, f.estado])).toEqual([
      [`${MARCA} Laura`, `${MARCA} Empresa A`, 'recibida'],
    ]);
    expect(Number(mias[0].diferencia)).toBe(0);
    expect((await request.get(`${API}/mes?periodo=2026-09&issuerId=${E.B.id}`).set(como('adminA'))).status).toBe(403);
  });

  it('el super admin ve las tres y quién falta', async () => {
    const res = await request.get(`${API}/mes?periodo=2026-09`).set(como('super'));
    const mias = res.body.data.facturas.filter((f) => f.colaborador_nombre.startsWith(MARCA));
    expect(mias.map((f) => f.estado).sort()).toEqual(['caducado', 'recibida', 'sin_enviar']);
  });

  it('con una empresa en la cabecera solo llegan sus facturas (Diego, 10/10: «son por EMPRESA»)', async () => {
    for (const k of ['A', 'B']) {
      const res = await request.get(`${API}/mes?periodo=2026-09&issuerId=${E[k].id}`).set(como('super'));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const mias = res.body.data.facturas.filter((f) => f.colaborador_nombre.startsWith(MARCA));
      expect(mias.length).toBeGreaterThan(0);
      expect(new Set(mias.map((f) => f.empresa))).toEqual(new Set([`${MARCA} Empresa ${k}`]));
    }
  });

  it('el archivo se abre con un enlace firmado, y no el de otra empresa', async () => {
    const lauraA = await filaViva(C.laura, E.A);
    const res = await request.get(`${API}/facturas/${lauraA}/archivo`).set(como('adminA'));
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/firma=15min$/);
    const pedroB = await filaViva(C.pedro, E.B);
    expect((await request.get(`${API}/facturas/${pedroB}/archivo`).set(como('adminA'))).status).toBe(404);
  });

  it('anular deja la factura (con motivo) y abre otra del mismo mes que se puede subir', async () => {
    const vieja = await filaViva(C.laura, E.A);
    expect((await request.post(`${API}/facturas/${vieja}/anular`).set(como('adminA')).send({ motivo: '' })).status).toBe(400);

    const res = await request.post(`${API}/facturas/${vieja}/anular`).set(como('adminA')).send({ motivo: 'Subió la de agosto' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).not.toHaveProperty('token');

    const anulada = await one('SELECT anulada_at, anulada_por, motivo_anulacion, archivo_key FROM facturas_colaborador WHERE id = $1', [vieja]);
    expect(anulada.anulada_por).toBe(U.adminA.id);
    expect(anulada.motivo_anulacion).toBe('Subió la de agosto');
    expect(anulada.archivo_key).toBeTruthy(); // el archivo no se borra

    // El enlace viejo ya no deja subir…
    expect((await subir(enlace['laura-A'])).status).toBe(409);
    // …y el nuevo sí.
    const nueva = await filaViva(C.laura, E.A);
    expect(nueva).toBe(res.body.data.nueva);
    const otraVez = await subir(await enlaceConocido(nueva), { numero: 'F-2026-09-B' });
    expect(otraVez.status, JSON.stringify(otraVez.body)).toBe(201);
  });

  it('reenviar cambia el enlace: el viejo deja de valer y no se devuelve el nuevo', async () => {
    const pedroB = await filaViva(C.pedro, E.B);
    const antes = new Date();
    const res = await request.post(`${API}/facturas/${pedroB}/reenviar`).set(como('super'));
    const despues = new Date();
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/token/);
    expect((await request.get(`${API}/enlace/${enlace['pedro-B']}`)).status).toBe(404);
    expect((await subir(enlace['pedro-B'])).status).toBe(404);
    // Reenviado después del 6 de octubre: el enlace nuevo vale 6 días enteros desde hoy.
    const { caduca_at: caduca } = await one('SELECT caduca_at FROM facturas_colaborador WHERE id = $1', [pedroB]);
    expect(caducaSegunLaRegla(caduca, antes, despues)).toBe(true);

    const reg = await request.get(`${API}/facturas/${pedroB}/registro`).set(como('super'));
    expect(reg.body.data.map((r) => r.evento)).toEqual(['reenviado']);
  });

  it('dos anulaciones a la vez: una vale y la otra dice que ya está anulada', async () => {
    const lauraB = await filaViva(C.laura, E.B);
    const anula = () => request.post(`${API}/facturas/${lauraB}/anular`).set(como('super')).send({ motivo: 'Dos a la vez' });
    const [a, b] = await Promise.all([anula(), anula()]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const vivas = await q(
      'SELECT id FROM facturas_colaborador WHERE colaborador_id = $1 AND issuer_id = $2 AND periodo = $3 AND anulada_at IS NULL',
      [C.laura.id, E.B.id, PERIODO]);
    expect(vivas).toHaveLength(1);
  });
});
