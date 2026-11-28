-- Migración 328: varios buzones de correo conectados desde el panel (CRM#1032).
-- Iba a ser la 320, que ya es 320_tickets_en_seguimiento (y 326 y 327 ya están en main).
-- En ISEIE es la 335 (CRM-ISEIE#750).
--
-- Diego, 23/11: «poder conectar varios correos de Hostinger como hicimos en
-- CEDIA». Hasta aquí la Bandeja (#146) leía UN buzón, el de `IMAP_USER` e
-- `IMAP_PASSWORD` del `.env` del servidor. Desde aquí se pueden conectar los que
-- hagan falta (facturación, soporte, admisiones…) sin tocar el servidor.
--
-- LAS CREDENCIALES, CIFRADAS. Servidor, puerto, usuario y contraseña van juntos
-- en `cifrado` con AES-256-GCM (`shared/utils/crypto.js`, la misma clave
-- `ENCRYPTION_KEY` que `api_credentials`). La API nunca los devuelve: solo
-- `direccion` —la dirección del buzón, que es pública: es a la que se escribe—
-- y si hay credenciales guardadas.
--
-- COMPATIBILIDAD. Si no hay ningún buzón activo aquí, se sigue leyendo el del
-- `.env` como hasta ahora. En cuanto hay uno, mandan los de aquí y el del `.env`
-- deja de leerse (Diego, CRM#1058). Los correos que ya entraron por él se quedan
-- con `buzon_id` NULL; si ese mismo buzón se conecta luego desde el panel, el CRM
-- los adopta al releerlo en vez de duplicarlos.
--
-- SOLO LEER. Estos buzones no mandan nada (Diego, CRM#1058): el envío sigue
-- como estaba, por Brevo con su plantilla, y el `SMTP_*` del `.env` y la copia
-- en «Enviados» siguen saliendo solo del buzón del `.env`.
--
-- Reaplicable: todo con IF NOT EXISTS.

BEGIN;

CREATE TABLE IF NOT EXISTS correo_buzones (
  id                 SERIAL       PRIMARY KEY,
  -- Cómo se llama en la Bandeja: «Facturación CEDIA», «Soporte ISEIH»…
  nombre             VARCHAR(120) NOT NULL,
  -- La dirección del buzón, en minúsculas. Con Hostinger es también el usuario.
  direccion          VARCHAR(255) NOT NULL,
  -- De qué campus es. NULL = de ninguno en concreto (lo ve quien ve la Bandeja,
  -- y solo lo tocan superadmin y soporte).
  project_id         INTEGER      REFERENCES projects(id) ON DELETE SET NULL,
  -- De qué empresa de facturación es, si es su buzón de facturación.
  empresa_id         INTEGER      REFERENCES invoice_issuers(id) ON DELETE SET NULL,
  -- {host, puerto, usuario, clave} cifrado con AES-256-GCM.
  cifrado            TEXT         NOT NULL,
  iv                 VARCHAR(64)  NOT NULL,
  auth_tag           VARCHAR(64)  NOT NULL,
  activo             BOOLEAN      NOT NULL DEFAULT true,
  -- La última vez que se leyó o se probó, y cómo fue. Sin el detalle del error
  -- del servidor de correo: eso va al registro del servidor, no a la pantalla.
  ultima_lectura_at  TIMESTAMPTZ,
  ultimo_resultado   VARCHAR(20),
  ultimo_error       TEXT,
  created_by         INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  updated_by         INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- El mismo buzón no se conecta dos veces (activo). Uno quitado se puede volver
-- a conectar.
CREATE UNIQUE INDEX IF NOT EXISTS uq_correo_buzones_direccion
  ON correo_buzones (lower(direccion)) WHERE activo;

CREATE INDEX IF NOT EXISTS idx_correo_buzones_project
  ON correo_buzones (project_id) WHERE activo;

-- De qué buzón entró cada correo. NULL en lo que sale y en lo que entró por el
-- buzón del `.env`.
ALTER TABLE email_envios
  ADD COLUMN IF NOT EXISTS buzon_id INTEGER REFERENCES correo_buzones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_envios_buzon
  ON email_envios (buzon_id, created_at DESC) WHERE buzon_id IS NOT NULL;

COMMENT ON TABLE correo_buzones IS
  'Buzones IMAP que lee la Bandeja, conectados desde el panel (CRM#1032). Credenciales cifradas con AES-256-GCM.';
COMMENT ON COLUMN correo_buzones.cifrado IS
  'JSON {host, puerto, usuario, clave} cifrado con ENCRYPTION_KEY. Nunca sale por la API.';
COMMENT ON COLUMN email_envios.buzon_id IS
  'El buzón por el que entró el correo (CRM#1032). NULL: salida, o el buzón del .env.';

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON correo_buzones TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE correo_buzones_id_seq TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
