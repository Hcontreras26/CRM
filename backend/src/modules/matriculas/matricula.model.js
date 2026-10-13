import { query } from '../../shared/config/db.js';
import { comoLista, SIN_PRUEBAS } from '../../shared/utils/ambito.js';

/**
 * Un campus, una empresa entera o «Todos» (#199: «por empresa y con "Todos los
 * proyectos", como el resto del CRM»). El mismo helper que Ventas y Reportes;
 * «Todos» sin los proyectos de pruebas.
 */
function alcance(projectId, projectIds, params) {
  const lista = comoLista(projectId, projectIds);
  if (!lista) return SIN_PRUEBAS('m.project_id');
  params.push(lista);
  return `m.project_id = ANY($${params.length}::int[])`;
}

/** El curso de una matrícula: el del formulario o, si no viene, el de su venta. */
const CURSO = "COALESCE(m.datos_admision->>'curso_solicitado', c.producto_contratado)";
/** El día de llegada, en hora de Madrid. */
const DIA_DE_LLEGADA = "(COALESCE(m.webhook_received_at, m.created_at) AT TIME ZONE 'Europe/Madrid')::date";

export async function findAll({ projectId, projectIds = null, estado, search, campusId, curso, desde, hasta, page = 1, limit = 50 }) {
  const params = [];
  const conditions = [alcance(projectId, projectIds, params)];
  let idx = params.length + 1;
  if (estado) { conditions.push(`m.estado = $${idx++}`); params.push(estado); }
  // Los filtros de Diego (#199): curso, campus y fechas. El campus se suma al
  // ámbito, así que uno que no es tuyo no devuelve nada.
  if (campusId) { conditions.push(`m.project_id = $${idx++}`); params.push(campusId); }
  if (curso) { conditions.push(`${CURSO} = $${idx++}`); params.push(curso); }
  if (desde) { conditions.push(`${DIA_DE_LLEGADA} >= $${idx++}::date`); params.push(desde); }
  if (hasta) { conditions.push(`${DIA_DE_LLEGADA} <= $${idx++}::date`); params.push(hasta); }
  // Recortado, igual que en leads: un espacio pegado al nombre vaciaba la lista.
  // Y `%`, `_` y `\` se buscan tal cual (revisión de la #250).
  const termino = typeof search === 'string' ? search.trim() : '';
  if (termino) {
    conditions.push(`(l.nombre ILIKE $${idx} OR l.email ILIKE $${idx} OR m.dni ILIKE $${idx})`);
    params.push(`%${termino.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
    idx++;
  }
  const where = 'WHERE ' + conditions.join(' AND ');
  const offset = (page - 1) * limit;
  const { rows: cnt } = await query(
    `SELECT COUNT(*) FROM matriculas m LEFT JOIN leads l ON l.id = m.lead_id LEFT JOIN conversions c ON c.id = m.conversion_id ${where}`, params);
  const total = parseInt(cnt[0].count);
  const { rows } = await query(
    `SELECT m.*,
            -- La persona: la del prospecto y, si aún no está vinculada, la del
            -- formulario (contrato de la #198: persona { nombre, email, telefono }).
            COALESCE(l.nombre, m.datos_admision->>'nombre') as lead_nombre,
            COALESCE(l.email, m.datos_admision->>'email') as lead_email,
            COALESCE(l.telefono, m.datos_admision->>'telefono') as lead_telefono,
            c.importe_total, c.producto_contratado, u.nombre as validated_by_nombre,
            -- Las columnas de Diego (#199): curso, campus y fecha de llegada.
            ${CURSO} as curso,
            p.nombre as campus_nombre,
            COALESCE(m.webhook_received_at, m.created_at) as recibida_at
     FROM matriculas m
     LEFT JOIN leads l ON l.id = m.lead_id
     LEFT JOIN conversions c ON c.id = m.conversion_id
     LEFT JOIN users u ON u.id = m.validated_by
     LEFT JOIN projects p ON p.id = m.project_id
     ${where}
     -- Primero lo que pide acción (Solicitud y Datos validados) y después por
     -- fecha de llegada (#199, ideas de Diego del 01/10).
     ORDER BY CASE WHEN m.estado IN ('solicitud_admision', 'datos_validados') THEN 0 ELSE 1 END,
              COALESCE(m.webhook_received_at, m.created_at) DESC, m.id DESC
     LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, limit, offset]
  );
  return { matriculas: rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function findById(id) {
  const { rows } = await query(
    `SELECT m.*, l.nombre as lead_nombre, l.email as lead_email,
            c.importe_total, c.producto_contratado, u.nombre as validated_by_nombre
     FROM matriculas m
     LEFT JOIN leads l ON l.id = m.lead_id
     LEFT JOIN conversions c ON c.id = m.conversion_id
     LEFT JOIN users u ON u.id = m.validated_by
     WHERE m.id = $1`, [id]);
  return rows[0] || null;
}

export async function findByConversion(conversionId) {
  const { rows } = await query(`SELECT * FROM matriculas WHERE conversion_id = $1`, [conversionId]);
  return rows[0] || null;
}

export async function create(data) {
  const dedupe = data.dedupe_key || data.dni || null;
  const { rows } = await query(
    `INSERT INTO matriculas (project_id, conversion_id, lead_id, dni, titulo, notas, datos_admision, source, dedupe_key, estado, webhook_received_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [data.project_id, data.conversion_id || null, data.lead_id || null,
     data.dni || null, data.titulo || null, data.notas || null,
     data.datos_admision ? JSON.stringify(data.datos_admision) : null,
     data.source || 'manual', dedupe,
     data.estado || (data.source === 'webhook' ? 'solicitud_admision' : 'pendiente'),
     data.source === 'webhook' ? new Date() : null]
  );
  return rows[0];
}

export async function findByDedupe(projectId, dedupeKey) {
  if (!dedupeKey) return null;
  const { rows } = await query(`SELECT * FROM matriculas WHERE project_id = $1 AND dedupe_key = $2`, [projectId, dedupeKey]);
  return rows[0] || null;
}

export async function update(id, fields) {
  const allowed = ['dni', 'titulo', 'notas', 'dni_doc_url', 'dni_doc_key', 'titulo_doc_url', 'titulo_doc_key', 'firma_url', 'firma_key'];
  const sets = []; const params = []; let idx = 1;
  for (const k of allowed) {
    if (fields[k] !== undefined) { sets.push(`${k} = $${idx++}`); params.push(fields[k]); }
  }
  if (!sets.length) return null;
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const { rows } = await query(`UPDATE matriculas SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
  return rows[0];
}

export async function setEstado(id, estado, userId, motivo = null) {
  const { rows } = await query(
    `UPDATE matriculas
       SET estado = $1, motivo_rechazo = $2,
           validated_by = $3, validated_at = NOW(), updated_at = NOW()
     WHERE id = $4 RETURNING *`,
    [estado, estado === 'rechazada' ? motivo : null, userId, id]
  );
  return rows[0];
}

export async function remove(id) {
  await query(`DELETE FROM matriculas WHERE id = $1`, [id]);
}

export async function getStats({ projectId, projectIds = null }) {
  const params = [];
  const where = alcance(projectId, projectIds, params);
  const { rows } = await query(
    `SELECT
       COUNT(*) as total,
       COUNT(*) FILTER (WHERE estado = 'solicitud_admision') as solicitudes,
       COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes,
       COUNT(*) FILTER (WHERE estado = 'validada') as validadas,
       COUNT(*) FILTER (WHERE estado = 'rechazada') as rechazadas
     FROM matriculas m WHERE ${where}`, params);
  return rows[0];
}
