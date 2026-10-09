import { query, getClient } from '../../shared/config/db.js';

export async function findAllCustomRoles() {
  const { rows } = await query(
    `SELECT id, label, description, base_role, permissions, active, created_at
     FROM custom_roles
     ORDER BY label`
  );
  return rows;
}

export async function findCustomRoleById(id) {
  const { rows } = await query(
    `SELECT id, label, description, base_role, permissions, active, created_at
     FROM custom_roles WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function createCustomRole({ label, description, base_role, permissions }) {
  const { rows } = await query(
    `INSERT INTO custom_roles (label, description, base_role, permissions)
     VALUES ($1, $2, $3, $4)
     RETURNING id, label, description, base_role, permissions, active, created_at`,
    [label, description || null, base_role || 'gestor', JSON.stringify(permissions || {})]
  );
  return rows[0];
}

export async function updateCustomRole(id, { label, description, base_role, permissions, active }) {
  const fields = [];
  const values = [];
  let i = 1;

  if (label !== undefined)       { fields.push(`label = $${i++}`);       values.push(label); }
  if (description !== undefined) { fields.push(`description = $${i++}`); values.push(description); }
  if (base_role !== undefined)   { fields.push(`base_role = $${i++}`);   values.push(base_role); }
  if (permissions !== undefined) { fields.push(`permissions = $${i++}`); values.push(JSON.stringify(permissions)); }
  if (active !== undefined)      { fields.push(`active = $${i++}`);      values.push(active); }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const { rows } = await query(
    `UPDATE custom_roles SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] || null;
}

export async function deleteCustomRole(id) {
  const { rows: users } = await query(
    `SELECT id FROM users WHERE custom_role_id = $1 LIMIT 1`,
    [id]
  );
  if (users.length > 0) return { error: 'HAS_USERS' };

  await query(`DELETE FROM custom_roles WHERE id = $1`, [id]);
  return { ok: true };
}

export async function getOverridesByUser(userId) {
  const { rows } = await query(
    `SELECT resource, action, allowed FROM user_permission_overrides WHERE user_id = $1 ORDER BY resource, action`,
    [userId]
  );
  return rows;
}

export async function saveOverridesForUser(userId, overrides) {
  // overrides: [{ resource, action, allowed }]
  // Reemplaza todos los overrides del usuario en una transacción
  await query(`DELETE FROM user_permission_overrides WHERE user_id = $1`, [userId]);

  if (!overrides || overrides.length === 0) return;

  const values = overrides.flatMap(({ resource, action, allowed }) => [userId, resource, action, allowed]);
  const placeholders = overrides.map((_, i) => `($${i * 4 + 1}, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4})`).join(', ');

  await query(
    `INSERT INTO user_permission_overrides (user_id, resource, action, allowed) VALUES ${placeholders}`,
    values
  );
}

/**
 * Lo que se ha cambiado desde Roles para estos roles del sistema (migración
 * 197). Sin la tabla todavía —servidor sin migrar— cada rol se queda con lo
 * que dice el código, igual que antes.
 */
export async function getRoleOverrides(roles) {
  const lista = [...new Set((roles || []).filter(Boolean))];
  if (!lista.length) return [];
  try {
    const { rows } = await query(
      `SELECT role, resource, action, allowed FROM role_permission_overrides
        WHERE role = ANY($1::text[]) ORDER BY role, resource, action`,
      [lista]
    );
    return rows;
  } catch (err) {
    if (err.code === '42P01') return [];
    throw err;
  }
}

/**
 * Deja los permisos de un recurso de un rol exactamente así: borra los que
 * había de ese recurso e inserta los nuevos, en una transacción.
 */
export async function saveRoleOverrides(role, resource, filas, updatedBy) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM role_permission_overrides WHERE role = $1 AND resource = $2', [role, resource]);
    for (const { action, allowed } of filas) {
      await client.query(
        `INSERT INTO role_permission_overrides (role, resource, action, allowed, updated_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [role, resource, action, allowed, updatedBy]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Cambia algunas claves de un rol a medida sin tocar el resto de su JSON. */
export async function mergeCustomRolePermissions(id, cambios) {
  const { rows } = await query(
    `UPDATE custom_roles SET permissions = COALESCE(permissions, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
      WHERE id = $1 RETURNING id, label, base_role, permissions`,
    [id, JSON.stringify(cambios)]
  );
  return rows[0] || null;
}

export async function getUserCustomRoleId(userId) {
  const { rows } = await query(
    `SELECT custom_role_id FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0]?.custom_role_id ?? null;
}
