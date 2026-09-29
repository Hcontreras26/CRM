-- Guardar el correo, no solo que se mandó. Primera parte del #146.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ
--
-- `email_envios` (127) apunta el destinatario, el asunto y si salió. No el
-- texto. Sirve para saber QUE se mandó algo, no PARA VER QUÉ se mandó.
--
-- Y eso es justo lo que hace falta el día que un tutor contesta «esto no me
-- cuadra»: hay que poder abrir el correo que se le mandó y leerlo, no deducirlo
-- de la plantilla de hoy —que además puede haber cambiado, porque es editable—.
--
-- QUÉ SE GUARDA Y QUÉ NO
--
-- El HTML tal y como salió, ya con los huecos rellenos. Es lo único que
-- responde a «¿qué leyó esta persona?».
--
-- No se guarda el texto plano: el CRM casi nunca lo manda, y tener dos copias
-- del mismo mensaje obliga a decidir cuál es la buena.
--
-- SON DATOS DE PERSONAS, y conviene decirlo aquí antes de que nadie tenga que
-- averiguarlo: un aviso a un tutor lleva lo que cobra; uno a un prospecto, su
-- nombre y su formación. Esta columna NO es para cualquiera — la pantalla que
-- la enseñe tiene que pedir permisos, y el #146 lo deja anotado como decisión.
--
-- Nada de esto se rellena hacia atrás: los envíos anteriores se quedan sin
-- cuerpo, y la pantalla lo dirá en vez de enseñar un hueco.

BEGIN;

ALTER TABLE email_envios
  ADD COLUMN IF NOT EXISTS cuerpo_html TEXT,
  -- De quién salió. Hoy se sabe por el `from` global, pero el aviso al tutor ya
  -- sale de una dirección distinta —facturacion@cediaidsl.com— y en cuanto haya
  -- dos remitentes, no guardarlo obliga a adivinar mirando las etiquetas.
  ADD COLUMN IF NOT EXISTS remitente VARCHAR(255);

COMMENT ON COLUMN email_envios.cuerpo_html IS
  'El correo tal y como salió, con los huecos ya rellenos. DATOS DE PERSONAS: quien lo enseñe tiene que pedir permisos.';
COMMENT ON COLUMN email_envios.remitente IS
  'La dirección desde la que salió. NULL en los envíos anteriores a esta columna.';

COMMIT;
