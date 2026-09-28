import { query } from '../../shared/config/db.js';
import crypto from 'crypto';

export async function findAll({ active }) {
  const where = active === undefined ? '' : `WHERE p.active = ${active === 'true' || active === true}`;
  const columnas = await columnasDeListado();
  const { rows } = await query(
    `SELECT p.id, p.nombre, p.slug, p.type, p.emoji, p.logo_url, p.logo_key, p.producto_label, p.producto_label_plural,
            p.modules, p.shortcuts, p.external_panels, p.sidebar_labels, p.theme_color, p.auto_email_documents,
            p.color_cabecera, p.remitente_no_contestar,
            p.webhook_api_key, p.meta_account_id, p.google_account_id,
            p.gsc_property, p.dias_alerta_inactividad, p.active, p.created_at, p.updated_at,
            p.sociedad_emisora_id, s.razon_social AS sociedad_nombre,
            ${columnas.map((c) => `p.${c}`).join(', ')}
     FROM projects p
     LEFT JOIN invoice_issuers s ON s.id = p.sociedad_emisora_id
     ${where}
     ORDER BY s.razon_social NULLS LAST, p.nombre ASC`
  );
  return rows;
}

/**
 * Que columnas de listado sabe guardar la base AHORA (#8).
 *
 * `lead_columns` existe desde siempre; `client_columns` y `product_columns` las
 * trae la migracion 141, y aqui las migraciones se preparan, no se aplican.
 * Pedir una columna que no existe no degrada: tumba el SELECT entero y con el
 * la pantalla de proyectos.
 *
 * Se cachea porque no cambia sin un despliegue. Ante la duda, solo la de leads:
 * es la que lleva años ahi.
 */
let columnasQueHay = null;
export async function columnasDeListado() {
  if (columnasQueHay) return columnasQueHay;
  try {
    const { rows } = await query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'projects'
          AND column_name IN ('lead_columns', 'client_columns', 'product_columns')`
    );
    columnasQueHay = rows.map((r) => r.column_name);
    if (!columnasQueHay.length) columnasQueHay = ['lead_columns'];
  } catch {
    columnasQueHay = ['lead_columns'];
  }
  return columnasQueHay;
}

/** Solo para las pruebas. */
export function olvidarColumnas() { columnasQueHay = null; }

export async function findById(id) {
  // Las columnas configuradas SE DEVUELVEN.
  //
  // No estaban en ningun SELECT, asi que la pestaña «Columnas» guardaba bien y
  // al volver a abrirla enseñaba la lista por defecto: lo guardado no se leia
  // nunca. Se configuraba, se guardaba, y no servia de nada.
  const columnas = await columnasDeListado();
  const { rows } = await query(
    `SELECT id, nombre, slug, type, emoji, logo_url, logo_key, producto_label, producto_label_plural,
            modules, shortcuts, external_panels, sidebar_labels, theme_color, auto_email_documents,
            color_cabecera, remitente_no_contestar,
            webhook_api_key, meta_account_id, google_account_id,
            gsc_property, dias_alerta_inactividad, active, created_at, updated_at,
            ${columnas.join(', ')}
     FROM projects WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function slugExists(slug, excludeId = null) {
  const params = excludeId ? [slug, excludeId] : [slug];
  const clause = excludeId ? 'AND id != $2' : '';
  const { rows } = await query(
    `SELECT id FROM projects WHERE slug = $1 ${clause}`,
    params
  );
  return rows.length > 0;
}

export async function create(data) {
  const webhookKey = `whk_${data.slug.replace(/-/g, '')}_${crypto.randomUUID()}`;
  const { rows } = await query(
    `INSERT INTO projects (nombre, slug, type, emoji, webhook_api_key, meta_account_id,
                           google_account_id, gsc_property, dias_alerta_inactividad, sociedad_emisora_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [data.nombre, data.slug, data.type, data.emoji, webhookKey, data.meta_account_id,
     data.google_account_id, data.gsc_property, data.dias_alerta_inactividad, data.sociedad_emisora_id ?? null]
  );

  // Inicializar round-robin queue si es CRM
  if (data.type === 'crm') {
    await query(
      `INSERT INTO project_queue_state (project_id, last_assigned_index) VALUES ($1, 0)
       ON CONFLICT DO NOTHING`,
      [rows[0].id]
    );
  }

  return rows[0];
}

export async function update(id, fields) {
  const allowed = ['nombre', 'type', 'emoji', 'meta_account_id', 'google_account_id',
                   'gsc_property', 'dias_alerta_inactividad', 'active',
                   'producto_label', 'producto_label_plural', 'logo_url', 'logo_key', 'modules',
                   'lead_base_fields_config', 'lead_columns', 'client_columns', 'product_columns',
                   'external_panels', 'sidebar_labels',
                   'theme_color', 'auto_email_documents', 'sociedad_emisora_id',
                   // Correos y formularios de la marca (migraciones 177 y 180).
                   'color_cabecera', 'remitente_no_contestar'];
  const sets = [];
  const params = [];
  let idx = 1;
  const jsonbFields = new Set(['modules', 'lead_base_fields_config', 'lead_columns',
    'client_columns', 'product_columns', 'external_panels', 'sidebar_labels']);
  for (const k of allowed) {
    if (fields[k] !== undefined) {
      sets.push(`${k} = $${idx++}`);
      params.push(jsonbFields.has(k) ? JSON.stringify(fields[k]) : fields[k]);
    }
  }
  if (!sets.length) return null;
  sets.push(`updated_at = NOW()`);
  params.push(id);
  const { rows } = await query(`UPDATE projects SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`, params);
  return rows[0];
}

// --- Sociedades emisoras (globales, project_id NULL) para el selector de proyecto ---
export async function listSociedades() {
  const { rows } = await query(
    `SELECT id, razon_social, nif, serie, pais
     FROM invoice_issuers
     WHERE project_id IS NULL AND activo = true
     ORDER BY razon_social ASC`
  );
  return rows;
}

export async function createSociedad({ razon_social, serie, nif, pais }) {
  const { rows } = await query(
    `INSERT INTO invoice_issuers (project_id, razon_social, nif, pais, serie, es_default, activo)
     VALUES (NULL, $1, $2, $3, $4, false, true)
     RETURNING id, razon_social, nif, serie, pais`,
    [razon_social, nif || `PENDIENTE-CIF-${(serie || 'X').toUpperCase()}`, pais || 'España', serie || null]
  );
  return rows[0];
}

export async function regenerateWebhookKey(id) {
  const { rows: r1 } = await query(`SELECT slug FROM projects WHERE id = $1`, [id]);
  if (!r1[0]) return null;
  const newKey = `whk_${r1[0].slug.replace(/-/g, '')}_${crypto.randomUUID()}`;
  const { rows } = await query(
    `UPDATE projects SET webhook_api_key = $1, updated_at = NOW() WHERE id = $2 RETURNING webhook_api_key`,
    [newKey, id]
  );
  return rows[0]?.webhook_api_key || null;
}
