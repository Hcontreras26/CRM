-- Columnas dinámicas, áreas y proyectos propios para el tablero de tareas · Entrega final 07/10
--
-- Añade:
-- 1. task_columns: columnas configurables con clave, nombre, color, orden, is_system y is_active.
-- 2. Elimina la restricción CHECK de 4 valores de tasks(status) y añade FK a task_columns(key).
-- 3. task_areas: áreas configurables con nombre, color, orden y estado activo.
-- 4. user_task_areas: relación M:N entre usuarios y áreas de trabajo.
-- 5. task_external_projects: proyectos propios que no están en la tabla projects.
-- 6. tasks: columnas area_id y external_project_id con constraint exclusivo (project_id IS NULL OR external_project_id IS NULL).
-- 7. task_tags: índice único (task_id, LOWER(name)) para evitar duplicados insensibles a mayúsculas.

BEGIN;

-- 1. Tabla de columnas del tablero
CREATE TABLE IF NOT EXISTS task_columns (
    id SERIAL PRIMARY KEY,
    key VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(30) NOT NULL DEFAULT 'gray',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Semillar las 4 columnas de sistema fijas
INSERT INTO task_columns (key, name, color, sort_order, is_system, is_active)
VALUES
    ('por_hacer', 'Por hacer', 'gray', 10, TRUE, TRUE),
    ('en_curso', 'En curso', 'blue', 20, TRUE, TRUE),
    ('en_revision', 'En revisión', 'yellow', 30, TRUE, TRUE),
    ('hecha', 'Hecha', 'green', 40, TRUE, TRUE)
ON CONFLICT (key) DO UPDATE SET
    name = EXCLUDED.name,
    is_system = TRUE,
    is_active = TRUE;

-- 2. Modificar constraint de status en tasks
-- Eliminar la restricción CHECK fija si existe
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'tasks'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%status%IN%'
    ) LOOP
        EXECUTE 'ALTER TABLE tasks DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- Añadir clave foránea a task_columns(key)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_status_column'
    ) THEN
        ALTER TABLE tasks
            ADD CONSTRAINT fk_tasks_status_column
            FOREIGN KEY (status) REFERENCES task_columns(key)
            ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
END $$;

-- 3. Tabla de áreas de trabajo
CREATE TABLE IF NOT EXISTS task_areas (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(30) NOT NULL DEFAULT 'gray',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Semillar áreas por defecto
INSERT INTO task_areas (name, color, sort_order, is_active)
VALUES
    ('Meta', 'blue', 10, TRUE),
    ('WEB · WordPress · SEO', 'purple', 20, TRUE)
ON CONFLICT (name) DO NOTHING;

-- 4. Asignación de áreas a usuarios
CREATE TABLE IF NOT EXISTS user_task_areas (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    area_id INTEGER NOT NULL REFERENCES task_areas(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, area_id)
);

CREATE INDEX IF NOT EXISTS idx_user_task_areas_user ON user_task_areas(user_id);
CREATE INDEX IF NOT EXISTS idx_user_task_areas_area ON user_task_areas(area_id);

-- 5. Proyectos propios (externos / no en catálogo general de projects)
CREATE TABLE IF NOT EXISTS task_external_projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    color VARCHAR(30) NOT NULL DEFAULT 'gray',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Añadir area_id y external_project_id a tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS area_id INTEGER REFERENCES task_areas(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS external_project_id INTEGER REFERENCES task_external_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_area_id ON tasks(area_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_external_project_id ON tasks(external_project_id) WHERE archived_at IS NULL;

-- Restricción exclusiva: o project_id o external_project_id, no ambos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_tasks_project_exclusive'
    ) THEN
        ALTER TABLE tasks
            ADD CONSTRAINT chk_tasks_project_exclusive
            CHECK (project_id IS NULL OR external_project_id IS NULL);
    END IF;
END $$;

-- 7. Unicidad de etiquetas por tarea insensible a mayúsculas
-- Si hubiera duplicados existentes, eliminarlos antes de crear el índice
DELETE FROM task_tags a USING task_tags b
WHERE a.id > b.id
  AND a.task_id = b.task_id
  AND LOWER(a.name) = LOWER(b.name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_tags_unique ON task_tags(task_id, LOWER(name));

-- Permisos
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON task_columns, task_areas, user_task_areas, task_external_projects TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE task_columns_id_seq, task_areas_id_seq, task_external_projects_id_seq TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
