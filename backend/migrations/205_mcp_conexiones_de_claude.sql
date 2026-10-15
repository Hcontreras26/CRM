-- Cada Claude conectado a una URL del MCP, con su permiso (#326).
--
-- Carlos (13/10): quitar la caducidad del desbloqueo por horas (2 h sin uso y 9 h
-- como máximo): tenía que volver a meter el código varias veces al día. El
-- código se sigue pidiendo la primera vez.
--
-- Diego (13/10): si la URL se cuela, que otra persona no pueda consultar. No se
-- puede por IP: con el conector de Claude las consultas llegan desde los
-- servidores de Anthropic, que cambian de IP (ver mcp.alertas.js). Lo acordado
-- con Diego (WhatsApp, 13/10): cada Claude que se conecta a una URL es una
-- conexión propia, queda PENDIENTE hasta que el dueño la autoriza en Conexión →
-- MCP, y el código desbloquea esa conexión, no la URL. Otra conexión con la
-- misma URL no consulta aunque la URL esté desbloqueada y aunque tenga código.
--
-- Cada conexión nace en el paso de inicio de sesión de Claude (OAuth, `/token`)
-- y tiene su propia llave (se guarda su huella y la semilla de la que sale). Al morir la URL (revocada,
-- caducada a los 90 días o sin uso 30 días) mueren sus conexiones.
--
-- `mcp_desbloqueos` (la 189) deja de usarse: el desbloqueo va aquí, sin caducar.

BEGIN;

CREATE TABLE IF NOT EXISTS mcp_conexiones (
    id               SERIAL        PRIMARY KEY,
    token_id         INTEGER       NOT NULL REFERENCES mcp_tokens(id) ON DELETE CASCADE,
    user_id          INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    llave_hash       CHAR(64)      NOT NULL UNIQUE,
    -- La llave sale de esta semilla y del secreto del servidor: el refresco de
    -- Claude devuelve la misma (ver mcp.conexiones.js). Sola no sirve de nada.
    llave_semilla    VARCHAR(64)   NOT NULL,
    -- 'claude' (claude.ai o Claude Desktop) o 'claude_code', por la dirección de vuelta.
    cliente          VARCHAR(20)   NOT NULL,
    estado           VARCHAR(12)   NOT NULL DEFAULT 'pendiente'
                                   CHECK (estado IN ('pendiente', 'autorizada', 'rechazada')),
    decidida_at      TIMESTAMPTZ,
    decidida_por     INTEGER       REFERENCES users(id) ON DELETE SET NULL,
    -- Desbloqueada con el código (o desde el panel). Sin caducidad por horas.
    desbloqueada_at  TIMESTAMPTZ,
    codigo_id        INTEGER       REFERENCES mcp_codigos(id) ON DELETE SET NULL,
    last_used_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcp_conexiones_token ON mcp_conexiones(token_id);

-- Las URLs que ya existían al desplegar: con MCP_CONEXIONES_EXISTENTES_APROBADAS
-- su primera conexión entra autorizada (lo decide Diego al pasar a producción).
ALTER TABLE mcp_tokens ADD COLUMN IF NOT EXISTS anterior_a_conexiones BOOLEAN NOT NULL DEFAULT false;
UPDATE mcp_tokens SET anterior_a_conexiones = true WHERE revoked_at IS NULL;

-- Permisos para el usuario de la aplicación (la migración la corre postgres).
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON mcp_conexiones TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE mcp_conexiones_id_seq TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
