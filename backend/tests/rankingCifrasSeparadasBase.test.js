import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../src/shared/config/db.js';
import {
  miPuesto, asesorasPorMes, overview, panelReportes, detalleMetrica,
} from '../src/modules/reports/report.model.js';

/**
 * Las cifras separadas del ranking, contra la base de verdad (Diego, 19/10/2026).
 *
 * Se monta en pequeño la semana del 12 al 18/10 que lo destapó en ISEIE: Diana
 * sale la primera con dinero de una venta del 30/09 y una cuota, y no vendió
 * nada; una venta de un lead sin responsable cobra 4.195 € y no salía en el
 * ranking. Aquí el ranking se calcula igual, así que se prueba igual.
 *
 *   docker compose -f docker-compose.dev.yml up -d
 *   npm --prefix backend run db:preparar
 *   cd backend && npx vitest run tests/rankingCifrasSeparadasBase.test.js
 *
 * El proyecto se crea como de PRUEBAS: los informes de «todos los proyectos» no
 * lo ven, y aquí se le pide por su id. Todo se borra al final.
 */

const MARCA = `cifras${Date.now().toString(36)}`;
const SEMANA = { from: '2026-10-12', to: '2026-10-18' };
const U = {};
const L = {};
const V = {};
const P = {};
let projectId = null;
let hayBase = true;
let porQueNo = null;

const uno = async (sql, p) => (await query(sql, p)).rows[0];

async function gestora(clave) {
  U[clave] = (await uno(
    `INSERT INTO users (nombre, email, password_hash, role, active) VALUES ($1, $2, 'x', 'gestor', true) RETURNING id`,
    [`${clave} ${MARCA}`, `${clave}.${MARCA}@test.local`])).id;
  await query('INSERT INTO user_projects (user_id, project_id, active) VALUES ($1, $2, true)', [U[clave], projectId]);
}

async function lead(clave, responsable, cuando) {
  L[clave] = (await uno(
    `INSERT INTO leads (project_id, nombre, email, responsable_id, status, fecha_solicitud, created_at)
     VALUES ($1, $2, $3, $4, 'nuevo', $5::timestamptz, $5::timestamptz) RETURNING id`,
    [projectId, `${clave} ${MARCA}`, `${clave}.${MARCA}@lead.local`, responsable ? U[responsable] : null, `${cuando} 10:00:00+02`])).id;
}

async function venta(clave, prospecto, fecha, total, { mensualidad = false } = {}) {
  V[clave] = (await uno(
    `INSERT INTO conversions (lead_id, project_id, producto_contratado, importe_total, fecha_conversion, es_mensualidad)
     VALUES ($1, $2, 'Máster', $3, $4, $5) RETURNING id`,
    [L[prospecto], projectId, total, fecha, mensualidad])).id;
}

async function cobro(clave, ventaClave, fecha, importe) {
  P[clave] = (await uno(
    'INSERT INTO conversion_payments (conversion_id, importe, fecha) VALUES ($1, $2, $3) RETURNING id',
    [V[ventaClave], importe, fecha])).id;
}

beforeAll(async () => {
  try {
    projectId = (await uno(
      `INSERT INTO projects (nombre, slug, webhook_api_key, active, es_prueba) VALUES ($1, $2, $3, true, true) RETURNING id`,
      [`Cifras ${MARCA}`, `cifras-${MARCA}`, `k-${MARCA}`])).id;
    await gestora('diana');
    await gestora('ana');

    // Prospectos de la semana: 3 de Diana y 2 de Ana.
    await lead('d1', 'diana', '2026-10-13');
    await lead('d2', 'diana', '2026-10-14');
    await lead('d3', 'diana', '2026-10-15');
    await lead('a1', 'ana', '2026-10-14');
    await lead('a2', 'ana', '2026-10-15');
    // Clientes de antes.
    await lead('dVieja', 'diana', '2026-09-20');
    await lead('dPlan', 'diana', '2026-08-01');
    await lead('sinNadie', null, '2026-09-10');
    await lead('aCruce', 'ana', '2026-09-27');

    // (a) La #676: venta del 30/09, transferencia del 16/10.
    await venta('anterior', 'dVieja', '2026-09-30', 1975);
    await cobro('anterior', 'anterior', '2026-10-16', 1975);

    // (b) La #527: plan de pago de agosto; la cuota 2 se cobra el 15/10.
    await venta('plan', 'dPlan', '2026-08-10', 1250);
    await cobro('plan1', 'plan', '2026-08-10', 125);
    await cobro('plan2', 'plan', '2026-10-15', 125);
    await query(
      `INSERT INTO conversion_installments (conversion_id, numero, importe_previsto, fecha_vencimiento, fecha_cobro, importe_cobrado, payment_id)
       VALUES ($1, 1, 125, '2026-08-10', '2026-08-10', 125, $2), ($1, 2, 125, '2026-10-15', '2026-10-15', 125, $3),
              ($1, 3, 125, '2026-11-15', NULL, NULL, NULL)`,
      [V.plan, P.plan1, P.plan2]);
    // Y una ficha de mensualidad de la misma alumna, también de la semana.
    await venta('mensualidad', 'dPlan', '2026-10-17', 125, { mensualidad: true });
    await cobro('mensualidad', 'mensualidad', '2026-10-17', 125);
    // Factura de la cuota 2, emitida en la semana: lo que Diana tiene «facturado».
    await query(
      `INSERT INTO invoices (project_id, conversion_id, lead_id, ano, numero, codigo, fecha_emision, cliente_nombre,
                             cliente_nif, cliente_direccion, cliente_ciudad, cliente_cp, cliente_pais, items,
                             base_imponible, total, payment_id)
       VALUES ($1, $2, $3, 2026, 9001, $4, '2026-10-15', 'Alumna', 'X', 'Calle', 'Madrid', '28001', 'España', '[]'::jsonb, 125, 125, $5)`,
      [projectId, V.plan, L.dPlan, `${MARCA}-1`, P.plan2]);

    // Una venta nueva de Ana, cobrada a medias.
    await venta('nueva', 'a1', '2026-10-14', 1000);
    await cobro('nueva', 'nueva', '2026-10-14', 500);
    // Una compartida al 50 % entre las dos, cobrada entera.
    await venta('compartida', 'a2', '2026-10-15', 600);
    await cobro('compartida', 'compartida', '2026-10-15', 600);
    await query('INSERT INTO conversion_vendedoras (conversion_id, user_id, porcentaje) VALUES ($1, $2, 50), ($1, $3, 50)',
      [V.compartida, U.ana, U.diana]);

    // (c) La #666: lead sin responsable y venta sin vendedora. No es de nadie.
    await venta('sinGestora', 'sinNadie', '2026-09-20', 4195);
    await cobro('sinGestora', 'sinGestora', '2026-10-13', 4195);

    // Una venta del 29/09 cobrada el 02/10: cambia de mes dentro de una semana.
    await venta('cruce', 'aCruce', '2026-09-29', 350);
    await cobro('cruce', 'cruce', '2026-10-02', 350);
  } catch (err) {
    hayBase = false;
    porQueNo = err.message;
  }
});

afterAll(async () => {
  if (!projectId) return;
  for (const [sql, p] of [
    ['DELETE FROM invoices WHERE project_id = $1', [projectId]],
    ['DELETE FROM conversions WHERE project_id = $1', [projectId]],
    ['DELETE FROM leads WHERE project_id = $1', [projectId]],
    ['DELETE FROM user_projects WHERE project_id = $1', [projectId]],
    ['DELETE FROM users WHERE id = ANY($1::int[])', [Object.values(U)]],
    ['DELETE FROM projects WHERE id = $1', [projectId]],
  ]) {
    try { await query(sql, p); } catch { /* sigue limpiando */ }
  }
});

const deLaSemana = () => miPuesto({ userId: U.diana, projectIds: [projectId], ...SEMANA, esJefe: true });

describe('hay base', () => {
  it('contra la que probar', () => { expect(hayBase, porQueNo || '').toBe(true); });
});

describe('el ranking de la semana del 12 al 18/10', () => {
  it('(a) el cobro de la venta del 30/09 va a «de ventas anteriores», con su nº y su fecha', async () => {
    if (!hayBase) return;
    const r = await deLaSemana();
    const diana = r.tabla.find((f) => f.user_id === U.diana);
    expect(diana.cobrado_anteriores).toBe(1975);
    expect(diana.anteriores_grandes).toEqual([{ venta_id: V.anterior, fecha_venta: '2026-09-30', importe: 1975 }]);
    // De ventas de la semana solo tiene su mitad de la compartida.
    expect(diana.cobrado_del_periodo).toBe(300);
  });

  it('(b) la cuota del plan y la mensualidad van a «cuotas», no a ventas', async () => {
    if (!hayBase) return;
    const diana = (await deLaSemana()).tabla.find((f) => f.user_id === U.diana);
    expect(diana.cobrado_en_cuotas).toBe(250);
    expect(diana.cobrado).toBe(2525);
    expect(diana.cobrado_del_periodo + diana.cobrado_anteriores + diana.cobrado_en_cuotas).toBe(diana.cobrado);
    // Vendido: solo media venta (la compartida). La mensualidad no es venta.
    expect(diana.ventas).toBe(0.5);
    expect(diana.vendido).toBe(300);
    expect(diana.facturado).toBe(125);
    expect(diana.leads).toBe(3);
  });

  it('el pendiente es de las ventas de la semana: lo que les falta hoy', async () => {
    if (!hayBase) return;
    const r = await deLaSemana();
    const ana = r.tabla.find((f) => f.user_id === U.ana);
    expect(ana.ventas).toBe(1.5);
    expect(ana.vendido).toBe(1300);
    expect(ana.pendiente).toBe(500);
    expect(ana.cobrado_del_periodo).toBe(800);
  });

  it('(c) el dinero sin gestora sale en su fila, y el Total es la tarjeta Cobrado', async () => {
    if (!hayBase) return;
    const r = await deLaSemana();
    expect(r.tabla.map((f) => f.user_id)).toEqual([U.diana, U.ana]);
    expect(r.sin_gestora.cobrado).toBe(4195);
    expect(r.sin_gestora.anteriores_grandes).toEqual([{ venta_id: V.sinGestora, fecha_venta: '2026-09-20', importe: 4195 }]);
    expect(r.total.cobrado).toBe(2525 + 800 + 4195);
    // La tarjeta de Reportes (Ingresos) y la del correo (los pagos de la semana).
    const panel = await panelReportes({ projectIds: [projectId], ...SEMANA });
    expect(r.total.cobrado).toBe(panel.kpis.ingresos.value);
    const { rows: [tarjeta] } = await query(
      `SELECT SUM(p.importe)::float8 AS cobrado FROM conversion_payments p JOIN conversions c ON c.id = p.conversion_id
        WHERE p.fecha BETWEEN $1 AND $2 AND c.project_id = $3`, [SEMANA.from, SEMANA.to, projectId]);
    expect(r.total.cobrado).toBe(tarjeta.cobrado);
    // Y cada columna del Total es la suma de sus filas.
    for (const k of ['ventas', 'vendido', 'facturado', 'pendiente', 'cobrado_del_periodo', 'cobrado_anteriores', 'cobrado_en_cuotas']) {
      expect(r.total[k], k).toBeCloseTo(r.tabla.reduce((s, f) => s + f[k], 0) + r.sin_gestora[k], 2);
    }
  });

  it('una cuota de una venta del MISMO periodo es dinero de esa venta, no «cuotas»', async () => {
    if (!hayBase) return;
    const [ago] = (await asesorasPorMes({ projectIds: [projectId], from: '2026-08-01', to: '2026-08-31', base: 'cobro' }))
      .filter((f) => f.asesora_id === U.diana);
    expect(Number(ago.cobrado_del_periodo)).toBe(125);
    expect(Number(ago.cobrado_en_cuotas)).toBe(0);
  });

  it('por rango la venta del 29/09 cobrada el 02/10 es de la semana; en la fila de octubre, anterior', async () => {
    if (!hayBase) return;
    const sem = await miPuesto({ userId: U.ana, projectIds: [projectId], from: '2026-09-28', to: '2026-10-04', esJefe: true });
    expect(sem.cobrado_del_periodo).toBe(350);
    expect(sem.cobrado_anteriores).toBe(0);
    const [oct] = (await asesorasPorMes({ projectIds: [projectId], from: '2026-10-01', to: '2026-10-31', base: 'cobro' }))
      .filter((f) => f.asesora_id === U.ana);
    expect(Number(oct.cobrado_anteriores)).toBe(350);
    expect(Number(oct.cobrado_del_periodo)).toBe(800);
  });

  it('por factura también cuadra: las tres partes suman lo cobrado', async () => {
    if (!hayBase) return;
    // Este CRM tiene dos bases; «cerrado» es solo de ISEIE.
    for (const base of ['factura']) {
      const filas = await asesorasPorMes({ projectIds: [projectId], from: '2026-08-01', to: '2026-10-31', base });
      for (const f of filas) {
        const partes = Number(f.cobrado_del_periodo) + Number(f.cobrado_anteriores) + Number(f.cobrado_en_cuotas);
        expect(partes, `${base} ${f.mes} ${f.asesora}`).toBeCloseTo(Number(f.cobrado), 2);
      }
    }
  });
});

describe('el detalle de cada caja suma lo que dice la tabla', () => {
  it('anteriores, cuotas y del periodo de Diana', async () => {
    if (!hayBase) return;
    const caja = async (tipo) => detalleMetrica({ projectIds: [projectId], ...SEMANA, tipo, base: 'cobro', asesoraId: U.diana });
    const ant = await caja('cobros-anteriores');
    expect(ant.map((x) => x.venta)).toEqual([V.anterior]);
    const cuotas = await caja('cobros-cuotas');
    expect(cuotas.map((x) => x.id).sort((a, b) => a - b)).toEqual([P.plan2, P.mensualidad].sort((a, b) => a - b));
    expect(cuotas.find((x) => x.id === P.plan2).cuota).toBe(2);
    const periodo = await caja('cobros-periodo');
    expect(periodo.map((x) => Number(x.importe))).toEqual([300]);
  });
});

describe('(d) overview con gestora: lo suyo, no lo del equipo', () => {
  it('prospectos por su responsable y ventas por su parte', async () => {
    if (!hayBase) return;
    const todo = await overview({ projectIds: [projectId], ...SEMANA });
    const diana = await overview({ projectIds: [projectId], ...SEMANA, asesoraId: U.diana });
    const ana = await overview({ projectIds: [projectId], ...SEMANA, asesoraId: U.ana });
    expect(Number(todo.leads.total)).toBe(5);
    expect(Number(diana.leads.total)).toBe(3);
    expect(Number(ana.leads.total)).toBe(2);
    // overview cuenta todas las fichas (también la mensualidad), repartidas.
    expect(Number(todo.conversions.total)).toBe(3);
    expect(Number(diana.conversions.total)).toBe(1.5);
    expect(Number(ana.conversions.total)).toBe(1.5);
    expect(Number(diana.conversions.ventas_brutas)).toBe(300 + 125);
  });
});
