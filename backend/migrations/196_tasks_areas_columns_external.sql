-- Tablero de tareas · columnas propias, áreas y proyectos propios (#210, mejoras del 07/10)
--
-- 1. task_columns: las columnas del tablero (clave, nombre, color, orden, si es
--    fija y si está activa). Las 4 de siempre quedan como fijas: tienen reglas
--    («En revisión» es lo que sale en «Por revisar» y «Hecha» la que cierra).
-- 2. tasks.status deja de ser un CHECK con 4 valores y pasa a apuntar a
--    task_columns(key). Las tareas que ya existen conservan su columna: sus
--    cuatro valores posibles están sembrados antes de crear la clave ajena.
-- 3. task_areas + user_task_areas: áreas (Meta, WEB · WordPress · SEO…) y quién
--    está en cada una.
-- 4. task_external_projects: proyectos propios que no son un campus del CRM
--    (Opynio, una web nueva, un cliente externo).
-- 5. tasks.area_id y tasks.external_project_id; una tarea tiene como mucho un
--    campus o un proyecto propio, y lo garantiza un CHECK.
-- 6. task_tags: «Web» y «web» en la misma tarea son la misma etiqueta.
--
-- Se puede pasar dos veces sin romper nada ni deshacer lo que se haya
-- configurado desde la pantalla (nombres, colores, orden).

BEGIN;

-- 1. Columnas
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

-- Las 4 fijas. En una segunda pasada solo se asegura que siguen siendo fijas y
-- activas: el nombre, el color y el orden que se les haya puesto se respetan.
INSERT INTO task_columns (key, name, color, sort_order, is_system, is_active)
VALUES
    ('por_hacer',   'Por hacer',   'gray',   10, TRUE, TRUE),
    ('en_curso',    'En curso',    'blue',   20, TRUE, TRUE),
    ('en_revision', 'En revisión', 'yellow', 30, TRUE, TRUE),
    ('hecha',       'Hecha',       'green',  40, TRUE, TRUE)
ON CONFLICT (key) DO UPDATE SET is_system = TRUE, is_active = TRUE;

-- 2. tasks.status apunta a la tabla de columnas.
-- El CHECK de la 193 se llama tasks_status_check. Se quita por su nombre y,
-- por si en algún servidor tuviera otro, también cualquier CHECK de tasks que
-- mire `status`. Postgres lo guarda como «status = ANY (ARRAY[...])», no como
-- «status IN (...)»: buscar el IN no lo encuentra.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'tasks'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ~* '\mstatus\M'
  LOOP
    EXECUTE format('ALTER TABLE tasks DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_status_column') THEN
    ALTER TABLE tasks
      ADD CONSTRAINT fk_tasks_status_column
      FOREIGN KEY (status) REFERENCES task_columns(key)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

-- 3. Áreas
CREATE TABLE IF NOT EXISTS task_areas (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(30) NOT NULL DEFAULT 'gray',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Las dos de partida (Diego, 07/10), para que la sección no salga vacía.
INSERT INTO task_areas (name, color, sort_order, is_active)
VALUES
    ('Meta', 'blue', 10, TRUE),
    ('WEB · WordPress · SEO', 'purple', 20, TRUE)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_task_areas (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    area_id INTEGER NOT NULL REFERENCES task_areas(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, area_id)
);

CREATE INDEX IF NOT EXISTS idx_user_task_areas_area ON user_task_areas(area_id);

-- 4. Proyectos propios
CREATE TABLE IF NOT EXISTS task_external_projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    description TEXT,
    url VARCHAR(500),
    color VARCHAR(30) NOT NULL DEFAULT 'gray',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE task_external_projects ADD COLUMN IF NOT EXISTS url VARCHAR(500);
ALTER TABLE task_external_projects ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- 5. La tarea: área y proyecto propio
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS area_id INTEGER REFERENCES task_areas(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS external_project_id INTEGER REFERENCES task_external_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_area_id ON tasks(area_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_external_project_id ON tasks(external_project_id) WHERE archived_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tasks_project_exclusive') THEN
    ALTER TABLE tasks
      ADD CONSTRAINT chk_tasks_project_exclusive
      CHECK (project_id IS NULL OR external_project_id IS NULL);
  END IF;
END $$;

-- 6. Etiquetas sin repetir por tarea, sin distinguir mayúsculas.
-- Si ya hubiera repetidas, se queda la primera que se puso (la de id menor):
-- es la misma etiqueta escrita dos veces, no se pierde información.
DELETE FROM task_tags a USING task_tags b
 WHERE a.id > b.id
   AND a.task_id = b.task_id
   AND LOWER(a.name) = LOWER(b.name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_tags_unique ON task_tags(task_id, LOWER(name));

-- Permisos para la aplicación, con el patrón de la 193
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
