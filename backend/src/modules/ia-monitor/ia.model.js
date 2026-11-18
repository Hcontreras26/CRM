import { query } from '../../shared/config/db.js';

export async function listSnapshots(projectId, monthsBack = 12) {
  const { rows } = await query(
    `SELECT * FROM ia_metrics_snapshots WHERE project_id = $1
       AND mes >= TO_CHAR((NOW() - ($2 || ' months')::interval), 'YYYY-MM')
     ORDER BY mes ASC`,
    [projectId, String(monthsBack)]);
  return rows;
}
export async function upsertSnapshot(data) {
  const { rows } = await query(
    `INSERT INTO ia_metrics_snapshots (project_id, mes, mrr, active_subs, new_subs, cancelled_subs, churn_rate, failed_payments, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (project_id, mes) DO UPDATE
       SET mrr = EXCLUDED.mrr, active_subs = EXCLUDED.active_subs,
           new_subs = EXCLUDED.new_subs, cancelled_subs = EXCLUDED.cancelled_subs,
           churn_rate = EXCLUDED.churn_rate, failed_payments = EXCLUDED.failed_payments,
           raw_payload = EXCLUDED.raw_payload, snapshot_at = NOW()
     RETURNING *`,
    [data.project_id, data.mes, data.mrr, data.active_subs, data.new_subs,
     data.cancelled_subs, data.churn_rate, data.failed_payments,
     data.raw_payload ? JSON.stringify(data.raw_payload) : null]);
  return rows[0];
}

/*
  LOS COBROS DE UN PROYECTO IA, ORDENADOS Y FILTRABLES.

  Cada cobro de la app de IA entra al CRM como una venta (alta o renovacion), y
  si se devolvio lleva su devolucion en `conversion_refunds`. Esta lectura los
  junta y filtra EN EL SERVIDOR --no en la pantalla-- para que la paginacion y
  los totales hablen del mismo conjunto: filtrar solo la pagina cargada daba
  cifras que no cuadraban con el listado.
*/
const ES_RENOVACION = "c.producto_contratado ILIKE '%(renovacion)%'";
const TIPOS = new Set(['alta', 'renovacion', 'devuelto']);
const PLANES = new Set(['mensual', 'anual']);

function condiciones(projectId, f = {}) {
  const params = [projectId];
  const donde = ['c.project_id = $1'];
  if (TIPOS.has(f.tipo)) {
    if (f.tipo === 'alta') donde.push('NOT (' + ES_RENOVACION + ')');
    if (f.tipo === 'renovacion') donde.push(ES_RENOVACION);
    if (f.tipo === 'devuelto') donde.push('EXISTS (SELECT 1 FROM conversion_refunds r0 WHERE r0.conversion_id = c.id)');
  }
  if (PLANES.has(f.plan)) donde.push("c.producto_contratado ILIKE '%" + f.plan + "%'");
  if (f.q) { params.push('%' + String(f.q).trim().slice(0, 80) + '%'); donde.push('(l.email ILIKE $' + params.length + ' OR l.nombre ILIKE $' + params.length + ')'); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.desde || '')) { params.push(f.desde); donde.push('c.fecha_conversion >= $' + params.length); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(f.hasta || '')) { params.push(f.hasta); donde.push('c.fecha_conversion <= $' + params.length); }
  return { params, donde: donde.join(' AND ') };
}

const DESDE = `
  FROM conversions c
  JOIN leads l ON l.id = c.lead_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(r.importe), 0) AS total FROM conversion_refunds r WHERE r.conversion_id = c.id
  ) dev ON TRUE`;

export async function cobrosDeProyecto(projectId, filtros = {}) {
  const limit = Math.min(Math.max(parseInt(filtros.limit, 10) || 25, 1), 100);
  const page = Math.max(parseInt(filtros.page, 10) || 1, 1);
  const { params, donde } = condiciones(projectId, filtros);

  const { rows } = await query(
    `SELECT c.id, c.fecha_conversion AS fecha, c.producto_contratado AS producto,
            c.importe_pagado::float AS importe, dev.total::float AS devuelto,
            (${ES_RENOVACION}) AS renovacion,
            l.nombre, l.email,
            substring(c.notas_pago from 'stripe:([^ ]+)') AS referencia
       ${DESDE}
      WHERE ${donde}
      ORDER BY c.fecha_conversion DESC, c.id DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
    params);

  const { rows: [t] } = await query(
    `SELECT count(*)::int AS n,
            COALESCE(sum(c.importe_pagado), 0)::float AS bruto,
            COALESCE(sum(dev.total), 0)::float AS devuelto,
            count(*) FILTER (WHERE ${ES_RENOVACION})::int AS renovaciones,
            count(*) FILTER (WHERE NOT (${ES_RENOVACION}))::int AS altas,
            count(*) FILTER (WHERE dev.total > 0)::int AS devueltos
       ${DESDE}
      WHERE ${donde}`,
    params);

  return {
    rows,
    totales: { ...t, neto: Number((t.bruto - t.devuelto).toFixed(2)), bruto: Number(t.bruto.toFixed(2)), devuelto: Number(t.devuelto.toFixed(2)) },
    pagination: { total: t.n, page, limit, totalPages: Math.max(1, Math.ceil(t.n / limit)) },
  };
}
