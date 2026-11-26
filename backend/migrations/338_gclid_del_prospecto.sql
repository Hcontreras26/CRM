-- #48 · El `gclid` de Google Ads, guardado aunque no venga pegado a la dirección.
--
-- Lo que ya había en `lead_utms` (y no se toca): las UTM, `landing_url`,
-- `referrer` (216), `canal_detectado` y `fbc` (284), que es el `fbclid` de Meta
-- en el formato que pide Meta. Faltaba el de Google: hasta ahora solo se sabía
-- si venía DENTRO de `landing_url`, y un formulario de Elementor o Make que lo
-- manda como campo oculto lo perdía (y con él, que el prospecto era de pago).
--
-- Sin riesgo: una columna nueva y nula. Reaplicable. Para deshacerla:
--   ALTER TABLE lead_utms DROP COLUMN gclid;
BEGIN;

ALTER TABLE lead_utms ADD COLUMN IF NOT EXISTS gclid TEXT;
COMMENT ON COLUMN lead_utms.gclid IS
  'gclid de Google Ads con el que llegó (#48): de la dirección o del campo suelto del formulario. El canal se deduce aparte.';

-- Permisos para el usuario de la app (CRM 360 e ISEIE), como la 334. La tabla
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
