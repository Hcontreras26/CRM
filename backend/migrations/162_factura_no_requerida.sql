-- La columna `conversions.factura_no_requerida`, que nunca tuvo migración.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- QUÉ PASÓ
--
-- La introdujo el commit 6cd70ca8, del 22/07/2026 — «campo
-- factura_no_requerida: anular pendientes de facturar antiguos» — y desde
-- entonces la leen CINCO sitios: la lista de Ventas, el resumen de lo que falta
-- por facturar, Ingresos y el aviso de ventas sin factura.
--
-- Pero nadie escribió el `ALTER TABLE`. La columna se creó a mano en la base de
-- quien lo hizo, y ahí se quedó.
--
-- LO QUE ESO COSTÓ
--
-- Cualquier base creada desde cero —CI, una máquina nueva, un entorno nuevo— no
-- tiene la columna, y `GET /api/conversions` devuelve 500:
--
--     no existe la columna c.factura_no_requerida
--
-- O sea que la lista de Ventas, entera, no carga. En CI eso son tres pruebas de
-- `conversions.test.js` en rojo desde julio, y el rojo de CI acaba siendo ruido
-- que esconde los fallos de verdad.
--
-- Es el mismo patrón que describe el #71 con las tablas de producción: las
-- bases no están iguales, y lo que funciona en una revienta en otra. Aquí ni
-- siquiera hace falta un problema de permisos — basta con que el `ALTER TABLE`
-- viva solo en el portátil de alguien.
--
-- `IF NOT EXISTS` es lo que hace esto seguro: donde ya existe —producción, y la
-- máquina donde nació— no se toca nada ni se pierde un dato marcado. Donde no,
-- se crea y la pantalla vuelve.

BEGIN;

-- Se deja NULABLE y sin valor por defecto a propósito: el código ya la lee con
-- `COALESCE(..., false)` y `IS NOT TRUE`, así que una fila sin marcar significa
-- «sí requiere factura», que es lo correcto. Poner un DEFAULT ahora haría que
-- las filas nuevas difieran de las viejas sin motivo.
ALTER TABLE conversions
  ADD COLUMN IF NOT EXISTS factura_no_requerida BOOLEAN;

COMMENT ON COLUMN conversions.factura_no_requerida IS
  'TRUE = esta venta no necesita factura. Se usó para dar por cerrados los pendientes de facturar antiguos. NULL o FALSE = sí la necesita. Se marca a mano: ninguna pantalla la escribe.';

-- Se filtra por ella al listar lo que falta por facturar, y son pocas las
-- marcadas: un índice parcial es el que sirve y no ocupa nada.
CREATE INDEX IF NOT EXISTS idx_conversions_sin_factura_requerida
  ON conversions (project_id)
  WHERE factura_no_requerida IS TRUE;

COMMIT;
