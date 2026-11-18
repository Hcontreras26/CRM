import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * El equipo comercial de una administradora (Carlos, 09/11/2026).
 *
 * «Raquel pasa a ser administradora como Daniela: no recibe leads y puede ver
 * los leads y la gestión en el CRM de las diferentes compañeras. Daniela puede
 * ver todas. Raquel podrá ver sus comerciales asignadas (pueden variar).»
 *
 * Contra la base LOCAL (tests/setup.js): personas, campus, prospectos y ventas
 * de verdad, y las rutas de verdad con sus permisos.
 *
 *   npx vitest run tests/equipoComercial.test.js
 */

const { default: pool } = await import('../src/shared/config/db.js');
const { errorHandler } = await import('../src/shared/middleware/errorHandler.js');
const { gestorasACargo, alcanceComercial } = await import('../src/shared/utils/roles.js');
const { construirAmbito } = await import('../src/modules/mcp/mcp.acceso.js');
const { esFacturaQueGestiona } = await import('../src/modules/invoices/invoices.model.js');
const { HERRAMIENTAS } = await import('../src/modules/mcp/mcp.tools.js');
const modulos = await Promise.all(['users', 'leads', 'conversions', 'sales', 'invoices']
  .map((m) => import(`../src/modules/${m}/index.js`).then((x) => x.default)));

const app = express();
app.use(express.json());
for (const m of modulos) app.use(m.prefix, m.router);
app.use(errorHandler);
const request = supertest(app);

const MARCA = `EQC${Date.now().toString(36)}`;
const q = (sql, p) => pool.query(sql, p).then((r) => r.rows);
const one = async (sql, p) => (await q(sql, p))[0];
const ids = { users: [], projects: [], issuers: [], leads: [], ventas: [] };

let EMPRESA; let OTRA_EMPRESA; let A; let B; let C;
let SUPER; let LIDER; let ADMIN; let G1; let G2; let G3; let G_OTRA;
let L1; let L2; let L3; let L_SIN; let V1; let V2; let F1;

const como = (u) => ({ Authorization: `Bearer ${jwt.sign({ userId: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '10m' })}` });
const pedir = (u, ruta) => request.get(ruta).set(como(u));
const poner = (u, lider, gestoraIds) => request.put(`/api/users/${lider.id}/equipo-comercial`).set(como(u)).send({ gestoraIds });
const idsDe = (res) => (res.body.data || []).map((x) => x.id);

beforeAll(async () => {
  const empresa = async (n) => {
    const e = await one('INSERT INTO invoice_issuers (razon_social, nif) VALUES ($1, $2) RETURNING id',
      [`${MARCA} ${n}`, `B${n.length}${Date.now().toString().slice(-7)}`]);
    ids.issuers.push(e.id); return e.id;
  };
  const campus = async (n, issuer) => {
    const p = await one(`INSERT INTO projects (nombre, slug, webhook_api_key, sociedad_emisora_id)
                         VALUES ($1, $2, $3, $4) RETURNING id`,
      [`${MARCA} ${n}`, `${MARCA.toLowerCase()}-${n}`, `${MARCA}-k-${n}`, issuer]);
    ids.projects.push(p.id); return p.id;
  };
  EMPRESA = await empresa('cedia'); OTRA_EMPRESA = await empresa('otra');
  A = await campus('a', EMPRESA); B = await campus('b', EMPRESA); C = await campus('c', OTRA_EMPRESA);

  const persona = async (n, role, suyos) => {
    const u = await one(`INSERT INTO users (nombre, email, password_hash, role) VALUES ($1, $2, 'x', $3) RETURNING id, role`,
      [`${MARCA} ${n}`, `${n}@${MARCA.toLowerCase()}.test`, role]);
    ids.users.push(u.id);
    for (const c of suyos) await q('INSERT INTO user_projects (user_id, project_id) VALUES ($1, $2)', [u.id, c]);
    return u;
  };
  SUPER = await persona('super', 'superadmin', []);
  LIDER = await persona('raquel', 'admin', [A, B]);       // la que lleva un equipo
  ADMIN = await persona('daniela', 'admin', [A, B]);      // admin sin equipo: lo ve todo
  G1 = await persona('g1', 'gestor', [A]);
  G2 = await persona('g2', 'gestor', [A]);
  G3 = await persona('g3', 'gestor', [B]);
  G_OTRA = await persona('gotra', 'gestor', [C]);         // de otra empresa

  const lead = async (n, campusId, responsable) => {
    const l = await one(`INSERT INTO leads (project_id, nombre, email, responsable_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [campusId, `${MARCA} ${n}`, `${n}@${MARCA.toLowerCase()}.test`, responsable]);
    ids.leads.push(l.id); return l.id;
  };
  L1 = await lead('l1', A, G1.id);
  L2 = await lead('l2', A, G2.id);
  L3 = await lead('l3', B, G3.id);
  L_SIN = await lead('lsin', A, null);

  const venta = async (leadId, campusId, vendedora) => {
    const v = await one(`INSERT INTO conversions (lead_id, project_id, producto_contratado, importe_total, vendedora_id)
                         VALUES ($1, $2, 'Curso', 100, $3) RETURNING id`, [leadId, campusId, vendedora]);
    ids.ventas.push(v.id);
    await q(`INSERT INTO conversion_payments (conversion_id, importe, fecha) VALUES ($1, 100, CURRENT_DATE)`, [v.id]);
    return v.id;
  };
  V1 = await venta(L1, A, G1.id);
  V2 = await venta(L2, A, G2.id);
  // Una factura de la venta de G1 (de su equipo), para corregir y abonar.
  F1 = (await one(`INSERT INTO invoices (project_id, ano, cliente_nombre, cliente_nif, cliente_direccion,
                      cliente_ciudad, cliente_cp, cliente_pais, items, base_imponible, total, conversion_id, lead_id,
                      serie, numero, codigo)
                    VALUES ($1, 2026, 'Cliente', 'X', 'Calle', 'Ciudad', '00000', 'ES', '[]'::jsonb, 100, 121, $2, $3,
                      $4, 1, $5)
                    RETURNING id`, [A, V1, L1, MARCA.slice(0, 10), `${MARCA}-1`])).id;
}, 60000);

afterAll(async () => {
  await q('DELETE FROM equipo_comercial WHERE lider_id = ANY($1::int[]) OR gestora_id = ANY($1::int[])', [ids.users]);
  await q('DELETE FROM permisos_registro WHERE usuario_id = ANY($1::int[]) OR quien_id = ANY($1::int[])', [ids.users]).catch(() => {});
  await q('DELETE FROM invoices WHERE id = $1 OR rectifica_id = $1', [F1]).catch(() => q('DELETE FROM invoices WHERE id = $1', [F1]));
  await q('DELETE FROM conversion_payments WHERE conversion_id = ANY($1::int[])', [ids.ventas]);
  await q('DELETE FROM conversions WHERE id = ANY($1::int[])', [ids.ventas]);
  await q('DELETE FROM lead_interactions WHERE lead_id = ANY($1::int[])', [ids.leads]).catch(() => {});
  await q('DELETE FROM lead_status_history WHERE lead_id = ANY($1::int[])', [ids.leads]).catch(() => {});
  await q('DELETE FROM notifications WHERE target_user_ids && $1::int[]', [ids.users]).catch(() => {});
  await q('DELETE FROM leads WHERE id = ANY($1::int[])', [ids.leads]);
  await q('DELETE FROM user_projects WHERE user_id = ANY($1::int[])', [ids.users]);
  await q('DELETE FROM users WHERE id = ANY($1::int[])', [ids.users]);
  await q('DELETE FROM projects WHERE id = ANY($1::int[])', [ids.projects]);
  await q('DELETE FROM invoice_issuers WHERE id = ANY($1::int[])', [ids.issuers]);
  await pool.end();
}, 60000);

describe('decidir el equipo (PUT /api/users/:id/equipo-comercial)', () => {
  it('sin «equipos.gestionar», 403 (un admin no se lo da a sí mismo)', async () => {
    const r = await poner(ADMIN, LIDER, [G1.id]);
    expect(r.status).toBe(403);
    const r2 = await poner(LIDER, LIDER, [G1.id, G2.id]);
    expect(r2.status).toBe(403);
    expect(await gestorasACargo(LIDER.id)).toEqual([]);
  });

  it('una gestora de otra empresa (sin campus en común), 400', async () => {
    const r = await poner(SUPER, LIDER, [G1.id, G_OTRA.id]);
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ success: false, code: 'GESTORA_NO_VALIDA' });
    expect(await gestorasACargo(LIDER.id)).toEqual([]);
  });

  it('ella misma no; ni alguien que no es gestora; ni algo que no son números', async () => {
    expect((await poner(SUPER, LIDER, [LIDER.id])).body.code).toBe('EQUIPO_A_SI_MISMA');
    expect((await poner(SUPER, LIDER, [ADMIN.id])).body.code).toBe('GESTORA_NO_VALIDA');
    expect((await poner(SUPER, LIDER, ['x'])).status).toBe(400);
  });

  it('el super admin lo pone, y queda apuntado en el registro', async () => {
    const r = await poner(SUPER, LIDER, [G1.id, G3.id]);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.data.gestora_ids.sort()).toEqual([G1.id, G3.id].sort());
    expect((await gestorasACargo(LIDER.id)).sort()).toEqual([G1.id, G3.id].sort());
    const [apunte] = await q(`SELECT * FROM permisos_registro WHERE usuario_id = $1 AND clave = 'equipo_comercial'
                               ORDER BY id DESC LIMIT 1`, [LIDER.id]);
    expect(apunte).toMatchObject({ quien_id: SUPER.id, destino_tipo: 'usuario', antes: '(sin equipo)' });
    expect(apunte.despues).toBe([G1.id, G3.id].sort((a, b) => a - b).join(', '));
  });

  it('GET: quien ve usuarios ve el equipo y las gestoras que se le pueden poner', async () => {
    const r = await pedir(ADMIN, `/api/users/${LIDER.id}/equipo-comercial`);
    expect(r.status).toBe(200);
    expect(r.body.data.gestora_ids.sort()).toEqual([G1.id, G3.id].sort());
    // Si puede cambiarlo lo dice el servidor: la admin, no; el super admin, sí.
    expect(r.body.data.puede_cambiar).toBe(false);
    expect((await pedir(SUPER, `/api/users/${LIDER.id}/equipo-comercial`)).body.data.puede_cambiar).toBe(true);
    const deLaLista = r.body.data.gestoras.map((g) => g.id);
    expect(deLaLista).toEqual(expect.arrayContaining([G1.id, G2.id, G3.id]));
    expect(deLaLista).not.toContain(G_OTRA.id);   // otra empresa
    expect(deLaLista).not.toContain(ADMIN.id);    // no es gestora
    expect(deLaLista).not.toContain(LIDER.id);
    // Una gestora no ve usuarios: 403.
    expect((await pedir(G1, `/api/users/${LIDER.id}/equipo-comercial`)).status).toBe(403);
  });
});

describe('lo que ve cada una', () => {
  it('la líder: los prospectos de su equipo, no los de otra gestora ni los sin asignar', async () => {
    const r = await pedir(LIDER, `/api/leads?projectIds=${A},${B}&limit=100`);
    expect(r.status).toBe(200);
    expect(idsDe(r)).toEqual(expect.arrayContaining([L1, L3]));
    expect(idsDe(r)).not.toContain(L2);
    expect(idsDe(r)).not.toContain(L_SIN);
    // Pedir los de una gestora de fuera no ensancha nada.
    const r2 = await pedir(LIDER, `/api/leads?projectId=${A}&responsableId=${G2.id}&limit=100`);
    expect(idsDe(r2)).not.toContain(L2);
    // La de una de su equipo, sí.
    const r3 = await pedir(LIDER, `/api/leads?projectIds=${A},${B}&responsableId=${G3.id}&limit=100`);
    expect(idsDe(r3)).toEqual([L3]);
  });

  it('la líder: la ficha de otra gestora le da lo mismo que a una gestora (403), la de su equipo sí', async () => {
    const ajena = await pedir(LIDER, `/api/leads/${L2}`);
    const comoGestora = await pedir(G1, `/api/leads/${L2}`);
    expect(ajena.status).toBe(comoGestora.status);
    expect(ajena.status).toBe(403);
    expect(ajena.body.data).toBeUndefined();
    expect((await pedir(LIDER, `/api/leads/${L1}`)).status).toBe(200);
  });

  it('la líder: las ventas de su equipo, no las de otra; la ficha de otra venta, 403', async () => {
    const r = await pedir(LIDER, `/api/conversions?projectId=${A}&limit=100`);
    expect(r.status).toBe(200);
    expect(idsDe(r)).toContain(V1);
    expect(idsDe(r)).not.toContain(V2);
    expect((await pedir(LIDER, `/api/conversions/${V2}`)).status).toBe(403);
    expect((await pedir(LIDER, `/api/conversions/${V1}`)).status).toBe(200);
  });

  it('con una empresa arriba o «Todos», sigue viendo solo su equipo', async () => {
    const empresa = await pedir(LIDER, `/api/conversions?issuerId=${EMPRESA}&limit=100`);
    expect(empresa.status).toBe(200);
    expect(idsDe(empresa)).toContain(V1);
    expect(idsDe(empresa)).not.toContain(V2);
    // El Dashboard con «Todos» pide la lista de campus de una vez.
    const stats = await pedir(LIDER, `/api/leads/stats?projectIds=${A},${B},${C}`);
    expect(stats.status).toBe(200);
    const statsAdmin = await pedir(ADMIN, `/api/leads/stats?projectIds=${A},${B}`);
    const total = (s) => Number(s.body.data.total ?? s.body.data.totales?.total ?? 0);
    expect(total(stats)).toBe(2);       // L1 y L3
    expect(total(statsAdmin)).toBe(4);  // L1, L2, L3 y el sin asignar
  });

  it('ventas por asesora, resumen y la tabla del equipo: solo su equipo', async () => {
    const equipo = [LIDER.id, G1.id, G3.id];
    const porAsesora = await pedir(LIDER, `/api/ventas/por-asesora?projectId=${A}`);
    expect(porAsesora.status).toBe(200);
    const quienes = porAsesora.body.data.map((x) => Number(x.user_id));
    expect(quienes).toContain(G1.id);
    expect(quienes.every((id) => equipo.includes(id))).toBe(true);
    const resumen = await pedir(LIDER, `/api/ventas/resumen?projectId=${A}`);
    const resumenAdmin = await pedir(ADMIN, `/api/ventas/resumen?projectId=${A}`);
    expect(resumen.status).toBe(200);
    expect(JSON.stringify(resumen.body.data)).not.toBe(JSON.stringify(resumenAdmin.body.data));
    const tabla = await pedir(LIDER, `/api/ventas/gestores-stats?projectId=${A}&periodo=all`);
    expect(tabla.status).toBe(200);
    const enTabla = tabla.body.data.gestores.map((g) => Number(g.user_id));
    expect(enTabla).toContain(G1.id);
    expect(enTabla).not.toContain(G2.id);
    const tablaAdmin = await pedir(ADMIN, `/api/ventas/gestores-stats?projectId=${A}&periodo=all`);
    expect(tablaAdmin.body.data.gestores.map((g) => Number(g.user_id))).toContain(G2.id);
  });

  it('el admin sin equipo lo ve todo su campus', async () => {
    const r = await pedir(ADMIN, `/api/leads?projectIds=${A},${B}&limit=100`);
    expect(idsDe(r)).toEqual(expect.arrayContaining([L1, L2, L3, L_SIN]));
    expect((await pedir(ADMIN, `/api/leads/${L2}`)).status).toBe(200);
    expect(await alcanceComercial({ userId: ADMIN.id, role: 'admin' })).toBeNull();
  });

  it('la gestora, solo lo suyo (como siempre)', async () => {
    const r = await pedir(G2, `/api/leads?projectId=${A}&limit=100`);
    expect(idsDe(r)).toEqual([L2]);
    const v = await pedir(G2, `/api/conversions?projectId=${A}&limit=100`);
    expect(idsDe(v)).toEqual([V2]);
  });

  it('reasignar: solo dentro de su equipo', async () => {
    const fuera = await request.patch(`/api/leads/${L1}/reassign`).set(como(LIDER)).send({ responsable_id: G2.id });
    expect(fuera.status).toBe(403);
    expect(fuera.body.code).toBe('FUERA_DE_TU_EQUIPO');
    const ajeno = await request.patch(`/api/leads/${L2}/reassign`).set(como(LIDER)).send({ responsable_id: G1.id });
    expect(ajeno.status).toBe(403);
    const dentro = await request.patch(`/api/leads/${L1}/reassign`).set(como(LIDER)).send({ responsable_id: G3.id });
    expect(dentro.status).toBe(200);
    await q('UPDATE leads SET responsable_id = $1 WHERE id = $2', [G1.id, L1]);
  });

  it('el MCP respeta el equipo: Claude le da lo de su equipo y nada más', async () => {
    const ambito = construirAmbito({ ...LIDER, nombre: 'Raquel' },
      [{ id: A, nombre: 'A', sociedad_id: EMPRESA }, { id: B, nombre: 'B', sociedad_id: EMPRESA }],
      await gestorasACargo(LIDER.id));
    const buscar = HERRAMIENTAS.find((h) => h.nombre === 'buscar_prospectos');
    const r = await buscar.ejecutar(ambito, { pagina: 1, limite: 100 });
    const vistos = r.prospectos.map((p) => p.id);
    expect(vistos).toEqual(expect.arrayContaining([L1, L3]));
    expect(vistos).not.toContain(L2);
    await expect(buscar.ejecutar(ambito, { gestora_id: G2.id, pagina: 1, limite: 100 }))
      .rejects.toMatchObject({ code: 'MCP_FUERA_DE_AMBITO' });
    const ver = HERRAMIENTAS.find((h) => h.nombre === 'ver_prospecto');
    await expect(ver.ejecutar(ambito, { id: L2 })).rejects.toMatchObject({ code: 'MCP_NO_ENCONTRADO' });
  });

  it('corregir y abonar facturas: la líder no, ni las de su equipo; una admin sin equipo, sí (Diego, 09/11)', async () => {
    expect(await esFacturaQueGestiona(LIDER.id, 'admin', F1)).toBe(false);
    expect(await esFacturaQueGestiona(ADMIN.id, 'admin', F1)).toBe(true);
    expect(await esFacturaQueGestiona(SUPER.id, 'superadmin', F1)).toBe(true);
    const corregir = await request.patch(`/api/invoices/${F1}/corregir`).set(como(LIDER)).send({ cliente_nombre: 'Otro' });
    expect(corregir.status).toBe(403);
    const abonar = await request.post(`/api/invoices/${F1}/rectificar`).set(como(LIDER)).send({ motivo: 'prueba' });
    expect(abonar.status).toBe(403);
    // La admin sin equipo pasa la puerta (lo que haga después ya no es cosa de esto).
    const admin = await request.patch(`/api/invoices/${F1}/corregir`).set(como(ADMIN)).send({ cliente_nombre: 'Cliente' });
    expect(admin.status).not.toBe(403);
  });

  it('cambiar el equipo surte efecto en la siguiente petición', async () => {
    expect((await poner(SUPER, LIDER, [G2.id])).status).toBe(200);
    const r = await pedir(LIDER, `/api/leads?projectIds=${A},${B}&limit=100`);
    expect(idsDe(r)).toContain(L2);
    expect(idsDe(r)).not.toContain(L1);
    expect(idsDe(r)).not.toContain(L3);
    expect((await pedir(LIDER, `/api/leads/${L1}`)).status).toBe(403);
    // Sin equipo, vuelve a verlo todo, como Daniela.
    expect((await poner(SUPER, LIDER, [])).status).toBe(200);
    const todo = await pedir(LIDER, `/api/leads?projectIds=${A},${B}&limit=100`);
    expect(idsDe(todo)).toEqual(expect.arrayContaining([L1, L2, L3, L_SIN]));
  });
});
