-- 298 · #770 · Cursos vendidos sin desarrollar (Automatizaciones 7/9, fase 2 de #336).
-- (Nació como 296; renumerada al fusionar: en staging la 296 es la de Monitask, #236,
-- y la 297 la del control de subidas, #771.)
--
-- Cuando se vende un curso que todavía no existe, el CRM crea solo su
-- «Curso pendiente» (o suma la alumna al que ya está abierto), se lo asigna a
-- su responsable y le avisa con la fecha límite. Para eso:
--
--   products.sin_desarrollar          la marca: «este curso se vende pero aún
--                                     no está hecho». Sin ella, vender no crea nada.
--   products.responsable_desarrollo_id quién lo desarrolla (tutor o tutor redactor).
--                                     Vacío: lo asigna administración tras la venta.
--   products.plazo_desarrollo_dias    días desde la venta hasta la fecha límite.
--                                     Vacío: el de serie por tipo
--                                     (CURSOS_PENDIENTES_PLAZO_DIAS en el .env).
--
-- Y un estado nuevo en el ciclo del pendiente, «entregado», entre «en
-- desarrollo» y «publicado»: el tutor lo da por hecho y falta subirlo. Lo
-- necesita también la #771 (control de subidas). La regla de la 217 —no se
-- avanza sin fecha comprometida— vale también para «entregado».
--
-- Sin riesgo para lo que hay: tres columnas nuevas con valor de serie y un
-- CHECK que admite un valor más. Reaplicable. Para deshacerlo (si no hay
-- ningún pendiente en «entregado»):
--   ALTER TABLE products DROP COLUMN sin_desarrollar, DROP COLUMN responsable_desarrollo_id, DROP COLUMN plazo_desarrollo_dias;
--   y volver a poner los dos CHECK de la 217.
--
-- PORTE A CRM-ISEIE (#458): allí la numeración es otra y la tabla
-- `cursos_pendientes` tiene que existir antes (su 217 equivalente).

BEGIN;

ALTER TABLE products ADD COLUMN IF NOT EXISTS sin_desarrollar BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS responsable_desarrollo_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS plazo_desarrollo_dias SMALLINT;

-- El plazo, si se pone, entre 1 día y un año.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_plazo_desarrollo_dias_check') THEN
    ALTER TABLE products ADD CONSTRAINT products_plazo_desarrollo_dias_check
      CHECK (plazo_desarrollo_dias IS NULL OR plazo_desarrollo_dias BETWEEN 1 AND 365);
  END IF;
END $$;

-- Para la búsqueda de cada venta: solo los marcados.
CREATE INDEX IF NOT EXISTS idx_products_sin_desarrollar ON products (id) WHERE sin_desarrollar;

-- El estado «entregado». El CHECK de la 217 no tiene nombre propio: se busca
-- por lo que dice y se cambia por uno con nombre.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'cursos_pendientes'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%pendiente_asignar%'
       AND pg_get_constraintdef(oid) NOT LIKE '%entregado%'
       AND conname <> 'cp_fecha_para_avanzar'
  LOOP
    EXECUTE format('ALTER TABLE cursos_pendientes DROP CONSTRAINT %I', r.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'cursos_pendientes'::regclass AND conname = 'cp_estado_valido') THEN
    ALTER TABLE cursos_pendientes ADD CONSTRAINT cp_estado_valido
      CHECK (estado IN ('pendiente_asignar', 'asignado', 'en_desarrollo', 'entregado', 'publicado', 'cerrado', 'cancelado'));
  END IF;
END $$;

ALTER TABLE cursos_pendientes DROP CONSTRAINT IF EXISTS cp_fecha_para_avanzar;
ALTER TABLE cursos_pendientes ADD CONSTRAINT cp_fecha_para_avanzar
  CHECK (estado NOT IN ('en_desarrollo', 'entregado', 'publicado', 'cerrado') OR fecha_comprometida IS NOT NULL);

COMMIT;
