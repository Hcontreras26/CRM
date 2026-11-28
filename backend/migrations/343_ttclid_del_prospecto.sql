-- #1246 · El `ttclid` de TikTok, guardado como ya se guarda el `gclid` (338).
--
-- Desde la #48, `deducirCanal` usa el `ttclid` para decir que un prospecto vino
-- de TikTok Ads, venga pegado a la dirección o como campo suelto (formulario,
-- widget, Make). Pero no se guardaba: en la ficha no se veía POR QUÉ salió de
-- TikTok, y un prospecto con solo `ttclid` salía «Sin origen» en el informe.
--
-- Sin riesgo: una columna nueva y nula. Reaplicable. Para deshacerla:
--   ALTER TABLE lead_utms DROP COLUMN ttclid;
BEGIN;

ALTER TABLE lead_utms ADD COLUMN IF NOT EXISTS ttclid TEXT;
COMMENT ON COLUMN lead_utms.ttclid IS
  'ttclid de TikTok Ads con el que llegó (#1246): de la dirección o del campo suelto del formulario. El canal se deduce aparte.';

-- Permisos para el usuario de la app (CRM 360 e ISEIE), como la 338. La tabla
-- ya los tiene; se repite por si el entorno se montó a mano y para que la
-- migración no dependa de eso.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON lead_utms TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE lead_utms_id_seq TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
