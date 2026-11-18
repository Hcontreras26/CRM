-- 244 · Cambiar el correo con un código a la dirección nueva (#211)
--
-- Diego, 02/10: «poder cambiar el correo desde el CRM con un código». Hoy un
-- correo se cambia y ya: nada comprueba que la dirección nueva exista ni sea de
-- esa persona. Así quedaron 39 de 45 tutores de ISEIE, con direcciones que no
-- existían y sin poder entrar nunca.
--
-- Una fila por petición: la dirección nueva, el código (solo su hash), cuántos
-- intentos lleva y hasta cuándo vale. El cambio no se aplica hasta que alguien
-- mete el código; entonces se marca `confirmado_at` y el correo cambia con
-- `cambiarCorreo`, que cierra las sesiones y avisa a la dirección vieja (#246).
--
-- Una petición nueva anula la anterior que siguiera pendiente (`anulado_at`):
-- solo vale el último código que se mandó.
--
-- Reaplicable: IF NOT EXISTS en todo.

CREATE TABLE IF NOT EXISTS cambios_de_correo (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_nuevo         VARCHAR(255) NOT NULL,
  -- sha256 del código de 6 cifras: el código en claro solo va en el correo.
  codigo_hash         CHAR(64) NOT NULL,
  intentos            SMALLINT NOT NULL DEFAULT 0,
  expira_at           TIMESTAMPTZ NOT NULL,
  -- Quién lo pidió: la propia persona o administración.
  pedido_por_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  creado_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmado_at       TIMESTAMPTZ,
  anulado_at          TIMESTAMPTZ
);

-- La petición vigente de cada persona: como mucho una.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cambio_de_correo_pendiente
  ON cambios_de_correo (user_id)
  WHERE confirmado_at IS NULL AND anulado_at IS NULL;

-- Que el CRM pueda leerla aunque la migración la pase postgres (como la 214).
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON cambios_de_correo TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE cambios_de_correo_id_seq TO %I', r);
    END IF;
  END LOOP;
END $$;
