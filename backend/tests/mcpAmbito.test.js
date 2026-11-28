import { describe, it, expect, vi, beforeEach } from 'vitest';

// Los permisos salen del catálogo (#423): sin base, el resolver de verdad con
// las personas de cada `req` (tests/helpers/permisosSinBase.js).
vi.mock('../src/modules/permissions/permissions.service.js', () => import('./helpers/permisosSinBase.js'));
const { registrar, conPermisos } = await import('./helpers/permisosSinBase.js');

/**
 * MCP de Claude: solo consulta y solo lo de cada uno.
 *
 * Diego, 28/09: «Si yo estoy en X empresa solo ver los datos de ahi. Si solo
 * soy de un campus solo de ese campus. No puedo ver ni consultar datos de
 * otros campus». Y: «Solo hara consulta el MCP».
 *
 * Un fallo aqui NO SE VE: no rompe nada, solo hace que Claude cuente datos de
 * un campus ajeno. Por eso se prueba sin base, grabando CADA consulta que se
 * lanza: todas tienen que ser de lectura y todas tienen que llevar la lista de
 * campus de la persona como primer parametro.
 */

const consultas = [];
vi.mock('../src/shared/config/db.js', () => ({
  query: vi.fn(async (sql, params) => {
    consultas.push({ sql, params });
    return { rows: [{ total: 0, count: 0 }], rowCount: 0 };
  }),
  getClient: vi.fn(),
  default: {},
}));

const {
  acotarProyectos, construirAmbito, puedeUsarMcp, soloLoSuyo, responsableImpuesto,
  generarToken, huella, pareceToken,
} = await import('../src/modules/mcp/mcp.acceso.js');
const { HERRAMIENTAS, INFORMES } = await import('../src/modules/mcp/mcp.tools.js');
const db = await import('../src/shared/config/db.js');

// Dos empresas: CEDIA (1) con los campus 10 y 11, Ictess (2) con el 20.
const PROYECTOS = [
  { id: 10, nombre: 'ISEIH', sociedad_id: 1, sociedad_nombre: 'CEDIA' },
  { id: 11, nombre: 'Psiko', sociedad_id: 1, sociedad_nombre: 'CEDIA' },
  { id: 20, nombre: 'Ictess', sociedad_id: 2, sociedad_nombre: 'Ictess' },
];
const persona = (role, extra = {}) => ({ id: 7, nombre: 'Ana', role, active: true, usa_mcp: false, ...extra });
const ambitoDe = (role, proyectos = PROYECTOS, equipo = []) => construirAmbito(persona(role), proyectos, equipo);

// La persona impuesta: el id suelto o, desde el equipo comercial (09/11/2026),
// la lista de personas. Para una gestora, la lista es SOLO ella: [7].
const llevaSoloA7 = (params) => (params || []).some((p) => p === 7
  || (Array.isArray(p) && p.length === 1 && p[0] === 7));
// Una líder (7) con su equipo (8 y 9): la lista exacta, ni una más.
const llevaAlEquipo = (params) => (params || []).some((p) => Array.isArray(p)
  && [...p].sort().join(',') === '7,8,9');

beforeEach(() => { consultas.length = 0; });

describe('quien entra', () => {
  it('super admin y admin entran por su rol', async () => {
    expect(await puedeUsarMcp(conPermisos(persona('superadmin')))).toBe(true);
    expect(await puedeUsarMcp(conPermisos(persona('admin')))).toBe(true);
  });

  it('el resto solo si se le ha dado «Usar el MCP» (antes, la casilla)', async () => {
    expect(await puedeUsarMcp(conPermisos(persona('gestor')))).toBe(false);
    expect(await puedeUsarMcp(conPermisos(persona('gestor', { usa_mcp: true })))).toBe(true);
    expect(await puedeUsarMcp(conPermisos(persona('soporte')))).toBe(false);
  });

  it('un tutor no entra ni con el permiso dado: su rol no puede tenerlo', async () => {
    expect(await puedeUsarMcp(conPermisos(persona('tutor', { usa_mcp: true })))).toBe(false);
  });

  it('un usuario desactivado no entra, sea quien sea', async () => {
    expect(await puedeUsarMcp(conPermisos(persona('superadmin', { active: false })))).toBe(false);
    expect(await puedeUsarMcp(conPermisos(null))).toBe(false);
  });
});

describe('que campus ve', () => {
  it('sin pedir nada: todos los suyos', () => {
    expect(acotarProyectos(ambitoDe('admin'))).toEqual([10, 11, 20]);
  });

  it('una empresa: solo sus campus', () => {
    expect(acotarProyectos(ambitoDe('admin'), { sociedad_id: 1 })).toEqual([10, 11]);
  });

  it('un campus suyo: ese', () => {
    expect(acotarProyectos(ambitoDe('admin'), { proyecto_id: 11 })).toEqual([11]);
  });

  it('un campus AJENO se rechaza, no se devuelve vacio', () => {
    // Vacio haria que Claude contestara «no hay ventas» cuando lo que pasa es
    // que no puede verlas.
    const soloIseih = ambitoDe('gestor', [PROYECTOS[0]]);
    expect(() => acotarProyectos(soloIseih, { proyecto_id: 11 })).toThrow(/No tienes acceso al campus 11/);
    expect(() => acotarProyectos(soloIseih, { proyecto_id: 11 })).toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  it('una empresa ajena tambien', () => {
    const soloCedia = ambitoDe('admin', PROYECTOS.slice(0, 2));
    expect(() => acotarProyectos(soloCedia, { sociedad_id: 2 })).toThrow(/empresa 2/);
  });

  it('un campus de OTRA empresa no se cuela pidiendo empresa y campus a la vez', () => {
    expect(() => acotarProyectos(ambitoDe('admin'), { sociedad_id: 1, proyecto_id: 20 })).toThrow(/campus 20/);
  });

  it('sin ningun campus asignado no ve nada', () => {
    expect(() => acotarProyectos(ambitoDe('admin', []))).toThrow(/ningun campus/);
  });
});

describe('solo lo suyo', () => {
  it('super admin y admin ven todo su campus; el resto solo lo suyo', () => {
    expect(soloLoSuyo(persona('superadmin'))).toBe(false);
    expect(soloLoSuyo(persona('admin'))).toBe(false);
    expect(soloLoSuyo(persona('gestor'))).toBe(true);
    expect(soloLoSuyo(persona('soporte'))).toBe(true);
  });

  it('a quien ve solo lo suyo se le impone su propio id', () => {
    expect(responsableImpuesto(ambitoDe('gestor'))).toBe(7);
    expect(responsableImpuesto(ambitoDe('admin'))).toBe(null);
  });
});

describe('tokens', () => {
  it('se guarda la huella, no el token', () => {
    const { token, hash, prefijo } = generarToken();
    expect(hash).toBe(huella(token));
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(token.startsWith(prefijo)).toBe(true);
    expect(prefijo.length).toBeLessThan(16);
  });

  it('dos tokens nunca son iguales', () => {
    expect(generarToken().token).not.toBe(generarToken().token);
  });

  it('solo se busca en la base lo que tiene pinta de token nuestro', () => {
    expect(pareceToken(generarToken().token)).toBe(true);
    expect(pareceToken('eyJhbGciOiJIUzI1NiJ9.jwt.del.crm')).toBe(false);
    expect(pareceToken('crm_mcp_corto')).toBe(false);
    expect(pareceToken(undefined)).toBe(false);
  });
});

// ─── Las herramientas contra la base (grabada) ────────────────────────────

/** Argumentos razonables para cada herramienta, con todos los filtros puestos. */
const ARGS = {
  mis_proyectos: {},
  buscar_prospectos: { estado: 'nuevo', canal: 'meta', texto: 'ana', desde: '2026-01-01', hasta: '2026-09-01', pagina: 1, limite: 25 },
  ver_prospecto: { id: 5 },
  resumen_prospectos: { desde: '2026-01-01' },
  listar_ventas: { texto: 'master', pendiente: true, desde: '2026-01-01', pagina: 1, limite: 25 },
  resumen_ventas: { hasta: '2026-09-01' },
  listar_pagos_stripe: { desde: '2026-11-09', hasta: '2026-11-15', estado: 'reembolsado', sin_asociar: false, pagina: 1, limite: 25 },
  listar_facturas: { estado: 'pagada', tipo: 'normal', texto: 'F-1', pagina: 1, limite: 25 },
  resumen_facturas: {},
  cobros_pendientes: { limite: 50 },
  meta_ads: { vista: 'campanas', desde: '2026-01-01', hasta: '2026-09-01', limite: 30 },
  meta_conjuntos: { desde: '2026-09-01', hasta: '2026-09-30', estado: 'todos', cuenta_id: 'act_1', texto: 'máster', creados_desde: '2026-09-01', pagina: 1, limite: 25 },
  meta_anuncios: { desde: '2026-09-01', hasta: '2026-09-30', estado: 'pausados', conjunto_id: '1', pagina: 1, limite: 25 },
  clientes: { texto: 'ana', desde: '2026-01-01', hasta: '2026-09-01', pagina: 1, limite: 25 },
  equipo: { incluir_inactivos: true },
  informe: { tipo: 'resumen_mensual', desde: '2026-01-01', hasta: '2026-09-01' },
  listar_tutores: { texto: 'ana', incluir_retirados: true },
  comisiones_tutores: { desde: '2026-08', hasta: '2026-09', tutor_id: 3 },
  formaciones_sin_tutor: { incluir_anteriores_al_corte: true },
  listar_formaciones: { texto: 'máster', pagina: 1, limite: 25 },
  resumen_catalogo: {},
  ver_formacion: { id: 5 },
  moodle_cursos: { estado: 'todos', texto: 'máster', pagina: 1, limite: 25 },
  moodle_alumnos: { texto: 'máster', estado: 'activos', limite_cursos: 10 },
  moodle_recursos_externos: { texto: 'máster', limite_cursos: 10 },
  moodle_estructura: {},
  cuentas_publicitarias: {},
  resumen_publicidad: { desde: '2026-09-01', hasta: '2026-09-30' },
  campanas_publicitarias: { desde: '2026-09-01', hasta: '2026-09-30', limite: 50 },
  actividad_por_comercial: { desde: '2026-09-30', hasta: '2026-09-30' },
  informe_seo: { desde: '2026-10-01', hasta: '2026-10-28', limite: 10 },
  informe_ga4: { desde: '2026-10-01', hasta: '2026-10-28', limite: 10 },
};

const ejecutarTodas = async (ambito, extra = {}, omitir = []) => {
  for (const h of HERRAMIENTAS.filter((x) => !omitir.includes(x.nombre))) {
    // ver_prospecto devuelve «no existe» con la base vacia; lo que se mira
    // aqui es la consulta que lanzo, no el resultado.
    // Y las de tutores, a una gestora, se niegan: es lo que tienen que hacer.
    await h.ejecutar(ambito, { ...ARGS[h.nombre], ...extra }).catch((e) => {
      // ver_formacion, con la base de mentira, recibe una fila sin campus: la
      // rechaza por ajena, que es justo lo que tiene que hacer.
      // Y las de Moodle, con la base de mentira, no encuentran ninguna
      // credencial: contestan «sin Moodle configurado» (no hay Moodle de
      // verdad; lo suyo se prueba en mcpMoodle.test.js).
      // «informe_seo» pide «Ver Tráfico orgánico» e «informe_ga4», «Ver Google Analytics»: sin él, se niegan (MCP_SIN_PERMISO).
      if (e.code !== 'MCP_NO_ENCONTRADO' && e.code !== 'MCP_SOLO_ADMIN' && e.code !== 'MOODLE_NO_DISPONIBLE' && e.code !== 'MCP_SIN_PERMISO'
        && !(h.nombre === 'ver_formacion' && e.code === 'MCP_FUERA_DE_AMBITO')) throw e;
    });
  }
};

describe('solo consulta', () => {
  it('hay una prueba de argumentos para cada herramienta', () => {
    expect(Object.keys(ARGS).sort()).toEqual(HERRAMIENTAS.map((h) => h.nombre).sort());
  });

  it('ninguna herramienta escribe en la base', async () => {
    await ejecutarTodas(ambitoDe('admin'));
    await ejecutarTodas(ambitoDe('gestor'));
    for (const n of Object.keys(INFORMES)) {
      await HERRAMIENTAS.find((h) => h.nombre === 'informe').ejecutar(ambitoDe('admin'), { tipo: n });
    }
    expect(consultas.length).toBeGreaterThan(20);
    for (const { sql } of consultas) {
      expect(sql.trim()).toMatch(/^(SELECT|WITH)\b/i);
      expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT)\b/i);
    }
  });

  it('ningun nombre de herramienta suena a escribir', () => {
    for (const h of HERRAMIENTAS) {
      expect(h.nombre).not.toMatch(/crear|editar|cambiar|borrar|eliminar|actualizar|enviar|marcar/);
    }
  });
});

describe('cada consulta va acotada a los campus de la persona', () => {
  it('con un campus pedido, TODAS las consultas llevan solo ese', async () => {
    // ver_prospecto no filtra por campus pedido: busca el id en TODOS los suyos
    // (se prueba aparte, abajo).
    await ejecutarTodas(ambitoDe('admin'), { proyecto_id: 11 }, ['ver_prospecto']);
    const deDatos = consultas.filter((c) => /\b(leads|conversions|invoices)\b/.test(c.sql));
    expect(deDatos.length).toBeGreaterThan(10);
    for (const { sql, params } of deDatos) {
      const lista = (params || []).find((p) => Array.isArray(p));
      const unSolo = (params || []).includes(11);
      // O va la lista [11] con `= ANY`, o el id suelto (Cuentas por cobrar va
      // de proyecto en proyecto). Lo que no puede haber es una consulta sin
      // campus, ni con otro.
      expect(lista ? lista : unSolo ? [11] : sql).toEqual([11]);
    }
  });

  it('ver un prospecto se busca dentro de sus campus, no por id a secas', async () => {
    const soloIseih = ambitoDe('admin', [PROYECTOS[0]]);
    await HERRAMIENTAS.find((h) => h.nombre === 'ver_prospecto').ejecutar(soloIseih, { id: 5 })
      .catch(() => {});
    expect(consultas[0].sql).toMatch(/l\.project_id = ANY\(\$1::int\[\]\)/);
    expect(consultas[0].params[0]).toEqual([10]);
  });

  it('a un gestor se le impone su id en todas las consultas de datos', async () => {
    await ejecutarTodas(ambitoDe('gestor'));
    const deDatos = consultas.filter((c) =>
      /\b(leads l|conversions c|invoices i)\b/.test(c.sql) && !/lead_interactions|WHERE c\.lead_id/.test(c.sql));
    expect(deDatos.length).toBeGreaterThan(10);
    for (const { params } of deDatos) {
      expect(llevaSoloA7(params)).toBe(true);
    }
  });

  it('a una líder de equipo comercial se le impone ella y su equipo en todas las consultas de datos (09/11/2026)', async () => {
    const lider = ambitoDe('admin', PROYECTOS, [8, 9]);
    expect(lider.alcance).toEqual([7, 8, 9]);
    expect(responsableImpuesto(lider)).toEqual([7, 8, 9]);
    // La publicidad (cuentas y campañas de Meta) es del campus, no de una
    // gestora: la ve por su permiso, como la pantalla de Meta Ads. No se mira aquí.
    await ejecutarTodas(lider, {}, ['cuentas_publicitarias', 'resumen_publicidad', 'campanas_publicitarias', 'meta_ads', 'meta_conjuntos', 'meta_anuncios', 'informe_seo', 'informe_ga4']);
    const deDatos = consultas.filter((c) =>
      /\b(leads l|conversions c|invoices i)\b/.test(c.sql) && !/lead_interactions|WHERE c\.lead_id/.test(c.sql));
    expect(deDatos.length).toBeGreaterThan(10);
    for (const { params } of deDatos) {
      expect(llevaAlEquipo(params)).toBe(true);
    }
  });

  it('una líder puede pedir a una de su equipo, no a otra gestora', async () => {
    const lider = ambitoDe('admin', PROYECTOS, [8, 9]);
    const buscar = HERRAMIENTAS.find((h) => h.nombre === 'buscar_prospectos');
    await expect(buscar.ejecutar(lider, { gestora_id: 12 })).rejects.toMatchObject({ code: 'MCP_FUERA_DE_AMBITO' });
    await expect(buscar.ejecutar(lider, { gestora_id: 8 })).resolves.toBeDefined();
    const ventas = HERRAMIENTAS.find((h) => h.nombre === 'listar_ventas');
    await expect(ventas.ejecutar(lider, { vendedora_id: 12 })).rejects.toMatchObject({ code: 'MCP_FUERA_DE_AMBITO' });
    // Los informes «de todo el campus» tampoco: solo ve su equipo.
    const informe = HERRAMIENTAS.find((h) => h.nombre === 'informe');
    const soloAdmin = Object.keys(INFORMES).find((k) => INFORMES[k].soloAdmin);
    await expect(informe.ejecutar(lider, { tipo: soloAdmin })).rejects.toMatchObject({ code: 'MCP_INFORME_SOLO_ADMIN' });
  });

  it('un super admin con filas de equipo lo sigue viendo todo', () => {
    const sa = construirAmbito(persona('superadmin'), PROYECTOS, [8, 9]);
    expect(sa.alcance).toBeNull();
    expect(responsableImpuesto(sa)).toBeNull();
  });

  it('cada informe, a un gestor, o le recorta a lo suyo o se le niega', async () => {
    // `overview` (resumen_general) acepto asesoraId sin aplicarlo hasta el
    // 19/10/2026; sigue siendo solo de admin. Si un
    // informe nuevo hace lo mismo, esta prueba lo caza antes de que Claude le
    // cuente a una gestora los totales de todo el campus.
    //
    // La excepción, a propósito: lo que la gestora ya ve ENTERO en su pantalla se le
    // cuenta entero de SUS campus (nunca de otros). Diego, 17/11/2026: Solicitud de
    // admisión (`matriculas`), «que todas las gestoras puedan ver la información».
    const DEL_CAMPUS_PARA_LA_GESTORA = ['matriculas'];
    const informe = HERRAMIENTAS.find((h) => h.nombre === 'informe');
    for (const tipo of Object.keys(INFORMES)) {
      consultas.length = 0;
      const r = await informe.ejecutar(ambitoDe('gestor'), { tipo }).catch((e) => e);
      if (r instanceof Error) {
        expect(r.code).toBe('MCP_INFORME_SOLO_ADMIN');
        expect(consultas).toEqual([]);
      } else if (DEL_CAMPUS_PARA_LA_GESTORA.includes(tipo)) {
        expect(consultas.length).toBeGreaterThan(0);
        for (const { params } of consultas) {
          const lista = (params || []).find((p) => Array.isArray(p));
          expect([...(lista || [])].sort(), `${tipo}: ${JSON.stringify(params)}`).toEqual(PROYECTOS.map((p) => p.id).sort());
        }
      } else {
        expect(consultas.length).toBeGreaterThan(0);
        for (const { params } of consultas) expect(llevaSoloA7(params)).toBe(true);
      }
    }
  });

  it('actividad_por_comercial: a una gestora se le impone su id en los contactos y en los WhatsApp', async () => {
    // La prueba de arriba deja fuera las consultas de `lead_interactions`;
    // esta mira las de la actividad (#203).
    consultas.length = 0;
    await HERRAMIENTAS.find((h) => h.nombre === 'actividad_por_comercial').ejecutar(ambitoDe('gestor'), ARGS.actividad_por_comercial);
    expect(consultas.length).toBe(3);
    for (const { sql, params } of consultas) {
      expect(sql).toMatch(/li\.created_by = ANY\(\$\d|m\.enviado_por = ANY\(\$\d/);
      expect(llevaSoloA7(params)).toBe(true);
    }
  });

  it('a un admin NO se le impone nadie', async () => {
    await ejecutarTodas(ambitoDe('admin'));
    const conSiete = consultas.filter((c) => (c.params || []).includes(7));
    expect(conSiete).toEqual([]);
  });

  it('un campus ajeno no llega a la base', async () => {
    const soloIseih = ambitoDe('gestor', [PROYECTOS[0]]);
    for (const h of HERRAMIENTAS.filter((x) => 'proyecto_id' in x.entrada)) {
      await expect((async () => h.ejecutar(soloIseih, { ...ARGS[h.nombre], proyecto_id: 20 }))())
        .rejects.toThrow(/campus 20/);
    }
    expect(consultas).toEqual([]);
  });
});

describe('lo que nunca sale', () => {
  it('ninguna consulta pide columnas sensibles ni `*`', async () => {
    await ejecutarTodas(ambitoDe('admin'));
    const PROHIBIDO = /password|token|iban|dni|identificacion_fiscal|direccion_fiscal|nif|_key\b|webhook_api_key|encrypted|custom_fields|\b[a-z]+\.\*/i;
    for (const { sql } of consultas) {
      // Los informes de Reportes no son nuestros; se mira lo que escribe el MCP.
      if (/FROM invoices i|FROM leads l|FROM conversions c|lead_interactions/.test(sql)) {
        expect(sql).not.toMatch(PROHIBIDO);
      }
    }
  });
});

describe('tutores (Carlos, 01/10: «la conexión no exporta los datos de tutores»)', () => {
  const TUTORES = ['listar_tutores', 'comisiones_tutores', 'formaciones_sin_tutor'];

  it('existen y van acotadas a los campus pedidos', async () => {
    for (const n of TUTORES) {
      consultas.length = 0;
      await HERRAMIENTAS.find((h) => h.nombre === n).ejecutar(ambitoDe('admin'), { ...ARGS[n], proyecto_id: 11 });
      expect(consultas.length, n).toBeGreaterThan(0);
      for (const { sql, params } of consultas) {
        // «formaciones_sin_tutor» usa la consulta de la pantalla, que lleva la
        // lista en $2; lo que importa es que la lleve y que sea solo [11].
        expect(sql).toMatch(/project_id = ANY\(\$\d::int\[\]\)/);
        expect(params.find((p) => Array.isArray(p))).toEqual([11]);
      }
    }
  });

  it('a una gestora se le niegan sin llegar a la base', async () => {
    for (const n of TUTORES) {
      consultas.length = 0;
      const r = await HERRAMIENTAS.find((h) => h.nombre === n).ejecutar(ambitoDe('gestor'), ARGS[n]).catch((e) => e);
      expect(r?.code, n).toBe('MCP_SOLO_ADMIN');
      expect(consultas).toEqual([]);
    }
  });

  it('no piden DNI, IBAN, banco ni teléfono', async () => {
    consultas.length = 0;
    for (const n of TUTORES) await HERRAMIENTAS.find((h) => h.nombre === n).ejecutar(ambitoDe('admin'), ARGS[n]);
    for (const { sql } of consultas) {
      expect(sql).not.toMatch(/iban|dni|nif|banco|telefono|tutor_profiles|password|\btoken\b/i);
      // El `s.*` de «Cursos sin tutor» lee de su propia subconsulta, que no
      // tiene nada personal; en las demás, ni un `*`.
      if (!/WITH sin_tutor AS/.test(sql)) expect(sql).not.toMatch(/\b[a-z]+\.\*/i);
    }
  });
});

describe('el catálogo (#215: «¿cuánto cuesta el Máster X en Psiko?»)', () => {
  const CATALOGO = ['listar_formaciones', 'resumen_catalogo'];

  it('existe y va acotado a los campus pedidos', async () => {
    for (const n of CATALOGO) {
      consultas.length = 0;
      await HERRAMIENTAS.find((h) => h.nombre === n).ejecutar(ambitoDe('admin'), { ...ARGS[n], proyecto_id: 11 });
      expect(consultas.length, n).toBeGreaterThan(0);
      for (const { params } of consultas) expect(params.find((p) => Array.isArray(p)), n).toEqual([11]);
    }
  });

  it('una gestora también lo usa (lo necesita para vender), solo con sus campus y sin imponerle su id', async () => {
    const soloIseih = ambitoDe('gestor', [PROYECTOS[0]]);
    for (const n of CATALOGO) {
      consultas.length = 0;
      await HERRAMIENTAS.find((h) => h.nombre === n).ejecutar(soloIseih, ARGS[n]);
      for (const { params } of consultas) {
        expect(params.find((p) => Array.isArray(p)), n).toEqual([10]);
        // El catálogo no es de nadie: si se le impusiera su id, no vería ninguna.
        expect(params, n).not.toContain(7);
      }
    }
  });

  it('una formación de otro campus da el mismo 403 que las demás herramientas', async () => {
    const soloIseih = ambitoDe('gestor', [PROYECTOS[0]]);
    db.query.mockResolvedValueOnce({ rows: [{ id: 5, curso: 'Máster de Ictess', campus_id: 20, precio: '1200' }] });
    const r = await HERRAMIENTAS.find((h) => h.nombre === 'ver_formacion').ejecutar(soloIseih, { id: 5 }).catch((e) => e);
    expect(r.code).toBe('MCP_FUERA_DE_AMBITO');
    expect(r.statusCode).toBe(403);
    expect(r.message).toMatch(/campus 20/);
  });

  it('y una de su campus, sí', async () => {
    const soloIseih = ambitoDe('gestor', [PROYECTOS[0]]);
    db.query.mockResolvedValueOnce({ rows: [{ id: 5, curso: 'Máster de ISEIH', campus_id: 10, precio: '1200', dossier_version: null }] });
    const r = await HERRAMIENTAS.find((h) => h.nombre === 'ver_formacion').ejecutar(soloIseih, { id: 5 });
    expect(r).toMatchObject({ curso: 'Máster de ISEIH', precio: 1200, tiene_dossier: false });
  });

  it('no pide el enlace de pago, ni ventas, ni lo que cobra el tutor', async () => {
    consultas.length = 0;
    for (const n of [...CATALOGO, 'ver_formacion']) {
      await HERRAMIENTAS.find((h) => h.nombre === n).ejecutar(ambitoDe('admin'), ARGS[n]).catch(() => {});
    }
    expect(consultas.length).toBeGreaterThan(2);
    for (const { sql } of consultas) {
      expect(sql).not.toMatch(/stripe_link|conversions|invoices|importe|pct|tutor_commission|iban|[a-z]+.*/i);
    }
  });
});

describe('la publicidad (#235: «¿cuánto hemos gastado en Meta y cuánto ha vendido?»)', () => {
  // Y los conjuntos y anuncios de Meta (#362).
  const PUBLICIDAD = ['cuentas_publicitarias', 'resumen_publicidad', 'campanas_publicitarias', 'meta_conjuntos', 'meta_anuncios'];

  it('a una gestora se le niega sin llegar a la base', async () => {
    for (const n of PUBLICIDAD) {
      consultas.length = 0;
      const r = await HERRAMIENTAS.find((h) => h.nombre === n).ejecutar(ambitoDe('gestor'), ARGS[n]).catch((e) => e);
      expect(r?.code, n).toBe('MCP_SOLO_ADMIN');
      expect(r?.statusCode, n).toBe(403);
      expect(consultas, n).toEqual([]);
    }
  });

  it('un admin no ve las cuentas de un campus que no es suyo', async () => {
    const soloIseih = ambitoDe('admin', [PROYECTOS[0]]);
    for (const n of PUBLICIDAD) {
      consultas.length = 0;
      const r = await HERRAMIENTAS.find((h) => h.nombre === n).ejecutar(soloIseih, { ...ARGS[n], proyecto_id: 20 }).catch((e) => e);
      expect(r?.code, n).toBe('MCP_FUERA_DE_AMBITO');
      expect(consultas, n).toEqual([]);
    }
  });

  it('a un admin, cada consulta va solo con los campus pedidos', async () => {
    for (const n of PUBLICIDAD) {
      consultas.length = 0;
      await HERRAMIENTAS.find((h) => h.nombre === n).ejecutar(ambitoDe('admin'), { ...ARGS[n], proyecto_id: 11 });
      expect(consultas.length, n).toBeGreaterThan(0);
      for (const { sql, params } of consultas) {
        expect(sql).toMatch(/project_id = ANY\(\$1::int\[\]\)|pr\.id = ANY\(\$1::int\[\]\)/);
        expect(params[0], n).toEqual([11]);
      }
    }
  });

  it('nunca pide el token de la cuenta ni el error que devolvió Meta', async () => {
    consultas.length = 0;
    for (const n of PUBLICIDAD) await HERRAMIENTAS.find((h) => h.nombre === n).ejecutar(ambitoDe('admin'), ARGS[n]);
    expect(consultas.length).toBeGreaterThan(2);
    for (const { sql } of consultas) {
      expect(sql).not.toMatch(/token|last_sync_error|created_by_user_id|\b[a-z]+\.\*/i);
    }
  });
});

describe('informe_seo (Search Console, #36): por su permiso y solo de sus campus', () => {
  const seo = () => HERRAMIENTAS.find((h) => h.nombre === 'informe_seo');

  it('sin «Ver Tráfico orgánico» se niega sin llegar a la base', async () => {
    conPermisos(persona('gestor', { usa_mcp: true }));
    const r = await seo().ejecutar(ambitoDe('gestor'), ARGS.informe_seo).catch((e) => e);
    expect(r?.code).toBe('MCP_SIN_PERMISO');
    expect(r?.statusCode).toBe(403);
    expect(consultas).toEqual([]);
  });

  it('con el permiso, cada consulta lleva solo el campus pedido y es de lectura', async () => {
    conPermisos(persona('admin'));
    const r = await seo().ejecutar(ambitoDe('admin'), { ...ARGS.informe_seo, proyecto_id: 11 });
    expect(r.campus.map((c) => c.campus_id)).toEqual([11]);
    expect(consultas.length).toBeGreaterThan(0);
    for (const { sql, params } of consultas) {
      expect(sql.trim()).toMatch(/^(SELECT|WITH)\b/i);
      expect(params).toContain(11);
      expect(params).not.toContain(10);
      expect(params).not.toContain(20);
    }
  });

  it('un campus ajeno se rechaza por ajeno, antes que por el permiso', async () => {
    conPermisos(persona('gestor'));
    const r = await seo().ejecutar(ambitoDe('gestor', [PROYECTOS[0]]), { proyecto_id: 20 }).catch((e) => e);
    expect(r?.code).toBe('MCP_FUERA_DE_AMBITO');
  });
});

describe('informe_ga4 (Google Analytics 4, #1247): por su permiso y solo de sus campus', () => {
  const ga4 = () => HERRAMIENTAS.find((h) => h.nombre === 'informe_ga4');

  it('sin «Ver Google Analytics» se niega sin llegar a la base', async () => {
    conPermisos(persona('gestor', { usa_mcp: true }));
    const r = await ga4().ejecutar(ambitoDe('gestor'), ARGS.informe_ga4).catch((e) => e);
    expect(r?.code).toBe('MCP_SIN_PERMISO');
    expect(r?.statusCode).toBe(403);
    expect(consultas).toEqual([]);
  });

  it('con el permiso, cada consulta lleva solo el campus pedido y es de lectura', async () => {
    conPermisos(persona('admin'));
    const r = await ga4().ejecutar(ambitoDe('admin'), { ...ARGS.informe_ga4, proyecto_id: 11 });
    expect(r.campus.map((c) => c.campus_id)).toEqual([11]);
    expect(consultas.length).toBeGreaterThan(0);
    for (const { sql, params } of consultas) {
      expect(sql.trim()).toMatch(/^(SELECT|WITH)\b/i);
      expect(params).toContain(11);
      expect(params).not.toContain(10);
      expect(params).not.toContain(20);
    }
  });

  it('un campus ajeno se rechaza por ajeno, antes que por el permiso', async () => {
    conPermisos(persona('gestor'));
    const r = await ga4().ejecutar(ambitoDe('gestor', [PROYECTOS[0]]), { proyecto_id: 20 }).catch((e) => e);
    expect(r?.code).toBe('MCP_FUERA_DE_AMBITO');
  });
});
