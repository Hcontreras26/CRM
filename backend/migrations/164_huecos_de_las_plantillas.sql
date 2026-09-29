-- Las plantillas de correo del proceso comercial no rellenaban ni un hueco.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- QUÉ PASABA
--
-- Las 18 plantillas de los días 1, 3 y 4 —las que se le mandan al prospecto—
-- están escritas con UNA llave:
--
--     Hola {nombre}:
--     Soy [tu nombre], asesora comercial de {proyecto}.
--     Te envío la información de {producto}.
--
-- Y `renderTemplate` sustituye `{{doble}}`, no `{simple}`. O sea que NINGUNA se
-- rellenaba: al prospecto le llegaba «Hola {nombre}:» tal cual, con el nombre
-- de la formación sin poner y la marca sin poner.
--
-- Es el mismo fallo que ya salió en las plantillas de WhatsApp con `{teléfono}`
-- —ofrecido en la lista de variables y nunca rellenado— pero aquí es peor: allí
-- la gestora copia y pega y lo ve; esto sale por correo sin que nadie lo lea.
--
-- LA TRADUCCIÓN
--
-- Cada hueco al camino que SÍ entiende el renderizador, que son los que ya
-- declara `TEMPLATE_VARIABLES`:
--
--     {nombre}    → {{lead.nombre}}
--     {producto}  → {{lead.producto}}
--     {proyecto}  → {{project.nombre}}
--     [tu nombre] → {{user.nombre}}      ← quien envía, que es la asesora
--
-- LO QUE SE QUEDA ENTRE CORCHETES, Y POR QUÉ
--
-- `[fecha]`, `[importe]`, `[nº meses]`, `[total]`, `[mes de inicio]`… no se
-- tocan. Son datos que el CRM no tiene para ese correo —condiciones que negocia
-- cada asesora— y convertirlos en variables pondría un hueco vacío en el texto
-- en vez de un corchete que se ve y se rellena. Un corchete visible es un aviso;
-- una variable que no resuelve es un silencio.

BEGIN;

UPDATE email_templates
   SET subject = replace(replace(replace(subject,
         '{nombre}',   '{{lead.nombre}}'),
         '{producto}', '{{lead.producto}}'),
         '{proyecto}', '{{project.nombre}}'),
       body_html = replace(replace(replace(replace(body_html,
         '{nombre}',    '{{lead.nombre}}'),
         '{producto}',  '{{lead.producto}}'),
         '{proyecto}',  '{{project.nombre}}'),
         '[tu nombre]', '{{user.nombre}}'),
       updated_at = NOW()
 WHERE subject ~ '(^|[^{])\{(nombre|producto|proyecto)\}'
    OR body_html ~ '(^|[^{])\{(nombre|producto|proyecto)\}'
    OR body_html LIKE '%[tu nombre]%';

COMMIT;
