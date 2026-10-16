-- 203 · Un admin con la empresa entera, también los campus que se creen (#220)
--
-- Diego, 10/10: «Un admin puede tener los proyectos futuros, pero de SU
-- empresa: mayormente los admin son por empresa».
--
-- La empresa es la sociedad emisora del campus (`projects.sociedad_emisora_id`
-- → `invoice_issuers`), la misma que usa el selector de la cabecera. Esta tabla
-- guarda solo QUÉ EMPRESAS ENTERAS tiene un admin. El acceso de verdad sigue
-- saliendo de `user_projects`, que es lo que leen `projectAccess`, `ambito.js`,
-- el MCP y el resto del CRM:
--
--   · al marcar la casilla se añaden a `user_projects` todos los campus que la
--     empresa tiene hoy;
--   · al crear un campus en esa empresa, o al pasarle uno, el servicio de
--     proyectos se lo añade a esos admins en la misma transacción;
--   · al quitarla, sus `user_projects` se quedan: deja de llegarle lo nuevo y ya.
--
-- 203: la 201 es la de Diana (#202, parte 2) y la 202 la de importe_pdf de
-- facturas_colaborador. Se puede pasar dos veces.

BEGIN;

CREATE TABLE IF NOT EXISTS user_empresas (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issuer_id INTEGER NOT NULL REFERENCES invoice_issuers(id) ON DELETE CASCADE,
    creado_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, issuer_id)
);

-- Para «qué admins tienen esta empresa» al crear un campus.
CREATE INDEX IF NOT EXISTS idx_user_empresas_issuer ON user_empresas(issuer_id);

COMMENT ON TABLE user_empresas IS
  'Empresas (invoice_issuers) enteras de un admin: los campus nuevos de la empresa se le añaden a user_projects (#220).';

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON user_empresas TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
