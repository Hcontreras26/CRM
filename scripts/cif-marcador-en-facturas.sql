-- ¿Cuántas facturas llevan impreso un CIF que no existe?
--
-- SOLO LECTURA. La parte que corrige está abajo, comentada, y no se ejecuta sin
-- que alguien la descomente a conciencia: toca documentos ya emitidos.
--
--   psql -U crm_user -d crm_prod_db -f scripts/cif-marcador-en-facturas.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DE DÓNDE VIENE
--
-- La migración 102 sembró las tres sociedades con el CIF escrito a mano:
--
--     PENDIENTE-CIF-CEDIA · PENDIENTE-CIF-ICTESS · PENDIENTE-CIF-LATERAL
--
-- y corre en todos los entornos. `invoices.service.js` imprime `NIF: <el que
-- sea>` en el PDF, así que toda factura emitida bajo una de esas sociedades
-- salió con eso encima.
--
-- Y NO BASTA CON ARREGLAR EL EMISOR. La factura guarda su propia copia de los
-- datos fiscales al emitirse (`invoices.issuer_nif`, `issuer_direccion`, …) y el
-- PDF se pinta de ahí, no del emisor en vivo. Está bien pensado —una factura de
-- hace un año tiene que seguir diciendo lo que decía—, pero significa que
-- rellenar el emisor hoy arregla las futuras y deja las viejas como estaban:
-- cada vez que alguien se descargue una de esas, el CIF falso vuelve a salir.


-- 1 · CUÁNTAS SON, Y DE QUÉ SOCIEDAD ---------------------------------------
SELECT COALESCE(i.issuer_nif, '(sin emisor guardado)') AS nif_impreso,
       i.issuer_razon_social                           AS sociedad,
       COUNT(*)::int                                   AS facturas,
       MIN(i.fecha_emision)                            AS la_primera,
       MAX(i.fecha_emision)                            AS la_ultima,
       SUM(i.total)                                    AS importe
  FROM invoices i
 WHERE i.issuer_nif LIKE 'PENDIENTE-CIF-%'
 GROUP BY 1, 2
 ORDER BY facturas DESC;


-- 2 · CUÁLES, PARA PODER MIRAR UNA ------------------------------------------
--
-- Con el código a la vista: si hay que avisar a alguien, se avisa por su número
-- de factura, no por su id.
SELECT i.codigo, i.fecha_emision, i.cliente_nombre, i.total,
       i.issuer_razon_social, i.issuer_nif, i.estado
  FROM invoices i
 WHERE i.issuer_nif LIKE 'PENDIENTE-CIF-%'
 ORDER BY i.fecha_emision DESC
 LIMIT 50;


-- 3 · Y EL EMISOR, QUE ES DE DONDE SALDRÁN LAS PRÓXIMAS ---------------------
SELECT id, razon_social, nif, direccion, cp, ciudad, activo
  FROM invoice_issuers
 ORDER BY id;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · LA CORRECCIÓN. DESCOMENTAR A CONCIENCIA.
--
-- Reescribe el dato fiscal de facturas YA EMITIDAS. Se hace porque el que hay
-- es falso —no es una corrección de criterio, es un CIF que no existe— pero es
-- justo la clase de cosa que se mira dos veces:
--
--   · Haz copia antes:  pg_dump ... > antes.sql
--   · Corre primero el bloque 1 y apunta el número. Después tiene que dar cero.
--   · Y sólo toca las que llevan el marcador: una factura con un CIF de verdad,
--     aunque sea otro, no se toca. Ahí la copia es la verdad.
--
-- Los datos de CEDIA salen de su web (aparecen en cabecera, contacto y pie):
-- «CEDIA Investigación y Desarrollo SL. NIF: B93806404. Av. Aragón 30,
-- Valencia 46021». CONTRÁSTALO con una factura de la casa antes de correr esto:
-- el NIF va por la serie B93, que es de Málaga, y el domicilio es de Valencia.
--
-- ICTESS y LATERAL no están aquí porque no tengo sus datos. Sus facturas se
-- quedan con el marcador hasta que alguien los dé.

-- BEGIN;
--
-- UPDATE invoices
--    SET issuer_nif       = 'B93806404',
--        issuer_direccion = COALESCE(issuer_direccion, 'Av. Aragón 30'),
--        issuer_ciudad    = COALESCE(issuer_ciudad, 'Valencia'),
--        issuer_cp        = COALESCE(issuer_cp, '46021'),
--        issuer_pais      = COALESCE(issuer_pais, 'España'),
--        -- El PDF se cachea en disco: si no se borra, se sigue sirviendo el
--        -- viejo con el CIF falso y parecerá que el arreglo no hizo nada.
--        pdf_path         = NULL,
--        updated_at       = NOW()
--  WHERE issuer_nif = 'PENDIENTE-CIF-CEDIA';
--
-- COMMIT;
