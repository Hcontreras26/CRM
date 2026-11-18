-- 248 · Consultas en el chat de GRUPO del alumno con las tutoras del curso (#679, plugin 1.9.0)
--
-- ─────────────────────────────────────────────────────────────────────────────
-- QUÉ CAMBIA (opción B de la #285, elegida por Carlos el 06/11/2026)
--
-- Con el plugin local_crm 1.9.0, «Entrar al chat» de un curso abre UNA conversación de
-- grupo por alumno y curso: el alumno y las tutoras de ese curso. Todas ven lo mismo y
-- cualquiera responde. En el CRM es una sola consulta:
--
--   · consultas.conversacion_grupo_id  el chat de grupo de la consulta. La respuesta desde
--                                      el CRM va ahí (no a una conversación privada). Una
--                                      consulta que venía del chat directo y sigue en el de
--                                      grupo lo tiene puesto y su conversación privada sigue
--                                      en conversacion_externa_id.
--   · consultas.grupo_tipo             de qué chat es: 'plugin' (el del alumno con las tutoras
--                                      de su curso) o 'curso' (la conversación de un grupo del
--                                      curso con una tutora dentro, #285: lo que se responde ahí
--                                      lo leen todos los alumnos del grupo).
--   · consultas.participantes          quién estaba en ese chat en el último mensaje
--                                      ([{ id, nombre, tutora, alumno }], ids de Moodle; en un
--                                      grupo del curso, solo las tutoras y quien escribe).
--   · consulta_mensajes.autor_moodle_id
--     consulta_mensajes.autor_nombre_campus
--                                      quién escribió en el campus. En un chat de grupo
--                                      responde cualquier tutora, también una sin ficha en el
--                                      CRM: su nombre sale igual en la consulta.
--
-- La consulta sigue teniendo su tutora (tutor_id) y su curso para las métricas y «Mi
-- campus»; el relevo cambia la tutora de la consulta, ya no la conversación.
--
-- Reaplicable.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE consultas ADD COLUMN IF NOT EXISTS conversacion_grupo_id BIGINT;
ALTER TABLE consultas ADD COLUMN IF NOT EXISTS participantes JSONB;
ALTER TABLE consultas ADD COLUMN IF NOT EXISTS grupo_tipo TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultas_grupo_tipo_valido') THEN
    ALTER TABLE consultas ADD CONSTRAINT consultas_grupo_tipo_valido CHECK (grupo_tipo IS NULL OR grupo_tipo IN ('plugin', 'curso'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_consultas_conversacion_grupo
    ON consultas (project_id, conversacion_grupo_id) WHERE conversacion_grupo_id IS NOT NULL;

ALTER TABLE consulta_mensajes ADD COLUMN IF NOT EXISTS autor_moodle_id BIGINT;
ALTER TABLE consulta_mensajes ADD COLUMN IF NOT EXISTS autor_nombre_campus TEXT;

COMMIT;
