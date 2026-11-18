-- 246 · Equipo comercial a cargo de una administradora (Carlos, 09/11/2026)
--
-- «Raquel pasa a ser administradora como Daniela: no recibe leads y puede ver
-- los leads y la gestión de las diferentes compañeras. Daniela puede ver todas.
-- Raquel podrá ver sus comerciales asignadas (pueden variar).»
--
-- Hasta hoy había dos alcances: quien ve todo su campus (admin) y quien ve solo
-- lo suyo (gestora, project manager). Esta tabla añade el tercero: quien tiene
-- filas aquí como `lider_id` ve lo suyo y lo de las gestoras de su lista, y nada
-- más. Un admin SIN filas sigue viéndolo todo, como Daniela.
--
-- El alcance por campus/empresa no cambia y se aplica además.
--
-- Se puede pasar dos veces.

BEGIN;

CREATE TABLE IF NOT EXISTS equipo_comercial (
    lider_id   INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gestora_id INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    creado_por INTEGER     REFERENCES users(id) ON DELETE SET NULL,
    creado_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (lider_id, gestora_id),
    CONSTRAINT equipo_comercial_no_a_si_misma CHECK (lider_id <> gestora_id)
);

CREATE INDEX IF NOT EXISTS idx_equipo_comercial_gestora ON equipo_comercial (gestora_id);

COMMENT ON TABLE equipo_comercial IS
  'Las gestoras a cargo de una administradora (246): la líder ve lo suyo y lo de ellas; un admin sin filas ve todo su campus.';

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON equipo_comercial TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
