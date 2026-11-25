-- 335 · Google Ads: campañas y gasto en el CRM (CRM#54)
--
-- Hasta ahora el CRM no sabía nada de Google Ads: ni gasto, ni campañas. Con
-- esto, por campus (la credencial «google_ads» de cada uno, que ya existía):
--
--   · google_ads_cuentas    una fila por campus: la cuenta de Google Ads
--                           (customer_id), su moneda, cuándo se trajo por última
--                           vez, cómo fue y si ya se rellenó el histórico.
--   · google_ads_campanas   la foto de cada campaña (nombre, estado, tipo,
--                           presupuesto) y a qué campus se le apunta: por defecto
--                           el de la cuenta; `project_id_asignado` la mueve a otro
--                           cuando una cuenta anuncia varios campus.
--   · google_ads_diario     gasto, impresiones, clics y conversiones por día y
--                           por nivel: campaña, grupo de anuncios y anuncio.
--
-- Los prospectos y las ventas NO se copian: se cruzan al leer con `lead_utms`
-- (utm_campaign = id o nombre de la campaña) y `conversions`, con las mismas
-- reglas que «¿Dónde ponemos el dinero?» (#56).
--
-- Todo detrás de GOOGLE_ADS_SYNC_ACTIVO (apagado de serie). Se puede pasar dos veces.

BEGIN;

CREATE TABLE IF NOT EXISTS google_ads_cuentas (
    project_id      INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    customer_id     VARCHAR(20),
    nombre          VARCHAR(255),
    moneda          VARCHAR(10),
    zona_horaria    VARCHAR(60),
    last_synced_at  TIMESTAMPTZ,
    last_status     VARCHAR(20),          -- ok | error
    last_error      TEXT,
    backfill_done   BOOLEAN NOT NULL DEFAULT false,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS google_ads_campanas (
    campaign_id         VARCHAR(30) PRIMARY KEY,
    customer_id         VARCHAR(20) NOT NULL,
    -- El campus de la cuenta que la trajo.
    project_id          INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    -- Asociación campaña ↔ campus a mano (NULL = la del campus de la cuenta).
    project_id_asignado INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    asignado_por        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    nombre              VARCHAR(500) NOT NULL,
    estado              VARCHAR(20),      -- ENABLED | PAUSED | REMOVED
    tipo                VARCHAR(40),      -- SEARCH | PERFORMANCE_MAX | DISPLAY | VIDEO…
    presupuesto_diario  NUMERIC(12,2),
    synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_google_ads_campanas_proyecto
    ON google_ads_campanas (COALESCE(project_id_asignado, project_id));

CREATE TABLE IF NOT EXISTS google_ads_diario (
    nivel           VARCHAR(10) NOT NULL CHECK (nivel IN ('campana', 'grupo', 'anuncio')),
    -- El id del elemento de ese nivel (campaña, grupo o anuncio).
    elemento_id     VARCHAR(30) NOT NULL,
    fecha           DATE NOT NULL,
    campaign_id     VARCHAR(30) NOT NULL,
    -- El grupo ('' en el nivel campaña): un anuncio en dos grupos son dos filas.
    ad_group_id     VARCHAR(30) NOT NULL DEFAULT '',
    customer_id     VARCHAR(20) NOT NULL,
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    nombre          VARCHAR(500),
    coste           NUMERIC(12,2) NOT NULL DEFAULT 0,
    impresiones     BIGINT NOT NULL DEFAULT 0,
    clics           BIGINT NOT NULL DEFAULT 0,
    conversiones    NUMERIC(12,2) NOT NULL DEFAULT 0,
    valor_conv      NUMERIC(12,2) NOT NULL DEFAULT 0,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (nivel, elemento_id, ad_group_id, fecha)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_diario_campana
    ON google_ads_diario (campaign_id, fecha);
CREATE INDEX IF NOT EXISTS idx_google_ads_diario_cuenta
    ON google_ads_diario (customer_id, fecha);

-- Permisos para el usuario del CRM (como en la 316 y la 232): sin esto las
-- tablas quedan de postgres y la API da 500. No hay secuencias: ninguna clave
-- es SERIAL.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON google_ads_cuentas, google_ads_campanas, google_ads_diario TO %I', r);
    END IF;
  END LOOP;
END $$;

COMMIT;
