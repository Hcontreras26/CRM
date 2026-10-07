import { query, getClient } from '../../shared/config/db.js';

// Quien tiene tablero de tareas. Los tutores no: entran con el rol colaborador.
export const ROLES_TAREAS = ['superadmin', 'admin', 'gestor', 'soporte', 'project_manager', 'colaborador'];

const CON_TABLERO = `(u.role::text = ANY($ROLES::text[]) OR u.roles_extra::text[] && $ROLES::text[])`;
const conTablero = (n) => CON_TABLERO.replaceAll('$ROLES', `$${n}`);

// Las columnas de una tarjeta. `position` es NUMERIC y pg lo devolveria como
// texto: se pasa a numero para que el tablero pueda calcular puntos medios.
const COLUMNAS = `
  t.id,
  t.title,
  t.description,
  t.status,
  t.position::float8 AS position,
  t.priority,
  t.due_date,
  t.project_id,
  p.nombre AS project_name,
  t.external_project_id,
  ep.name AS external_project_name,
  ep.color AS external_project_color,
  t.area_id,
  ar.name AS area_name,
  ar.color AS area_color,
  t.assigned_to,
  u_assign.nombre AS assigned_to_name,
  u_assign.email AS assigned_to_email,
  t.created_by,
  u_create.nombre AS created_by_name,
  t.completed_at,
  t.archived_at,
  t.created_at,
  t.updated_at`;

const JOINS = `
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN task_external_projects ep ON ep.id = t.external_project_id
  LEFT JOIN task_areas ar ON ar.id = t.area_id
  LEFT JOIN users u_assign ON u_assign.id = t.assigned_to
  LEFT JOIN users u_create ON u_create.id = t.created_by`;

export async function findTasks({
  assigned_to, project_id, external_project_id, area_id, status, priority, search, tag, vencidas, desde, hasta,
  incluir_archivadas = false,
}) {
  const conditions = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    conditions.push(sql.replaceAll('$?', `$${params.length}`));
  };

  if (!incluir_archivadas) conditions.push('t.archived_at IS NULL');
  if (assigned_to != null) add('t.assigned_to = $?', assigned_to);
  if (project_id != null) add('t.project_id = $?', project_id);
  if (external_project_id != null) add('t.external_project_id = $?', external_project_id);
  if (area_id != null) add('t.area_id = $?', area_id);
  if (status) add('t.status = $?', status);
  if (priority) add('t.priority = $?', priority);
  if (search) add('(t.title ILIKE $? OR t.description ILIKE $?)', `%${search}%`);
  if (tag) add('EXISTS (SELECT 1 FROM task_tags tg WHERE tg.task_id = t.id AND LOWER(tg.name) = LOWER($?))', tag);
  if (vencidas) conditions.push(`t.due_date < NOW() AND t.status <> 'hecha'`);
  // El rango es de dias enteros: «hasta el 31» incluye todo el 31.
  if (desde) add('t.due_date >= $?::date', desde);
  if (hasta) add(`t.due_date < ($?::date + INTERVAL '1 day')`, hasta);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT ${COLUMNAS},
      (SELECT COUNT(*)::int FROM task_checklist_items ci WHERE ci.task_id = t.id) AS checklist_total,
      (SELECT COUNT(*)::int FROM task_checklist_items ci WHERE ci.task_id = t.id AND ci.is_completed) AS checklist_completed,
      (SELECT COUNT(*)::int FROM task_comments cm WHERE cm.task_id = t.id) AS comments_count,
      (SELECT COUNT(*)::int FROM task_links lk WHERE lk.task_id = t.id) AS links_count,
      (SELECT cm.content FROM task_comments cm WHERE cm.task_id = t.id ORDER BY cm.created_at DESC, cm.id DESC LIMIT 1) AS last_comment,
      COALESCE((
        SELECT json_agg(json_build_object('id', tg.id, 'name', tg.name, 'color', tg.color) ORDER BY tg.id)
        FROM task_tags tg WHERE tg.task_id = t.id
      ), '[]'::json) AS tags
    ${JOINS}
    ${whereClause}
    ORDER BY t.position ASC, t.created_at DESC
  `;

  const { rows } = await query(sql, params);
  return rows;
}

export async function findTaskById(id) {
  const { rows } = await query(
    `SELECT ${COLUMNAS},
       (SELECT cm.content FROM task_comments cm WHERE cm.task_id = t.id ORDER BY cm.created_at DESC, cm.id DESC LIMIT 1) AS last_comment
     ${JOINS} WHERE t.id = $1`,
    [id]
  );
  return rows[0] || null;
}

/** La posicion actual de una tarjeta, solo si sigue viva. */
export async function findPosition(id) {
  const { rows } = await query(
    `SELECT position::float8 AS position, status, assigned_to
       FROM tasks WHERE id = $1 AND archived_at IS NULL`,
    [id]
  );
  return rows[0] || null;
}

export async function getMaxPosition(status, assigned_to = null) {
  const { rows } = await query(
    `SELECT COALESCE(MAX(position), 0)::float8 AS max_pos
       FROM tasks
      WHERE status = $1 AND archived_at IS NULL AND assigned_to IS NOT DISTINCT FROM $2`,
    [status, assigned_to]
  );
  return Number(rows[0]?.max_pos || 0);
}

/**
 * Encuentra de forma exacta las posiciones de las tarjetas anterior y siguiente
 * en la misma columna y para el mismo responsable, evitando saltos indebidos si
 * los IDs del frontal estuviesen desfasados.
 */
export async function findNeighbors(status, assigned_to, { prev_id, next_id }) {
  let prevPos = null;
  let nextPos = null;

  if (next_id) {
    const nextTask = await findPosition(next_id);
    if (nextTask && nextTask.status === status && nextTask.assigned_to === assigned_to) {
      nextPos = nextTask.position;
      const { rows } = await query(
        `SELECT position::float8 AS position
           FROM tasks
          WHERE status = $1 AND archived_at IS NULL AND assigned_to IS NOT DISTINCT FROM $2
            AND position < $3
          ORDER BY position DESC
          LIMIT 1`,
        [status, assigned_to, nextPos]
      );
      if (rows[0]) {
        prevPos = rows[0].position;
      }
    }
  }

  if (prevPos == null && prev_id) {
    const prevTask = await findPosition(prev_id);
    if (prevTask && prevTask.status === status && prevTask.assigned_to === assigned_to) {
      prevPos = prevTask.position;
      if (nextPos == null) {
        const { rows } = await query(
          `SELECT position::float8 AS position
             FROM tasks
            WHERE status = $1 AND archived_at IS NULL AND assigned_to IS NOT DISTINCT FROM $2
              AND position > $3
            ORDER BY position ASC
            LIMIT 1`,
          [status, assigned_to, prevPos]
        );
        if (rows[0]) {
          nextPos = rows[0].position;
        }
      }
    }
  }

  return { prevPos, nextPos };
}

/**
 * Vuelve a repartir las posiciones de una columna con huecos de 1.000.
 */
export async function renumberColumn(status, assigned_to) {
  await query(
    `UPDATE tasks t
        SET position = s.rn * 1000
       FROM (
         SELECT id, ROW_NUMBER() OVER (ORDER BY position ASC, created_at DESC) AS rn
           FROM tasks
          WHERE status = $1 AND archived_at IS NULL AND assigned_to IS NOT DISTINCT FROM $2
       ) s
      WHERE t.id = s.id`,
    [status, assigned_to]
  );
}

export async function createTask(data) {
  const {
    title,
    description = null,
    status = 'por_hacer',
    position = 1000.0,
    priority = 'media',
    due_date = null,
    project_id = null,
    external_project_id = null,
    area_id = null,
    assigned_to = null,
    created_by,
    completed_at = null,
  } = data;

  const { rows } = await query(
    `INSERT INTO tasks (
       title, description, status, position, priority,
       due_date, project_id, external_project_id, area_id, assigned_to, created_by, completed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [title, description, status, position, priority, due_date, project_id, external_project_id, area_id, assigned_to, created_by, completed_at]
  );
  return findTaskById(rows[0].id);
}

export async function updateTask(id, fields) {
  const allowed = ['title', 'description', 'priority', 'due_date', 'project_id', 'external_project_id', 'area_id', 'assigned_to'];
  const sets = [];
  const params = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      params.push(fields[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }

  if (sets.length === 0) return findTaskById(id);

  sets.push('updated_at = NOW()');
  params.push(id);

  const { rowCount } = await query(
    `UPDATE tasks SET ${sets.join(', ')} WHERE id = $${params.length} AND archived_at IS NULL`,
    params
  );
  return rowCount ? findTaskById(id) : null;
}

export async function updateTaskPositionAndStatus(id, { status, position, completed_at }) {
  const { rowCount } = await query(
    `UPDATE tasks
        SET status = $1, position = $2, completed_at = $3, updated_at = NOW()
      WHERE id = $4 AND archived_at IS NULL`,
    [status, position, completed_at, id]
  );
  return rowCount ? findTaskById(id) : null;
}

export async function archiveTask(id) {
  const { rowCount } = await query(
    `UPDATE tasks SET archived_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND archived_at IS NULL`,
    [id]
  );
  return rowCount ? findTaskById(id) : null;
}

/**
 * Devolver tarea atómicamente: en una única transacción de Postgres
 * pasa a «en_curso», inserta el comentario obligatorio y registra los eventos.
 */
export async function returnTaskAtomic({ taskId, comment, user }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows: taskRows } = await client.query(
      `SELECT * FROM tasks WHERE id = $1 AND archived_at IS NULL FOR UPDATE`,
      [taskId]
    );
    const task = taskRows[0];
    if (!task) {
      await client.query('ROLLBACK');
      return null;
    }

    // Calcular posición al final de «en_curso»
    const { rows: posRows } = await client.query(
      `SELECT COALESCE(MAX(position), 0)::float8 AS max_pos
         FROM tasks
        WHERE status = 'en_curso' AND archived_at IS NULL AND assigned_to IS NOT DISTINCT FROM $1`,
      [task.assigned_to]
    );
    const newPos = Number(posRows[0]?.max_pos || 0) + 1000;

    await client.query(
      `UPDATE tasks
          SET status = 'en_curso', position = $1, completed_at = NULL, updated_at = NOW()
        WHERE id = $2`,
      [newPos, taskId]
    );

    const { rows: commentRows } = await client.query(
      `INSERT INTO task_comments (task_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [taskId, user.userId, comment]
    );

    await client.query(
      `INSERT INTO task_events (task_id, user_id, event_type, details)
       VALUES ($1, $2, 'status_changed', $3)`,
      [
        taskId,
        user.userId,
        JSON.stringify({
          old_status: task.status,
          new_status: 'en_curso',
          motivo: comment,
        }),
      ]
    );

    await client.query(
      `INSERT INTO task_events (task_id, user_id, event_type, details)
       VALUES ($1, $2, 'comment', $3)`,
      [taskId, user.userId, JSON.stringify({ comment_id: commentRows[0].id })]
    );

    await client.query('COMMIT');

    const updatedTask = await findTaskById(taskId);
    return { task: updatedTask, comment: commentRows[0], oldTask: task };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* --- Historial --- */

export async function createTaskEvent({ task_id, user_id, event_type, details = {} }) {
  const { rows } = await query(
    `INSERT INTO task_events (task_id, user_id, event_type, details)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [task_id, user_id, event_type, JSON.stringify(details)]
  );
  return rows[0];
}

export async function findTaskEvents(task_id) {
  const { rows } = await query(
    `SELECT te.id, te.task_id, te.user_id, u.nombre AS user_name,
            te.event_type, te.details, te.created_at
       FROM task_events te
       LEFT JOIN users u ON u.id = te.user_id
      WHERE te.task_id = $1
      ORDER BY te.created_at DESC, te.id DESC`,
    [task_id]
  );
  return rows;
}

/* --- Lista de comprobacion --- */

export async function findChecklistItems(task_id) {
  const { rows } = await query(
    `SELECT id, task_id, title, is_completed, position::float8 AS position, created_at, updated_at
       FROM task_checklist_items
      WHERE task_id = $1
      ORDER BY position ASC, id ASC`,
    [task_id]
  );
  return rows;
}

export async function createChecklistItem({ task_id, title }) {
  const { rows } = await query(
    `INSERT INTO task_checklist_items (task_id, title, position)
     VALUES ($1, $2, (SELECT COALESCE(MAX(position), 0) + 1000 FROM task_checklist_items WHERE task_id = $1))
     RETURNING id, task_id, title, is_completed, position::float8 AS position, created_at, updated_at`,
    [task_id, title]
  );
  return rows[0];
}

export async function updateChecklistItem(task_id, id, fields) {
  const allowed = ['title', 'is_completed'];
  const sets = [];
  const params = [];

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      params.push(fields[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) return null;

  sets.push('updated_at = NOW()');
  params.push(id, task_id);

  const { rows } = await query(
    `UPDATE task_checklist_items
        SET ${sets.join(', ')}
      WHERE id = $${params.length - 1} AND task_id = $${params.length}
      RETURNING id, task_id, title, is_completed, position::float8 AS position, created_at, updated_at`,
    params
  );
  return rows[0] || null;
}

export async function deleteChecklistItem(task_id, id) {
  const { rows } = await query(
    'DELETE FROM task_checklist_items WHERE id = $1 AND task_id = $2 RETURNING id, title',
    [id, task_id]
  );
  return rows[0] || null;
}

/* --- Comentarios --- */

export async function findComments(task_id) {
  const { rows } = await query(
    `SELECT c.id, c.task_id, c.user_id, u.nombre AS user_name, u.avatar_url AS user_avatar,
            c.content, c.created_at, c.updated_at
       FROM task_comments c
       JOIN users u ON u.id = c.user_id
      WHERE c.task_id = $1
      ORDER BY c.created_at ASC, c.id ASC`,
    [task_id]
  );
  return rows;
}

export async function findComment(task_id, id) {
  const { rows } = await query(
    'SELECT id, task_id, user_id FROM task_comments WHERE id = $1 AND task_id = $2',
    [id, task_id]
  );
  return rows[0] || null;
}

export async function createComment({ task_id, user_id, content }) {
  const { rows } = await query(
    `INSERT INTO task_comments (task_id, user_id, content)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [task_id, user_id, content]
  );
  return rows[0];
}

export async function deleteComment(task_id, id) {
  const { rows } = await query(
    'DELETE FROM task_comments WHERE id = $1 AND task_id = $2 RETURNING id',
    [id, task_id]
  );
  return rows[0] || null;
}

/* --- Etiquetas --- */

export async function findTags(task_id) {
  const { rows } = await query(
    `SELECT id, task_id, name, color, created_at
       FROM task_tags
      WHERE task_id = $1
      ORDER BY id ASC`,
    [task_id]
  );
  return rows;
}

export async function createTag({ task_id, name, color = 'sky' }) {
  const { rows } = await query(
    `INSERT INTO task_tags (task_id, name, color)
     VALUES ($1, $2, $3)
     ON CONFLICT (task_id, LOWER(name)) DO UPDATE SET color = EXCLUDED.color
     RETURNING *`,
    [task_id, name, color]
  );
  return rows[0];
}

export async function deleteTag(task_id, id) {
  const { rows } = await query(
    'DELETE FROM task_tags WHERE id = $1 AND task_id = $2 RETURNING id, name',
    [id, task_id]
  );
  return rows[0] || null;
}

/** Los nombres de etiqueta que se pueden elegir en el filtro del tablero. */
export async function findTagNames({ assigned_to = null } = {}) {
  const params = [];
  let filtro = '';
  if (assigned_to != null) {
    params.push(assigned_to);
    filtro = 'AND t.assigned_to = $1';
  }
  const { rows } = await query(
    `SELECT MIN(tg.name) AS name, COUNT(*)::int AS total
       FROM task_tags tg
       JOIN tasks t ON t.id = tg.task_id
      WHERE t.archived_at IS NULL ${filtro}
      GROUP BY LOWER(tg.name)
      ORDER BY MIN(tg.name)`,
    params
  );
  return rows;
}

/* --- Enlaces --- */

export async function findLinks(task_id) {
  const { rows } = await query(
    `SELECT l.id, l.task_id, l.url, l.title, l.created_by, u.nombre AS created_by_name, l.created_at
       FROM task_links l
       LEFT JOIN users u ON u.id = l.created_by
      WHERE l.task_id = $1
      ORDER BY l.id ASC`,
    [task_id]
  );
  return rows;
}

export async function createLink({ task_id, url, title = null, created_by }) {
  const { rows } = await query(
    `INSERT INTO task_links (task_id, url, title, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [task_id, url, title, created_by]
  );
  return rows[0];
}

export async function deleteLink(task_id, id) {
  const { rows } = await query(
    'DELETE FROM task_links WHERE id = $1 AND task_id = $2 RETURNING id, url',
    [id, task_id]
  );
  return rows[0] || null;
}

/* --- Personas --- */

export async function findAssignees() {
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.email, u.role
       FROM users u
      WHERE u.active AND ${conTablero(1)}
      ORDER BY u.nombre ASC`,
    [ROLES_TAREAS]
  );
  return rows;
}

export async function findUserBasic(id) {
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.email, u.active,
            (u.role::text = ANY($2::text[]) OR u.roles_extra::text[] && $2::text[]) AS con_tablero
       FROM users u WHERE u.id = $1`,
    [id, ROLES_TAREAS]
  );
  return rows[0] || null;
}

/* --- Todo el equipo y métricas --- */

export async function getTeamMetrics(projectId = null, areaId = null) {
  const params = [ROLES_TAREAS];
  let filtroProyecto = '';
  let filtroArea = '';

  if (projectId) {
    params.push(projectId);
    filtroProyecto = `AND t.project_id = $${params.length}`;
  }
  if (areaId) {
    params.push(areaId);
    filtroArea = `AND t.area_id = $${params.length}`;
  }

  const { rows } = await query(
    `SELECT
       u.id AS user_id,
       u.nombre AS user_name,
       u.email AS user_email,
       u.role AS user_role,
       COUNT(t.id) FILTER (WHERE t.archived_at IS NULL AND t.status <> 'hecha')::int AS open_tasks,
       COUNT(t.id) FILTER (WHERE t.archived_at IS NULL AND t.status <> 'hecha' AND t.due_date < NOW())::int AS overdue_tasks,
       COUNT(t.id) FILTER (WHERE t.status = 'hecha' AND t.completed_at >= date_trunc('week', NOW()))::int AS completed_this_week,
       COUNT(t.id) FILTER (WHERE t.status = 'hecha' AND t.completed_at >= date_trunc('month', NOW()))::int AS completed_this_month
     FROM users u
     LEFT JOIN tasks t ON t.assigned_to = u.id ${filtroProyecto} ${filtroArea}
     WHERE u.active AND ${conTablero(1)}
     GROUP BY u.id, u.nombre, u.email, u.role
     ORDER BY open_tasks DESC, u.nombre ASC`,
    params
  );
  return rows;
}

/* --- Columnas dinámicas --- */

export async function findActiveColumns() {
  const { rows } = await query(
    `SELECT id, key, name, color, sort_order, is_system, is_active, created_at, updated_at
       FROM task_columns
      WHERE is_active = true
      ORDER BY sort_order ASC, id ASC`
  );
  return rows;
}

export async function findAllColumns() {
  const { rows } = await query(
    `SELECT id, key, name, color, sort_order, is_system, is_active, created_at, updated_at
       FROM task_columns
      ORDER BY sort_order ASC, id ASC`
  );
  return rows;
}

export async function findColumnByKey(key) {
  const { rows } = await query(`SELECT * FROM task_columns WHERE key = $1`, [key]);
  return rows[0] || null;
}

export async function findColumnById(id) {
  const { rows } = await query(`SELECT * FROM task_columns WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function countTasksInColumn(key) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS total FROM tasks WHERE status = $1 AND archived_at IS NULL`,
    [key]
  );
  return rows[0]?.total || 0;
}

export async function createColumn({ key, name, color = 'gray', sort_order = 0 }) {
  const { rows } = await query(
    `INSERT INTO task_columns (key, name, color, sort_order, is_system, is_active)
     VALUES ($1, $2, $3, $4, FALSE, TRUE)
     RETURNING *`,
    [key, name, color, sort_order]
  );
  return rows[0];
}

export async function updateColumn(id, fields) {
  const allowed = ['name', 'color', 'sort_order', 'is_active'];
  const sets = [];
  const params = [];

  for (const k of allowed) {
    if (fields[k] !== undefined) {
      params.push(fields[k]);
      sets.push(`${k} = $${params.length}`);
    }
  }
  if (sets.length === 0) return findColumnById(id);

  sets.push('updated_at = NOW()');
  params.push(id);

  const { rows } = await query(
    `UPDATE task_columns SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return rows[0] || null;
}

export async function reorderColumns(keys) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < keys.length; i++) {
      await client.query(
        `UPDATE task_columns SET sort_order = $1, updated_at = NOW() WHERE key = $2`,
        [(i + 1) * 10, keys[i]]
      );
    }
    await client.query('COMMIT');
    return findActiveColumns();
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* --- Áreas de trabajo --- */

export async function findActiveAreas() {
  const { rows } = await query(
    `SELECT id, name, color, sort_order, is_active, created_at, updated_at
       FROM task_areas
      WHERE is_active = true
      ORDER BY sort_order ASC, id ASC`
  );
  return rows;
}

export async function findAllAreas() {
  const { rows } = await query(
    `SELECT id, name, color, sort_order, is_active, created_at, updated_at
       FROM task_areas
      ORDER BY sort_order ASC, id ASC`
  );
  return rows;
}

export async function findAreaById(id) {
  const { rows } = await query(`SELECT * FROM task_areas WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function createArea({ name, color = 'gray', sort_order = 0 }) {
  const { rows } = await query(
    `INSERT INTO task_areas (name, color, sort_order, is_active)
     VALUES ($1, $2, $3, TRUE)
     RETURNING *`,
    [name, color, sort_order]
  );
  return rows[0];
}

export async function updateArea(id, fields) {
  const allowed = ['name', 'color', 'sort_order', 'is_active'];
  const sets = [];
  const params = [];

  for (const k of allowed) {
    if (fields[k] !== undefined) {
      params.push(fields[k]);
      sets.push(`${k} = $${params.length}`);
    }
  }
  if (sets.length === 0) return findAreaById(id);

  sets.push('updated_at = NOW()');
  params.push(id);

  const { rows } = await query(
    `UPDATE task_areas SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return rows[0] || null;
}

export async function getUserAreas(userId) {
  const { rows } = await query(
    `SELECT ta.id, ta.name, ta.color, ta.sort_order
       FROM user_task_areas uta
       JOIN task_areas ta ON ta.id = uta.area_id
      WHERE uta.user_id = $1 AND ta.is_active = true
      ORDER BY ta.sort_order ASC`,
    [userId]
  );
  return rows;
}

export async function getUserAreaAssignments() {
  const { rows } = await query(
    `SELECT user_id, area_id FROM user_task_areas`
  );
  return rows;
}

export async function setUserAreas(userId, areaIds) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM user_task_areas WHERE user_id = $1`, [userId]);
    for (const areaId of areaIds) {
      await client.query(
        `INSERT INTO user_task_areas (user_id, area_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, areaId]
      );
    }
    await client.query('COMMIT');
    return getUserAreas(userId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* --- Proyectos Propios (Externos) --- */

export async function findActiveExternalProjects() {
  const { rows } = await query(
    `SELECT id, name, description, color, is_active, created_at, updated_at
       FROM task_external_projects
      WHERE is_active = true
      ORDER BY name ASC`
  );
  return rows;
}

export async function findAllExternalProjects() {
  const { rows } = await query(
    `SELECT id, name, description, color, is_active, created_at, updated_at
       FROM task_external_projects
      ORDER BY name ASC`
  );
  return rows;
}

export async function findExternalProjectById(id) {
  const { rows } = await query(`SELECT * FROM task_external_projects WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function createExternalProject({ name, description = null, color = 'gray' }) {
  const { rows } = await query(
    `INSERT INTO task_external_projects (name, description, color, is_active)
     VALUES ($1, $2, $3, TRUE)
     RETURNING *`,
    [name, description, color]
  );
  return rows[0];
}

export async function updateExternalProject(id, fields) {
  const allowed = ['name', 'description', 'color', 'is_active'];
  const sets = [];
  const params = [];

  for (const k of allowed) {
    if (fields[k] !== undefined) {
      params.push(fields[k]);
      sets.push(`${k} = $${params.length}`);
    }
  }
  if (sets.length === 0) return findExternalProjectById(id);

  sets.push('updated_at = NOW()');
  params.push(id);

  const { rows } = await query(
    `UPDATE task_external_projects SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return rows[0] || null;
}

/* --- Correo diario --- */

export async function findDailyDigest(aviso) {
  const { rows } = await query(
    `SELECT u.id AS user_id, u.nombre, u.email,
            json_agg(json_build_object(
              'id', t.id, 'title', t.title, 'status', t.status,
              'priority', t.priority, 'due_date', t.due_date
            ) ORDER BY t.due_date ASC) AS tareas
       FROM users u
       JOIN tasks t ON t.assigned_to = u.id
      WHERE u.active
        AND u.email IS NOT NULL
        AND t.archived_at IS NULL
        AND t.status <> 'hecha'
        AND t.due_date < (CURRENT_DATE + INTERVAL '1 day')
        AND NOT EXISTS (
          SELECT 1 FROM avisos_apagados a WHERE a.user_id = u.id AND a.aviso = $1
        )
      GROUP BY u.id, u.nombre, u.email
      ORDER BY u.nombre`,
    [aviso]
  );
  return rows;
}

export async function avisoApagado(userId, aviso) {
  const { rows } = await query(
    'SELECT 1 FROM avisos_apagados WHERE user_id = $1 AND aviso = $2',
    [userId, aviso]
  );
  return rows.length > 0;
}
