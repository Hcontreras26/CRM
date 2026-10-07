-- Colaboradores · el rol nuevo (#210, fase 5; lo comparte #202 «Mi factura»)
--
-- Equipo interno y externos —desarrollo web, SEO, contenido— que necesitan
-- usuario en el CRM solo para su tablero de tareas. No ven prospectos, ventas
-- ni finanzas: lo corta el servidor en `verifyToken` (shared/middleware/auth.js),
-- no solo el menú.
--
-- En su propio fichero, como la 123 del tutor: «ALTER TYPE ... ADD VALUE» no se
-- puede usar en la misma transaccion en la que se añade el valor.
--
-- users.role es un ENUM (user_role), no texto con CHECK: sin este valor, un
-- INSERT o un `u.role IN (..., 'colaborador')` falla con «invalid input value
-- for enum». IF NOT EXISTS hace que se pueda pasar dos veces.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'colaborador';
