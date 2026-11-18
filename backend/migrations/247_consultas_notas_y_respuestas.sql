-- 247 · Notas internas en las consultas y respuestas guardadas en el servidor (#679)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Para que el personal se organice mejor:
--
--   · consulta_notas: lo que una tutora deja escrito en una consulta para quien la
--     lleve después (un relevo, coordinación). Solo lo ve el personal: nunca sale
--     al campus ni lo ve el alumno.
--
--   · respuestas_guardadas: las respuestas que se repiten («La tarea está en
--     Actividades…»). Antes vivían en el navegador de cada tutora y se perdían al
--     cambiar de equipo. Ahora:
--       - personales  → user_id puesto, project_id vacío;
--       - del campus  → project_id puesto, user_id vacío: las define coordinación
--                       y las ven todas las tutoras de ese campus.
--
-- Se puede pasar dos veces.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS consulta_notas (
    id SERIAL PRIMARY KEY,
    consulta_id INTEGER NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    autor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    texto TEXT NOT NULL CHECK (length(btrim(texto)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consulta_notas_consulta ON consulta_notas (consulta_id, created_at);

CREATE TABLE IF NOT EXISTS respuestas_guardadas (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    titulo VARCHAR(120) NOT NULL CHECK (length(btrim(titulo)) > 0),
    texto TEXT NOT NULL CHECK (length(btrim(texto)) > 0),
    creado_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- O de una persona o de un campus, nunca de los dos ni de ninguno.
    CONSTRAINT respuestas_guardadas_de_quien CHECK ((user_id IS NULL) <> (project_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_respuestas_guardadas_usuario ON respuestas_guardadas (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_respuestas_guardadas_campus ON respuestas_guardadas (project_id) WHERE project_id IS NOT NULL;

-- Como en la 245 y la 246: que el CRM pueda leer y escribir aunque la migración la
-- pase postgres (en el servidor la aplica postgres, y la API entra como crm_user; en
-- la gemela, crm_iseie_user). Sin esto, anotar o guardar una respuesta da «permiso denegado».
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON consulta_notas TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE consulta_notas_id_seq TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON respuestas_guardadas TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE respuestas_guardadas_id_seq TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
