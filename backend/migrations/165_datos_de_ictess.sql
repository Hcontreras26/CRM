-- Los datos fiscales de ICTESS, que seguia con el marcador.
--
-- La 161 relleno CEDIA. Esta rellena ICTESS. LATERAL SE QUEDA COMO ESTA.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DE DONDE SALE
--
-- De SU PROPIO aviso legal, en `ictess.com/aviso-legal`, literal:
--
--     «ICTESS INGENIERIA E INNOVACION SL … B25951955 … Avenida Aragon 30
--      ESC. 1 8 5. 46021, Valencia (Valencia). España»
--
-- Es la misma calle que CEDIA —Av. Aragón 30— asi que cuadra: comparten
-- edificio.
--
-- POR QUE LATERAL NO ENTRA AQUI
--
-- Su web no aparece. Lo unico que hay son registros mercantiles de terceros
-- —Iberinform, Infonif, DatosCif— que coinciden entre si, pero ninguno es la
-- empresa. Un CIF sacado de un directorio y puesto en una factura no se
-- arregla despues: ya salio impreso y ya se mando.
--
-- Asi que se queda con «PENDIENTE-CIF-LATERAL» y con el guardian impidiendole
-- emitir, que es exactamente lo que tiene que pasar mientras no se sepa. Cuando
-- alguien de la casa confirme el dato, se rellena y ya esta.
--
-- Como la 161: solo se toca si SIGUE con el marcador. Si alguien ya puso el
-- bueno a mano, manda el suyo.

BEGIN;

UPDATE invoice_issuers
   SET nif        = 'B25951955',
       direccion  = 'Avenida Aragón 30, Esc. 1, 8º 5ª',
       ciudad     = 'Valencia',
       cp         = '46021',
       pais       = COALESCE(pais, 'España'),
       updated_at = NOW()
 WHERE nif = 'PENDIENTE-CIF-ICTESS';

COMMIT;
