-- 304 · Notas del historial sin autor (02/11/2026, #593)
-- (Nació como 300; renumerada al fusionar: en staging la 300 es la de los links de pago, #680.)
--
-- El feedback (#169) apunta en el historial del prospecto que se le mandó el
-- correo, lo que contestó y si pidió que le volvieran a contactar. Esas notas
-- no las escribe nadie: las pone el CRM, y se guardaban con `created_by` NULL.
-- La columna exigía un usuario, así que el INSERT fallaba, el servicio se
-- tragaba el error y la gestora no veía nada en la ficha. Lo mismo les pasaba a
-- las notas de «duplicado» que pone la entrada de prospectos.
--
-- En CRM-ISEIE la columna ya admite NULL. Aquí se iguala, como se hizo con
-- `lead_status_history.changed_by` en la 175: la clave ya es
-- `ON DELETE SET NULL`, que con NOT NULL no se podía cumplir, y la ficha lee el
-- autor con LEFT JOIN, así que una nota sin autor se pinta sin «Por …».
-- Se puede pasar dos veces.

BEGIN;

ALTER TABLE lead_interactions ALTER COLUMN created_by DROP NOT NULL;

COMMIT;
