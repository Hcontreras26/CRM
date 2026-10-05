-- Tablero de tareas del equipo (Trello / Kanban) · Fase 1
--
-- Diego, 05/10: «Columnas fijas: Por hacer · En curso · En revisión · Hecha.
-- Valores por_hacer, en_curso, en_revision y hecha. Prioridad: baja, media, alta.
-- Estado y prioridad con VARCHAR y CHECK, nunca ENUM. Posición con NUMERIC
-- (punto medio entre vecinas). Borrar = archivar (archived_at).
-- Índices: (assigned_to, status, position) y project_id.»

BEGIN;

CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'por_hacer'
        CHECK (status IN ('por_hacer', 'en_curso', 'en_revision', 'hecha')),
    position NUMERIC(12, 4) NOT NULL DEFAULT 1000.0000,
    priority VARCHAR(20) NOT NULL DEFAULT 'media'
        CHECK (priority IN ('baja', 'media', 'alta')),
    due_date TIMESTAMPTZ,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices de consulta del tablero por persona y proyecto
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status_pos ON tasks(assigned_to, status, position) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON tasks(created_by) WHERE archived_at IS NULL;

-- Historial de eventos de la tarea
CREATE TABLE IF NOT EXISTS task_events (
    id BIGSERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(50) NOT NULL, -- 'created', 'status_changed', 'assigned', 'updated', 'archived'
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id, created_at DESC);

-- Permisos para el usuario de la aplicación
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON tasks, task_events TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE tasks_id_seq, task_events_id_seq TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
