-- Los 133,33 € que nadie cobra: la venta #177 no dice de qué formación es.
--
-- SOLO LECTURA hasta el bloque 4, que va comentado. Diego dio el dato el 14/09:
--
--     «Este pago es de la formación: Diplomado en neurociencia aplicada al
--      trauma y plasticidad cerebral. La tutora es Alba Burundarena.»
--
-- No es un fallo del CRM: es el dato que faltaba. Mientras la venta no diga qué
-- formación es, no se sabe de quién es la comisión y el tutor no cobra por ella.
--
--   psql -U crm_user -d crm_prod_db -f scripts/venta-177-sin-formacion.sql
--
-- OJO CON EL PASO 2. La nota lo dice: en la lista aparece una «Alba»
-- (alba@psikoaprende.com) con 2 cursos, y hay que CONFIRMAR QUE ES LA MISMA
-- PERSONA antes de tocar nada. Atar el cobro a la tutora equivocada es peor que
-- dejarlo sin atar: lo segundo se ve en un aviso, lo primero se paga.


-- 1 · LA VENTA, TAL COMO ESTÁ -----------------------------------------------
SELECT cv.id, cv.fecha_conversion, l.nombre AS alumno, cv.importe_total,
       cv.producto_contratado          AS lo_que_dice_el_texto,
       cv.producto_contratado_id       AS atada_al_catalogo,
       p.nombre                        AS formacion_actual
  FROM conversions cv
  LEFT JOIN leads l    ON l.id = cv.lead_id
  LEFT JOIN products p ON p.id = cv.producto_contratado_id
 WHERE cv.id = 177;


-- 2 · LA FORMACIÓN QUE DIJO DIEGO, Y SU ID -----------------------------------
--
-- Se busca por trozos y no por el título entero: el nombre exacto en el
-- catálogo no tiene por qué ser el que se dice de viva voz.
SELECT p.id, p.nombre, p.project_id, pr.nombre AS proyecto, p.active
  FROM products p
  LEFT JOIN projects pr ON pr.id = p.project_id
 WHERE p.nombre ILIKE '%neurocien%'
 ORDER BY p.active DESC, p.id;


-- 3 · ¿ES ALBA LA TUTORA DE ESA FORMACIÓN, Y DESDE CUÁNDO? -------------------
--
-- Las dos cosas importan. Si consta pero con fecha de inicio POSTERIOR al
-- cobro, la comisión seguirá sin salir y parecerá que el arreglo no funcionó:
-- el módulo no genera nada anterior a la fecha de inicio de cada tutor, ni
-- anterior al 2026-08-01.
SELECT u.id, u.nombre, u.email,
       p.nombre  AS formacion,
       c.pct, c.vigente_desde, c.vigente_hasta, c.activa
  FROM users u
  LEFT JOIN tutor_collaborations c ON c.tutor_id = u.id
  LEFT JOIN products p             ON p.id = c.product_id
 WHERE u.role = 'tutor'
   AND (u.nombre ILIKE '%alba%' OR u.email ILIKE '%alba%')
 ORDER BY u.id, p.nombre;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · ATAR LA VENTA. DESCOMENTAR CUANDO LOS TRES BLOQUES CUADREN.
--
--   · El id del producto sale del bloque 2. NO se deja escrito aquí a propósito:
--     ponerlo a ojo es como se ata el cobro a la formación de al lado.
--   · Que Alba conste como tutora, con fecha de inicio ANTERIOR al cobro.
--   · Después hay que pulsar «Calcular» en /tutores/comisiones de septiembre:
--     esto solo pone el dato, la comisión la escribe el cálculo.

-- BEGIN;
--
-- UPDATE conversions
--    SET producto_contratado_id = <EL ID DEL BLOQUE 2>,
--        updated_at = NOW()
--  WHERE id = 177
--    AND producto_contratado_id IS NULL;   -- si ya la ató alguien, manda lo suyo
--
-- COMMIT;

-- 5 · COMPROBACIÓN. Después de calcular, esto tiene que devolver la comisión
--     de Alba por ese cobro, y el aviso de la pantalla debe desaparecer.
-- SELECT tc.id, u.nombre AS tutora, p.nombre AS formacion,
--        tc.base_calculo, tc.pct, tc.importe, tc.periodo, tc.estado
--   FROM tutor_commissions tc
--   JOIN users u    ON u.id = tc.tutor_id
--   JOIN products p ON p.id = tc.product_id
--  WHERE p.nombre ILIKE '%neurocien%';
