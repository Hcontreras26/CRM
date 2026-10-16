-- Las solicitudes de diploma que llegan desde Moodle a través de Certifex (#272).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ
--
-- Manuel, 08/10: en el último módulo de cada formación el alumno pide su diploma
-- («Enhorabuena, has completado tu formación. Solicita tu diploma»), escribe su
-- nombre tal y como saldrá impreso, y le llega al CRM una solicitud para aprobarla.
--
-- La solicitud vive en Certifex (es quien sabe de la matrícula de Moodle) y el CRM
-- la lee de su API para el panel Diplomas. Certifex, además, la AVISA aquí desde su
-- servidor con el secreto compartido de las consultas (CERTIFEX_WEBHOOK_SECRETO).
-- Esta tabla es lo que el CRM guarda de ese aviso:
--
--   · para que suene la campana una sola vez por solicitud, aunque Certifex
--     reintente tras un corte;
--   · para enlazar al alumno con la ficha del CRM por su correo (`lead_id`);
--   · para apuntar el aviso de rechazo que alguien del CRM aprobó, con quién y
--     cuándo: la API de Certifex no lo devuelve en el listado.
--
-- Decisiones del 08/10 que esto respeta: SIN DNI (el alumno solo escribe su
-- nombre), y ningún correo al alumno sale sin que una persona del CRM lo apruebe.
--
-- LO QUE EVITA LOS DUPLICADOS
--
-- `matricula_id` es el id de la matrícula en Certifex: una solicitud por alumno y
-- formación. Si el alumno vuelve a pedirlo (tras un rechazo, o corrigiendo su
-- nombre), llega con otra `solicitada_en` y se ACTUALIZA la fila que hay; un
-- reintento idéntico de Certifex no cambia nada.
--
-- Reaplicable: todo va con IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS certifex_solicitudes (
  id                  SERIAL PRIMARY KEY,
  matricula_id        BIGINT NOT NULL UNIQUE,
  centro              TEXT,
  curso_ref           BIGINT,
  curso_nombre        TEXT,
  -- El nombre que escribió el alumno: el que se imprimirá en el diploma.
  nombre_diploma      TEXT,
  -- El nombre que tiene en Moodle, para compararlo al revisar.
  nombre_moodle       TEXT,
  email               TEXT,
  lead_id             INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  solicitada_en       TIMESTAMPTZ,
  -- Cuántas veces lo ha pedido (un reintento idéntico no cuenta).
  veces               INTEGER NOT NULL DEFAULT 1,
  -- El aviso de rechazo que aprobó alguien del CRM (POST /api/crm/v1/avisos-rechazo).
  aviso_rechazo_en        TIMESTAMPTZ,
  aviso_rechazo_por       TEXT,
  aviso_rechazo_resultado TEXT,
  recibida_en         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_certifex_solicitudes_recibida ON certifex_solicitudes (recibida_en DESC);
CREATE INDEX IF NOT EXISTS idx_certifex_solicitudes_email ON certifex_solicitudes (lower(email));

-- ─────────────────────────────────────────────────────────────────────────────
-- LO QUE SE REVISA ANTES DE APROBAR (panel Diplomas, «Editar»)
--
-- Manuel, 08/10: «permite que se puedan editar los datos con los que se trabaja»
-- para verificar al alumno. Moodle y el CRM no siempre casan: el alumno usa en
-- Moodle otro correo que el de su venta, o la formación vendida no se llama como el
-- curso. Sin esto salía «Sin programa del CRM: se usará lo de Moodle» y no había
-- forma de arreglarlo desde el panel.
--
-- Lo que se guarda aquí (el nombre del diploma NO: vive en Certifex, que es quien
-- lo imprime, y se le manda a su API):
--   · `email_crm`: el correo con el que buscar al alumno en el CRM (su venta, si
--     ha pagado) cuando no es el de Moodle.
--   · `producto_id`: la formación vendida, elegida a mano del catálogo.
--   · `programa_editado`: el programa a imprimir escrito a mano,
--     { horas, modulos: [{ titulo, horas }] }. Manda sobre todo lo demás.
--   · `editado_por` / `editado_en`: quién lo tocó por última vez y cuándo.
-- Solo vale mientras no hay diploma: emitido, lo que cambia es el diploma (Corregir).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE certifex_solicitudes ADD COLUMN IF NOT EXISTS email_crm TEXT;
ALTER TABLE certifex_solicitudes ADD COLUMN IF NOT EXISTS producto_id INTEGER REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE certifex_solicitudes ADD COLUMN IF NOT EXISTS programa_editado JSONB;
ALTER TABLE certifex_solicitudes ADD COLUMN IF NOT EXISTS editado_por TEXT;
ALTER TABLE certifex_solicitudes ADD COLUMN IF NOT EXISTS editado_en TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'certifex_solicitudes_programa_editado_objeto') THEN
    ALTER TABLE certifex_solicitudes ADD CONSTRAINT certifex_solicitudes_programa_editado_objeto
      CHECK (programa_editado IS NULL OR jsonb_typeof(programa_editado) = 'object');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TERMINARON SIN PEDIR EL DIPLOMA (aviso «ha terminado la formación»)
--
-- Certifex avisa (POST /api/certifex/completados, mismo secreto) cuando Moodle da una
-- formación por terminada y el alumno aún no ha pedido su diploma ni lo tiene. Una vez
-- por matrícula. Se guarda en la misma fila (una por matrícula): si luego lo pide, el
-- aviso de la solicitud completa la fila y la de «terminado» se queda como historia.
--   · `completado_en`: cuándo lo dio Moodle por terminado (según Certifex).
--   · `completado_nota`: la nota final que tenía entonces.
--   · `completado_recibido_en`: cuándo llegó el aviso al CRM. Con valor, un reintento
--     de Certifex no vuelve a sonar la campana.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE certifex_solicitudes ADD COLUMN IF NOT EXISTS completado_en TIMESTAMPTZ;
ALTER TABLE certifex_solicitudes ADD COLUMN IF NOT EXISTS completado_nota NUMERIC;
ALTER TABLE certifex_solicitudes ADD COLUMN IF NOT EXISTS completado_recibido_en TIMESTAMPTZ;

-- La tabla es del usuario de la app, no de quien aplica la migración (mismo motivo
-- que en la 186: aplicada como `postgres`, la API recibía «permission denied»).
DO $$
DECLARE dueno text;
BEGIN
  SELECT tableowner INTO dueno FROM pg_tables WHERE schemaname = 'public' AND tablename = 'leads';
  IF dueno IS NOT NULL THEN
    EXECUTE format('ALTER TABLE certifex_solicitudes OWNER TO %I', dueno);
    EXECUTE format('ALTER SEQUENCE certifex_solicitudes_id_seq OWNER TO %I', dueno);
  END IF;
END $$;
