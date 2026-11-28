import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

/**
 * #1201 · Diplomas › Emitidos: «Enviar al alumno» en lote.
 *
 * Lo que se defiende, con los controladores de verdad y Certifex doblado:
 *  · N enviables → una llamada a Certifex `/avisos` con esos N, a nombre de quien pulsa.
 *  · Lo que no toca (ya enviado, revocado, revertido, emitido fuera del CRM, sin correo del
 *    alumno) NO llega a Certifex: vuelve en `omitidos`, cada uno con su motivo.
 *  · Lo ya enviado no se reenvía: un lote solo de enviados no escribe nada.
 *  · Dos lotes a la vez con el mismo diploma: sale una vez (el segundo lo deja fuera).
 *  · Alcance por campus (un diploma ajeno: 404 y nada sale) y permiso del catálogo
 *    (`diplomas.emit`: sin él, 403).
 *  · Un fallo de uno (Certifex no pudo con él) se informa y los demás salen igual.
 *  · Tope por llamada: 10.
 *  · Ningún correo real: `fetch` solo contesta lo de Certifex (el correo lo manda Certifex,
 *    y aquí no hay Certifex), y cualquier otra dirección hace fallar la prueba.
 */

const PROYECTOS = [{ id: 1, nombre: 'Psiko Aprende', slug: 'psiko' }, { id: 2, nombre: 'ISEIE', slug: 'iseie' }];
const campusDe = { 61: [1], 62: [1] };
vi.mock('../src/shared/config/db.js', () => {
  const query = vi.fn(async (text, params) => {
    if (/FROM user_projects WHERE user_id = \$1/.test(text)) return { rows: (campusDe[params[0]] ?? []).map((id) => ({ project_id: id })) };
    if (/SELECT id, nombre, slug FROM projects/.test(text)) return { rows: PROYECTOS };
    return { rows: [] };
  });
  return { query, getClient: vi.fn(), default: { query, end: vi.fn() } };
});
vi.mock('../src/modules/permissions/permissions.service.js', () => import('./helpers/permisosSinBase.js'));
// Brevo simulado: el CRM no manda ningún correo aquí (el del diploma lo manda Certifex).
const brevo = vi.hoisted(() => ({ enviados: [] }));
vi.mock('../src/shared/services/brevo.service.js', async (original) => {
  const real = await original();
  const apuntar = (...a) => { brevo.enviados.push(a); return { sent: false, reason: 'PRUEBA' }; };
  return { ...real, sendEmail: vi.fn(apuntar) };
});
// «Cuándo se le mandó» (#768): se apunta lo que salió, como en el envío de uno.
const anotados = vi.hoisted(() => ({ lista: [] }));
vi.mock('../src/modules/diploma-confirmacion/diploma-confirmacion.puerta.js', async (original) => {
  const real = await original();
  return { ...real, anotarEnvios: vi.fn(async (exps) => { anotados.lista.push(...exps); }) };
});
const { registrar } = await import('./helpers/permisosSinBase.js');

process.env.CERTIFEX_API_URL = 'https://certifex.test';
process.env.CERTIFEX_CRM_CLAVE = 'cfx_crm_clave-de-prueba-envio-lote';

const { default: express } = await import('express');
const { default: supertest } = await import('supertest');
const { default: jwt } = await import('jsonwebtoken');
const { default: router } = await import('../src/modules/certifex/certifex.routes.js');

const app = express();
app.use(express.json());
app.use('/api/certifex', router);
app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ success: false, error: err.message, code: err.code }));
const request = supertest(app);

const token = (userId, role) =>
  jwt.sign({ userId, email: `u${userId}@prueba.test`, role, roles_extra: [] }, process.env.JWT_SECRET, { expiresIn: '5m' });
const SUPER = token(1, 'superadmin');
const GESTORA = token(61, 'gestor'); // diplomas.emit, solo Psiko
const SIN_EMITIR = token(62, 'gestor'); // Psiko, solo ver

// ── Certifex de mentira ──────────────────────────────────────────────────────
const exp = (n, centro = 'PSIKO') => `${centro}-2026-${String(n).padStart(6, '0')}-AAAA`;
const DEL_CRM = 'u9@prueba.test (CRM ISEIH)';
const diploma = (n, extra = {}) => ({
  nexpediente: exp(n, extra.centro), centro: 'PSIKO', alumno: `Alumna ${n}`, titulacion: 'Diplomado en Prueba', cursoRef: 12,
  emitidoEn: '2026-11-20T10:00:00.000Z', emitidaPor: DEL_CRM, revocada: false, anulada: false, aviso: null, ...extra,
});
const enviado = { resultado: 'enviado', en: '2026-11-21T10:00:00.000Z', por: DEL_CRM };
const DIPLOMAS = [
  diploma(1), diploma(2), diploma(3), // pendientes de aviso
  diploma(4, { aviso: enviado }), // ya enviado
  diploma(5, { revocada: true }),
  diploma(6, { anulada: true }),
  diploma(7, { emitidaPor: 'secretaria@campus.test' }), // fuera del CRM
  diploma(8), // sin correo del alumno
  diploma(9, { aviso: { resultado: 'correo_apagado', en: '2026-11-21T10:00:00.000Z', por: DEL_CRM } }), // no salió: se puede
  diploma(10, { centro: 'ISEIE' }),
  ...[11, 12, 13, 14, 15, 16, 17].map((n) => diploma(n)),
  diploma(18, { entregado: true }), // entregado por Certifex sin aviso del CRM (su panel o su cola)
];
// Las matrículas aprobadas (de ahí sale el correo del titular).
const CANDIDATOS = DIPLOMAS.map((d) => ({
  matriculaId: Number(d.nexpediente.split('-')[2]), centro: d.centro, nexpediente: d.nexpediente,
  titular: { nombre: d.alumno, email: d.nexpediente === exp(8) ? '' : `alumna${d.nexpediente.split('-')[2]}@prueba.test` },
}));

let pedidas = [];
let falloDe = new Set(); // los que Certifex no puede enviar
let esperaAvisos = null; // para retener /avisos (dos lotes a la vez)
let correoActivo = true; // el correo del servidor de Certifex
let certifexCaido = false; // /avisos contesta 503
let certifexSinContestar = false; // /avisos no contesta (se corta por tiempo)
const fetchReal = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = vi.fn(async (url, opts = {}) => {
    if (!String(url).startsWith('https://certifex.test/')) throw new Error(`salida no permitida en la prueba: ${url}`);
    const u = new URL(String(url));
    const p = { ruta: u.pathname.replace('/api/crm/v1', ''), query: Object.fromEntries(u.searchParams), metodo: opts.method, cuerpo: opts.body ? JSON.parse(opts.body) : null };
    pedidas.push(p);
    const responder = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    const filtrar = (lista) => lista.filter((x) => !p.query.centro || x.centro === p.query.centro.toUpperCase());
    if (p.ruta === '/yo') return responder({ nombre: 'CRM ISEIH', centros: ['PSIKO', 'ISEIE'] });
    if (p.ruta === '/candidatos') { const f = filtrar(CANDIDATOS); return responder({ filas: f, total: f.length }); }
    if (p.ruta === '/diplomas') {
      const f = filtrar(DIPLOMAS).filter((d) => !p.query.q || d.nexpediente === p.query.q);
      return responder({ filas: f, total: f.length });
    }
    if (p.ruta === '/avisos') {
      // Solo se retiene la primera llamada: la del segundo lote contesta enseguida.
      const espera = esperaAvisos;
      esperaAvisos = null;
      if (espera) await espera;
      if (certifexCaido) return responder({ error: 'Certifex caído' }, 503);
      if (certifexSinContestar) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      return responder({
        correoActivo,
        resultados: p.cuerpo.nexpedientes.map((n) => (falloDe.has(n)
          ? { nexpediente: n, ok: false, resultado: 'error' }
          : { nexpediente: n, ok: true, resultado: 'enviado' })),
      });
    }
    return responder({ error: `ruta no doblada: ${p.ruta}` }, 404);
  });
});
afterAll(() => { globalThis.fetch = fetchReal; });
beforeEach(() => {
  pedidas = [];
  falloDe = new Set();
  esperaAvisos = null;
  correoActivo = true;
  certifexCaido = false;
  certifexSinContestar = false;
  anotados.lista = [];
  brevo.enviados = [];
  registrar({ userId: 1, role: 'superadmin' });
  registrar({ userId: 61, role: 'gestor', excepciones: { 'diplomas.emit': true } });
  registrar({ userId: 62, role: 'gestor', excepciones: { 'diplomas.view': true } });
});

const lote = (nexpedientes, t = SUPER) => request.post('/api/certifex/diplomas/avisos/lote').set('Authorization', `Bearer ${t}`).send({ nexpedientes });
const avisosEnviados = () => pedidas.filter((p) => p.ruta === '/avisos');

describe('#1201 · enviar en lote desde Emitidos', () => {
  it('N enviables → una llamada a Certifex con esos N, a nombre de quien pulsa', async () => {
    const r = await lote([exp(1), exp(2), exp(3)]);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(avisosEnviados()).toHaveLength(1);
    expect(avisosEnviados()[0].cuerpo).toEqual({ nexpedientes: [exp(1), exp(2), exp(3)], aprobadoPor: 'u1@prueba.test' });
    expect(r.body.data.resultados.filter((x) => x.ok)).toHaveLength(3);
    expect(r.body.data.omitidos).toEqual([]);
  });

  it('lo que no toca no llega a Certifex y vuelve con su motivo', async () => {
    const r = await lote([exp(1), exp(4), exp(5), exp(6), exp(7), exp(8), exp(9)]);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(avisosEnviados()).toHaveLength(1);
    // El 9 tiene aviso, pero no salió (correo apagado): ese sí se vuelve a intentar.
    expect(avisosEnviados()[0].cuerpo.nexpedientes).toEqual([exp(1), exp(9)]);
    const motivos = Object.fromEntries(r.body.data.omitidos.map((o) => [o.nexpediente, o.motivo]));
    expect(motivos).toEqual({
      [exp(4)]: 'ya_enviado', [exp(5)]: 'revocado', [exp(6)]: 'anulado', [exp(7)]: 'fuera_del_crm', [exp(8)]: 'sin_correo',
    });
    for (const o of r.body.data.omitidos) expect(o.error).toBeTruthy();
  });

  it('lo ya enviado no se reenvía: un lote solo de enviados no escribe nada', async () => {
    const r = await lote([exp(4)]);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(avisosEnviados()).toHaveLength(0);
    expect(r.body.data.resultados).toEqual([]);
    expect(r.body.data.omitidos).toMatchObject([{ nexpediente: exp(4), motivo: 'ya_enviado' }]);
  });

  it('el mismo número repetido en el lote sale una sola vez', async () => {
    const r = await lote([exp(1), exp(1), exp(2)]);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(avisosEnviados()[0].cuerpo.nexpedientes).toEqual([exp(1), exp(2)]);
  });

  it('dos lotes a la vez con el mismo diploma: sale una vez', async () => {
    let soltar;
    esperaAvisos = new Promise((r) => { soltar = r; });
    const primero = lote([exp(1), exp(2)]);
    const primeroYa = primero.then((x) => x); // arranca la petición
    await vi.waitFor(() => expect(avisosEnviados()).toHaveLength(1));
    const segundo = await lote([exp(2), exp(3)]);
    soltar();
    const r1 = await primeroYa;
    expect(r1.status).toBe(200);
    expect(segundo.status, JSON.stringify(segundo.body)).toBe(200);
    const enviadosA = avisosEnviados().flatMap((p) => p.cuerpo.nexpedientes);
    expect(enviadosA.filter((n) => n === exp(2))).toHaveLength(1);
    expect(segundo.body.data.omitidos).toMatchObject([{ nexpediente: exp(2), motivo: 'en_curso' }]);
  });

  it('un fallo de uno se informa y los demás salen igual', async () => {
    falloDe = new Set([exp(2)]);
    const r = await lote([exp(1), exp(2), exp(3)]);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const porExp = Object.fromEntries(r.body.data.resultados.map((x) => [x.nexpediente, x.ok]));
    expect(porExp).toEqual({ [exp(1)]: true, [exp(2)]: false, [exp(3)]: true });
  });

  it('más de 10 por llamada: 400 y nada sale', async () => {
    const r = await lote([1, 2, 3, 9, 11, 12, 13, 14, 15, 16, 17].map((n) => exp(n)));
    expect(r.status).toBe(400);
    expect(avisosEnviados()).toHaveLength(0);
  });

  it('cada envío queda apuntado, y el CRM no manda ningún correo por su cuenta', async () => {
    const r = await lote([exp(1), exp(2), exp(3)]);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(anotados.lista).toEqual([exp(1), exp(2), exp(3)]);
    expect(brevo.enviados).toHaveLength(0);
  });

  it('con el correo de Certifex apagado: aprobado, pero no se apunta como enviado, y se dice', async () => {
    correoActivo = false;
    const r = await lote([exp(1), exp(2)]);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.correoActivo).toBe(false);
    expect(anotados.lista).toEqual([]);
  });

  it('si Certifex no responde, el error sale tal cual (el panel lo apunta y sigue con la tanda siguiente)', async () => {
    certifexCaido = true;
    const r = await lote([exp(1)]);
    expect(r.status).toBe(502);
    expect(anotados.lista).toEqual([]);
  });

  it('super admin: un número que Certifex no tiene se queda fuera, con su motivo', async () => {
    const r = await lote([exp(1), exp(999)]);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(avisosEnviados()[0].cuerpo.nexpedientes).toEqual([exp(1)]);
    expect(r.body.data.omitidos).toMatchObject([{ nexpediente: exp(999), motivo: 'no_encontrado' }]);
  });

  it('el envío de uno («Reenviar» desde la fila) sigue igual: a nombre de quien pulsa', async () => {
    const r = await request.post('/api/certifex/diplomas/avisos').set('Authorization', `Bearer ${SUPER}`).send({ nexpedientes: [exp(4)] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(avisosEnviados()[0].cuerpo).toEqual({ nexpedientes: [exp(4)], aprobadoPor: 'u1@prueba.test' });
    expect(anotados.lista).toEqual([exp(4)]);
  });
});

describe('#1201 · quién puede y sobre qué campus', () => {
  it('una gestora con diplomas.emit envía los de su campus', async () => {
    const r = await lote([exp(1), exp(2)], GESTORA);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(avisosEnviados()[0].cuerpo).toMatchObject({ nexpedientes: [exp(1), exp(2)], aprobadoPor: 'u61@prueba.test' });
  });

  it('con uno de otro campus en el lote: 404 y no sale ninguno', async () => {
    const r = await lote([exp(1), exp(10, 'ISEIE')], GESTORA);
    expect(r.status).toBe(404);
    expect(avisosEnviados()).toHaveLength(0);
  });

  it('quien solo ve Diplomas (sin diplomas.emit): 403 y nada sale', async () => {
    const r = await lote([exp(1)], SIN_EMITIR);
    expect(r.status).toBe(403);
    expect(avisosEnviados()).toHaveLength(0);
  });
});

describe('#1201 · cambios tras el QA', () => {
  const fila = (nexpedientes, t = SUPER) => request.post('/api/certifex/diplomas/avisos').set('Authorization', `Bearer ${t}`).send({ nexpedientes });
  const vecesQueSale = (n) => avisosEnviados().flatMap((x) => x.cuerpo.nexpedientes).filter((e) => e === n).length;

  it('fila y lote a la vez con el mismo diploma: un solo envío (la fila contesta 409)', async () => {
    let soltar;
    esperaAvisos = new Promise((r) => { soltar = r; });
    const primero = lote([exp(1), exp(2)]).then((x) => x);
    await vi.waitFor(() => expect(avisosEnviados()).toHaveLength(1));
    const r = await fila([exp(2)]);
    soltar();
    expect((await primero).status).toBe(200);
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    expect(r.body.code).toBe('ENVIO_EN_CURSO');
    expect(r.body.error).toMatch(/se está enviando ahora/);
    expect(vecesQueSale(exp(2))).toBe(1);
  });

  it('y al revés: la fila enviando, el lote lo deja fuera («en_curso»)', async () => {
    let soltar;
    esperaAvisos = new Promise((r) => { soltar = r; });
    const primero = fila([exp(3)]).then((x) => x);
    await vi.waitFor(() => expect(avisosEnviados()).toHaveLength(1));
    const r = await lote([exp(3), exp(11)]);
    soltar();
    expect((await primero).status).toBe(200);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.omitidos).toMatchObject([{ nexpediente: exp(3), motivo: 'en_curso' }]);
    expect(vecesQueSale(exp(3))).toBe(1);
  });

  it('acabado el envío de la fila, el candado se suelta', async () => {
    expect((await fila([exp(12)])).status).toBe(200);
    expect((await fila([exp(12)])).status).toBe(200);
  });

  it('entregado por Certifex sin aviso del CRM: no entra en el lote', async () => {
    const r = await lote([exp(1), exp(18)]);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(avisosEnviados()[0].cuerpo.nexpedientes).toEqual([exp(1)]);
    expect(r.body.data.omitidos).toMatchObject([{ nexpediente: exp(18), motivo: 'entregado' }]);
  });

  it('super admin con más de 5: busca cada diploma por su número, sin recorrer todo Certifex', async () => {
    const r = await lote([1, 2, 3, 11, 12, 13, 14, 15].map((n) => exp(n)));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const listados = pedidas.filter((x) => x.ruta === '/diplomas');
    expect(listados).toHaveLength(8);
    for (const x of listados) expect(x.query.q).toBeTruthy();
  });

  it('si Certifex no contesta a tiempo: 504 «puede que algunos se hayan enviado», no «no responde»', async () => {
    certifexSinContestar = true;
    const r = await lote([exp(1), exp(2)]);
    expect(r.status).toBe(504);
    expect(r.body.code).toBe('ENVIO_SIN_CONFIRMAR');
    expect(r.body.error).toMatch(/Puede que algunos se hayan enviado: refresca la lista antes de volver a enviar/);
  });
});
