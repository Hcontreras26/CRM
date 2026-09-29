-- «Avisar tutor»: el correo mensual de comisiones que pidio Diego el 14/09.
--
-- Numero 160 y no 156: la 156 a la 159 ya estan cogidas en
-- `feat/angel-whatsapp-128`. Mirado contra el remoto antes de crear el fichero,
-- que es la regla 3 del #127.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · AVISAR NO ES COBRAR, ASI QUE NO ES UN ESTADO
--
-- Diego lo pidio como «que cambie el status a avisado». Pero `estado` solo
-- admite 'pendiente', 'pagada' y 'revertida', y esas tres dicen DONDE ESTA EL
-- DINERO. Una comision avisada sigue sin pagarse: si «avisado» entrara ahi,
-- dejaria de ser pendiente y desapareceria de los «Por pagar» de la cabecera.
-- El tutor se quedaria sin cobrar y la pantalla diria que no se le debe nada.
--
-- Asi que el aviso va en su propia columna. El dinero no se entera.
ALTER TABLE tutor_commissions
  ADD COLUMN IF NOT EXISTS avisado_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS avisado_por INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tc_avisado_por') THEN
    ALTER TABLE tutor_commissions
      ADD CONSTRAINT fk_tc_avisado_por FOREIGN KEY (avisado_por)
      REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN tutor_commissions.avisado_at IS
  'Cuando se le mando el correo de «Avisar tutor». No es un estado del dinero: una comision avisada sigue pendiente de pago.';

-- Se consulta por tutor y periodo para pintar «avisado el ...» en la fila.
CREATE INDEX IF NOT EXISTS idx_tc_avisado ON tutor_commissions (tutor_id, periodo)
  WHERE avisado_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · UNA PLANTILLA PUEDE SER DE TODOS LOS PROYECTOS
--
-- `email_templates.project_id` era NOT NULL: cada plantilla, de un proyecto.
-- Para este correo no vale, y no es un capricho: la pantalla de comisiones se
-- abre en «todos los proyectos» y un tutor cobra de varios a la vez. Con una
-- plantilla por proyecto, el mismo correo tendria dos textos distintos y no
-- habria forma de elegir.
--
-- NULL pasa a significar «de la casa, para todos». Las que ya hay no cambian:
-- siguen con su proyecto y se siguen leyendo igual.
ALTER TABLE email_templates ALTER COLUMN project_id DROP NOT NULL;

COMMENT ON COLUMN email_templates.project_id IS
  'El proyecto al que pertenece. NULL = comun a todos (p.ej. el aviso mensual al tutor, que cruza proyectos).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · LA PLANTILLA, CON EL BORRADOR DE DIEGO
--
-- Tal como la escribio el 14/09, y editable desde el CRM — «la plantilla por
-- definir, es decir que sea editable» —. Los DATOS DE CEDIA van escritos aqui
-- a mano y no sacados de `invoice_issuers` a proposito: hoy ese emisor tiene el
-- CIF sin rellenar («PENDIENTE-CIF-CEDIA») y el correo le mandaria un marcador
-- al tutor. Cuando esten los de verdad, se cambian en el editor.
INSERT INTO email_templates (project_id, name, subject, body_html, description, active)
SELECT NULL,
       'Avisar tutor · comisiones del mes',
       'Tus comisiones de {{mes}}',
       '<p>Hola {{tutor.nombre}},</p>' ||
       '<p>Durante el mes <strong>{{mes}}</strong> has generado un total de <strong>{{total}}</strong>, de las formaciones:</p>' ||
       '{{formaciones}}' ||
       '<p>Contesta a este mismo correo con tu factura <strong>+ IVA − Retención</strong>. La cuenta, para que no haya dudas:</p>' ||
       '{{calculo}}' ||
       '<p>Y con estos datos:</p>' ||
       '<p><strong>CEDIA Investigación y Desarrollo SL</strong><br>' ||
       'CIF: (pendiente de rellenar)<br>' ||
       'Dirección: (pendiente de rellenar)</p>' ||
       '<p><strong>Envía tu IBAN</strong> si no nos lo has dado todavía: sin él no se te puede pagar.</p>' ||
       '<p>Muchas gracias.</p>',
       'El correo mensual de «Avisar tutor», desde el apartado de Comisiones. Común a todos los proyectos.',
       true
WHERE NOT EXISTS (
  SELECT 1 FROM email_templates WHERE name = 'Avisar tutor · comisiones del mes'
);

COMMIT;
