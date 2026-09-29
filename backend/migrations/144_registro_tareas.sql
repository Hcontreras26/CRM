-- 144 · El rastro de las tareas programadas (#111, la pantalla de registro)
--
-- La vista «todos» del registro tiene que enseñar los sucesos del sistema:
-- trabajos programados, webhooks, sincronizaciones y errores. Tres de los
-- cuatro ya dejan rastro en una tabla y no hay que inventar nada:
--
--   errores          → status_errors           (037)
--   webhooks         → make_webhook_deliveries (063)
--   quien hizo que   → lead_audit_log (070), document_audit_log (039),
--                      user_activity_log (001)
--
-- El que falta son las tareas. `jobs/latido.js` las vigila desde el envoltorio
-- —por eso ninguna puede olvidarse de fichar— pero lo guarda EN MEMORIA, y ahi
-- se dijo el porque: la pantalla de estado (#26) solo pregunta «¿esto va?», y
-- para eso el proceso vivo basta.
--
-- Un registro es la otra pregunta: «¿que paso el martes a las tres?». Eso la
-- memoria no lo contesta —se vacia en cada despliegue— y por eso aqui si hace
-- falta la tabla. El latido sigue en memoria para el estado; esto es el diario.
--
-- SE GUARDA UNA FILA POR VUELTA, INCLUIDAS LAS QUE NO HACEN NADA
--
-- La tentacion es anotar solo cuando algo cambio. No: «la sincronizacion de
-- Stripe no corrio en tres dias» y «corrio y no habia cobros» son dos cosas
-- distintas, y sin la fila de la vuelta vacia se leen igual. Las trece tareas
-- juntas dan del orden de mil filas al dia; la limpieza va abajo.

BEGIN;

CREATE TABLE IF NOT EXISTS registro_tareas (
  id           BIGSERIAL PRIMARY KEY,
  -- El identificador estable que ya usa `vigilar()`, no el titulo bonito: el
  -- titulo se puede reescribir y entonces el historico se parte en dos.
  nombre       VARCHAR(80)  NOT NULL,
  titulo       VARCHAR(160),
  empezo       TIMESTAMPTZ  NOT NULL,
  termino      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  duracion_ms  INTEGER,
  ok           BOOLEAN      NOT NULL DEFAULT TRUE,
  -- Solo cuando fallo. Recortado: aqui no cabe una traza entera, y para eso
  -- esta `status_errors`.
  mensaje      TEXT,
  -- Lo que la vuelta quiera contar de si misma: cuantos correos mando, cuantos
  -- cobros trajo. Es opcional a proposito — ninguna tarea esta obligada a
  -- rellenarlo, y las que no lo hagan siguen dejando su fila.
  detalle      JSONB
);

-- La consulta del registro es siempre «lo ultimo», con o sin filtro de tarea.
CREATE INDEX IF NOT EXISTS idx_registro_tareas_cuando ON registro_tareas(termino DESC);
CREATE INDEX IF NOT EXISTS idx_registro_tareas_nombre ON registro_tareas(nombre, termino DESC);
-- Para «enseñame solo lo que fallo», que es como se mira esto de verdad.
CREATE INDEX IF NOT EXISTS idx_registro_tareas_fallos ON registro_tareas(termino DESC) WHERE NOT ok;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- LA LIMPIEZA, QUE NO ES OPCIONAL
--
-- Mil filas al dia son 365.000 al año de algo que nadie mira pasada una semana.
-- El ticket lo pide para los avisos —«que no se acumulen para siempre»— y vale
-- igual aqui.
--
-- No se pone un trabajo mas para esto: la propia tarea borra al fichar, una vez
-- de cada cien vueltas, que sale gratis y no puede olvidarse de correr. Queda
-- escrito aqui para que se sepa que existe y donde mirar si algun dia sobra.
--
-- Lo que fallo se guarda mas tiempo que lo que salio bien: una vuelta correcta
-- de hace un mes no dice nada, y un fallo de hace un mes explica por que falta
-- un dato. Los plazos estan en `jobs/latido.js` (DIAS_QUE_SE_GUARDAN).
-- ─────────────────────────────────────────────────────────────────────────────

-- El #71: esta migracion la corre `postgres` —las tablas viejas son suyas— y
-- eso hace que la tabla NUEVA nazca siendo de postgres, con el usuario del CRM
-- sin poder ni leerla. Se le da acceso al que exista en esta instalacion.
DO $$
DECLARE rol TEXT; tab TEXT;
BEGIN
  FOREACH rol IN ARRAY ARRAY['crm_user', 'crm_iseie_user'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      FOREACH tab IN ARRAY ARRAY['registro_tareas'] LOOP
        IF to_regclass('public.' || tab) IS NOT NULL THEN
          EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO %I', tab, rol);
          IF to_regclass('public.' || tab || '_id_seq') IS NOT NULL THEN
            EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO %I', tab || '_id_seq', rol);
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
END $$;
