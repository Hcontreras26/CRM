import { describe, it, expect, vi, beforeEach } from 'vitest';

// El DNI es OBLIGATORIO para emitir el diploma (Diego, 20/10/2026: «revisa si los diplomas
// llevan el DNI porque es obligatorio»). El DNI vive en Certifex, en el titular de cada
// solicitud (`GET /candidatos` → `titular.dni`): antes de aprobar o emitir, el CRM se lo
// pregunta. La que no lo tiene no se aprueba ni se emite; si Certifex no contesta, no se
// aprueba ni se emite nada.
//
// Aquí, sin base ni Certifex de verdad: los dos se simulan y se apunta cada llamada.

const llamadas = [];
const estado = { candidatos: [], fallo: null, guardadas: [] };

vi.mock('../src/modules/certifex/certifex.cliente.js', () => ({
  certifex: vi.fn(async (metodo, ruta, cuerpo) => {
    llamadas.push({ metodo, ruta, cuerpo });
    if (ruta === '/decisiones') return { resultados: cuerpo.decisiones.map((d) => ({ matriculaId: d.matriculaId, ok: true })) };
    if (ruta === '/emitir') return { resultados: cuerpo.items.map((it) => ({ matriculaId: it.matriculaId, ok: true, nexpediente: `CEDIA-2026-00000${it.matriculaId}-AAAA` })) };
    return {};
  }),
  recorrer: vi.fn(async (ruta, params, { filtro }) => {
    llamadas.push({ ruta, params });
    if (estado.fallo) throw estado.fallo;
    return { filas: estado.candidatos.filter(filtro), truncado: false };
  }),
}));

// La base: solo contesta lo guardado al recibir cada solicitud (`estado.guardadas`).
const consultas = [];
vi.mock('../src/shared/config/db.js', () => {
  const query = vi.fn(async (sql, params) => {
    consultas.push(String(sql));
    if (/SELECT matricula_id, centro, email, curso_nombre/.test(sql)) {
      return { rows: estado.guardadas.filter((r) => params[0].includes(r.matricula_id)) };
    }
    return { rows: [] };
  });
  return { query, getClient: vi.fn(), default: { query } };
});

const { AppError } = await import('../src/shared/utils/AppError.js');
const emision = await import('../src/modules/certifex/certifex.emision.js');
const diplomas = await import('../src/modules/certifex/certifex.diplomas.js');
const { prepararEmision, datosPara, MOTIVO_FALTA_DNI, FIRMA_EN_DIPLOMA } = emision;

const cand = (matriculaId, dni, extra = {}) => ({
  matriculaId, centro: 'ISEIE', titular: { nombre: `Alumno ${matriculaId}`, email: `alumno${matriculaId}@prueba.test`, dni },
  curso: { ref: 12, nombre: 'Máster en Prueba' }, nexpediente: null, ...extra,
});

beforeEach(() => {
  llamadas.length = 0;
  consultas.length = 0;
  estado.candidatos = [];
  estado.fallo = null;
  estado.guardadas = [];
});

/** Llama a un handler de Express como lo haría la ruta, con el super admin. */
async function llamar(handler, body) {
  const req = { body, user: { userId: 1, email: 'ana@crm.test', role: 'superadmin', roles_extra: [] } };
  let json = null;
  let error = null;
  const res = { json: (d) => { json = d; return res; } };
  await handler(req, res, (e) => { error = e; });
  return { json, error };
}
const rutas = () => llamadas.map((l) => l.ruta);

describe('prepararEmision: el DNI de cada matrícula, de Certifex', () => {
  it('con DNI no se bloquea; sin DNI, vacío o solo espacios, sí (FALTA_DNI, con el motivo)', async () => {
    estado.candidatos = [cand(1, '12345678Z'), cand(2, null), cand(3, ''), cand(4, '   ')];
    const p = await prepararEmision([1, 2, 3, 4]);
    expect(p.bloqueadas.has(1)).toBe(false);
    for (const id of [2, 3, 4]) {
      expect(p.bloqueadas.get(id)).toBe(MOTIVO_FALTA_DNI);
      expect(p.codigos.get(id)).toBe('FALTA_DNI');
    }
    expect(MOTIVO_FALTA_DNI).toMatch(/falta el DNI .* obligatorio en el diploma\. Ponlo con «Sin DNI · Poner» y vuelve a emitir\./);
    expect(p.datos.get(1).dni).toBe('12345678Z');
    // Una sola búsqueda en Certifex, por todas a la vez.
    expect(llamadas).toEqual([{ ruta: '/candidatos', params: { estado: 'todas' } }]);
  });

  it('lo que Certifex no devuelve no se emite: sin poder comprobar el DNI (DNI_SIN_COMPROBAR)', async () => {
    estado.candidatos = [cand(1, '12345678Z')];
    estado.guardadas = [{ matricula_id: 9, centro: 'ISEIE', email: 'x@prueba.test', curso_nombre: 'Curso' }];
    const p = await prepararEmision([1, 9, 10]);
    expect(p.bloqueadas.has(1)).toBe(false);
    for (const id of [9, 10]) {
      expect(p.codigos.get(id)).toBe('DNI_SIN_COMPROBAR');
      expect(p.bloqueadas.get(id)).toMatch(/no se puede comprobar el DNI/);
    }
  });

  it('lo guardado en el CRM sigue mandando; de Certifex solo se toma el DNI', async () => {
    estado.guardadas = [{ matricula_id: 5, centro: 'ISEIE', email: 'el.del.crm@prueba.test', curso_nombre: 'Curso del CRM' }];
    estado.candidatos = [cand(5, ' X1234567L ', { titular: { nombre: 'Otro', email: 'el.de.moodle@prueba.test', dni: ' X1234567L ' } })];
    const d = await datosPara([5], { conDni: true });
    expect(d.get(5)).toMatchObject({ email: 'el.del.crm@prueba.test', curso: 'Curso del CRM', dni: 'X1234567L' });
    // Sin `conDni` (rechazar, decidir), lo guardado basta: ni se pregunta a Certifex.
    llamadas.length = 0;
    const sin = await datosPara([5]);
    expect(llamadas).toEqual([]);
    expect(sin.get(5).dni).toBeUndefined();
  });

  it('si Certifex no contesta: 503 claro y no se sigue', async () => {
    estado.fallo = new AppError('Certifex no responde. Prueba de nuevo en un momento.', 502, 'CERTIFEX_NO_RESPONDE');
    const e = await prepararEmision([1]).catch((x) => x);
    expect(e).toMatchObject({ statusCode: 503, code: 'CERTIFEX_NO_CONTESTA' });
    expect(e.message).toMatch(/No se ha podido comprobar en Certifex el DNI .* no se ha aprobado ni emitido nada\. Certifex no responde/);
    // Sin Certifex configurado, su propio error (también 503), tal cual.
    estado.fallo = new AppError('Certifex no esta conectado: faltan CERTIFEX_API_URL y CERTIFEX_CRM_CLAVE en el servidor.', 503, 'CERTIFEX_SIN_CONFIGURAR');
    await expect(prepararEmision([1])).rejects.toMatchObject({ statusCode: 503, code: 'CERTIFEX_SIN_CONFIGURAR' });
  });

  it('la firma del alumno ya no va en el diploma: ni se busca', async () => {
    expect(FIRMA_EN_DIPLOMA).toBe(false);
    estado.candidatos = [cand(1, '12345678Z')];
    const p = await prepararEmision([1]);
    expect(p.firmas.size).toBe(0);
    expect(consultas.some((sql) => /firma/i.test(sql))).toBe(false);
  });
});

describe('«Aprobar y emitir»: sin DNI ni se aprueba ni se emite', () => {
  it('sin DNI: ni /decisiones ni /emitir, y vuelve con el motivo y FALTA_DNI', async () => {
    estado.candidatos = [cand(2, null)];
    const { json, error } = await llamar(diplomas.aprobarEmitir, { matriculaIds: [2] });
    expect(error).toBeNull();
    expect(rutas()).toEqual(['/candidatos']);
    expect(json.data.resultados).toEqual([{ matriculaId: 2, ok: false, fase: 'emitir_bloqueado', codigo: 'FALTA_DNI', error: MOTIVO_FALTA_DNI }]);
  });

  it('con DNI, sí: se busca, se aprueba y se emite', async () => {
    estado.candidatos = [cand(1, '12345678Z')];
    const { json } = await llamar(diplomas.aprobarEmitir, { matriculaIds: [1] });
    expect(rutas()).toEqual(['/candidatos', '/decisiones', '/emitir']);
    expect(json.data.resultados[0]).toMatchObject({ matriculaId: 1, ok: true, fase: 'emitir', nexpediente: 'CEDIA-2026-000001-AAAA' });
  });

  it('un lote mezclado: solo se aprueba y emite lo que tiene DNI; lo demás vuelve con su motivo', async () => {
    estado.candidatos = [cand(1, '12345678Z'), cand(2, null), cand(3, '  '), cand(4, 'PA1234567')];
    const { json } = await llamar(diplomas.aprobarEmitir, { matriculaIds: [1, 2, 3, 4] });
    expect(rutas()).toEqual(['/candidatos', '/decisiones', '/emitir']);
    expect(llamadas[1].cuerpo.decisiones.map((d) => d.matriculaId)).toEqual([1, 4]);
    // Sin la firma del alumno (FIRMA_EN_DIPLOMA apagado).
    expect(llamadas[2].cuerpo.items).toEqual([{ matriculaId: 1 }, { matriculaId: 4 }]);
    const r = json.data.resultados;
    expect(r.map((x) => [x.matriculaId, x.ok, x.fase, x.codigo ?? null])).toEqual([
      [1, true, 'emitir', null], [2, false, 'emitir_bloqueado', 'FALTA_DNI'], [3, false, 'emitir_bloqueado', 'FALTA_DNI'], [4, true, 'emitir', null],
    ]);
  });

  it('si Certifex no contesta al pedir el DNI: 503 y nada aprobado ni emitido', async () => {
    estado.fallo = new AppError('Certifex respondio 500', 502, 'CERTIFEX_ERROR');
    const { json, error } = await llamar(diplomas.aprobarEmitir, { matriculaIds: [1, 2] });
    expect(json).toBeNull();
    expect(error).toMatchObject({ statusCode: 503, code: 'CERTIFEX_NO_CONTESTA' });
    expect(rutas()).toEqual(['/candidatos']);
  });
});

describe('«Emitir» (reintento de «Aprobados sin diploma» y pestaña de Emisiones): igual', () => {
  it('lo que no tiene DNI no se emite; lo demás, sí', async () => {
    estado.candidatos = [cand(1, '12345678Z', { decision: { decision: 'aprobada' } }), cand(2, null, { decision: { decision: 'aprobada' } })];
    const { json } = await llamar(diplomas.emitir, { matriculaIds: [1, 2] });
    expect(rutas()).toEqual(['/candidatos', '/emitir']);
    expect(llamadas[1].cuerpo.items).toEqual([{ matriculaId: 1 }]);
    expect(json.data.resultados[1]).toEqual({ matriculaId: 2, ok: false, fase: 'emitir_bloqueado', codigo: 'FALTA_DNI', error: MOTIVO_FALTA_DNI });
  });

  it('si ninguna tiene DNI, no llega nada a /emitir', async () => {
    estado.candidatos = [cand(2, null)];
    const { json } = await llamar(diplomas.emitir, { matriculaIds: [2] });
    expect(rutas()).toEqual(['/candidatos']);
    expect(json.data.resultados[0]).toMatchObject({ ok: false, fase: 'emitir_bloqueado', codigo: 'FALTA_DNI' });
  });
});
