-- El webhook de admisión (#198): los datos de la persona en campos propios.
--
-- Diego, 01/10 (comentario en la #198): «Guardar los datos de la persona en
-- campos propios (nombre, documento, fecha de nacimiento, dirección,
-- estudios…), no solo en el JSON. El JSON se conserva tal cual llegó».
--
-- El número de documento sigue en `matriculas.dni` (la lista y el buscador ya lo
-- usan); aquí se añade su tipo (DNI, NIE, pasaporte…).
--
-- `envio_huella`: la huella del envío (lo que llegó y sus archivos). El mismo
-- envío dos veces no crea dos matrículas («idempotente», #198).
--
-- 213: la 207 es la firma de Certifex (#349), la 208–211 las consultas de alumnos
-- (#187–#190) y la 212 el historial de matrículas (#199). Se puede pasar dos veces.

BEGIN;

ALTER TABLE matriculas
  ADD COLUMN IF NOT EXISTS nombre            VARCHAR(200),
  ADD COLUMN IF NOT EXISTS email             VARCHAR(200),
  ADD COLUMN IF NOT EXISTS telefono          VARCHAR(50),
  ADD COLUMN IF NOT EXISTS documento_tipo    VARCHAR(30),
  ADD COLUMN IF NOT EXISTS fecha_nacimiento  DATE,
  ADD COLUMN IF NOT EXISTS direccion         TEXT,
  ADD COLUMN IF NOT EXISTS pais              VARCHAR(80),
  ADD COLUMN IF NOT EXISTS estudios          TEXT,
  ADD COLUMN IF NOT EXISTS curso_solicitado  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS envio_huella      CHAR(64);

-- Un mismo envío, una sola matrícula por campus.
CREATE UNIQUE INDEX IF NOT EXISTS idx_matriculas_envio_huella
  ON matriculas (project_id, envio_huella) WHERE envio_huella IS NOT NULL;

-- Buscar la solicitud de una persona por su correo (vincularla, la firma de Certifex).
CREATE INDEX IF NOT EXISTS idx_matriculas_email ON matriculas (project_id, lower(email));

COMMIT;
