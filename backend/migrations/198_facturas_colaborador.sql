-- Facturas de colaboradores (#202, primera PR)
--
-- La gente de fuera que factura al grupo cada mes —soporte, desarrollo,
-- WordPress, SEO, contenido— sube su factura por un enlace personal, una por
-- empresa y mes. No son los tutores (siguen con «Avisar tutor», #164) ni las
-- gestoras. La lista de quién recibe el enlace la decide administración en el
-- propio CRM.
--
-- Esquema de la «Definición acordada · Diego, 01/10». El desglose (fijo, por
-- hora, por proyecto), el IVA y el IRPF y el pago van en la segunda PR, con su
-- propia migración.
--
-- 198: la 196 y la 197 son de Hugo, del tablero (#210).
-- Se puede pasar dos veces sin romper nada.

BEGIN;

-- Quién factura al grupo. `user_id` solo si además tiene usuario en el CRM
-- (rol colaborador): sin usuario funciona igual, con el enlace del correo.
CREATE TABLE IF NOT EXISTS colaboradores (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(200) NOT NULL,
    email VARCHAR(255) NOT NULL,
    nif VARCHAR(30),
    area VARCHAR(20) NOT NULL DEFAULT 'otra'
        CHECK (area IN ('soporte', 'desarrollo', 'wordpress', 'seo', 'contenido', 'otra')),
    notas TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    -- Primer día del mes desde el que entra, y desde el que deja de recibir.
    alta_desde DATE,
    baja_desde DATE,
    creado_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_colaboradores_user_id ON colaboradores(user_id);

-- A qué empresas del grupo factura cada uno, y lo acordado con cada una.
CREATE TABLE IF NOT EXISTS colaborador_empresas (
    colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
    issuer_id INTEGER NOT NULL REFERENCES invoice_issuers(id) ON DELETE CASCADE,
    importe_acordado NUMERIC(12, 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (colaborador_id, issuer_id)
);

CREATE INDEX IF NOT EXISTS idx_colaborador_empresas_issuer ON colaborador_empresas(issuer_id);

-- Una fila por colaborador, empresa y mes. Nace al preparar el mes (con su
-- enlace) y se completa cuando el colaborador sube la factura.
CREATE TABLE IF NOT EXISTS facturas_colaborador (
    id SERIAL PRIMARY KEY,
    colaborador_id INTEGER NOT NULL REFERENCES colaboradores(id) ON DELETE RESTRICT,
    issuer_id INTEGER NOT NULL REFERENCES invoice_issuers(id) ON DELETE RESTRICT,
    -- El día 1 del mes que se factura.
    periodo DATE NOT NULL CHECK (periodo = date_trunc('month', periodo)::date),
    -- Copiado del acordado al preparar el mes: si luego cambia, este no.
    importe_esperado NUMERIC(12, 2),
    -- Del enlace solo se guarda la huella (sha256), como los tokens del MCP.
    -- La semilla (32 bytes al azar) no es el enlace: el enlace se calcula con
    -- ella y la clave del servidor, así el recordatorio del día 5 puede llevar
    -- el mismo enlace sin guardarlo. Con la base sola no se puede fabricar.
    token_semilla CHAR(64),
    token_hash CHAR(64),
    caduca_at TIMESTAMPTZ,
    enviado_at TIMESTAMPTZ,
    abierto_at TIMESTAMPTZ,
    subida_at TIMESTAMPTZ,
    -- REC-2026-09-0007: el número que se le da al colaborador como acuse.
    numero_recepcion VARCHAR(30),
    importe NUMERIC(12, 2),
    numero_factura VARCHAR(60),
    archivo_key VARCHAR(500),
    nombre_original VARCHAR(255),
    mime VARCHAR(100),
    tamano INTEGER,
    sha256 CHAR(64),
    anulada_at TIMESTAMPTZ,
    anulada_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
    motivo_anulacion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- La regla de «una por empresa y mes» la impone la base, no solo la pantalla:
-- una anulada deja sitio a otra.
CREATE UNIQUE INDEX IF NOT EXISTS uq_facturas_colaborador_mes
    ON facturas_colaborador(colaborador_id, issuer_id, periodo)
    WHERE anulada_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_facturas_colaborador_token
    ON facturas_colaborador(token_hash)
    WHERE token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_facturas_colaborador_recepcion
    ON facturas_colaborador(numero_recepcion)
    WHERE numero_recepcion IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_facturas_colaborador_periodo
    ON facturas_colaborador(periodo, issuer_id);

-- Cada paso deja una línea, que no se borra ni se edita: el envío, la
-- apertura, la subida, la anulación… y también los cambios en la lista
-- (alta, baja, cambio), para saber quién decidió a quién le llega el correo.
CREATE TABLE IF NOT EXISTS facturas_colaborador_registro (
    id BIGSERIAL PRIMARY KEY,
    factura_id INTEGER REFERENCES facturas_colaborador(id) ON DELETE RESTRICT,
    colaborador_id INTEGER REFERENCES colaboradores(id) ON DELETE RESTRICT,
    evento VARCHAR(30) NOT NULL,
    creado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ip VARCHAR(64),
    detalle JSONB NOT NULL DEFAULT '{}'::jsonb,
    CHECK (factura_id IS NOT NULL OR colaborador_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_fc_registro_factura ON facturas_colaborador_registro(factura_id);
CREATE INDEX IF NOT EXISTS idx_fc_registro_colaborador ON facturas_colaborador_registro(colaborador_id);

-- Sin esto la API da «permission denied» (lo que pasó con certifex_consultas el
-- 30/09). Al registro solo se le da SELECT e INSERT: no se edita ni se borra.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON colaboradores, colaborador_empresas, facturas_colaborador TO %I', r);
      EXECUTE format('GRANT SELECT, INSERT ON facturas_colaborador_registro TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE colaboradores_id_seq, facturas_colaborador_id_seq, facturas_colaborador_registro_id_seq TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
