-- ─────────────────────────────────────────────────────────────────────────────
-- 207 · La firma del alumno en el diploma (Diego, 19/10/2026; CRM #349)
--
-- «Todo tiene que tener la firma del alumno para cargar, y si no la tiene debe salir
-- para cargarla.» La firma va sobre la línea «El interesado» del diploma.
--
-- De dónde sale, en este orden:
--   1. La subida a mano en «Revisar datos antes de aprobar» (estas columnas).
--   2. La de la matrícula de admisión del mismo correo en ese campus
--      (`matriculas.firma_key`, migraciones 019 y 024). Esa no se copia aquí: se lee
--      al ver y al emitir, para que una firma corregida en la matrícula valga sin más.
--
--   · `firma_key`: la imagen YA PROCESADA (PNG, fondo transparente, recortada al
--     trazo), en el almacén de archivos del CRM (localStorage.service, como las de
--     matrículas). NULL = no se subió ninguna.
--   · `firma_por` / `firma_en`: quién la subió y cuándo.
-- Va aparte de `editado_*` a propósito: la firma no es «lo revisado a mano» que
-- bloquea la emisión cuando falta el programa (certifex.emision.js, tieneEdicion).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE certifex_solicitudes ADD COLUMN IF NOT EXISTS firma_key TEXT;
ALTER TABLE certifex_solicitudes ADD COLUMN IF NOT EXISTS firma_por TEXT;
ALTER TABLE certifex_solicitudes ADD COLUMN IF NOT EXISTS firma_en TIMESTAMPTZ;

-- La tabla es del usuario de la app, no de quien aplica la migración (como en la 199).
DO $$
DECLARE dueno text;
BEGIN
  SELECT tableowner INTO dueno FROM pg_tables WHERE schemaname = 'public' AND tablename = 'leads';
  IF dueno IS NOT NULL THEN
    EXECUTE format('ALTER TABLE certifex_solicitudes OWNER TO %I', dueno);
  END IF;
END $$;
