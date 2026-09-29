-- El correo que ENTRA. Segunda mitad del #146.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ
--
-- Ángel pidió «un panel de visualización de todo el webmail, para ver mensajes
-- enviados, recibidos etc». La primera mitad —lo que sale— ya está. Esta tabla
-- solo sabía de envíos, hasta el punto de que la consulta devolvía `'salida'`
-- escrito a mano porque no había otra cosa que devolver.
--
-- Falta lo que llega, y no es un capricho: el aviso al tutor le pide que
-- CONTESTE con su factura. Esa respuesta cae en el buzón de Hostinger y el CRM
-- no se entera — así que la conversación que el propio CRM empieza, se termina
-- fuera de él.
--
-- DE DÓNDE SALE
--
-- Se lee el buzón por IMAP, con la misma conexión que ya deja la copia en
-- «Enviados». Se descartó Brevo Inbound: obliga a apuntar un subdominio a
-- Brevo, deja el correo normal del buzón fuera —que es justo el que se quiere
-- ver— y añade un proveedor donde ya hay uno que funciona.
--
-- POR QUÉ AQUÍ Y NO EN UNA TABLA NUEVA
--
-- Porque es la misma cosa: un correo, con su remitente, su asunto, su fecha y
-- su cuerpo. Separarlo obligaría a unir las dos mitades en cada consulta para
-- enseñar una bandeja, que es como se mira el correo.
--
-- LO QUE EVITA LOS DUPLICADOS
--
-- La `clave` que ya existe, con su índice único: para lo que entra se guarda
-- `entrada:<Message-ID>`. El Message-ID lo pone quien manda y no cambia, así
-- que leer el buzón dos veces —o releerlo entero tras un fallo— no duplica
-- nada. No hace falta columna nueva ni recordar por dónde se iba.
--
-- SON DATOS DE PERSONAS, y más que antes: lo que entra no lo escribimos
-- nosotros. Puede traer lo que al remitente le dé la gana — su factura, su
-- situación, su DNI. La pantalla que lo enseñe pide permisos, igual que la de
-- salida.

BEGIN;

ALTER TABLE email_envios
  -- Con `DEFAULT 'salida'`, las filas que ya hay quedan bien sin tocarlas: todo
  -- lo anterior a hoy salió del CRM, no entró.
  ADD COLUMN IF NOT EXISTS direccion VARCHAR(8) NOT NULL DEFAULT 'salida';

ALTER TABLE email_envios
  DROP CONSTRAINT IF EXISTS email_envios_direccion_check;
ALTER TABLE email_envios
  ADD CONSTRAINT email_envios_direccion_check
  CHECK (direccion IN ('salida', 'entrada'));

-- `estado` decía si un envío salió. Lo que entra ya está aquí: no hay nada que
-- intentar ni que fallar, así que necesita su propia palabra en vez de forzarle
-- un «enviado» que significaría lo contrario de lo que pasó.
ALTER TABLE email_envios
  DROP CONSTRAINT IF EXISTS email_envios_estado_check;
ALTER TABLE email_envios
  ADD CONSTRAINT email_envios_estado_check
  CHECK (estado IN ('enviado', 'fallido', 'bloqueado', 'recibido'));

-- La bandeja se pide siempre por dirección y por fecha; sin esto, enseñar los
-- recibidos obliga a recorrer también todo lo que ha salido.
CREATE INDEX IF NOT EXISTS idx_email_envios_direccion
  ON email_envios (direccion, created_at DESC);

COMMENT ON COLUMN email_envios.direccion IS
  'salida = lo mandó el CRM · entrada = llegó al buzón y se leyó por IMAP.';
COMMIT;
