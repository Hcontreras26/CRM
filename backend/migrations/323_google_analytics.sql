-- 323 · Google Analytics: lo que pasa antes del lead (CRM#55)
--
-- Las webs tienen GA4 pero el CRM no veía nada de lo que pasa antes de que
-- alguien deje su teléfono. Con esto se guarda, por campus y por día:
--
--   · ga4_canales_diarios   sesiones, usuarios, usuarios nuevos y eventos clave
--                           por canal (sessionDefaultChannelGroup de GA4).
--   · ga4_paginas_diarias   lo mismo por página de entrada (landingPage, sin
--                           query): es lo que dice si un curso no vende porque
--                           no lo ven o porque no convence.
--   · ga4_sincronizacion    una fila por campus: la propiedad, cuándo se trajo
--                           por última vez, cómo fue y si ya se rellenó el
--                           histórico.
--   · el servicio «google_analytics» en las credenciales, cifrado como los demás:
--     JSON de la cuenta de servicio de Google con `property_id` añadido.
--
-- Los leads y las ventas NO se copian aquí: se cruzan al leer con `leads` y
-- `conversions`, para que la cifra sea la misma que en el resto del CRM.
--
-- Todo detrás de GA4_SYNC_ACTIVO (apagado de serie). Se puede pasar dos veces.

-- ALTER TYPE ... ADD VALUE va suelto, como en la 220 y la 299.
ALTER TYPE api_service ADD VALUE IF NOT EXISTS 'google_analytics';

BEGIN;

CREATE TABLE IF NOT EXISTS ga4_canales_diarios (
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    fecha           DATE NOT NULL,
    canal           VARCHAR(80) NOT NULL,
    sesiones        INTEGER NOT NULL DEFAULT 0,
    usuarios        INTEGER NOT NULL DEFAULT 0,
    usuarios_nuevos INTEGER NOT NULL DEFAULT 0,
    eventos_clave   NUMERIC(12,2) NOT NULL DEFAULT 0,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, fecha, canal)
);

CREATE TABLE IF NOT EXISTS ga4_paginas_diarias (
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    fecha           DATE NOT NULL,
    -- La ruta tal cual la da GA4 (landingPage): sin dominio ni query.
    pagina          VARCHAR(1000) NOT NULL,
    sesiones        INTEGER NOT NULL DEFAULT 0,
    usuarios        INTEGER NOT NULL DEFAULT 0,
    eventos_clave   NUMERIC(12,2) NOT NULL DEFAULT 0,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, fecha, pagina)
);

CREATE INDEX IF NOT EXISTS idx_ga4_paginas_proyecto_pagina
    ON ga4_paginas_diarias (project_id, pagina);

CREATE TABLE IF NOT EXISTS ga4_sincronizacion (
    project_id      INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    property_id     VARCHAR(40),
    last_synced_at  TIMESTAMPTZ,
    last_status     VARCHAR(20),          -- ok | error
    last_error      TEXT,
    backfill_done   BOOLEAN NOT NULL DEFAULT false,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
