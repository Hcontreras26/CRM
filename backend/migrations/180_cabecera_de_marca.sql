-- 180 · El fondo de la cabecera de cada marca, en correos y formularios
--
-- Diego, 28/09: «que cada formulario tenga el branding de cada marca y su logo,
-- y en el correo también». Los logos de las marcas vienen en dos versiones: la
-- de fondo claro y la blanca, para fondo oscuro. ACADEMIA IA e ISAEG solo
-- publican la blanca. Sobre qué color va el logo es por eso un dato de la
-- marca, no una decisión del correo: vacío = blanco.
--
-- Se configura en «Configurar esta marca → General», junto al logo y al color
-- de marca (que sigue siendo el de botones y acentos).

ALTER TABLE projects ADD COLUMN IF NOT EXISTS color_cabecera VARCHAR(7);
