-- Tablero de tareas · enlaces de la tarjeta (#210, fase 2)
--
-- Decision 5 de la #210: sin adjuntos, solo enlaces (a la web, a un Drive, a un
-- issue de GitHub). Se puede pasar dos veces sin romper nada.

BEGIN;

CREATE TABLE IF NOT EXISTS task_links (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    url VARCHAR(2000) NOT NULL,
    title VARCHAR(255),
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_links_task_id ON task_links(task_id);

-- El nombre de la etiqueta, para filtrar el tablero por etiqueta (fase 4)
CREATE INDEX IF NOT EXISTS idx_task_tags_name ON task_tags(LOWER(name));

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON task_links TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE task_links_id_seq TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
