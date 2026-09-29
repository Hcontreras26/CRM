-- Los estados de la comisión del tutor. Diego, 14/09:
--
--     «Ahí que pone pendiente deben aparecer los siguientes estados: Pendiente,
--      Notificada, Falta Factura. Si este estado se pone en septiembre, se
--      mantiene SOLO en ese mes, hasta que se modifique.»
--
-- Lo de «solo en ese mes» no hay que construirlo: `tutor_commissions` ya tiene
-- `periodo` y cada fila es de un mes concreto. Poner un estado en septiembre no
-- puede tocar agosto, por estructura.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ES UN CHECK, NO UN ENUM
--
-- La nota del documento avisaba de mirarlo, porque buscar solo el CHECK cuando
-- era un ENUM ya rompió las conversiones en los dos CRM una vez. Comprobado: la
-- migración 124 lo dejó como `CHECK (estado IN (...))`. Se amplía el CHECK.
--
-- LOS DOS NUEVOS SIGNIFICAN «TODAVÍA SE LE DEBE»
--
-- Y eso es lo que hay que entender antes de tocar nada. `pendiente`, `pagada` y
-- `revertida` dicen DÓNDE ESTÁ EL DINERO. Los dos que entran no cambian de
-- sitio el dinero: dicen por dónde va el trámite.
--
--     notificada     se le mandó el correo, esperando su factura
--     falta_factura  contestó, pero lo que mandó no sirve o no llegó
--
-- En los dos casos sigue sin cobrar. Por eso, en el código, «lo que se debe»
-- pasa a ser «lo que NO está pagada ni revertida» en vez de «lo que está
-- pendiente»: así estos dos cuentan, y el que se invente mañana también.
--
-- Sin eso, avisar a un tutor lo haría desaparecer de «Por pagar» y la pantalla
-- diría que no se le debe nada.

BEGIN;

ALTER TABLE tutor_commissions DROP CONSTRAINT IF EXISTS tutor_commissions_estado_check;

ALTER TABLE tutor_commissions
  ADD CONSTRAINT tutor_commissions_estado_check
  CHECK (estado IN ('pendiente', 'notificada', 'falta_factura', 'pagada', 'revertida'));

COMMENT ON COLUMN tutor_commissions.estado IS
  'pendiente | notificada | falta_factura | pagada | revertida. Las tres primeras significan que SIGUE SIN COBRAR: lo que se debe es todo lo que no esta pagada ni revertida.';

COMMIT;
