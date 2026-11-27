-- 341 · La app de Meta y la renovación de sus tokens, desde la pantalla (CRM#1209)
--
-- Norma del 27/11: nada de `.env` para lo que se puede poner en la pantalla.
-- Hasta ahora la renovación diaria de los tokens de Meta (#471) leía del
-- servidor META_APP_ID, META_APP_SECRET, META_TOKENS_RENOVACION_ACTIVA,
-- META_TOKENS_RENOVAR_DIAS, META_TOKENS_AVISO_DIAS y META_GASTO_TOTAL_CADA_HORAS.
-- Ahora se ponen en Meta Ads › Configuración › «App de Meta»:
--
--   · el ID y el secreto de la app van en `api_credentials`, cifrados como las
--     demás (AES-256-GCM), con el servicio nuevo `meta_app` y project_id NULL
--     (la app es de todo el CRM). Valor: {"app_id":"…","app_secret":"…"}.
--     No se reutiliza `meta`: ese servicio lo ofrecía Configuración › APIs como
--     un token suelto que no leía nadie, y puede haber cosas guardadas ahí.
--   · los ajustes, en `meta_app_ajustes`, una sola fila. NULL en una columna =
--     «lo del servidor» (`.env`) o, si tampoco, el valor de siempre. Mientras
--     convivan, el `.env` queda de reserva y la pantalla dice de dónde sale cada
--     valor.
--   · `ultima_vuelta_*`: cuándo dio la última vuelta la renovación y cómo fue.
--
-- ALTER TYPE ... ADD VALUE va sin BEGIN/COMMIT (como la 220). Se puede pasar
-- dos veces.

ALTER TYPE api_service ADD VALUE IF NOT EXISTS 'meta_app';

CREATE TABLE IF NOT EXISTS meta_app_ajustes (
  id                      SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  renovacion_activa       BOOLEAN,
  renovar_dias            INTEGER CHECK (renovar_dias BETWEEN 1 AND 59),
  aviso_dias              INTEGER CHECK (aviso_dias BETWEEN 1 AND 30),
  gasto_total_cada_horas  INTEGER CHECK (gasto_total_cada_horas BETWEEN 1 AND 168),
  ultima_vuelta_at        TIMESTAMPTZ,
  ultima_vuelta_resumen   JSONB,
  updated_by              INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE meta_app_ajustes IS 'CRM#1209: ajustes de la renovación de tokens de Meta. Una fila. NULL = el del servidor (.env) o el de siempre.';

-- Que el CRM pueda usarla aunque la migración la pase postgres (como la 295).
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON meta_app_ajustes TO %I', r);
    END IF;
  END LOOP;
END $$;
