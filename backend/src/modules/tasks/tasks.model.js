import { query } from '../../shared/config/db.js';

export async function findTasks({ assigned_to, project_id, status, priority, search, incluir_archivadas = false }) {
  const conditions = [];
  const params = [];
  let pIdx = 1;

  if (!incluir_archivadas) {
    conditions.push('t.archived_at IS NULL');
  }

  if (assigned_to !== undefined && assigned_to !== null) {
    conditions.push(`t.assigned_to = $${pIdx++}`);
    params.push(assigned_to);
  }

  if (project_id !== undefined && project_id !== null) {
    conditions.push(`t.project_id = $${pIdx++}`);
    params.push(project_id);
  }

  if (status) {
    conditions.push(`t.status = $${pIdx++}`);
    params.push(status);
  }

  if (priority) {
    conditions.push(`t.priority = $${pIdx++}`);
    params.push(priority);
  }

  if (search) {
    conditions.push(`(t.title ILIKE $${pIdx} OR t.description ILIKE $${pIdx})`);
    params.push(`%${search}%`);
    pIdx++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      t.id,
      t.title,
      t.description,
      t.status,
      t.position,
      t.priority,
      t.due_date,
      t.project_id,
      p.name AS project_name,
      t.assigned_to,
      u_assign.name AS assigned_to_name,
      u_assign.email AS assigned_to_email,
      t.created_by,
      u_create.name AS created_by_name,
      t.completed_at,
      t.archived_at,
      t.created_at,
      t.updated_at
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u_assign ON u_assign.id = t.assigned_to
    LEFT JOIN users u_create ON u_create.id = t.created_by
    ${whereClause}
    ORDER BY t.status, t.position ASC, t.created_at DESC
  `;

  const { rows } = await query(sql, params);
  return rows;
}

export async function findTaskById(id) {
  const sql = `
    SELECT 
      t.id,
      t.title,
      t.description,
      t.status,
      t.position,
      t.priority,
      t.due_date,
      t.project_id,
      p.name AS project_name,
      t.assigned_to,
      u_assign.name AS assigned_to_name,
      u_assign.email AS assigned_to_email,
      t.created_by,
      u_create.name AS created_by_name,
      t.completed_at,
      t.archived_at,
      t.created_at,
      t.updated_at
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    LEFT JOIN users u_assign ON u_assign.id = t.assigned_to
    LEFT JOIN users u_create ON u_create.id = t.created_by
    WHERE t.id = $1
  `;
  const { rows } = await query(sql, [id]);
  return rows[0] || null;
}

export async function getMaxPosition(status, assigned_to = null) {
  const conditions = ['status = $1', 'archived_at IS NULL'];
  const params = [status];

  if (assigned_to !== null && assigned_to !== undefined) {
    conditions.push('assigned_to = $2');
    params.push(assigned_to);
  }

  const sql = `
    SELECT COALESCE(MAX(position), 0) AS max_pos 
    FROM tasks 
    WHERE ${conditions.join(' AND ')}
  `;
  const { rows } = await query(sql, params);
  return parseFloat(rows[0]?.max_pos || 0);
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
  } = data;

  const sql = `
    INSERT INTO tasks (
      title, description, status, position, priority, 
      due_date, project_id, assigned_to, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;
  const params = [
    title,
    description,
    status,
    position,
    priority,
    due_date,
    project_id,
    assigned_to,
    created_by,
  ];
  const { rows } = await query(sql, params);
  return rows[0];
}

export async function updateTask(id, fields) {
  const allowed = ['title', 'description', 'priority', 'due_date', 'project_id', 'assigned_to'];
  const sets = [];
  const params = [];
  let pIdx = 1;

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = $${pIdx++}`);
      params.push(fields[key]);
    }
  }

  if (sets.length === 0) return null;

  sets.push(`updated_at = NOW()`);
  params.push(id);

  const sql = `
    UPDATE tasks 
    SET ${sets.join(', ')}
    WHERE id = $${pIdx} AND archived_at IS NULL
    RETURNING *
  `;
  const { rows } = await query(sql, params);
  return rows[0] || null;
}

export async function updateTaskPositionAndStatus(id, { status, position, completed_at }) {
  const sql = `
    UPDATE tasks 
    SET 
      status = $1,
      position = $2,
      completed_at = $3,
      updated_at = NOW()
    WHERE id = $4 AND archived_at IS NULL
    RETURNING *
  `;
  const { rows } = await query(sql, [status, position, completed_at, id]);
  return rows[0] || null;
}

export async function archiveTask(id) {
  const sql = `
    UPDATE tasks 
    SET archived_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND archived_at IS NULL
    RETURNING *
  `;
  const { rows } = await query(sql, [id]);
  return rows[0] || null;
}

export async function createTaskEvent({ task_id, user_id, event_type, details = {} }) {
  const sql = `
    INSERT INTO task_events (task_id, user_id, event_type, details)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  const { rows } = await query(sql, [task_id, user_id, event_type, JSON.stringify(details)]);
  return rows[0];
}

export async function findTaskEvents(task_id) {
  const sql = `
    SELECT 
      te.id,
      te.task_id,
      te.user_id,
      u.name AS user_name,
      te.event_type,
      te.details,
      te.created_at
    FROM task_events te
    LEFT JOIN users u ON u.id = te.user_id
    WHERE te.task_id = $1
    ORDER BY te.created_at DESC
  `;
  const { rows } = await query(sql, [task_id]);
  return rows;
}
