-- 342 · GA4 y Search Console: la sincronización y los umbrales del aviso, por campus y desde la pantalla (CRM#1210)
--
-- Norma del 27/11: nada de `.env` para encender una integración. Hasta ahora la
-- sincronización de GA4 (CRM#55) y la de Search Console (CRM#36) solo corrían con
-- GA4_SYNC_ACTIVO=1 / GSC_SYNC_ACTIVO=1, para todos los campus a la vez, y los
-- umbrales del aviso de caída (CRM#1156) eran GSC_AVISO_* del servidor.
--
-- Ahora cada campus tiene su interruptor en la tarjeta de Integraciones:
--
--   · sync_activo        true / false lo ha decidido alguien en la pantalla.
--                        NULL = nadie lo ha tocado: vale el `.env` (reserva) y,
--                        sin él, apagado. Así un servidor que ya tenía la
--                        variable a 1 sigue igual al aplicar esto.
--   · sync_cambiado_por / sync_cambiado_at   quién y cuándo, para la tarjeta.
--
-- Y en Search Console, los cuatro umbrales del aviso (NULL = el del `.env` o el
-- de serie: 30 %, 30 %, 20 clics, 200 impresiones), con quién y cuándo.
--
-- Las filas de `*_sincronizacion` existen desde la primera vuelta; para un
-- campus que aún no ha dado ninguna, el interruptor la crea (INSERT … ON CONFLICT).
-- Los permisos de crm_user / crm_iseie_user sobre las dos tablas ya están (323,
-- 334 y PR #1170): una columna nueva no los necesita otra vez.
--
-- Se puede pasar dos veces.

BEGIN;

ALTER TABLE ga4_sincronizacion
    ADD COLUMN IF NOT EXISTS sync_activo       BOOLEAN,
    ADD COLUMN IF NOT EXISTS sync_cambiado_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sync_cambiado_at  TIMESTAMPTZ;

ALTER TABLE gsc_sincronizacion
    ADD COLUMN IF NOT EXISTS sync_activo       BOOLEAN,
    ADD COLUMN IF NOT EXISTS sync_cambiado_por INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sync_cambiado_at  TIMESTAMPTZ,
    -- Una caída de MÁS de este % avisa; 0 apaga esa métrica.
    ADD COLUMN IF NOT EXISTS aviso_caida_clics       SMALLINT CHECK (aviso_caida_clics BETWEEN 0 AND 100),
    ADD COLUMN IF NOT EXISTS aviso_caida_impresiones SMALLINT CHECK (aviso_caida_impresiones BETWEEN 0 AND 100),
    -- Volumen mínimo de la semana ANTERIOR para avisar.
    ADD COLUMN IF NOT EXISTS aviso_min_clics         INTEGER CHECK (aviso_min_clics BETWEEN 0 AND 10000000),
    ADD COLUMN IF NOT EXISTS aviso_min_impresiones   INTEGER CHECK (aviso_min_impresiones BETWEEN 0 AND 100000000),
    ADD COLUMN IF NOT EXISTS umbrales_cambiado_por   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS umbrales_cambiado_at    TIMESTAMPTZ;

COMMIT;
