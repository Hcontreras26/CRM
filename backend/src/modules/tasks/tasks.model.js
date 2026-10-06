import { query } from '../../shared/config/db.js';

// Quien tiene tablero de tareas. Los tutores no: entran con el rol colaborador.
// Se compara como texto (`role::text`) a proposito: si un valor no estuviera en
// el ENUM `user_role`, una lista literal tumbaria la consulta entera con
// «invalid input value for enum»; como texto, simplemente no coincide.
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
  LEFT JOIN users u_assign ON u_assign.id = t.assigned_to
  LEFT JOIN users u_create ON u_create.id = t.created_by`;

export async function findTasks({
  assigned_to, project_id, status, priority, search, tag, vencidas, desde, hasta,
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
  const { rows } = await query(`SELECT ${COLUMNAS} ${JOINS} WHERE t.id = $1`, [id]);
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
 * Vuelve a repartir las posiciones de una columna con huecos de 1.000.
 *
 * Soltar siempre entre las dos mismas tarjetas parte el hueco por la mitad cada
 * vez; con NUMERIC(12,4) se agota tras unas trece. Solo entonces se renumera,
 * y solo esa columna de esa persona: mover una tarjeta no reescribe las demas.
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
    assigned_to = null,
    created_by,
    completed_at = null,
  } = data;

  const { rows } = await query(
    `INSERT INTO tasks (
       title, description, status, position, priority,
       due_date, project_id, assigned_to, created_by, completed_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [title, description, status, position, priority, due_date, project_id, assigned_to, created_by, completed_at]
  );
  return findTaskById(rows[0].id);
}

export async function updateTask(id, fields) {
  const allowed = ['title', 'description', 'priority', 'due_date', 'project_id', 'assigned_to'];
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
// Todo lo que toca un elemento va acotado por `task_id`: el acceso se comprueba
// sobre la tarea de la URL, y sin esto un id de otra tarea se colaba.

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

/** A quien se le puede asignar una tarea: activos y con tablero. */
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

/* --- Todo el equipo (fase 4) --- */

export async function getTeamMetrics(projectId = null) {
  const params = [ROLES_TAREAS];
  let filtroProyecto = '';
  if (projectId) {
    params.push(projectId);
    filtroProyecto = 'AND t.project_id = $2';
  }

  const { rows } = await query(
    `SELECT
       u.id AS user_id,
       u.nombre AS user_name,
       u.email AS user_email,
       u.role AS user_role,
       -- Abiertas y vencidas: lo que sigue en el tablero.
       COUNT(t.id) FILTER (WHERE t.archived_at IS NULL AND t.status <> 'hecha')::int AS open_tasks,
       COUNT(t.id) FILTER (WHERE t.archived_at IS NULL AND t.status <> 'hecha' AND t.due_date < NOW())::int AS overdue_tasks,
       -- Cerradas: tambien las archivadas. Archivar en vez de borrar es
       -- justo para que lo completado se siga contando.
       COUNT(t.id) FILTER (WHERE t.status = 'hecha' AND t.completed_at >= date_trunc('week', NOW()))::int AS completed_this_week,
       COUNT(t.id) FILTER (WHERE t.status = 'hecha' AND t.completed_at >= date_trunc('month', NOW()))::int AS completed_this_month
     FROM users u
     LEFT JOIN tasks t ON t.assigned_to = u.id ${filtroProyecto}
     WHERE u.active AND ${conTablero(1)}
     GROUP BY u.id, u.nombre, u.email, u.role
     ORDER BY open_tasks DESC, u.nombre ASC`,
    params
  );
  return rows;
}

/* --- Correo diario (fase 3) --- */

/**
 * Para el correo de cada mañana: por persona, lo que vence hoy y lo vencido.
 * Fuera quien lo haya apagado en «Mis preferencias».
 */
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

/** Si esta persona ha apagado este aviso por correo. */
export async function avisoApagado(userId, aviso) {
  const { rows } = await query(
    'SELECT 1 FROM avisos_apagados WHERE user_id = $1 AND aviso = $2',
    [userId, aviso]
  );
  return rows.length > 0;
}
