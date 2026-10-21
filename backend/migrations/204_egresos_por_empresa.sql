-- 204 · Egresos por empresa (#227, Diego 10/10: «Egresos se empareja: la misma pantalla y el
-- mismo funcionamiento en los dos CRM»). El mismo número y la misma migración en CRM-ISEIE.
--
-- Un gasto podía ser de un campus o «general». Con una EMPRESA puesta en la cabecera no había
-- forma de apuntar el alquiler de CEDIA: la pantalla mandaba project_id = -1 y el servidor lo
-- rechazaba. Ahora un gasto es de uno de estos tres:
--
--   de un campus          project_id = 7,    issuer_id = NULL
--   de toda una empresa   project_id = NULL, issuer_id = 3
--   general, de la casa   project_id = NULL, issuer_id = NULL
--
-- Con campus, la empresa sale de projects.sociedad_emisora_id: guardarla también podría dejar
-- las dos diciendo cosas distintas. Por eso el CHECK.
--
-- NO MUEVE DATOS: las filas que hay siguen como estaban (con campus o generales). En producción
-- la tabla está vacía (13/10: 0 filas en crm_prod_db).
--
-- Reaplicable: IF NOT EXISTS y comprobaciones en el catálogo antes de cada restricción.

BEGIN;

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS issuer_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_expenses_issuer') THEN
    ALTER TABLE expenses
      ADD CONSTRAINT fk_expenses_issuer FOREIGN KEY (issuer_id) REFERENCES invoice_issuers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_campus_o_empresa') THEN
    ALTER TABLE expenses
      ADD CONSTRAINT expenses_campus_o_empresa CHECK (project_id IS NULL OR issuer_id IS NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_expenses_issuer ON expenses (issuer_id) WHERE issuer_id IS NOT NULL;

COMMENT ON COLUMN expenses.issuer_id IS
  'Empresa (invoice_issuers) de un gasto SIN campus: cuenta en la empresa y en cada uno de sus campus. Con project_id va NULL (la empresa sale del campus).';

-- Permisos del usuario de la aplicación (crm_user en MultiCRM, crm_iseie_user en ISEIE). La
-- tabla ya es suya; esto cubre una base donde no lo sea.
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON expenses TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE expenses_id_seq TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ROLLBACK:
--   ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_campus_o_empresa;
--   ALTER TABLE expenses DROP CONSTRAINT IF EXISTS fk_expenses_issuer;
--   DROP INDEX IF EXISTS idx_expenses_issuer;
--   ALTER TABLE expenses DROP COLUMN IF EXISTS issuer_id;
