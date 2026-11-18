import { query } from '../../shared/config/db.js';

// Un campus o varios (#218: con «Todos» o una empresa, los del ámbito). Cada
// informe lleva el nombre de su campus.
export async function listByProject(projectId) {
  const { rows } = await query(
    `SELECT r.id, r.project_id, r.periodo, r.metadata, r.pdf_url, r.created_at,
            u.nombre as generated_by_nombre, p.nombre as proyecto_nombre
       FROM reports r
       LEFT JOIN users u ON u.id = r.generated_by
       LEFT JOIN projects p ON p.id = r.project_id
      WHERE r.project_id = ANY($1::int[])
      ORDER BY r.periodo DESC, p.nombre`, [[].concat(projectId).map(Number)]);
  return rows;
}
export async function findById(id) {
  const { rows } = await query(`SELECT r.*, u.nombre as generated_by_nombre FROM reports r LEFT JOIN users u ON u.id = r.generated_by WHERE r.id = $1`, [id]);
  return rows[0] || null;
}
export async function findByPeriodo(projectId, periodo) {
  const { rows } = await query(`SELECT * FROM reports WHERE project_id = $1 AND periodo = $2`, [projectId, periodo]);
  return rows[0] || null;
}
export async function upsert(data) {
  const { rows } = await query(
    `INSERT INTO reports (project_id, periodo, content, metadata, generated_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (project_id, periodo) DO UPDATE
       SET content = EXCLUDED.content, metadata = EXCLUDED.metadata,
           generated_by = EXCLUDED.generated_by
     RETURNING *`,
    [data.project_id, data.periodo, data.content,
     data.metadata ? JSON.stringify(data.metadata) : null,
     data.generated_by]);
  return rows[0];
}
export async function setPdf(id, pdfUrl) {
  await query(`UPDATE reports SET pdf_url = $2, pdf_generated_at = NOW() WHERE id = $1`, [id, pdfUrl]);
}
