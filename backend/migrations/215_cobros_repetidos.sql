-- 215 · Los cobros repetidos del libro (#135, #42)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- QUÉ ARREGLA
--
-- Filas repetidas en `conversion_payments`: misma venta, mismo importe, misma
-- fecha de cobro, creadas con semanas de diferencia. En el último recuento eran
-- 83 filas y 22.972,54 €, y 72 de las 83 se crearon el 18/06: una carga que
-- volvió a meter cobros que ya estaban.
--
-- Toda pantalla que SUMA este libro está inflada: Ventas, la gráfica de
-- ingresos, el «dinero que entró» del resumen. Reportes se libra porque usa
-- `importe_pagado` de la venta, que se mantiene desde el código al añadir o
-- borrar un cobro y está bien — y por eso las dos pantallas discrepaban.
-- Un `DELETE` directo NO toca `importe_pagado` (no hay triggers), que es lo que
-- se quiere: ya estaba bien.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EL NÚMERO
--
-- La 215: `staging` llega a la 207 y las PR abiertas ocupan de la 208 a la 214.
-- Comprobar que sigue libre. Reaplicable: tras la primera vez no quedan
-- repetidos que cumplan las condiciones y no hace nada.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LO QUE SE CAMBIÓ RESPECTO A LA VERSIÓN DE LA RAMA (era la 180)
--
-- Diego avisó en el #135 de que aquella versión «no es segura (borra cobros y
-- rompe Stripe)». Había dos cosas, y esta las quita:
--
--  1. EL ÍNDICE ÚNICO (venta, importe, fecha) YA NO SE CREA. La sincronización
--     de Stripe llama a `addPayment` con `allowDuplicate: true` A PROPÓSITO: dos
--     cobros iguales el mismo día para una venta pueden ser legítimos, y el alta
--     manual también tiene la casilla «duplicado permitido». Con el índice, el
--     segundo cobro haría FALLAR la sincronización de Stripe. La protección
--     contra duplicar ya existe en el código (`addPayment` avisa con un 409), y
--     un índice único la contradice.
--
--  2. YA NO SE BORRA UN «REPETIDO» SOLO POR PARECERSE. Antes bastaba que dos filas
--     coincidieran en venta, importe y fecha: dos cobros iguales el mismo día,
--     apuntados con minutos de diferencia, son lo normal cuando de verdad entró
--     dos veces el dinero, y la más nueva se habría borrado. Ahora además:
--
--       · el repetido se creó AL MENOS UN DÍA DESPUÉS del original. Una carga
--         que se vuelve a ejecutar lo hace semanas después; un cobro real
--         repetido, el mismo día;
--       · coinciden también el método, la moneda y la referencia (dos
--         transferencias con referencias distintas son dos cobros);
--       · y no tiene NADA colgando (ver abajo).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LA TRAMPA QUE HAY QUE CONOCER
--
-- Borrar un cobro NO es borrar una fila suelta. De `conversion_payments`
-- cuelgan cinco cosas, y una de ellas en CASCADA:
--
--     tutor_commissions.payment_id          ON DELETE CASCADE   ← se borra con él
--     invoices.payment_id                   ON DELETE SET NULL
--     conversion_installments.payment_id    ON DELETE SET NULL
--     conversion_refunds.payment_id         ON DELETE SET NULL
--     stripe_payments.conversion_payment_id ON DELETE SET NULL
--
-- Un `DELETE` a lo bruto se lleva por delante la comisión de un profesor sin
-- decir nada. Por eso SOLO se borra lo que no tiene NADA colgando; el resto se
-- queda y se lista al final para mirarlo a mano.
--
-- Se conserva SIEMPRE el más antiguo de cada grupo: es el que se creó cuando el
-- dinero entró de verdad. Y el respaldo se queda en `conversion_payments_repetidos`
-- con la fila entera, para poder deshacerlo.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- VER LO QUE VA A PASAR, ANTES (solo lectura):
--
--   WITH g AS (
--     SELECT cp.*,
--            ROW_NUMBER() OVER w AS puesto,
--            MIN(cp.created_at) OVER w AS primer_alta,
--            COUNT(*) OVER w AS veces
--       FROM conversion_payments cp
--     WINDOW w AS (PARTITION BY cp.conversion_id, cp.importe, cp.fecha,
--                  COALESCE(cp.metodo, ''), COALESCE(cp.moneda, ''), COALESCE(cp.referencia, ''))
--   )
--   SELECT g.conversion_id AS venta, l.nombre AS cliente, g.importe, g.fecha,
--          g.veces, g.created_at::date AS creado, g.primer_alta::date AS original,
--          CASE
--            WHEN g.created_at < g.primer_alta + INTERVAL '1 day' THEN 'el mismo dia: se deja'
--            WHEN EXISTS (SELECT 1 FROM invoices i WHERE i.payment_id = g.id)                     THEN 'tiene factura: se deja'
--            WHEN EXISTS (SELECT 1 FROM tutor_commissions t WHERE t.payment_id = g.id)           THEN 'tiene comision: se deja'
--            WHEN EXISTS (SELECT 1 FROM conversion_installments n WHERE n.payment_id = g.id)     THEN 'tiene cuota: se deja'
--            WHEN EXISTS (SELECT 1 FROM conversion_refunds d WHERE d.payment_id = g.id)          THEN 'tiene devolucion: se deja'
--            WHEN EXISTS (SELECT 1 FROM stripe_payments s WHERE s.conversion_payment_id = g.id)  THEN 'es de Stripe: se deja'
--            ELSE 'SE BORRA'
--          END AS que_pasa
--     FROM g
--     JOIN conversions c ON c.id = g.conversion_id
--     JOIN leads l ON l.id = c.lead_id
--    WHERE g.puesto > 1
--    ORDER BY que_pasa, g.importe DESC;
--
--   Y el total de lo que se borraría:
--
--   (la misma consulta, con SUM(importe) y COUNT(*) WHERE que_pasa = 'SE BORRA')

BEGIN;

CREATE TABLE IF NOT EXISTS conversion_payments_repetidos (
  id             INTEGER PRIMARY KEY,
  conversion_id  INTEGER,
  importe        NUMERIC(10,2),
  fecha          DATE,
  notas          TEXT,
  metodo         VARCHAR(30),
  moneda         VARCHAR(10),
  referencia     VARCHAR(255),
  created_at     TIMESTAMPTZ,
  borrado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SI LA 180 DE LA RAMA DE ÁNGEL SE APLICÓ EN ALGÚN SITIO (una base local, un
-- entorno de pruebas), se deshace lo peligroso y se completa lo que faltaba:
--
--   · su índice único (venta, importe, fecha) se quita: rechaza un segundo cobro
--     igual el mismo día, que es justo lo que Stripe y «duplicado permitido»
--     hacen a propósito. No existe en ninguna base donde esa 180 no se aplicó,
--     y entonces esto no hace nada;
--   · la tabla de respaldo de esa versión no tenía `moneda` ni `referencia`.
DROP INDEX IF EXISTS uq_cobro_venta_importe_fecha;
ALTER TABLE conversion_payments_repetidos ADD COLUMN IF NOT EXISTS moneda     VARCHAR(10);
ALTER TABLE conversion_payments_repetidos ADD COLUMN IF NOT EXISTS referencia VARCHAR(255);

-- Los repetidos: mismo (venta, importe, fecha, método, moneda, referencia). Se
-- marca todo menos el primero que se creó, y se guarda cuándo se creó ese primero.
CREATE TEMP TABLE repetidos ON COMMIT DROP AS
SELECT p.*
  FROM (
    SELECT cp.*,
           ROW_NUMBER() OVER w AS puesto,
           MIN(cp.created_at) OVER w AS primer_alta
      FROM conversion_payments cp
    WINDOW w AS (PARTITION BY cp.conversion_id, cp.importe, cp.fecha,
                 COALESCE(cp.metodo, ''), COALESCE(cp.moneda, ''), COALESCE(cp.referencia, ''))
  ) p
 WHERE p.puesto > 1;

-- De esos, los que se crearon al menos un día después del original (una carga
-- repetida, no un cobro real apuntado dos veces el mismo día) y no tienen NADA
-- colgando. El resto se quedan.
CREATE TEMP TABLE borrables ON COMMIT DROP AS
SELECT r.*
  FROM repetidos r
 WHERE r.created_at >= r.primer_alta + INTERVAL '1 day'
   AND NOT EXISTS (SELECT 1 FROM invoices                i WHERE i.payment_id = r.id)
   AND NOT EXISTS (SELECT 1 FROM tutor_commissions       t WHERE t.payment_id = r.id)
   AND NOT EXISTS (SELECT 1 FROM conversion_installments n WHERE n.payment_id = r.id)
   AND NOT EXISTS (SELECT 1 FROM conversion_refunds      d WHERE d.payment_id = r.id)
   AND NOT EXISTS (SELECT 1 FROM stripe_payments         s WHERE s.conversion_payment_id = r.id);

INSERT INTO conversion_payments_repetidos
  (id, conversion_id, importe, fecha, notas, metodo, moneda, referencia, created_at)
SELECT id, conversion_id, importe, fecha, notas, metodo, moneda, referencia, created_at FROM borrables
ON CONFLICT (id) DO NOTHING;

DELETE FROM conversion_payments p USING borrables b WHERE p.id = b.id;

-- Decir en voz alta qué ha pasado y qué queda. Una migración que arregla
-- dinero y no cuenta cuánto ha tocado obliga a fiarse de ella.
DO $$
DECLARE
  borrados INTEGER;
  euros    NUMERIC;
  quedan   INTEGER;
BEGIN
  SELECT count(*), COALESCE(sum(importe), 0) INTO borrados, euros
    FROM conversion_payments_repetidos WHERE borrado_at > NOW() - INTERVAL '1 minute';
  SELECT count(*) INTO quedan FROM repetidos r
   WHERE NOT EXISTS (SELECT 1 FROM borrables b WHERE b.id = r.id);

  RAISE NOTICE 'Cobros repetidos borrados: % (% EUR)', borrados, euros;
  IF quedan > 0 THEN
    RAISE NOTICE 'Quedan % repetidos SIN tocar: creados el mismo dia que el original, o con factura, comision, cuota, devolucion o cobro de Stripe colgando. Se miran a mano (consulta de la cabecera).', quedan;
  END IF;
END $$;

COMMIT;

-- NO SE CREA NINGÚN ÍNDICE ÚNICO. Ver la cabecera: chocaría con la sincronización
-- de Stripe y con la casilla «duplicado permitido».
--
-- Para deshacerlo:
--
--   INSERT INTO conversion_payments (id, conversion_id, importe, fecha, notas, metodo, moneda, referencia, created_at)
--   SELECT id, conversion_id, importe, fecha, notas, metodo, moneda, referencia, created_at
--     FROM conversion_payments_repetidos;
--   SELECT setval('conversion_payments_id_seq', (SELECT max(id) FROM conversion_payments));

-- Que el CRM pueda leerla aunque la migración la pase postgres (como la 230, la 231 y la 232).
-- Faltaba: lo vio la auditoría de la 2.6.0 (02/11).
DO $$
DECLARE r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT ON conversion_payments_repetidos TO %I', r);
    END IF;
  END LOOP;
END $$;
