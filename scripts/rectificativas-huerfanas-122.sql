-- #122 · Las rectificativas que no se le restan a nadie
--
-- SOLO LECTURA. Aqui no hay un solo UPDATE: el issue pide atar seis abonos a su
-- venta, y atar el que no es duele mas que dejarlo suelto. Esto averigua CUAL es
-- cada uno y deja la decision escrita para que alguien la confirme.
--
--   psql -U crm_user -d <base> -f scripts/rectificativas-huerfanas-122.sql
--
-- En ISEIE son las 2026/R-1 .. 2026/R-6 (-2.495,00 EUR). En MultiCRM no hay
-- ninguna todavia, y el bloque 5 sirve para enterarse el dia que la haya.


-- 1 · QUIENES SON, Y DE DONDE SALIERON ------------------------------------
--
-- La columna que decide es `nacio_despues`: la diferencia entre cuando se
-- emitio en el papel y cuando entro en la base. Si son meses, no las emitio
-- el CRM — se cargaron a mano con su fecha vieja, y entonces preguntar «que
-- fallo al emitirlas» no lleva a ninguna parte. Si coinciden, si las emitio,
-- y entonces hay un agujero que sigue abierto.
SELECT i.codigo,
       i.fecha_emision,
       i.created_at::date                                   AS entro_en_la_base,
       (i.created_at::date - i.fecha_emision)               AS nacio_despues,
       i.total,
       i.cliente_nombre,
       u.nombre                                             AS la_creo,
       i.conversion_id,
       i.rectifica_id,
       i.rectifica_codigo,
       i.motivo_rectificacion
  FROM invoices i
  LEFT JOIN users u ON u.id = i.created_by
 WHERE i.tipo = 'rectificativa'
   AND i.rectifica_id IS NULL
 ORDER BY i.fecha_emision;


-- 2 · A QUE FACTURA CORRIGE CADA UNA, POR IMPORTE EXACTO -------------------
--
-- El issue dice que no se puede deducir porque no queda ni el cliente. Queda
-- el importe y queda la fecha, y un abono de -1.000,00 EUR sale casi siempre
-- de una factura de 1.000,00 EUR emitida poco antes en la misma empresa.
--
-- Esto NO decide: propone, y ordena por cercania. Si una huerfana saca un solo
-- candidato, es esa y se confirma en un minuto. Si saca cuatro, hace falta el
-- papel — pero ya son cuatro y no todo el año.
SELECT r.codigo                                             AS abono,
       r.fecha_emision                                      AS fecha_abono,
       r.total                                              AS importe_abono,
       f.codigo                                             AS candidata,
       f.fecha_emision                                      AS fecha_candidata,
       f.total                                              AS importe_candidata,
       f.cliente_nombre                                     AS cliente,
       (r.fecha_emision - f.fecha_emision)                  AS dias_antes,
       f.conversion_id
  FROM invoices r
  JOIN invoices f
    ON f.project_id = r.project_id
   AND COALESCE(f.issuer_id, -1) = COALESCE(r.issuer_id, -1)
   AND f.tipo <> 'rectificativa'
   AND f.total = ABS(r.total)
   AND f.fecha_emision <= r.fecha_emision
 WHERE r.tipo = 'rectificativa'
   AND r.rectifica_id IS NULL
 ORDER BY r.fecha_emision, (r.fecha_emision - f.fecha_emision);


-- 3 · LAS QUE NO CUADRAN AL CENTIMO ---------------------------------------
--
-- Un abono parcial no vale lo mismo que su factura: devuelve una parte. Para
-- esas, el candidato es una factura MAYOR o igual, del trimestre anterior.
-- Sale mas ruido, asi que solo para las que el bloque 2 deje vacias.
SELECT r.codigo                                             AS abono,
       r.total                                              AS importe_abono,
       f.codigo                                             AS candidata,
       f.fecha_emision                                      AS fecha_candidata,
       f.total                                              AS importe_candidata,
       f.cliente_nombre                                     AS cliente,
       (r.fecha_emision - f.fecha_emision)                  AS dias_antes
  FROM invoices r
  JOIN invoices f
    ON f.project_id = r.project_id
   AND COALESCE(f.issuer_id, -1) = COALESCE(r.issuer_id, -1)
   AND f.tipo <> 'rectificativa'
   AND f.total >= ABS(r.total)
   AND f.fecha_emision BETWEEN r.fecha_emision - INTERVAL '120 days' AND r.fecha_emision
 WHERE r.tipo = 'rectificativa'
   AND r.rectifica_id IS NULL
   AND NOT EXISTS (
         SELECT 1 FROM invoices x
          WHERE x.project_id = r.project_id
            AND x.tipo <> 'rectificativa'
            AND x.total = ABS(r.total)
            AND x.fecha_emision <= r.fecha_emision)
 ORDER BY r.fecha_emision, (r.fecha_emision - f.fecha_emision);


-- 4 · LA COMPROBACION QUE YA TRAE EL ISSUE --------------------------------
--
-- Diego dio la respuesta de una: en mayo, su panel le pone a Agostina 571,92 y
-- la base 851,92; la diferencia son los 280,00 de la 2026/R-5. O sea que EL ya
-- sabe de quien es esa.
--
-- Si el candidato que propone el bloque 2 para la R-5 cae en una venta de
-- Agostina, el metodo entero queda validado contra un caso conocido y las otras
-- cinco se pueden atar con el mismo criterio. Si cae en otra, el metodo no vale
-- y hay que ir a por los papeles. Una consulta decide eso.
--
-- La asesora de una venta es `vendedora_id`, y si no, la responsable del lead:
-- la misma regla que usa Ventas (sales.service.js), para que el numero case con
-- la pantalla contra la que se cuadra.
SELECT r.codigo                                             AS abono,
       r.total                                              AS importe_abono,
       f.codigo                                             AS candidata,
       f.cliente_nombre                                     AS cliente,
       cv.id                                                AS venta,
       cv.fecha_conversion,
       cv.importe_total                                     AS importe_venta,
       u.nombre                                             AS asesora_que_lo_cobraria
  FROM invoices r
  JOIN invoices f
    ON f.project_id = r.project_id
   AND f.tipo <> 'rectificativa'
   AND f.total = ABS(r.total)
   AND f.fecha_emision <= r.fecha_emision
  LEFT JOIN conversions cv ON cv.id = f.conversion_id
  LEFT JOIN leads l        ON l.id  = cv.lead_id
  LEFT JOIN users u        ON u.id  = COALESCE(cv.vendedora_id, l.responsable_id)
 WHERE r.tipo = 'rectificativa'
   AND r.rectifica_id IS NULL
 ORDER BY r.fecha_emision, (r.fecha_emision - f.fecha_emision);


-- 5 · EL CENSO, PARA VOLVER A MIRAR ---------------------------------------
--
-- Cuantas quedan sueltas y cuanto dinero no se le resta a nadie. Es la cifra
-- que tiene que llegar a cero, y la que avisa si nace otra.
SELECT p.nombre                                             AS proyecto,
       COUNT(*)                                             AS abonos_sueltos,
       SUM(i.total)                                         AS dinero_sin_dueno,
       MIN(i.fecha_emision)                                 AS el_mas_viejo,
       MAX(i.fecha_emision)                                 AS el_mas_nuevo
  FROM invoices i
  JOIN projects p ON p.id = i.project_id
 WHERE i.tipo = 'rectificativa'
   AND i.rectifica_id IS NULL
 GROUP BY p.nombre
 ORDER BY dinero_sin_dueno;
