-- 245 · El plugin del CRM en cada Moodle (#679)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- QUÉ ES
--
-- El plugin `local_crm` (tools/moodle-local-crm) avisa al CRM de cada mensaje
-- privado del campus, firmado con una clave del campus. Aquí se guarda esa clave
-- (cifrada, como el resto de claves), si el plugin está activo y cuándo llegó el
-- último aviso, para enseñar en el panel que el campus está conectado.
--
-- Con el plugin activo, la respuesta desde el CRM sale por el plugin, en nombre
-- de la tutora, con el token del campus: deja de hacer falta el token personal de
-- cada tutora (`tutor_campus.token_cifrado`), que sigue valiendo en los campus
-- sin plugin.
--
-- Reaplicable.
-- ─────────────────────────────────────────────────────────────────────────────

-- Los códigos de conexión: como en Certifex, conectar un campus es instalar el
-- plugin y pegar UN código. El código es de un solo uso y caduca; se guarda solo su
-- huella (sha256), nunca el código.
CREATE TABLE IF NOT EXISTS moodle_conexion_codigos (
  id           SERIAL PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  huella       TEXT NOT NULL UNIQUE,
  expira_at    TIMESTAMPTZ NOT NULL,
  usado_at     TIMESTAMPTZ,
  sitio        TEXT,
  creado_por   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Intentos con ese código: pasado el tope se anula (que un código filtrado no sirva para probar sin fin).
ALTER TABLE moodle_conexion_codigos ADD COLUMN IF NOT EXISTS intentos INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_moodle_conexion_codigos_proyecto ON moodle_conexion_codigos (project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS moodle_plugin_campus (
  project_id       INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  secreto_cifrado  TEXT NOT NULL,
  secreto_iv       TEXT NOT NULL,
  secreto_tag      TEXT NOT NULL,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_aviso_at  TIMESTAMPTZ,
  creado_por       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- El repaso de cada 15 minutos (plugin 1.8.0): hasta qué mensaje de Moodle está al día,
-- cuándo fue el último bueno, si falló por qué, y qué versión del plugin tiene el campus.
ALTER TABLE moodle_plugin_campus ADD COLUMN IF NOT EXISTS sincronizado_hasta_id BIGINT;
ALTER TABLE moodle_plugin_campus ADD COLUMN IF NOT EXISTS sincronizado_at TIMESTAMPTZ;
ALTER TABLE moodle_plugin_campus ADD COLUMN IF NOT EXISTS sincronizacion_error TEXT;
ALTER TABLE moodle_plugin_campus ADD COLUMN IF NOT EXISTS version_plugin TEXT;

-- Como en la 232 y la 246: que el CRM pueda leer y escribir aunque la migración la
-- pase postgres (en el servidor la aplica postgres, y la API entra como crm_user; en
-- la gemela, crm_iseie_user). Sin esto, conectar un campus da «permiso denegado».
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON moodle_conexion_codigos TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE moodle_conexion_codigos_id_seq TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON moodle_plugin_campus TO %I', r);
    END IF;
  END LOOP;
END $$;
