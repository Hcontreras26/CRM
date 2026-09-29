import { query } from '../../shared/config/db.js';
// El calculo de plazas vive aparte: lo usa tambien la cola del dia.
import { PLAZAS_JOIN, PLAZAS_COLS } from './plazas.sql.js';

// #86 · Las plazas ocupadas NO se guardan en ninguna columna: se cuentan aqui,
// cada vez. Es lo que exige el proceso comercial —«se comprueba antes de cada
// envio, nunca se arrastra el dato del mensaje anterior»— y lo unico que evita
// que la plantilla salga al cliente con la cifra de la semana pasada.
//
// Se cuentan LEADS distintos, no filas de venta: la misma persona puede tener
// dos ventas del mismo producto (un plan que se partio, una cuota suelta) y
/// Listado: omite _texto pesados. Para detalle completo usar findById(id).
const LIST_COLS = [
  'p.id', 'p.project_id', 'p.nombre', 'p.sku', 'p.precio', 'p.moneda',
  'p.duracion', 'p.horas', 'p.modalidad', 'p.fecha_inicio_texto', 'p.num_modulos',
  'p.image_url', 'p.url_info', 'p.stripe_link',
  'p.source_type', 'p.wc_product_id',
  'p.categoria_id', 'p.subcategoria_id', 'p.regimen_fiscal_id',
  'p.plazas_totales', 'p.plazas_ocupadas_previas', 'p.fecha_cierre_convocatoria',
  'p.active', 'p.created_at', 'p.updated_at',
  "LEFT(p.descripcion, 280) AS descripcion",
].join(', ');

export async function findByProject(projectId, { includeInactive = false, categoryId = null } = {}) {
  const params = [projectId];
  let categoryFilter = '';
  if (categoryId) {
    // Filtra por categoría incluyendo TODOS sus descendientes (CTE recursivo)
    categoryFilter = `AND p.categoria_id IN (
      WITH RECURSIVE d AS (
        SELECT id FROM product_categories WHERE id = $2
        UNION ALL
        SELECT c.id FROM product_categories c JOIN d ON c.parent_id = d.id
      )
      SELECT id FROM d
    )`;
    params.push(categoryId);
  }
  const base = `SELECT ${LIST_COLS}, ${PLAZAS_COLS},
                       c.nombre as categoria_nombre, sc.nombre as subcategoria_nombre
                FROM products p
                LEFT JOIN product_categories c ON c.id = p.categoria_id
                LEFT JOIN product_categories sc ON sc.id = p.subcategoria_id
                ${PLAZAS_JOIN}
                WHERE p.project_id = $1 ${categoryFilter}`;
  const sql = includeInactive
    ? base + ' ORDER BY p.created_at DESC'
    : base + ' AND p.active = true ORDER BY p.created_at DESC';
  const { rows } = await query(sql, params);
  return rows;
}

export async function findById(id) {
  const { rows } = await query(
    `SELECT p.*, ${PLAZAS_COLS} FROM products p ${PLAZAS_JOIN} WHERE p.id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function create({ projectId, nombre, descripcion, categoria_id, subcategoria_id, precio, moneda, stripe_link, sku, duracion, url_info, regimen_fiscal_id }) {
  const { rows } = await query(
    `INSERT INTO products (project_id, nombre, descripcion, categoria_id, subcategoria_id, precio, moneda, stripe_link, sku, duracion, url_info, regimen_fiscal_id)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'EUR'), $8, $9, $10, $11, $12)
     RETURNING *`,
    [projectId, nombre, descripcion, categoria_id || null, subcategoria_id || null,
     precio ?? null, moneda || null, stripe_link || null, sku || null, duracion || null, url_info || null, regimen_fiscal_id || null]
  );
  return rows[0];
}

export async function update(id, data) {
  const allowed = ['nombre', 'descripcion', 'categoria_id', 'subcategoria_id',
                   'precio', 'moneda', 'stripe_link', 'sku', 'duracion', 'url_info',
                   'image_url', 'regimen_fiscal_id',
                   'horas', 'num_modulos', 'modalidad', 'fecha_inicio_texto',
                   'plazas_totales', 'plazas_ocupadas_previas', 'fecha_cierre_convocatoria',
                   'presentacion_texto', 'objetivos_texto', 'beneficios_texto',
                   'dirigido_a_texto', 'para_que_te_prepara_texto', 'por_que_estudiar_texto',
                   'modulos_texto', 'metodologia_texto', 'faqs_texto', 'profesores_texto'];
  const fields = [];
  const values = [];
  let idx = 1;

  for (const k of allowed) {
    if (data[k] !== undefined) { fields.push(`${k} = $${idx++}`); values.push(data[k]); }
  }

  if (fields.length === 0) return findById(id);

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await query(
    `UPDATE products SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return rows[0];
}

export async function deactivate(id) {
  const { rows } = await query(
    `UPDATE products SET active = false, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [id]
  );
  return rows[0];
}

export async function findByProjectAndName(projectId, nombre) {
  const { rows } = await query(
    `SELECT * FROM products WHERE project_id = $1 AND nombre = $2 AND active = true`,
    [projectId, nombre]
  );
  return rows[0] || null;
}
