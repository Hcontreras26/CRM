-- 235 · Extensión unaccent para búsqueda insensible a acentos en personas y clientes
--
-- Diego, 02/11: en MultiCRM «gonzalez» no encontraba a «González» y «jose» a «José»
-- (en ISEIE ya existía).
-- Se puede pasar dos veces.

CREATE EXTENSION IF NOT EXISTS unaccent;
