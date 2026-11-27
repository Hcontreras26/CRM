import { describe, it, expect, beforeAll, afterAll } from 'vitest';

/**
 * «informe_seo» en el MCP (Search Console, #36): lo que ya guardó la
 * sincronización, por campus y periodo, con lo que más sube y baja. Contra la
 * base de verdad; nada va a Google (aquí no hay ni `fetch`).
 *
 *   npx vitest run tests/mcpInformeSeo.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const { HERRAMIENTAS } = await import('../src/modules/mcp/mcp.tools.js');
const { construirAmbito } = await import('../src/modules/mcp/mcp.acceso.js');
const gsc = await import('../src/modules/search-console/search-console.service.js');

const MARCA = `SEO${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const ids = { users: [], projects: [] };
let P; let SIN_GSC; let SIN_DATOS; let OTRO; let ADMIN; let LAURA;
const seo = HERRAMIENTAS.find((h) => h.nombre === 'informe_seo');
const ambito = (u, campus) => construirAmbito({ id: u.id, nombre: u.nombre, role: u.role, active: true },
  campus.map((c) => ({ id: c, nombre: `Campus ${c}`, sociedad_id: null, sociedad_nombre: null })));
const correr = (u, args = {}, campus = [P]) => seo.ejecutar(ambito(u, campus), { limite: 10, ...args });

// Periodo actual: 15–28/10 (14 días). El anterior: 01–14/10.
const ACTUAL = { desde: '2026-10-15', hasta: '2026-10-28' };

beforeAll(async () => {
  const proy = async (c) => {
    const [p] = await q(`INSERT INTO projects (nombre, slug, webhook_api_key) VALUES ($1, $2, $3) RETURNING id`,
      [`${MARCA} ${c}`, `${MARCA.toLowerCase()}-${c}`, `${MARCA}-key-${c}`]);
    ids.projects.push(p.id);
    return p.id;
  };
  P = await proy('a'); SIN_GSC = await proy('b'); SIN_DATOS = await proy('c'); OTRO = await proy('d');
  const persona = async (n, role) => {
    const [u] = await q(`INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, role, nombre`,
      [`${MARCA} ${n}`, `${n.toLowerCase()}@${MARCA.toLowerCase()}.test`, role]);
    ids.users.push(u.id);
    return u;
  };
  ADMIN = await persona('ADMIN', 'admin'); LAURA = await persona('LAURA', 'gestor');

  // Con credencial y sin nada guardado todavía.
  await q(`INSERT INTO api_credentials (project_id, service, encrypted_value, iv, auth_tag, active)
           VALUES ($1, 'gsc', 'x', 'x', 'x', true)`, [SIN_DATOS]);

  // El sitio: antes 100 clics / 2.000 impresiones (posición 10); ahora 150 / 2.500 (posición 8).
  await q(`INSERT INTO gsc_diario (project_id, fecha, clics, impresiones, posicion_suma) VALUES
           ($1, '2026-10-05', 100, 2000, 20000), ($1, '2026-10-20', 150, 2500, 20000)`, [P]);
  await q(`INSERT INTO gsc_consultas_diarias (project_id, fecha, consulta, clics, impresiones, posicion_suma) VALUES
           ($1, '2026-10-05', 'master duelo', 10, 200, 1000),
           ($1, '2026-10-20', 'master duelo', 40, 400, 1200),
           ($1, '2026-10-05', 'curso apego', 30, 300, 1500),
           ($1, '2026-10-20', 'curso apego', 5, 250, 2500),
           ($1, '2026-10-05', 'se fue', 8, 50, 400),
           ($1, '2026-10-20', 'nueva', 12, 90, 270),
           ($1, '2026-10-20', 'igual', 7, 70, 350),
           ($1, '2026-10-05', 'igual', 7, 60, 300)`, [P]);
  await q(`INSERT INTO gsc_paginas_diarias (project_id, fecha, host, ruta, clics, impresiones, posicion_suma) VALUES
           ($1, '2026-10-05', 'psikoaprende.com', '/curso/duelo', 20, 400, 2800),
           ($1, '2026-10-20', 'psikoaprende.com', '/curso/duelo', 60, 600, 3000),
           ($1, '2026-10-05', 'mx.psikoaprende.com', '/curso/duelo', 25, 300, 1500),
           ($1, '2026-10-20', 'mx.psikoaprende.com', '/curso/duelo', 10, 300, 2400)`, [P]);
  await q(`INSERT INTO gsc_sincronizacion (project_id, site_url, last_synced_at, last_status, backfill_done)
           VALUES ($1, 'sc-domain:psikoaprende.com', '2026-10-29T06:00:00Z', 'ok', true)`, [P]);
  // Lo de otro campus no se cuela.
  await q(`INSERT INTO gsc_diario (project_id, fecha, clics, impresiones, posicion_suma) VALUES ($1, '2026-10-20', 9999, 99999, 1)`, [OTRO]);
}, 60000);

afterAll(async () => {
  await q(`DELETE FROM user_permission_overrides WHERE user_id = ANY($1::int[])`, [ids.users]);
  await q(`DELETE FROM api_credentials WHERE project_id = ANY($1::int[])`, [ids.projects]);
  await q(`DELETE FROM users WHERE id = ANY($1::int[])`, [ids.users]);
  // gsc_* caen con el campus (ON DELETE CASCADE).
  await q(`DELETE FROM projects WHERE id = ANY($1::int[])`, [ids.projects]);
  await pool.end();
}, 60000);

describe('informe_seo', () => {
  it('clics, impresiones, CTR y posición del periodo, frente al anterior', async () => {
    const r = await correr(ADMIN, ACTUAL);
    const c = r.campus[0];
    expect(c).toMatchObject({ campus_id: P, ultimo_dia: '2026-10-20' });
    expect(c.periodo).toEqual({ ...ACTUAL, dias_con_datos: 1 });
    expect(c.total).toEqual({ clics: 150, impresiones: 2500, ctr: 6, posicion: 8 });
    expect(c.anterior).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-14', clics: 100, impresiones: 2000, ctr: 5, posicion: 10 });
    expect(c.cambio).toEqual({ clics: 50, clics_pct: 50, impresiones: 500, impresiones_pct: 25, ctr_puntos: 1, posicion: -2 });
  });

  it('las búsquedas que más suben y bajan, también las que aparecen y desaparecen', async () => {
    const { consultas } = (await correr(ADMIN, ACTUAL)).campus[0];
    expect(consultas.suben.map((x) => x.consulta)).toEqual(['master duelo', 'nueva']);
    expect(consultas.bajan.map((x) => x.consulta)).toEqual(['curso apego', 'se fue']);
    expect(consultas.suben[0]).toMatchObject({ clics: 40, clics_antes: 10, diferencia_clics: 30, impresiones: 400, ctr: 10, posicion: 3, posicion_antes: 5 });
    expect(consultas.suben[1]).toMatchObject({ clics: 12, clics_antes: 0, posicion_antes: null });
    expect(consultas.bajan[1]).toMatchObject({ clics: 0, clics_antes: 8, diferencia_clics: -8, posicion: null });
    // La que no se mueve no está en ninguna lista.
    expect([...consultas.suben, ...consultas.bajan].map((x) => x.consulta)).not.toContain('igual');
  });

  it('las páginas, con su host: los subdominios de país no se mezclan', async () => {
    const { paginas } = (await correr(ADMIN, ACTUAL)).campus[0];
    expect(paginas.suben).toEqual([expect.objectContaining({ pagina: 'psikoaprende.com/curso/duelo', diferencia_clics: 40 })]);
    expect(paginas.bajan).toEqual([expect.objectContaining({ pagina: 'mx.psikoaprende.com/curso/duelo', diferencia_clics: -15 })]);
  });

  it('«limite» recorta cada lista', async () => {
    const { consultas } = (await correr(ADMIN, { ...ACTUAL, limite: 1 })).campus[0];
    expect(consultas.suben).toHaveLength(1);
    expect(consultas.bajan).toHaveLength(1);
  });

  it('sin fechas: cuatro semanas hasta el último día guardado, no hasta hoy', async () => {
    const c = (await correr(ADMIN)).campus[0];
    expect(c.periodo).toMatchObject({ desde: '2026-09-23', hasta: '2026-10-20' });
    expect(c.anterior).toMatchObject({ desde: '2026-08-26', hasta: '2026-09-22' });
  });

  it('un campus sin Search Console, o aún sin datos, lo dice; no sale como cero clics', async () => {
    const r = await correr(ADMIN, ACTUAL, [SIN_GSC, SIN_DATOS]);
    expect(r.campus[0]).toEqual({ campus_id: SIN_GSC, campus: `Campus ${SIN_GSC}`, aviso: 'sin Search Console conectado' });
    expect(r.campus[1]).toMatchObject({ campus_id: SIN_DATOS, aviso: expect.stringContaining('aún sin datos') });
    expect(r.campus[1].total).toBeUndefined();
  });

  it('una sincronización fallida se avisa', async () => {
    await q(`UPDATE gsc_sincronizacion SET last_status = 'error' WHERE project_id = $1`, [P]);
    try {
      expect((await correr(ADMIN, ACTUAL)).campus[0].aviso).toMatch(/falló/);
    } finally {
      await q(`UPDATE gsc_sincronizacion SET last_status = 'ok' WHERE project_id = $1`, [P]);
    }
  });

  it('cada campus con lo suyo: lo de otro no se cuela', async () => {
    const r = await correr(ADMIN, ACTUAL, [P, SIN_GSC]);
    expect(r.campus.map((c) => c.campus_id)).toEqual([P, SIN_GSC]);
    expect(r.campus[0].total.clics).toBe(150);
  });

  it('un campus que no es suyo, 403', async () => {
    await expect(correr(ADMIN, { proyecto_id: OTRO })).rejects.toMatchObject({ code: 'MCP_FUERA_DE_AMBITO' });
  });

  it('sin «Ver Tráfico orgánico» (una gestora, de serie), 403', async () => {
    await expect(correr(LAURA, ACTUAL)).rejects.toMatchObject({ code: 'MCP_SIN_PERMISO', statusCode: 403 });
  });

  it('con el permiso dado a la gestora, sí; y quitárselo cierra la puerta en la siguiente', async () => {
    const quitar = () => q(`DELETE FROM user_permission_overrides WHERE user_id = $1`, [LAURA.id]);
    try {
      await q(`INSERT INTO user_permission_overrides (user_id, resource, action, allowed) VALUES ($1, 'search_console', 'view', true)`, [LAURA.id]);
      expect((await correr(LAURA, ACTUAL)).campus[0].total.clics).toBe(150);
      await quitar();
      await expect(correr(LAURA, ACTUAL)).rejects.toMatchObject({ code: 'MCP_SIN_PERMISO' });
    } finally {
      await quitar();
    }
  });

  it('un periodo al revés no da «0 de todo»', async () => {
    await expect(correr(ADMIN, { desde: '2026-10-28', hasta: '2026-10-01' })).rejects.toMatchObject({ code: 'MCP_PERIODO_AL_REVES' });
  });

  it('periodoDelInforme y cambioEntre, sueltos', () => {
    expect(gsc.periodoDelInforme({ ultimoDia: '2026-11-23' })).toEqual({ desde: '2026-10-27', hasta: '2026-11-23' });
    expect(gsc.periodoDelInforme({ desde: '2026-11-01', ultimoDia: '2026-11-23' })).toEqual({ desde: '2026-11-01', hasta: '2026-11-23' });
    expect(gsc.periodoDelInforme({ ahora: new Date('2026-11-26T10:00:00Z') })).toEqual({ desde: '2026-10-29', hasta: '2026-11-25' });
    expect(gsc.cambioEntre({ clics: 5, impresiones: 0, ctr: null, posicion: null }, { clics: 0, impresiones: 0, ctr: null, posicion: null }))
      .toEqual({ clics: 5, clics_pct: null, impresiones: 0, impresiones_pct: null, ctr_puntos: null, posicion: null });
  });
});
