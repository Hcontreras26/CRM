-- 334 · Search Console: búsquedas, páginas e indexación de cada campus (CRM#36)
--
-- Carlos quiere hacer el análisis SEO desde «Tráfico orgánico» sin entrar en
-- Search Console. Con esto se guarda, por campus y por día:
--
--   · gsc_diario             clics, impresiones y posición del sitio entero.
--                            Es el total de verdad: las otras dos tablas pierden
--                            las búsquedas que Google oculta por privacidad.
--   · gsc_paginas_diarias    lo mismo por página (dominio + ruta, como la cruza
--                            GA4 con `normalizarRuta`, pero con el dominio: los
--                            subdominios de país son páginas distintas).
--   · gsc_consultas_diarias  lo mismo por búsqueda.
--   · gsc_indexacion         lo que dice la inspección de URL de Google de las
--                            páginas de formación (`products.url_info`): si
--                            está indexada y, si no, por qué.
--   · gsc_sincronizacion     una fila por campus: el sitio, cuándo se trajo,
--                            cómo fue y si ya se rellenó el histórico.
--
-- La posición se guarda como `posicion_suma` = posición × impresiones, para
-- sacar la media bien ponderada al sumar días (la media de medias engaña).
--
-- La credencial es el servicio `gsc`, que ya existía en el enum desde la 001:
-- JSON de la cuenta de servicio de Google con `site_url` añadido, cifrado como
-- las demás.
--
-- Todo detrás de GSC_SYNC_ACTIVO (apagado de serie). Se puede pasar dos veces.

BEGIN;

CREATE TABLE IF NOT EXISTS gsc_diario (
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    fecha           DATE NOT NULL,
    clics           INTEGER NOT NULL DEFAULT 0,
    impresiones     INTEGER NOT NULL DEFAULT 0,
    posicion_suma   NUMERIC(16,2) NOT NULL DEFAULT 0,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, fecha)
);

CREATE TABLE IF NOT EXISTS gsc_paginas_diarias (
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    fecha           DATE NOT NULL,
    -- Sin «www.» y en minúsculas; la ruta, sin query, ancla ni barra final.
    host            VARCHAR(255) NOT NULL,
    ruta            VARCHAR(1000) NOT NULL,
    clics           INTEGER NOT NULL DEFAULT 0,
    impresiones     INTEGER NOT NULL DEFAULT 0,
    posicion_suma   NUMERIC(16,2) NOT NULL DEFAULT 0,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, fecha, host, ruta)
);

CREATE INDEX IF NOT EXISTS idx_gsc_paginas_proyecto_ruta
    ON gsc_paginas_diarias (project_id, host, ruta);

CREATE TABLE IF NOT EXISTS gsc_consultas_diarias (
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    fecha           DATE NOT NULL,
    consulta        VARCHAR(500) NOT NULL,
    clics           INTEGER NOT NULL DEFAULT 0,
    impresiones     INTEGER NOT NULL DEFAULT 0,
    posicion_suma   NUMERIC(16,2) NOT NULL DEFAULT 0,
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, fecha, consulta)
);

CREATE TABLE IF NOT EXISTS gsc_indexacion (
    project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    url             VARCHAR(1000) NOT NULL,
    product_id      INTEGER REFERENCES products(id) ON DELETE SET NULL,
    -- PASS | PARTIAL | FAIL | NEUTRAL (verdict de Google) o ERROR si no se pudo mirar.
    veredicto       VARCHAR(20) NOT NULL,
    -- El texto de Google: «Submitted and indexed», «Crawled - currently not indexed»…
    cobertura       VARCHAR(255),
    ultimo_rastreo  TIMESTAMPTZ,
    error           TEXT,
    revisado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, url)
);

CREATE TABLE IF NOT EXISTS gsc_sincronizacion (
    project_id      INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    site_url        VARCHAR(255),
    last_synced_at  TIMESTAMPTZ,
    last_status     VARCHAR(20),          -- ok | error
    last_error      TEXT,
    backfill_done   BOOLEAN NOT NULL DEFAULT false,
    indexacion_at   TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
