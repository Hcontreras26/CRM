-- Los datos fiscales de CEDIA, que estaban sin rellenar.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE ESTO NO ES SOLO COSA DEL CORREO AL TUTOR
--
-- La migracion 102 sembro las tres sociedades con el CIF puesto a mano como
-- «PENDIENTE-CIF-CEDIA», «PENDIENTE-CIF-ICTESS» y «PENDIENTE-CIF-LATERAL», y
-- esa migracion corre en TODOS los entornos.
--
-- `invoices.service.js` pinta `NIF: <emisor.nif>` en el PDF de cada factura. O
-- sea que, si nadie los relleno a mano, toda factura emitida bajo una de esas
-- sociedades salio con un CIF inventado impreso. Eso no es una pantalla fea: es
-- un documento fiscal que se le manda a un cliente.
--
-- DE DONDE SALEN ESTOS DATOS
--
-- De la web de la empresa, `cediaidsl.com`, donde aparecen en tres sitios —
-- cabecera, contacto y pie — con este texto literal:
--
--     «CEDIA Investigación y Desarrollo SL, Centros de Educación, Desarrollo e
--      Inteligencia Artificial. NIF: B93806404. Av. Aragón 30, Valencia 46021»
--
-- El sitio no tiene aviso legal (da 404), asi que la web es la unica fuente
-- publica. CONVIENE CONTRASTARLO con una factura de la casa: el NIF empieza por
-- B93, que es la serie de Malaga, y el domicilio es de Valencia. No tiene por
-- que estar mal —una sociedad registrada en Malaga puede tener ahi su
-- domicilio— pero es de las cosas que se miran dos veces antes de imprimirlas.
--
-- ICTESS y LATERAL se quedan como estan: no tengo sus datos.

BEGIN;

-- Solo si sigue con el marcador. Si alguien ya los relleno a mano, manda lo
-- suyo: esta migracion no pisa un dato de verdad con uno sacado de una web.
UPDATE invoice_issuers
   SET nif        = 'B93806404',
       direccion  = 'Av. Aragón 30',
       ciudad     = 'Valencia',
       cp         = '46021',
       pais       = COALESCE(pais, 'España'),
       email      = COALESCE(email, 'facturacion@cediaidsl.com'),
       updated_at = NOW()
 WHERE nif = 'PENDIENTE-CIF-CEDIA';

-- Y los mismos datos en el correo del tutor, donde estaban como «(pendiente de
-- rellenar)». Se cambian con `replace` y no reescribiendo la plantilla entera:
-- es editable desde el CRM, y quien la haya retocado no tiene por que perder su
-- texto por venir a rellenar un CIF.
UPDATE email_templates
   SET body_html = replace(
         replace(body_html,
           'CIF: (pendiente de rellenar)',
           'NIF: B93806404'),
         'Dirección: (pendiente de rellenar)',
         'Av. Aragón 30 · 46021 Valencia'),
       updated_at = NOW()
 WHERE name = 'Avisar tutor · comisiones del mes'
   AND project_id IS NULL;

COMMIT;
