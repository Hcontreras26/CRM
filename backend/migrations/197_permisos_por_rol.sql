-- Permisos por rol, editables desde Configuración › Roles por el superadmin y
-- el admin (#210, 08/10 y 09/10)
--
-- Los permisos de cada rol del sistema (admin, gestor, soporte, colaborador…)
-- viven en el código (permissions.defaults.js). Esta tabla guarda lo que se
-- CAMBIA desde la pantalla de Roles: una fila por rol y permiso que se aparta
-- de su valor por defecto. Sin filas, cada rol se queda como dice el código.
--
-- El orden al calcular los permisos de una persona es:
--   valor por defecto del rol → esta tabla → su rol a medida → sus excepciones
--   personales (user_permission_overrides).
--
-- De momento solo se editan tasks.close y tasks.manage (lo valida el servidor),
-- pero la tabla no se ata a ellas: es el mismo formato que las excepciones
-- personales de la 033. Se puede pasar dos veces.

BEGIN;

CREATE TABLE IF NOT EXISTS role_permission_overrides (
    id SERIAL PRIMARY KEY,
    -- Texto y no el ENUM user_role: añadir un valor al ENUM no puede romper esto.
    role VARCHAR(30) NOT NULL,
    resource VARCHAR(60) NOT NULL,
    action VARCHAR(30) NOT NULL,
    allowed BOOLEAN NOT NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (role, resource, action)
);

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON role_permission_overrides TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE role_permission_overrides_id_seq TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
