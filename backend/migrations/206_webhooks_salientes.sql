-- 206 · Webhook de transferencias (Conexión → «Webhook de transferencias»)
--
-- Diego, 15/10: «Necesito que creemos como un webhook, que se debe configurar
-- cuando hacen pago por transferencias, que debe enviar ciertos datos a un
-- webhook. Es como tener un apartado en Conexión para enviar esos datos
-- ÚNICAMENTE CUANDO SE PONGA DATOS POR TRANSFERENCIA BANCARIA / DEPÓSITO
-- BANCARIO».
--
-- Tres cosas, y las tres hacen falta para que eso funcione:
--
--   1. «Depósito bancario» como forma de cobro. NO EXISTÍA: el CRM solo tenía
--      transferencia, tarjeta, tarjeta_stripe, efectivo, bizum, paypal,
--      fraccionado y otro. `conversions.metodo_pago` es el ENUM `payment_method`
--      y hay que ampliar el ENUM (un CHECK no basta: ya rompió conversiones con
--      «otro», ver la 118). `conversion_payments.metodo`,
--      `conversion_installments.metodo` e `invoices.metodo_pago` son VARCHAR sin
--      CHECK: ahí no hay nada que ampliar, los valores los valida Zod.
--
--   2. `conversion_payments.referencia`: la referencia de la transferencia o
--      del ingreso (el nº de operación que da el banco). El payload la lleva y
--      el cobro no tenía dónde guardarla. Opcional.
--
--   3. Las dos tablas del webhook: la configuración y el registro de envíos.
--
-- 206: la 205 es la de Diana (conexiones de Claude en el MCP). Se puede pasar
-- dos veces.

-- (1) Fuera de la transacción, como la 118: ALTER TYPE ... ADD VALUE no puede ir
-- dentro de un BEGIN en las versiones antiguas de PostgreSQL.
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'deposito';

BEGIN;

-- (2) La referencia del cobro.
ALTER TABLE conversion_payments ADD COLUMN IF NOT EXISTS referencia VARCHAR(120);

COMMENT ON COLUMN conversion_payments.metodo IS
  'Como se cobro: tarjeta, tarjeta_stripe, transferencia, deposito, efectivo, bizum, paypal, fraccionado, otro. Nulo = no se anoto (la mayoria de los historicos).';
COMMENT ON COLUMN conversion_payments.referencia IS
  'Referencia del banco de una transferencia o un deposito (nº de operacion). Opcional. Va en el webhook de transferencias (206).';

-- (3a) Los webhooks. Uno por destino: nombre, URL https, secreto para firmar,
-- para quién (todas las empresas, una empresa o un campus) y qué formas de
-- cobro lo disparan (solo transferencia y depósito; las dos por defecto).
--
-- La empresa es la sociedad emisora del campus (`projects.sociedad_emisora_id`
-- → `invoice_issuers`), la misma del selector de la cabecera.
--
-- El secreto va CIFRADO (AES-256-GCM, `shared/utils/crypto.js`), como
-- `api_credentials`. Se enseña una vez al crearlo o regenerarlo y nunca más; de
-- él solo se guarda en claro la cola (los 4 últimos) para reconocerlo.
CREATE TABLE IF NOT EXISTS webhooks_salientes (
    id               SERIAL       PRIMARY KEY,
    nombre           VARCHAR(150) NOT NULL,
    url              TEXT         NOT NULL,
    secreto_cifrado  TEXT         NOT NULL,
    secreto_iv       VARCHAR(32)  NOT NULL,
    secreto_tag      VARCHAR(32)  NOT NULL,
    secreto_cola     VARCHAR(8),
    activo           BOOLEAN      NOT NULL DEFAULT true,
    ambito           VARCHAR(10)  NOT NULL DEFAULT 'campus',
    issuer_id        INTEGER      REFERENCES invoice_issuers(id) ON DELETE CASCADE,
    project_id       INTEGER      REFERENCES projects(id) ON DELETE CASCADE,
    metodos          TEXT[]       NOT NULL DEFAULT ARRAY['transferencia', 'deposito']::text[],
    creado_por       INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    actualizado_por  INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT webhooks_salientes_url_https CHECK (url ~* '^https://'),
    CONSTRAINT webhooks_salientes_ambito CHECK (ambito IN ('todas', 'empresa', 'campus')),
    CONSTRAINT webhooks_salientes_ambito_coherente CHECK (
         (ambito = 'todas'   AND issuer_id IS NULL     AND project_id IS NULL)
      OR (ambito = 'empresa' AND issuer_id IS NOT NULL AND project_id IS NULL)
      OR (ambito = 'campus'  AND project_id IS NOT NULL AND issuer_id IS NULL)
    ),
    -- Solo esas dos: con tarjeta, Stripe, efectivo, Bizum o PayPal no se envía nunca.
    CONSTRAINT webhooks_salientes_metodos CHECK (
      cardinality(metodos) >= 1 AND metodos <@ ARRAY['transferencia', 'deposito']::text[]
    )
);

CREATE INDEX IF NOT EXISTS idx_webhooks_salientes_activos ON webhooks_salientes (ambito) WHERE activo;
CREATE INDEX IF NOT EXISTS idx_webhooks_salientes_issuer ON webhooks_salientes (issuer_id) WHERE issuer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhooks_salientes_project ON webhooks_salientes (project_id) WHERE project_id IS NOT NULL;

COMMENT ON TABLE webhooks_salientes IS
  'Webhook de transferencias (206): a donde se avisa cuando se apunta un cobro por transferencia o deposito bancario. Secreto cifrado AES-256-GCM.';

-- (3b) El registro de envíos: una fila por cobro y webhook. La clave de
-- idempotencia (`cobro-<id>-webhook-<id>`) es ÚNICA: el mismo cobro no se manda
-- dos veces al mismo webhook aunque se edite o se vuelva a disparar. Las pruebas
-- llevan su propia clave, de un solo uso.
--
-- `estado`: pendiente (espera su turno o su reintento) → enviando → enviado, o
-- fallido tras el último intento. `respuesta` va recortada.
CREATE TABLE IF NOT EXISTS webhooks_salientes_envios (
    id                  SERIAL       PRIMARY KEY,
    webhook_id          INTEGER      NOT NULL REFERENCES webhooks_salientes(id) ON DELETE CASCADE,
    payment_id          INTEGER      REFERENCES conversion_payments(id) ON DELETE SET NULL,
    evento              VARCHAR(40)  NOT NULL,
    idempotency_key     VARCHAR(100) NOT NULL,
    prueba              BOOLEAN      NOT NULL DEFAULT false,
    payload             JSONB        NOT NULL,
    estado              VARCHAR(12)  NOT NULL DEFAULT 'pendiente',
    http_status         INTEGER,
    respuesta           TEXT,
    intentos            SMALLINT     NOT NULL DEFAULT 0,
    error               TEXT,
    proximo_intento_at  TIMESTAMPTZ,
    ultimo_intento_at   TIMESTAMPTZ,
    enviado_at          TIMESTAMPTZ,
    reenviado_por       INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    reenviado_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT webhooks_salientes_envios_idempotency UNIQUE (idempotency_key),
    CONSTRAINT webhooks_salientes_envios_estado CHECK (estado IN ('pendiente', 'enviando', 'enviado', 'fallido'))
);

-- Lo que mira el reintento cada pocos minutos.
CREATE INDEX IF NOT EXISTS idx_wse_pendientes ON webhooks_salientes_envios (proximo_intento_at)
  WHERE estado IN ('pendiente', 'enviando');
-- «Los últimos envíos» de la pantalla.
CREATE INDEX IF NOT EXISTS idx_wse_webhook_fecha ON webhooks_salientes_envios (webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wse_payment ON webhooks_salientes_envios (payment_id) WHERE payment_id IS NOT NULL;

COMMENT ON TABLE webhooks_salientes_envios IS
  'Registro del webhook de transferencias (206): payload, codigo HTTP, respuesta recortada, intentos y error. Unico por idempotency_key (cobro + webhook).';

-- Permisos del usuario de la aplicación (crm_user en MultiCRM, crm_iseie_user en
-- ISEIE). Si las tablas ya son suyas no cambia nada.
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON webhooks_salientes, webhooks_salientes_envios TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE webhooks_salientes_id_seq, webhooks_salientes_envios_id_seq TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ROLLBACK (el valor 'deposito' del ENUM no se puede quitar sin recrear el tipo;
-- se deja, no estorba):
--   DROP TABLE IF EXISTS webhooks_salientes_envios;
--   DROP TABLE IF EXISTS webhooks_salientes;
--   ALTER TABLE conversion_payments DROP COLUMN IF EXISTS referencia;
