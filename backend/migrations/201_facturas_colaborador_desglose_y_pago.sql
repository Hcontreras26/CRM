-- Facturas de colaboradores (#202, segunda PR): cómo cobra cada uno, y pagarlas
--
-- Del «Añadido 01/10 (tarde)» de la definición de Diego:
--   · tres modalidades —fijo, por hora y por proyecto (por horas)— con su
--     desglose en líneas, y el IVA y el IRPF de la ficha del colaborador;
--   · el estado del pago, que no se mezcla con el de la factura: por pagar,
--     o pagada con su fecha.
-- Los nombres de las columnas son los de su esquema.
--
-- 201: la 198 es la primera PR de las facturas de colaboradores; la 199, la de
-- los diplomas de Certifex de Ángel (#300), y la 200, la de los idiomas del
-- botón de WhatsApp, también de Ángel (#316).
-- Se puede pasar dos veces sin romper nada.

BEGIN;

-- Cómo cobra el colaborador de cada empresa. Sin modalidad (las fichas de antes)
-- la factura se sube como en la primera PR, sin desglose.
ALTER TABLE colaborador_empresas
    ADD COLUMN IF NOT EXISTS modalidad VARCHAR(10)
        CHECK (modalidad IN ('fijo', 'hora', 'proyecto')),
    ADD COLUMN IF NOT EXISTS importe_fijo NUMERIC(12, 2) CHECK (importe_fijo >= 0),
    ADD COLUMN IF NOT EXISTS tarifa_hora NUMERIC(10, 2) CHECK (tarifa_hora >= 0),
    -- «21 % y 15 %, o 0 % si factura desde fuera».
    ADD COLUMN IF NOT EXISTS iva_pct NUMERIC(5, 2) CHECK (iva_pct BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS irpf_pct NUMERIC(5, 2) CHECK (irpf_pct BETWEEN 0 AND 100);

-- Lo que calcula el CRM con el desglose, y si cuadra con el total que el
-- colaborador escribió (`importe`): base + IVA − IRPF.
ALTER TABLE facturas_colaborador
    ADD COLUMN IF NOT EXISTS base NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS iva NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS irpf NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS total NUMERIC(12, 2),
    ADD COLUMN IF NOT EXISTS horas NUMERIC(8, 2),
    -- NULL: subida sin desglose (antes de esta PR, o ficha sin modalidad).
    ADD COLUMN IF NOT EXISTS cuadra BOOLEAN,
    -- El pago. La fecha la elige quien paga (hoy por defecto): es un día, no
    -- un instante. Deshacerlo vacía estas columnas; el motivo va al registro.
    ADD COLUMN IF NOT EXISTS pagada_at DATE,
    ADD COLUMN IF NOT EXISTS pagada_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS forma_pago VARCHAR(20)
        CHECK (forma_pago IN ('transferencia', 'bizum', 'paypal', 'efectivo', 'otro')),
    -- La clave del justificante en R2, si se adjunta.
    ADD COLUMN IF NOT EXISTS justificante VARCHAR(500),
    ADD COLUMN IF NOT EXISTS referencia_pago VARCHAR(100);

-- Solo se paga una factura recibida.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_fc_pagada_recibida') THEN
    ALTER TABLE facturas_colaborador
      ADD CONSTRAINT chk_fc_pagada_recibida CHECK (pagada_at IS NULL OR subida_at IS NOT NULL);
  END IF;
END $$;

-- «Por pagar»: recibidas, vivas y sin pagar.
CREATE INDEX IF NOT EXISTS idx_facturas_colaborador_por_pagar
    ON facturas_colaborador(issuer_id, periodo)
    WHERE subida_at IS NOT NULL AND anulada_at IS NULL AND pagada_at IS NULL;

-- Una línea por encargo. La suma de las líneas da la base. Con el proyecto
-- (campus) de cada una, administración ve cuántas horas y cuánto dinero de
-- colaboradores se va a cada campus cada mes.
CREATE TABLE IF NOT EXISTS facturas_colaborador_lineas (
    id SERIAL PRIMARY KEY,
    factura_id INTEGER NOT NULL REFERENCES facturas_colaborador(id) ON DELETE CASCADE,
    orden SMALLINT NOT NULL DEFAULT 1,
    concepto VARCHAR(200) NOT NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    horas NUMERIC(8, 2) CHECK (horas >= 0),
    tarifa NUMERIC(10, 2) CHECK (tarifa >= 0),
    importe NUMERIC(12, 2) NOT NULL CHECK (importe >= 0)
);

CREATE INDEX IF NOT EXISTS idx_fc_lineas_factura ON facturas_colaborador_lineas(factura_id);
CREATE INDEX IF NOT EXISTS idx_fc_lineas_project ON facturas_colaborador_lineas(project_id);

-- Sin esto la API da «permission denied» (como certifex_consultas el 30/09).
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON facturas_colaborador_lineas TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE facturas_colaborador_lineas_id_seq TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
