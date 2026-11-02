import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

vi.mock('../src/shared/services/brevo.service.js', () => ({
  sendEmail: vi.fn(async () => ({ sent: true })),
}));
// R2 simulado: aquí no se sube nada de verdad.
vi.mock('../src/shared/services/r2.service.js', () => ({
  uploadToR2: vi.fn(async (key) => key),
  getFromR2: vi.fn(),
  deleteFromR2: vi.fn(),
}));
// El disco del servidor (sin R2, como hoy en /testeo y en producción), simulado.
const enDisco = new Map();
vi.mock('../src/shared/services/localStorage.service.js', () => ({
  saveLocal: vi.fn(async (k, b) => { enDisco.set(k, b); return k; }),
  getLocal: vi.fn(async (k) => ({ buffer: enDisco.get(k) ?? Buffer.from(`%PDF-1.4 ${k}`), size: 8 })),
}));
vi.mock('../src/shared/utils/presignedUrl.js', () => ({
  generatePresignedUrl: vi.fn(async (key) => `https://r2.test/${key}?firmado`),
}));

import supertest from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import pool from '../src/shared/config/db.js';
import { sendEmail } from '../src/shared/services/brevo.service.js';
import { uploadToR2 } from '../src/shared/services/r2.service.js';

/**
 * Facturas de colaboradores (#202, segunda parte) · «Marcar pagada».
 *
 * Del «Añadido 01/10 (tarde)»: la fecha, la forma de pago y, si se quiere, el
 * justificante; una o varias a la vez; solo un admin; se puede deshacer con
 * motivo; todo al registro; y el aviso al colaborador («Tu factura de … está
 * pagada · 636,00 € · transferencia del 05/10»), con los correos apagados
 * salvo que se enciendan.
 *
 * Su mes es mayo de 2026, y las facturas se crean aquí mismo: los otros
 * ficheros, que corren a la vez, no las tocan.
 */

// R2 «configurado» con valores de prueba: así almacen.js (revisión del 10/10) usa el
// R2 simulado de arriba también en la CI, que no tiene R2. El camino del disco lo
// prueba facturasColaboradorRevision.test.js.
process.env.CLOUDFLARE_R2_ACCOUNT_ID = 'cuenta-de-prueba';
process.env.CLOUDFLARE_R2_ACCESS_KEY = 'clave-de-prueba';
process.env.CLOUDFLARE_R2_BUCKET = 'cubo-de-prueba';

const request = supertest(app);
const API = '/api/facturas-colaborador';
const MARCA = `FCPAG_${Date.now().toString(36)}`;
const PERIODO = '2026-05-01';
const PDF = Buffer.from('%PDF-1.4\n% justificante de prueba\n');

const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);
const one = async (sql, params) => (await q(sql, params))[0];

const E = {};
const P = {};
const U = {};
const T = {};
const F = {};       // facturas por clave
const C = [];       // colaboradores, para borrarlos

function token(user, projectId) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, roles_extra: [], customRoleId: null, activeProjectId: projectId },
    process.env.JWT_SECRET, { expiresIn: '1h' },
  );
}
const como = (clave) => ({ Authorization: `Bearer ${T[clave]}` });

async function crearPersona(clave, role, campus) {
  const u = await one(
    `INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, email, role`,
    [`${MARCA} ${clave}`, `${clave}_${MARCA.toLowerCase()}@test.local`, role]);
  for (const p of campus) await q('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [u.id, p.id]);
  U[clave] = u;
  T[clave] = token(u, campus[0]?.id ?? P.A.id);
}

/** Una factura de mayo; `recibida` = ya subida (con su número de recepción). */
async function factura(clave, empresa, { recibida = true, importe = 636 } = {}) {
  const c = await one(
    `INSERT INTO colaboradores (nombre, email, area) VALUES ($1, $2, 'seo') RETURNING id`,
    [`${MARCA} ${clave}`, `${clave}_${MARCA.toLowerCase()}@test.local`]);
  C.push(c.id);
  await q('INSERT INTO colaborador_empresas (colaborador_id, issuer_id) VALUES ($1, $2)', [c.id, empresa.id]);
  F[clave] = (await one(
    `INSERT INTO facturas_colaborador (colaborador_id, issuer_id, periodo, subida_at, numero_recepcion, importe, numero_factura)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [c.id, empresa.id, PERIODO, recibida ? new Date() : null,
      recibida ? `REC-P${(Date.now() % 1e7)}-${C.length}` : null, recibida ? importe : null, recibida ? `F-${clave}` : null])).id;
}

const pagar = (clave, campos, archivo = null) => {
  const r = request.post(`${API}/facturas/pagar`).set(como(clave));
  for (const [k, v] of Object.entries(campos)) r.field(k, v);
  if (archivo) r.attach('justificante', archivo, 'justificante transferencia.pdf');
  return r;
};
const fila = (id) => one(
  `SELECT to_char(pagada_at, 'YYYY-MM-DD') AS pagada_at, pagada_por, forma_pago, justificante, referencia_pago
     FROM facturas_colaborador WHERE id = $1`, [id]);
const registro = (id, evento) => q(
  'SELECT detalle, user_id FROM facturas_colaborador_registro WHERE factura_id = $1 AND evento = $2 ORDER BY id', [id, evento]);

beforeAll(async () => {
  for (const k of ['A', 'B']) {
    E[k] = await one('INSERT INTO invoice_issuers (razon_social, nif) VALUES ($1, $2) RETURNING id, razon_social',
      [`${MARCA}${k} Empresa`, `B${k}${Date.now().toString().slice(-7)}`]);
    P[k] = await one(
      `INSERT INTO projects (nombre, slug, webhook_api_key, sociedad_emisora_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [`${MARCA} Campus ${k}`, `${MARCA.toLowerCase()}-${k.toLowerCase()}`, `${MARCA}-key-${k}`, E[k].id]);
  }
  await crearPersona('super', 'superadmin', []);
  await crearPersona('adminA', 'admin', [P.A]);
  await crearPersona('gestora', 'gestor', [P.A]);
  await crearPersona('colaborador', 'colaborador', []);
  await factura('laura', E.A);
  await factura('ana', E.A);
  await factura('sinSubir', E.A, { recibida: false });
  await factura('deB', E.B);
  await factura('aviso', E.A);
});

afterAll(async () => {
  delete process.env.FACTURAS_COLABORADOR_CORREOS_ACTIVOS;
  await q(`DELETE FROM facturas_colaborador_registro WHERE factura_id IN (SELECT id FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[]))`, [C]);
  await q('DELETE FROM facturas_colaborador WHERE colaborador_id = ANY($1::int[])', [C]);
  await q('DELETE FROM colaboradores WHERE id = ANY($1::int[])', [C]);
  const ids = Object.values(U).map((u) => u.id);
  await q('DELETE FROM user_projects WHERE user_id = ANY($1::int[])', [ids]);
  await q('DELETE FROM users WHERE id = ANY($1::int[])', [ids]);
  await q('DELETE FROM projects WHERE id = ANY($1::int[])', [Object.values(P).map((p) => p.id)]);
  await q('DELETE FROM invoice_issuers WHERE id = ANY($1::int[])', [Object.values(E).map((e) => e.id)]);
  await pool.end();
});

describe('facturas de colaboradores (#202) · marcar pagada', () => {
  const datos = (ids) => ({ ids: ids.join(','), fecha: '2026-06-05', forma_pago: 'transferencia' });

  it('solo un admin: la gestora y el colaborador no pueden', async () => {
    expect((await pagar('gestora', datos([F.laura]))).status).toBe(403);
    expect((await pagar('colaborador', datos([F.laura]))).status).toBe(403);
    expect((await fila(F.laura)).pagada_at).toBeNull();
  });

  it('una o varias a la vez, con fecha, forma, referencia y justificante; todo al registro', async () => {
    uploadToR2.mockClear();
    const res = await pagar('adminA', { ...datos([F.laura, F.ana]), referencia_pago: 'TRF-0605' }, PDF);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    for (const id of [F.laura, F.ana]) {
      expect(await fila(id)).toMatchObject({
        pagada_at: '2026-06-05', pagada_por: U.adminA.id, forma_pago: 'transferencia', referencia_pago: 'TRF-0605',
      });
      const [r] = await registro(id, 'pagada');
      expect(r.user_id).toBe(U.adminA.id);
      expect(r.detalle).toMatchObject({
        fecha: '2026-06-05', forma_pago: 'transferencia', referencia_pago: 'TRF-0605',
        justificante: 'justificante transferencia.pdf', importe: 636, junto_con: 2,
      });
    }
    // Un justificante para el pago entero, subido una vez.
    expect(uploadToR2).toHaveBeenCalledTimes(1);
    expect((await fila(F.laura)).justificante).toBe((await fila(F.ana)).justificante);
  });

  it('dos veces no: «Ya está pagada»', async () => {
    const res = await pagar('adminA', datos([F.laura]));
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Ya está pagada');
    // Con varias, en plural.
    const dos = await pagar('adminA', datos([F.laura, F.ana]));
    expect(dos.status).toBe(409);
    expect(dos.body.error).toContain('Ya están pagadas');
  });

  it('solo se paga una factura recibida', async () => {
    const res = await pagar('adminA', datos([F.sinSubir]));
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Solo se pagan facturas recibidas, y esta no lo está');
    expect((await fila(F.sinSubir)).pagada_at).toBeNull();
  });

  it('el admin de A no paga lo de B, ni junto a una suya', async () => {
    expect((await pagar('adminA', datos([F.deB]))).status).toBe(404);
    expect((await pagar('adminA', datos([F.deB, F.aviso]))).status).toBe(404);
    expect((await fila(F.aviso)).pagada_at).toBeNull();
  });

  it('lo que no vale se rechaza: fecha futura, forma inventada, archivo que no es PDF ni foto', async () => {
    const futura = await pagar('adminA', { ...datos([F.aviso]), fecha: '2099-01-01' });
    expect(futura.status).toBe(400);
    expect(JSON.stringify(futura.body)).toContain('posterior a hoy');
    expect((await pagar('adminA', { ...datos([F.aviso]), forma_pago: 'cheque' })).status).toBe(400);
    const txt = await pagar('adminA', datos([F.aviso]), Buffer.from('hola, soy un texto'));
    expect(txt.status).toBe(400);
    expect((await fila(F.aviso)).pagada_at).toBeNull();
  });

  it('el justificante, con enlace firmado; sin justificante, 404', async () => {
    const res = await request.get(`${API}/facturas/${F.laura}/justificante`).set(como('adminA'));
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/^https:\/\/r2\.test\/facturas-colaborador\/pagos\/2026-06\//);
    expect((await request.get(`${API}/facturas/${F.sinSubir}/justificante`).set(como('adminA'))).status).toBe(404);
  });

  it('el admin de A no abre el justificante de B ni le deshace el pago', async () => {
    expect((await pagar('super', datos([F.deB]), PDF)).status).toBe(200);
    expect((await request.get(`${API}/facturas/${F.deB}/justificante`).set(como('adminA'))).status).toBe(404);
    expect((await request.post(`${API}/facturas/${F.deB}/deshacer-pago`).set(como('adminA')).send({ motivo: 'No es mía' })).status).toBe(404);
    expect((await fila(F.deB)).pagada_at).toBe('2026-06-05');
    // Se deja como estaba: por pagar (la usan las pestañas de abajo).
    expect((await request.post(`${API}/facturas/${F.deB}/deshacer-pago`).set(como('super')).send({ motivo: 'Era de prueba' })).status).toBe(200);
  });

  it('una pagada no se anula sin deshacer antes el pago', async () => {
    const res = await request.post(`${API}/facturas/${F.ana}/anular`).set(como('adminA')).send({ motivo: 'Se equivocó' });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('deshaz el pago');
  });

  it('se deshace con motivo: vuelve a «por pagar» y lo que había queda en el registro', async () => {
    expect((await request.post(`${API}/facturas/${F.ana}/deshacer-pago`).set(como('adminA')).send({})).status).toBe(400);
    const res = await request.post(`${API}/facturas/${F.ana}/deshacer-pago`).set(como('adminA')).send({ motivo: 'Era otra transferencia' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await fila(F.ana)).toMatchObject({ pagada_at: null, pagada_por: null, forma_pago: null, justificante: null, referencia_pago: null });
    const [r] = await registro(F.ana, 'pago_deshecho');
    expect(r.detalle).toMatchObject({
      motivo: 'Era otra transferencia', antes: { fecha: '2026-06-05', forma_pago: 'transferencia', referencia_pago: 'TRF-0605' },
    });
    expect((await request.post(`${API}/facturas/${F.ana}/deshacer-pago`).set(como('adminA')).send({ motivo: 'otra vez' })).status).toBe(409);
  });

  it('el aviso al colaborador: encendido sale el de Diego, a él, y queda en el registro; apagado no sale', async () => {
    sendEmail.mockClear();
    // Primero encendidos (se espera a que salgan) y al final apagados: el aviso sale después de
    // responder y lee el interruptor al mandar; en este orden no depende de cuánto tarde.
    process.env.FACTURAS_COLABORADOR_CORREOS_ACTIVOS = 'true';
    try {
      expect((await pagar('adminA', { ...datos([F.aviso]), fecha: '2026-06-05' })).status).toBe(200);
      await vi.waitFor(async () => expect(await registro(F.aviso, 'aviso_pago')).toHaveLength(1));
      expect(sendEmail).toHaveBeenCalledTimes(1);
      const correo = sendEmail.mock.calls[0][0];
      expect(correo.to).toEqual([{ email: `aviso_${MARCA.toLowerCase()}@test.local`, name: `${MARCA} aviso` }]);
      expect(correo.subject).toBe(`Tu factura de mayo para ${MARCA}A está pagada · 636,00 € · transferencia del 05/06`);

      // Se deshace y se vuelve a pagar el mismo día (otra forma de pago): sale otro aviso, con otra clave.
      expect((await request.post(`${API}/facturas/${F.aviso}/deshacer-pago`).set(como('adminA')).send({ motivo: 'Era Bizum' })).status).toBe(200);
      expect((await pagar('adminA', { ...datos([F.aviso]), fecha: '2026-06-05', forma_pago: 'bizum' })).status).toBe(200);
      await vi.waitFor(async () => expect(await registro(F.aviso, 'aviso_pago')).toHaveLength(2));
      const [primero, segundo] = sendEmail.mock.calls.map((c) => c[0]);
      expect(segundo.subject).toContain('Bizum del 05/06');
      expect(segundo.clave).not.toBe(primero.clave);
    } finally { delete process.env.FACTURAS_COLABORADOR_CORREOS_ACTIVOS; }

    // Apagados: no se llama a Brevo ni queda «aviso de pago» en el registro.
    sendEmail.mockClear();
    expect((await pagar('adminA', datos([F.ana]))).status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(sendEmail).not.toHaveBeenCalled();
    expect(await registro(F.ana, 'aviso_pago')).toHaveLength(0);
  });

  it('anular y pagar a la vez: si el pago llega mientras anular espera la fila, la anulación no sigue', async () => {
    await factura('carrera', E.A);
    // La fila, bloqueada desde fuera: «anular» ya la ha leído sin pagar y se queda esperando.
    const otro = await pool.connect();
    try {
      await otro.query('BEGIN');
      await otro.query('SELECT id FROM facturas_colaborador WHERE id = $1 FOR UPDATE', [F.carrera]);
      const anulando = request.post(`${API}/facturas/${F.carrera}/anular`).set(como('adminA')).send({ motivo: 'Se equivocó' }).then((r) => r);
      await new Promise((r) => setTimeout(r, 600));
      // Entretanto, otro admin la paga.
      await otro.query("UPDATE facturas_colaborador SET pagada_at = '2026-06-05', forma_pago = 'transferencia' WHERE id = $1", [F.carrera]);
      await otro.query('COMMIT');
      const res = await anulando;
      expect(res.status, JSON.stringify(res.body)).toBe(409);
      expect(res.body.error).toContain('deshaz el pago');
      expect((await one('SELECT anulada_at FROM facturas_colaborador WHERE id = $1', [F.carrera])).anulada_at).toBeNull();
    } finally { otro.release(); }
  });
});

// Las pestañas (segunda parte): «Del mes · Enviadas · Por pagar (con el total
// pendiente) · Pagadas · Historial, filtrable por colaborador, empresa, mes y
// estado», y el coste por campus con las líneas del desglose.
describe('facturas de colaboradores (#202) · Enviadas, Por pagar, Pagadas, Historial y coste por campus', () => {
  const vista = (clave, params) => request.get(`${API}/facturas`).query(params).set(como(clave));
  const mias = (res) => res.body.data.facturas.filter((f) => Object.values(F).includes(f.id)).map((f) => f.id).sort();

  beforeAll(async () => {
    // Una recibida de A sin pagar, que además no cuadra, con dos líneas (una con campus).
    await factura('porPagar', E.A, { importe: 500 });
    await q('UPDATE facturas_colaborador SET cuadra = false, total = 480 WHERE id = $1', [F.porPagar]);
    await q(`INSERT INTO facturas_colaborador_lineas (factura_id, orden, concepto, project_id, horas, tarifa, importe)
             VALUES ($1, 1, 'Landing', $2, 10, 30, 300), ($1, 2, 'Soporte', NULL, 5, 30, 150)`, [F.porPagar, P.A.id]);
  });

  it('Por pagar: recibidas y sin pagar, de sus empresas, con el total pendiente', async () => {
    const res = await vista('adminA', { vista: 'por_pagar', periodo: '2026-05' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(mias(res)).toEqual([F.porPagar]);
    // El admin de A solo ve la empresa A de esta prueba: lo pendiente es justo esa de 500.
    expect(res.body.data.resumen).toMatchObject({ total: 1, pendiente: 500 });
    // La de B no la ve el admin de A; el super admin sí.
    expect(mias(await vista('super', { vista: 'por_pagar', periodo: '2026-05' }))).toEqual([F.deB, F.porPagar].sort((a, b) => a - b));
  });

  it('Pagadas, Enviadas e Historial', async () => {
    expect(mias(await vista('adminA', { vista: 'pagadas', periodo: '2026-05' })))
      .toEqual([F.laura, F.ana, F.aviso, F.carrera].sort((a, b) => a - b));
    expect(mias(await vista('adminA', { vista: 'enviadas', periodo: '2026-05' })))
      .toEqual([F.laura, F.ana, F.aviso, F.carrera, F.porPagar].sort((a, b) => a - b));
    // El historial lo lleva todo, también la que aún no ha llegado.
    expect(mias(await vista('adminA', { vista: 'historial', periodo: '2026-05' })))
      .toEqual([F.laura, F.ana, F.sinSubir, F.aviso, F.carrera, F.porPagar].sort((a, b) => a - b));
  });

  it('se filtra por colaborador y por estado («No cuadra» es de la factura)', async () => {
    const colaborador = (await one('SELECT colaborador_id FROM facturas_colaborador WHERE id = $1', [F.ana])).colaborador_id;
    expect(mias(await vista('adminA', { vista: 'historial', colaboradorId: colaborador }))).toEqual([F.ana]);
    expect(mias(await vista('adminA', { vista: 'historial', periodo: '2026-05', estado: 'no_cuadra' }))).toEqual([F.porPagar]);
  });

  it('el admin de A no pide la lista de B; una pestaña inventada da 400', async () => {
    expect((await vista('adminA', { vista: 'pagadas', issuerId: E.B.id })).status).toBe(403);
    expect((await vista('adminA', { vista: 'todas' })).status).toBe(400);
    expect((await vista('gestora', { vista: 'pagadas' })).status).toBe(403);
  });

  it('el desglose de una factura, para administración: sus líneas con el campus y lo que calculó el CRM', async () => {
    const res = await request.get(`${API}/facturas/${F.porPagar}/desglose`).set(como('adminA'));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data).toMatchObject({ importe: 500, total: 480, cuadra: false });
    expect(res.body.data.lineas).toEqual([
      expect.objectContaining({ orden: 1, concepto: 'Landing', campus: `${MARCA} Campus A`, horas: 10, tarifa: 30, importe: 300 }),
      expect.objectContaining({ orden: 2, concepto: 'Soporte', campus: null, horas: 5, importe: 150 }),
    ]);
    // Sin desglose (subida sin modalidad): sin líneas y sin «cuadra».
    expect((await request.get(`${API}/facturas/${F.laura}/desglose`).set(como('adminA'))).body.data).toMatchObject({ lineas: [], cuadra: null });
    // Un admin, solo de sus empresas; la gestora, nada.
    expect((await request.get(`${API}/facturas/${F.deB}/desglose`).set(como('adminA'))).status).toBe(404);
    expect((await request.get(`${API}/facturas/${F.porPagar}/desglose`).set(como('gestora'))).status).toBe(403);
  });

  it('coste por campus: horas y base de las líneas del mes, juntas las que no tienen campus', async () => {
    const res = await request.get(`${API}/coste-por-campus`).query({ periodo: '2026-05' }).set(como('adminA'));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const deA = res.body.data.campus.find((c) => c.project_id === P.A.id);
    expect(deA).toMatchObject({ campus: `${MARCA} Campus A`, horas: 10, importe: 300, facturas: 1 });
    expect(res.body.data.campus.find((c) => c.project_id === null)).toMatchObject({ horas: 5, importe: 150 });
  });

  it('con todas las empresas, lo que no lleva campus no se suma entre empresas (Diego, 10/10: «son por EMPRESA»)', async () => {
    await q(`INSERT INTO facturas_colaborador_lineas (factura_id, orden, concepto, project_id, horas, tarifa, importe)
             VALUES ($1, 1, 'Soporte', NULL, 2, 30, 60)`, [F.deB]);
    const res = await request.get(`${API}/coste-por-campus`).query({ periodo: '2026-05' }).set(como('super'));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const sinCampus = res.body.data.campus.filter((c) => c.project_id === null && [E.A.id, E.B.id].includes(c.issuer_id));
    expect(sinCampus.map((c) => [c.issuer_id, c.empresa, c.importe]).sort()).toEqual([
      [E.A.id, `${MARCA}A Empresa`, 150], [E.B.id, `${MARCA}B Empresa`, 60],
    ].sort());
  });

  it('con desglose, la diferencia es la de su base: lo acordado es la base, no el total con IVA e IRPF', async () => {
    const recibido = async () => (await request.get(`${API}/mes`).query({ periodo: '2026-05', issuerId: E.A.id })
      .set(como('adminA'))).body.data.resumen.importe_recibido;
    const antes = await recibido();
    await q('UPDATE facturas_colaborador SET base = 450, importe_esperado = 450 WHERE id = $1', [F.porPagar]);
    const res = await vista('adminA', { vista: 'por_pagar', periodo: '2026-05' });
    const f = res.body.data.facturas.find((x) => x.id === F.porPagar);
    // Importe 500 (el total de su factura), base 450 y 450 acordados: diferencia 0.
    expect(Number(f.diferencia)).toBe(0);
    // Y la cabecera de «Del mes» («… de … acordados») cuenta su base, no su total: 50 menos.
    expect(Math.round((antes - await recibido()) * 100) / 100).toBe(50);
    await q('UPDATE facturas_colaborador SET base = NULL, importe_esperado = NULL WHERE id = $1', [F.porPagar]);
  });

  it('el coste por campus sigue el filtro de empresa; un admin no pide el de otra', async () => {
    const deB = await request.get(`${API}/coste-por-campus`).query({ periodo: '2026-05', issuerId: E.B.id }).set(como('super'));
    expect(deB.status).toBe(200);
    expect(deB.body.data.campus.find((c) => c.project_id === P.A.id)).toBeUndefined();
    expect((await request.get(`${API}/coste-por-campus`).query({ periodo: '2026-05', issuerId: E.B.id }).set(como('adminA'))).status).toBe(403);
  });
});

// El ZIP del mes (segunda parte): «facturas-colaboradores_2026-09_CEDIA.zip, con
// un resumen.xlsx dentro», con las columnas de la definición.
describe('facturas de colaboradores (#202) · el ZIP del mes', () => {
  const nombre = (clave) => `2026-05_${MARCA}A_${clave}_F-${clave}.pdf`;
  const binario = (res, cb) => { const t = []; res.on('data', (c) => t.push(c)); res.on('end', () => cb(null, Buffer.concat(t))); };

  beforeAll(async () => {
    const { getFromR2 } = await import('../src/shared/services/r2.service.js');
    getFromR2.mockImplementation(async (key) => ({
      body: { transformToByteArray: async () => new TextEncoder().encode(`%PDF-1.4 ${key}`) },
    }));
    for (const clave of ['laura', 'porPagar']) {
      await q('UPDATE facturas_colaborador SET archivo_key = $2, importe_esperado = 600 WHERE id = $1',
        [F[clave], `facturas-colaborador/2026-05/${F[clave]}-abc/${nombre(clave)}`]);
    }
  });

  it('las recibidas de la empresa, con su nombre, y el resumen con las columnas de la definición', async () => {
    const res = await request.get(`${API}/zip`).query({ periodo: '2026-05', issuerId: E.A.id })
      .set(como('adminA')).buffer(true).parse(binario);
    expect(res.status, res.text).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="facturas-colaboradores_2026-05_${MARCA}A.zip"; filename*=UTF-8''facturas-colaboradores_2026-05_${MARCA}A.zip`);

    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(res.body);
    const archivos = Object.keys(zip.files).sort();
    expect(archivos).toEqual([nombre('laura'), nombre('porPagar'), 'resumen.xlsx'].sort());
    expect(await zip.file(nombre('laura')).async('string')).toContain(`%PDF-1.4 facturas-colaborador/2026-05/${F.laura}`);

    const { default: ExcelJS } = await import('exceljs');
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await zip.file('resumen.xlsx').async('nodebuffer'));
    const hoja = libro.getWorksheet('Resumen');
    expect(hoja.getRow(1).values.slice(1)).toEqual([
      'Colaborador', 'Área', 'NIF', 'Número de factura', 'Importe', 'Acordado', 'Diferencia', 'Moneda', 'Fecha de subida', 'Número de recepción',
    ]);
    const filas = [2, 3].map((n) => hoja.getRow(n).values.slice(1));
    const deLaura = filas.find((f) => f[0] === `${MARCA} laura`);
    // La moneda (#584), detrás de la diferencia: sin decir otra, EUR.
    expect(deLaura.slice(0, 8)).toEqual([`${MARCA} laura`, 'SEO', '', 'F-laura', 636, 600, 36, 'EUR']);
    expect(deLaura[8]).toBeInstanceOf(Date);
    expect(deLaura[9]).toMatch(/^REC-P/);
  });

  it('la fecha de subida, en hora de Madrid; y dos con el mismo nombre no se pisan', async () => {
    // 10:44 UTC de un día de verano son las 12:44 en Madrid.
    await q("UPDATE facturas_colaborador SET subida_at = '2026-06-01T10:44:00Z' WHERE id = $1", [F.laura]);
    // La de porPagar, con el mismo nombre de archivo que la de Laura.
    await q('UPDATE facturas_colaborador SET archivo_key = $2 WHERE id = $1',
      [F.porPagar, `facturas-colaborador/2026-05/otra-carpeta/${nombre('laura')}`]);
    const res = await request.get(`${API}/zip`).query({ periodo: '2026-05', issuerId: E.A.id })
      .set(como('adminA')).buffer(true).parse(binario);
    expect(res.status).toBe(200);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(res.body);
    const pdfs = Object.keys(zip.files).filter((n) => n.endsWith('.pdf'));
    expect(pdfs).toHaveLength(2);
    expect(pdfs.some((n) => /_REC-P\d+-\d+\.pdf$/.test(n)), pdfs.join(' · ')).toBe(true);

    const { default: ExcelJS } = await import('exceljs');
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await zip.file('resumen.xlsx').async('nodebuffer'));
    const deLaura = [2, 3].map((n) => libro.getWorksheet('Resumen').getRow(n).values.slice(1)).find((r) => r[0] === `${MARCA} laura`);
    expect(deLaura[8].toISOString()).toBe('2026-06-01T12:44:00.000Z');
    // Y la fecha de su archivo dentro del ZIP, también en hora de Madrid (antes, en UTC: 10:44).
    expect(zip.file(nombre('laura')).date.toISOString()).toBe('2026-06-01T12:44:00.000Z');
  });

  it('una razón social con «’» o «Ł» no rompe la descarga', async () => {
    await q('UPDATE invoice_issuers SET razon_social = $2 WHERE id = $1', [E.A.id, `L’Łódź${MARCA} Empresa`]);
    try {
      const res = await request.get(`${API}/zip`).query({ periodo: '2026-05', issuerId: E.A.id })
        .set(como('adminA')).buffer(true).parse(binario);
      expect(res.status, res.text).toBe(200);
      const nombre = `facturas-colaboradores_2026-05_L’Łódź${MARCA}.zip`;
      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="${nombre.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`);
    } finally {
      await q('UPDATE invoice_issuers SET razon_social = $2 WHERE id = $1', [E.A.id, E.A.razon_social]);
    }
  });

  it('un admin, solo de sus empresas; sin recibidas, 404; la gestora, 403', async () => {
    expect((await request.get(`${API}/zip`).query({ periodo: '2026-05', issuerId: E.B.id }).set(como('adminA'))).status).toBe(403);
    const vacio = await request.get(`${API}/zip`).query({ periodo: '2026-04', issuerId: E.A.id }).set(como('adminA'));
    expect(vacio.status).toBe(404);
    expect(vacio.body.error).toContain('No hay facturas recibidas de abril de 2026');
    expect((await request.get(`${API}/zip`).query({ periodo: '2026-05', issuerId: E.A.id }).set(como('gestora'))).status).toBe(403);
  });
});

// Sin R2, como hoy en /testeo y en producción (almacen.js, revisión del 10/10): el
// justificante y las facturas van al disco del servidor, con su enlace firmado.
describe('facturas de colaboradores (#202) · el justificante y el ZIP, en el disco del servidor', () => {
  const sinR2 = () => {
    const antes = { ...process.env };
    delete process.env.CLOUDFLARE_R2_ACCOUNT_ID; delete process.env.CLOUDFLARE_R2_ACCESS_KEY; delete process.env.CLOUDFLARE_R2_BUCKET;
    return () => Object.assign(process.env, {
      CLOUDFLARE_R2_ACCOUNT_ID: antes.CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY: antes.CLOUDFLARE_R2_ACCESS_KEY,
      CLOUDFLARE_R2_BUCKET: antes.CLOUDFLARE_R2_BUCKET,
    });
  };

  it('el justificante se guarda en el disco y se abre con su enlace, que no abre la factura (ni al revés)', async () => {
    await factura('enDisco', E.A);
    const volver = sinR2();
    try {
      const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
      const res = await pagar('adminA', { ids: String(F.enDisco), fecha: '2026-06-05', forma_pago: 'bizum' }, jpg);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect((await fila(F.enDisco)).justificante).toMatch(/^local:facturas-colaborador\/pagos\/2026-06\/.+\.jpg$/);

      const { url } = (await request.get(`${API}/facturas/${F.enDisco}/justificante`).set(como('adminA'))).body.data;
      expect(url).toMatch(new RegExp(`^/facturas-colaborador/justificante-local/${F.enDisco}\\?exp=\\d+&sig=`));
      const bajada = await request.get(`/api${url}`);
      expect(bajada.status).toBe(200);
      expect(bajada.headers['content-type']).toBe('image/jpeg');
      expect(Buffer.from(bajada.body).equals(jpg)).toBe(true);

      // La firma del justificante no abre la factura, ni la de la factura el justificante.
      const firma = url.split('?')[1];
      expect((await request.get(`${API}/archivo-local/${F.enDisco}?${firma}`)).status).toBe(403);
      expect((await request.get(`${API}/justificante-local/${F.enDisco}?exp=9999999999&sig=inventada`)).status).toBe(403);
    } finally { volver(); }
  });

  it('el ZIP lee también las facturas guardadas en el disco', async () => {
    await q("UPDATE facturas_colaborador SET archivo_key = 'local:facturas-colaborador/2026-05/x/2026-05_En-disco.pdf' WHERE id = $1", [F.enDisco]);
    const binario = (r, cb) => { const t = []; r.on('data', (c) => t.push(c)); r.on('end', () => cb(null, Buffer.concat(t))); };
    const res = await request.get(`${API}/zip`).query({ periodo: '2026-05', issuerId: E.A.id }).set(como('adminA')).buffer(true).parse(binario);
    expect(res.status).toBe(200);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(res.body);
    expect(await zip.file('2026-05_En-disco.pdf').async('string')).toContain('%PDF-1.4 facturas-colaborador/2026-05/x/2026-05_En-disco.pdf');
  });
});

// El aviso sale después de responder: si entretanto se deshizo el pago, no se avisa.
describe('facturas de colaboradores (#202) · el aviso de pago, si se deshace antes de que salga', () => {
  const datos = (ids) => ({ ids: ids.join(','), fecha: '2026-06-05', forma_pago: 'transferencia' });

  it('pagadas dos a la vez: si la segunda se deshace mientras sale el aviso de la primera, el de la segunda no sale', async () => {
    await factura('avisoPrimera', E.A);
    await factura('avisoSegunda', E.A);
    let seguir;
    const esperar = new Promise((r) => { seguir = r; });
    sendEmail.mockClear();
    // El primer aviso se queda «en Brevo» hasta que se deshaga el pago de la segunda.
    sendEmail.mockImplementationOnce(async () => { await esperar; return { sent: true }; });
    process.env.FACTURAS_COLABORADOR_CORREOS_ACTIVOS = 'true';
    try {
      expect((await pagar('adminA', datos([F.avisoPrimera, F.avisoSegunda]))).status).toBe(200);
      await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1));
      expect((await request.post(`${API}/facturas/${F.avisoSegunda}/deshacer-pago`).set(como('adminA'))
        .send({ motivo: 'Se pagó por error' })).status).toBe(200);
      seguir();
      await vi.waitFor(async () => expect(await registro(F.avisoPrimera, 'aviso_pago')).toHaveLength(1));
      await new Promise((r) => setTimeout(r, 300));
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(await registro(F.avisoSegunda, 'aviso_pago')).toHaveLength(0);
    } finally { delete process.env.FACTURAS_COLABORADOR_CORREOS_ACTIVOS; }
  });
});
