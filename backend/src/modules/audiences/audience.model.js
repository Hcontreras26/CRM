import { query } from '../../shared/config/db.js';
import { sqlPaisDelLead } from '../leads/pais.js';

// Filtra leads segun filtros del wizard
export async function previewAudience({ projectId, filters = {} }) {
  const conditions = ['l.project_id = $1'];
  const params = [projectId];
  let i = 2;

  if (Array.isArray(filters.statuses) && filters.statuses.length) {
    conditions.push(`l.status::text = ANY($${i++}::text[])`);
    params.push(filters.statuses);
  }
  if (Array.isArray(filters.canales) && filters.canales.length) {
    conditions.push(`EXISTS (SELECT 1 FROM lead_utms lu WHERE lu.lead_id = l.id AND lu.canal_detectado = ANY($${i++}::text[]))`);
    params.push(filters.canales);
  }
  // País de entrada (#221): el retargeting de Meta, separado por país.
  if (Array.isArray(filters.paises) && filters.paises.length) {
    conditions.push(`${sqlPaisDelLead('l')} = ANY($${i++}::text[])`);
    params.push(filters.paises);
  }
  if (filters.fechaDesde) { conditions.push(`l.fecha_solicitud >= $${i++}`); params.push(filters.fechaDesde); }
  if (filters.fechaHasta) { conditions.push(`l.fecha_solicitud <= $${i++}`); params.push(filters.fechaHasta); }
  if (filters.productoId) { conditions.push(`l.producto_interes_id = $${i++}`); params.push(filters.productoId); }
  if (filters.importeMinimo) {
    conditions.push(`EXISTS (SELECT 1 FROM conversions c WHERE c.lead_id = l.id AND c.importe_total >= $${i++})`);
    params.push(filters.importeMinimo);
  }

  const where = 'WHERE ' + conditions.join(' AND ');

  // Total
  const { rows: cnt } = await query(`SELECT COUNT(*) FROM leads l ${where}`, params);
  const totalCount = parseInt(cnt[0].count);

  // Breakdown por status
  const { rows: statusRows } = await query(
    `SELECT l.status, COUNT(*) as c FROM leads l ${where} GROUP BY l.status`, params);
  const statusBreakdown = Object.fromEntries(statusRows.map(r => [r.status, parseInt(r.c)]));

  // Breakdown por canal
  const { rows: canalRows } = await query(
    `SELECT COALESCE(lu.canal_detectado, 'directo') as canal, COUNT(*) as c
       FROM leads l LEFT JOIN lead_utms lu ON lu.lead_id = l.id ${where}
      GROUP BY canal`, params);
  const canalBreakdown = Object.fromEntries(canalRows.map(r => [r.canal, parseInt(r.c)]));

  // Sample (primeros 10)
  const { rows: sample } = await query(
    `SELECT l.id, l.nombre, l.email, l.telefono, l.status as estado, lu.canal_detectado as canal, l.fecha_solicitud
       FROM leads l LEFT JOIN lead_utms lu ON lu.lead_id = l.id ${where}
      ORDER BY l.fecha_solicitud DESC LIMIT 10`, params);

  return {
    totalCount,
    breakdown: { status: statusBreakdown, canal: canalBreakdown },
    sample,
  };
}

// Devuelve todos los leads en el filtro (para export)
export async function exportAudience({ projectId, filters = {} }) {
  const { sample } = await previewAudience({ projectId, filters });  // sample is just first 10
  // Repetir query SIN limit
  const conditions = ['l.project_id = $1'];
  const params = [projectId];
  let i = 2;
  if (Array.isArray(filters.statuses) && filters.statuses.length) {
    conditions.push(`l.status = ANY($${i++}::text[])`); params.push(filters.statuses);
  }
  if (Array.isArray(filters.canales) && filters.canales.length) {
    conditions.push(`EXISTS (SELECT 1 FROM lead_utms lu WHERE lu.lead_id = l.id AND lu.canal_detectado = ANY($${i++}::text[]))`);
    params.push(filters.canales);
  }
  if (Array.isArray(filters.paises) && filters.paises.length) {
    conditions.push(`${sqlPaisDelLead('l')} = ANY($${i++}::text[])`);
    params.push(filters.paises);
  }
  if (filters.fechaDesde) { conditions.push(`l.fecha_solicitud >= $${i++}`); params.push(filters.fechaDesde); }
  if (filters.fechaHasta) { conditions.push(`l.fecha_solicitud <= $${i++}`); params.push(filters.fechaHasta); }
  if (filters.productoId) { conditions.push(`l.producto_interes_id = $${i++}`); params.push(filters.productoId); }
  const where = 'WHERE ' + conditions.join(' AND ');
  const { rows } = await query(
    `SELECT l.id, l.nombre, l.email, l.telefono FROM leads l ${where} ORDER BY l.id`, params);
  return rows;
}

// ===== meta_uploads =====
export async function createUpload(data) {
  const { rows } = await query(
    `INSERT INTO meta_uploads (project_id, audience_name, records_uploaded, status, filters, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [data.project_id, data.audience_name, data.records_uploaded || 0, data.status || 'preparing',
     data.filters ? JSON.stringify(data.filters) : null, data.created_by || null]);
  return rows[0];
}
export async function updateUpload(id, fields) {
  const allowed = ['audience_id', 'records_uploaded', 'match_rate', 'status', 'error_message', 'completed_at'];
  const sets = []; const params = []; let i = 1;
  for (const k of allowed) if (fields[k] !== undefined) {
    sets.push(`${k} = $${i++}`); params.push(fields[k]);
  }
  if (!sets.length) return null;
  params.push(id);
  const { rows } = await query(`UPDATE meta_uploads SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params);
  return rows[0];
}
export async function getUpload(id) {
  const { rows } = await query(`SELECT * FROM meta_uploads WHERE id = $1`, [id]);
  return rows[0] || null;
}
export async function listUploads(projectId, limit = 20) {
  const { rows } = await query(
    `SELECT * FROM meta_uploads WHERE project_id = $1 ORDER BY started_at DESC LIMIT $2`,
    [projectId, limit]);
  return rows;
}
