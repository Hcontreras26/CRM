import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * «informe_ga4» en el MCP (Google Analytics 4, #1247): lo que ya guardó la
 * sincronización de GA4 (#55), por campus y periodo, con las mismas funciones
 * que la pantalla «Google Analytics». Contra la base de verdad; nada va a Google.
 *
 *   npx vitest run tests/mcpInformeGa4.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const { HERRAMIENTAS } = await import('../src/modules/mcp/mcp.tools.js');
const { construirAmbito } = await import('../src/modules/mcp/mcp.acceso.js');
const ga = await import('../src/modules/google-analytics/google-analytics.service.js');

const MARCA = `GA4M${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const ids = { users: [], projects: [], leads: [], conversions: [] };
let P; let SIN_GA4; let SIN_DATOS; let OTRO; let ADMIN; let LAURA;
const herramienta = HERRAMIENTAS.find((h) => h.nombre === 'informe_ga4');
const ambito = (u, campus) => construirAmbito({ id: u.id, nombre: u.nombre, role: u.role, active: true },
  campus.map((c) => ({ id: c, nombre: `Campus ${c}`, sociedad_id: null, sociedad_nombre: null })));
const correr = (u, args = {}, campus = [P]) => herramienta.ejecutar(ambito(u, campus), { limite: 10, ...args });

// Periodo actual: 15–28/10 (14 días). El anterior: 01–14/10.
const ACTUAL = { desde: '2026-10-15', hasta: '2026-10-28' };

async function lead(nombre, cuando, landing) {
  const [l] = await q(
    `INSERT INTO leads (project_id, nombre, created_at, fecha_solicitud, landing_url)
     VALUES ($1, $2, $3, $3, $4) RETURNING id`,
    [P, `${MARCA} ${nombre}`, cuando, landing]);
  ids.leads.push(l.id);
  return l.id;
}

beforeAll(async () => {
  const proy = async (c) => {
    const [p] = await q(`INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
      [`${MARCA} ${c}`, `${MARCA.toLowerCase()}-${c}`, `${MARCA}-key-${c}`]);
    ids.projects.push(p.id);
    return p.id;
  };
  P = await proy('a'); SIN_GA4 = await proy('b'); SIN_DATOS = await proy('c'); OTRO = await proy('d');
  const persona = async (n, role) => {
    const [u] = await q(`INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, role, nombre`,
      [`${MARCA} ${n}`, `${n.toLowerCase()}@${MARCA.toLowerCase()}.test`, role]);
    ids.users.push(u.id);
    return u;
  };
  ADMIN = await persona('ADMIN', 'admin'); LAURA = await persona('LAURA', 'gestor');

  // Con credencial y sin nada guardado todavía.
  await q(`INSERT INTO api_credentials (project_id, service, encrypted_value, iv, auth_tag, active)
           VALUES ($1, 'google_analytics', 'x', 'x', 'x', true)`, [SIN_DATOS]);

  // Antes: 40 sesiones / 30 usuarios / 2 conversiones. Ahora: 100 / 85 / 4,5.
  await q(`INSERT INTO ga4_canales_diarios (project_id, fecha, canal, sesiones, usuarios, eventos_clave) VALUES
           ($1, '2026-10-05', 'Organic Search', 40, 30, 2),
           ($1, '2026-10-20', 'Organic Search', 60, 50, 3),
           ($1, '2026-10-20', 'Paid Social', 40, 35, 1.5)`, [P]);
  await q(`INSERT INTO ga4_paginas_diarias (project_id, fecha, pagina, sesiones, usuarios, eventos_clave) VALUES
           ($1, '2026-10-05', '/curso/duelo', 30, 25, 1),
           ($1, '2026-10-20', '/curso/duelo', 70, 60, 3),
           ($1, '2026-10-20', '/curso/apego', 20, 18, 1),
           ($1, '2026-10-20', '/', 10, 9, 0)`, [P]);
  await q(`INSERT INTO ga4_sincronizacion (project_id, property_id, last_synced_at, last_status, backfill_done)
           VALUES ($1, '123', '2026-10-21T06:00:00Z', 'ok', true)`, [P]);

  // Dos prospectos ahora (uno compra, con cobro) y uno antes, todos por /curso/duelo.
  const vende = await lead('vende', '2026-10-20 12:00+02', 'https://web.test/curso/duelo?utm_source=fb');
  await lead('no vende', '2026-10-20 18:00+02', 'https://web.test/curso/duelo/');
  await lead('antes', '2026-10-05 10:00+02', 'https://web.test/curso/duelo');
  const [c] = await q(
    `INSERT INTO conversions (lead_id, project_id, producto_contratado, importe_total, importe_pagado, fecha_conversion)
     VALUES ($1, $2, 'curso', 300, 300, '2026-10-21') RETURNING id`, [vende, P]);
  ids.conversions.push(c.id);
  await q(`INSERT INTO conversion_payments (conversion_id, importe, fecha) VALUES ($1, 300, '2026-10-21')`, [c.id]);

  // Lo de otro campus no se cuela.
  await q(`INSERT INTO ga4_canales_diarios (project_id, fecha, canal, sesiones, usuarios, eventos_clave)
           VALUES ($1, '2026-10-20', 'Organic Search', 9999, 9999, 99)`, [OTRO]);
}, 60000);

afterAll(async () => {
  await q(`DELETE FROM conversion_payments WHERE conversion_id = ANY($1::int[])`, [ids.conversions]);
  await q(`DELETE FROM conversions WHERE id = ANY($1::int[])`, [ids.conversions]);
  await q(`DELETE FROM leads WHERE id = ANY($1::int[])`, [ids.leads]);
  await q(`DELETE FROM user_permission_overrides WHERE user_id = ANY($1::int[])`, [ids.users]);
  await q(`DELETE FROM api_credentials WHERE project_id = ANY($1::int[])`, [ids.projects]);
  await q(`DELETE FROM users WHERE id = ANY($1::int[])`, [ids.users]);
  // ga4_* caen con el campus (ON DELETE CASCADE).
  await q(`DELETE FROM projects WHERE id = ANY($1::int[])`, [ids.projects]);
  await pool.end();
}, 60000);

describe('informe_ga4', () => {
  it('sesiones, usuarios, conversiones, prospectos y ventas del periodo, frente al anterior', async () => {
    const c = (await correr(ADMIN, ACTUAL)).campus[0];
    expect(c).toMatchObject({ campus_id: P, ultimo_dia: '2026-10-20', ultima_sincronizacion: '2026-10-21T06:00:00.000Z' });
    expect(c.aviso).toBeUndefined();
    expect(c.periodo).toEqual({ ...ACTUAL, dias_con_datos: 1 });
    expect(c.total).toEqual({ sesiones: 100, usuarios: 85, conversiones: 4.5, leads: 2, ventas: 1, lead_por_sesion: 2, venta_por_lead: 50 });
    expect(c.anterior).toEqual({
      desde: '2026-10-01', hasta: '2026-10-14', dias_con_datos: 1,
      sesiones: 40, usuarios: 30, conversiones: 2, leads: 1, ventas: 0, lead_por_sesion: 2.5, venta_por_lead: 0,
    });
    expect(c.cambio).toEqual({
      sesiones: 60, sesiones_pct: 150, usuarios: 55, usuarios_pct: 183.3, conversiones: 2.5, conversiones_pct: 125,
      leads: 1, leads_pct: 100, ventas: 1, ventas_pct: null,
    });
    expect(c.canales).toEqual([
      { canal: 'Organic Search', sesiones: 60, usuarios: 50, conversiones: 3 },
      { canal: 'Paid Social', sesiones: 40, usuarios: 35, conversiones: 1.5 },
    ]);
  });

  it('las cifras cuadran con la pantalla «Google Analytics» (embudo y páginas)', async () => {
    const c = (await correr(ADMIN, ACTUAL)).campus[0];
    const embudo = await ga.embudo(P, ACTUAL.desde, ACTUAL.hasta);
    expect({ sesiones: c.total.sesiones, leads: c.total.leads, ventas: c.total.ventas, lead_por_sesion: c.total.lead_por_sesion, venta_por_lead: c.total.venta_por_lead })
      .toEqual({ sesiones: embudo.total.sesiones, leads: embudo.total.leads, ventas: embudo.total.ventas, lead_por_sesion: embudo.total.lead_por_sesion, venta_por_lead: embudo.total.venta_por_lead });
    const dias = embudo.dias.filter((d) => d.sesiones != null);
    expect(c.total.usuarios).toBe(dias.reduce((t, d) => t + d.usuarios, 0));
    expect(c.total.conversiones).toBe(dias.reduce((t, d) => t + d.eventos_clave, 0));
    const pantalla = await ga.paginas(P, ACTUAL.desde, ACTUAL.hasta);
    expect(c.paginas.top.map(({ pagina, sesiones, usuarios, conversiones, leads, ventas }) => ({ pagina, sesiones, usuarios, conversiones, leads, ventas })))
      .toEqual(pantalla.map(({ pagina, sesiones, usuarios, eventos_clave, leads, ventas }) => ({ pagina, sesiones, usuarios, conversiones: eventos_clave, leads, ventas })));
  });

  it('las páginas con más sesiones, con sus prospectos y lo que tenían antes; «limite» recorta', async () => {
    const { paginas } = (await correr(ADMIN, ACTUAL)).campus[0];
    expect(paginas.top.map((p) => p.pagina)).toEqual(['/curso/duelo', '/curso/apego', '/']);
    expect(paginas.top[0]).toEqual({
      pagina: '/curso/duelo', sesiones: 70, usuarios: 60, conversiones: 3, leads: 2, ventas: 1, lead_por_sesion: 2.86,
      sesiones_antes: 30, leads_antes: 1,
    });
    expect(paginas.top[1]).toMatchObject({ pagina: '/curso/apego', sesiones_antes: 0, leads_antes: 0 });
    expect((await correr(ADMIN, { ...ACTUAL, limite: 1 })).campus[0].paginas.top).toHaveLength(1);
  });

  it('sin fechas: cuatro semanas hasta el último día guardado, no hasta hoy', async () => {
    const c = (await correr(ADMIN)).campus[0];
    expect(c.periodo).toMatchObject({ desde: '2026-09-23', hasta: '2026-10-20' });
    expect(c.anterior).toMatchObject({ desde: '2026-08-26', hasta: '2026-09-22' });
  });

  it('con comparar_con_periodo_anterior: false no hay «anterior» ni «cambio»', async () => {
    const c = (await correr(ADMIN, { ...ACTUAL, comparar_con_periodo_anterior: false })).campus[0];
    expect(c.anterior).toBeUndefined();
    expect(c.cambio).toBeUndefined();
    expect(c.total.sesiones).toBe(100);
    expect(c.paginas.top[0]).not.toHaveProperty('sesiones_antes');
    // Sin el parámetro, compara.
    expect((await correr(ADMIN, ACTUAL)).campus[0].cambio).toBeDefined();
  });

  it('con comparar_con_periodo_anterior: false ni siquiera consulta el periodo anterior', async () => {
    const original = pool.query.bind(pool);
    const params = [];
    pool.query = (sql, p) => { params.push(...(p || [])); return original(sql, p); };
    try {
      await correr(ADMIN, { ...ACTUAL, comparar_con_periodo_anterior: false });
    } finally {
      pool.query = original;
    }
    expect(params).not.toContain('2026-10-01');
    expect(params).not.toContain('2026-10-14');
  });

  it('un campus sin GA4, o aún sin datos, lo dice; no sale como cero sesiones', async () => {
    const r = await correr(ADMIN, ACTUAL, [SIN_GA4, SIN_DATOS]);
    expect(r.campus[0]).toEqual({ campus_id: SIN_GA4, campus: `Campus ${SIN_GA4}`, aviso: 'sin Google Analytics 4 conectado' });
    expect(r.campus[1]).toMatchObject({ campus_id: SIN_DATOS, aviso: expect.stringContaining('aún sin datos') });
    expect(r.campus[1].total).toBeUndefined();
  });

  it('un «desde» posterior al último día guardado se avisa', async () => {
    const c = (await correr(ADMIN, { desde: '2026-10-25' })).campus[0];
    expect(c).toMatchObject({ aviso: expect.stringContaining('2026-10-20'), ultimo_dia: '2026-10-20' });
    expect(c.total).toBeUndefined();
  });

  it('una sincronización fallida se avisa', async () => {
    await q(`UPDATE ga4_sincronizacion SET last_status = 'error' WHERE project_id = $1`, [P]);
    try {
      expect((await correr(ADMIN, ACTUAL)).campus[0].aviso).toMatch(/falló/);
    } finally {
      await q(`UPDATE ga4_sincronizacion SET last_status = 'ok' WHERE project_id = $1`, [P]);
    }
  });

  it('cada campus con lo suyo: lo de otro no se cuela', async () => {
    const r = await correr(ADMIN, ACTUAL, [P, SIN_GA4]);
    expect(r.campus.map((c) => c.campus_id)).toEqual([P, SIN_GA4]);
    expect(r.campus[0].total.sesiones).toBe(100);
  });

  it('un campus que no es suyo, 403', async () => {
    await expect(correr(ADMIN, { proyecto_id: OTRO })).rejects.toMatchObject({ code: 'MCP_FUERA_DE_AMBITO' });
  });

  it('sin «Ver Google Analytics» (una gestora, de serie), 403', async () => {
    await expect(correr(LAURA, ACTUAL)).rejects.toMatchObject({ code: 'MCP_SIN_PERMISO', statusCode: 403 });
  });

  it('con el permiso dado a la gestora, sí; y quitárselo cierra la puerta en la siguiente', async () => {
    const quitar = () => q(`DELETE FROM user_permission_overrides WHERE user_id = $1`, [LAURA.id]);
    try {
      await q(`INSERT INTO user_permission_overrides (user_id, resource, action, allowed) VALUES ($1, 'google_analytics', 'view', true)`, [LAURA.id]);
      expect((await correr(LAURA, ACTUAL)).campus[0].total.sesiones).toBe(100);
      await quitar();
      await expect(correr(LAURA, ACTUAL)).rejects.toMatchObject({ code: 'MCP_SIN_PERMISO' });
    } finally {
      await quitar();
    }
  });

  it('un periodo al revés no da «0 de todo»', async () => {
    await expect(correr(ADMIN, { desde: '2026-10-28', hasta: '2026-10-01' })).rejects.toMatchObject({ code: 'MCP_PERIODO_AL_REVES' });
  });

  it('periodoAnterior y cambioEntre, sueltos', () => {
    expect(ga.periodoAnterior('2026-10-15', '2026-10-28')).toEqual({ desde: '2026-10-01', hasta: '2026-10-14' });
    const cero = { sesiones: 0, usuarios: 0, conversiones: 0, leads: 0, ventas: 0 };
    expect(ga.cambioEntre({ ...cero, sesiones: 5 }, cero)).toMatchObject({ sesiones: 5, sesiones_pct: null });
  });
});
