import { query } from '../../shared/config/db.js';

/**
 * Los conectores que tocan a unos campus: los de cada campus, los de SU
 * empresa y los de todo el sistema (migración 183). Salen con el nombre de su
 * campus y de su empresa, y primero los más amplios.
 */
export async function listByAmbito(projectIds) {
  const { rows } = await query(
    `SELECT c.id, c.project_id, p.nombre AS proyecto, c.alcance, c.issuer_id, s.razon_social AS empresa,
            c.type, c.label, c.destination, c.config, c.field_mapping,
            c.sample_payload, c.sample_received_at, c.active,
            c.last_sync_at, c.last_sync_status, c.last_sync_count, c.created_at, c.updated_at
     FROM project_connectors c
     JOIN projects p ON p.id = c.project_id
     LEFT JOIN invoice_issuers s ON s.id = c.issuer_id
     WHERE (c.alcance = 'campus' AND c.project_id = ANY($1::int[]))
        OR (c.alcance = 'empresa' AND c.issuer_id IN (
              SELECT sociedad_emisora_id FROM projects WHERE id = ANY($1::int[]) AND sociedad_emisora_id IS NOT NULL))
        OR c.alcance = 'sistema'
     ORDER BY CASE c.alcance WHEN 'sistema' THEN 0 WHEN 'empresa' THEN 1 ELSE 2 END, s.razon_social, p.nombre, c.id`,
    [projectIds]
  );
  return rows;
}

/** Los campus a los que puede llevar datos un conector, según su alcance. */
export async function campusDelAlcance(c) {
  if (c.alcance === 'empresa') {
    const { rows } = await query('SELECT id, nombre FROM projects WHERE sociedad_emisora_id = $1 ORDER BY id', [c.issuer_id]);
    return rows;
  }
  if (c.alcance === 'sistema') {
    const { rows } = await query('SELECT id, nombre FROM projects WHERE active ORDER BY id');
    return rows;
  }
  const { rows } = await query('SELECT id, nombre FROM projects WHERE id = $1', [c.project_id]);
  return rows;
}

/** Si el campus es de esa empresa. */
export async function campusEsDeLaEmpresa(projectId, issuerId) {
  const { rows } = await query('SELECT 1 FROM projects WHERE id = $1 AND sociedad_emisora_id = $2', [projectId, issuerId]);
  return rows.length > 0;
}

export async function findById(id) {
  const { rows } = await query(`SELECT * FROM project_connectors WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function create(data) {
  const { rows } = await query(
    `INSERT INTO project_connectors (project_id, type, label, destination, config, field_mapping, alcance, issuer_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      data.project_id,
      data.type,
      data.label,
      data.destination || 'product',
      JSON.stringify(data.config || {}),
      JSON.stringify(data.field_mapping || {}),
      data.alcance || 'campus',
      data.issuer_id ?? null,
    ]
  );
  return rows[0];
}

export async function update(id, data) {
  const allowed = ['label', 'destination', 'config', 'field_mapping', 'active', 'alcance', 'issuer_id', 'project_id'];
  const fields = []; const values = []; let i = 1;
  for (const k of allowed) {
    if (data[k] === undefined) continue;
    fields.push(`${k} = $${i++}`);
    values.push((k === 'config' || k === 'field_mapping') ? JSON.stringify(data[k]) : data[k]);
  }
  if (!fields.length) return null;
  fields.push('updated_at = NOW()');
  values.push(id);
  const { rows } = await query(
    `UPDATE project_connectors SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] || null;
}

export async function remove(id) {
  await query(`DELETE FROM project_connectors WHERE id = $1`, [id]);
}

export async function saveSample(id, sample) {
  await query(
    `UPDATE project_connectors SET sample_payload = $1, sample_received_at = NOW(), updated_at = NOW() WHERE id = $2`,
    [JSON.stringify(sample), id]
  );
}

export async function recordSync(id, status, count) {
  await query(
    `UPDATE project_connectors SET last_sync_at = NOW(), last_sync_status = $1, last_sync_count = $2, updated_at = NOW() WHERE id = $3`,
    [status, count, id]
  );
}
