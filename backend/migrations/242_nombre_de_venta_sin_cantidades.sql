-- 242 · El nombre de las ventas con varias líneas, sin «2x» (#223)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- QUÉ ARREGLA
--
-- El diálogo de venta componía el nombre de una venta con varias líneas como
-- «1x Curso A + 2x Curso B». La cantidad ya está en cada línea
-- (`conversion_items`); en el nombre solo estorba, y en Ventas salía como un
-- programa aparte.
--
-- Diego (04/11/2026): una venta con cursos distintos SE QUEDA COMO UNA SOLA
-- VENTA —partirla movería cobros y facturas ya emitidas— y solo se limpia el
-- nombre. El grifo ya está cerrado en esta misma PR
-- (`conversions/nombre-de-las-lineas.js`); esto limpia las que quedaron atrás.
--
-- LA REGLA, la misma que la del grifo: el nombre son los cursos de sus líneas,
-- en su orden, sin cantidades y sin repetir: «Curso A + Curso B».
--
-- QUÉ NO TOCA
-- - Ni el curso (`producto_contratado_id`), ni importes, cobros, cuotas,
--   facturas o comisiones. Solo el texto.
-- - Las ventas cuyo nombre no lleva el «Nx » del diálogo, ni las que no tienen
--   líneas.
-- - Las que eran todas de un mismo curso: la 214 ya les puso el nombre del
--   catálogo.
--
-- Reaplicable: solo toca nombres que todavía llevan «Nx », y al limpiarlos
-- dejan de llevarlo.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ANTES DE APLICAR, VER CUÁLES CAMBIAN:
--
--   SELECT c.id, c.producto_contratado AS dice_ahora, n.queda
--     FROM conversions c
--     JOIN LATERAL (
--       SELECT string_agg(d, ' + ' ORDER BY primera) AS queda
--         FROM (SELECT MIN(btrim(i.descripcion)) AS d, MIN(i.orden) AS primera
--                 FROM conversion_items i
--                WHERE i.conversion_id = c.id AND btrim(COALESCE(i.descripcion, '')) <> ''
--                GROUP BY lower(btrim(i.descripcion))) x
--     ) n ON n.queda IS NOT NULL
--    WHERE c.producto_contratado ~ '(^|\s\+\s)[0-9]+x\s'
--    ORDER BY c.id;

BEGIN;

-- La copia de antes, para deshacerlo sin adivinar. Se queda: ocupa poco y es
-- el único rastro de que esto pasó.
CREATE TABLE IF NOT EXISTS conversions_nombre_bak (
  conversion_id  INTEGER PRIMARY KEY REFERENCES conversions(id) ON DELETE CASCADE,
  decia          VARCHAR(255) NOT NULL,
  queda          VARCHAR(255) NOT NULL,
  limpiado_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TEMP TABLE nombres_limpios ON COMMIT DROP AS
SELECT c.id AS conversion_id,
       c.producto_contratado AS decia,
       CASE WHEN length(n.queda) <= 255 THEN n.queda
            ELSE rtrim(left(n.queda, 254)) || '…' END AS queda
  FROM conversions c
  JOIN LATERAL (
    SELECT string_agg(d, ' + ' ORDER BY primera) AS queda
      FROM (SELECT MIN(regexp_replace(btrim(i.descripcion), '\s+', ' ', 'g')) AS d,
                   MIN(i.orden) AS primera
              FROM conversion_items i
             WHERE i.conversion_id = c.id AND btrim(COALESCE(i.descripcion, '')) <> ''
             GROUP BY lower(regexp_replace(btrim(i.descripcion), '\s+', ' ', 'g'))) x
  ) n ON n.queda IS NOT NULL
 WHERE c.producto_contratado ~ '(^|\s\+\s)[0-9]+x\s';

INSERT INTO conversions_nombre_bak (conversion_id, decia, queda)
SELECT conversion_id, decia, queda FROM nombres_limpios
ON CONFLICT (conversion_id) DO NOTHING;

UPDATE conversions c
   SET producto_contratado = n.queda,
       updated_at          = NOW()
  FROM nombres_limpios n
 WHERE c.id = n.conversion_id;

COMMIT;

-- Para deshacerlo, si hiciera falta:
--
--   UPDATE conversions c
--      SET producto_contratado = b.decia
--     FROM conversions_nombre_bak b
--    WHERE b.conversion_id = c.id;

-- Que el CRM pueda leerla aunque la migración la pase postgres (como la 214).
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT ON conversions_nombre_bak TO %I', r);
    END IF;
  END LOOP;
END $$;
