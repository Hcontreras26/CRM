-- 155 · Que quede apuntado que una ficha se reviso (#132)
--
-- Diego, sobre el quinto paso del proceso —«Seguimiento de toda la base», fin
-- de mes—:
--
--     «Se puede enviar por correo a cada gestora esa base y que la validen.»
--     «Tiene que poder responderse. Si el correo solo enseña, nadie valida
--      nada: lo abre, lo cierra y sigue igual.»
--
-- Validar es MARCAR. Y para marcar hace falta un sitio donde quede.
--
-- POR QUE UNA TABLA Y NO UNA COLUMNA `revisado_at` EN `leads`
--
-- Porque esto se repite cada mes. Con una columna, revisar en octubre borra el
-- rastro de septiembre, y entonces no se puede responder a «¿repaso Adriana su
-- base el mes pasado?» — que es justo para lo que sirve el paso.
--
-- Una fila por revision guarda quien, cuando y que dijo. Y «cuanto le queda»
-- es contar las fichas suyas SIN fila este mes.
--
-- SIN ESTA MIGRACION EL CRM FUNCIONA IGUAL: el filtro «sin revisar» se mira
-- una vez contra `information_schema`, y si la tabla no esta, la pantalla y el
-- correo lo DICEN en vez de enseñar una lista que no significa nada.

CREATE TABLE IF NOT EXISTS lead_revisiones (
  id            SERIAL PRIMARY KEY,
  lead_id       INTEGER      NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  revisado_por  INTEGER      NOT NULL REFERENCES users(id),

  -- Que dijo la gestora al mirarla. Sin CHECK: los tres de hoy son
  -- 'sigue' | 'no_sigue' | 'cambio', y añadir un cuarto no deberia costar una
  -- migracion. La validacion vive en Zod, que es donde se puede leer.
  resultado     VARCHAR(30)  NOT NULL,
  nota          TEXT,

  revisado_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- La consulta de siempre es «¿tiene esta ficha revision en el mes en curso?»,
-- una por fila del listado. Sin indice eso es un recorrido entero por cada una.
CREATE INDEX IF NOT EXISTS idx_lead_revisiones_lead_fecha
  ON lead_revisiones (lead_id, revisado_at DESC);

-- Y «cuantas lleva revisadas esta persona este mes», que es el contador que ve
-- mientras avanza.
CREATE INDEX IF NOT EXISTS idx_lead_revisiones_quien_fecha
  ON lead_revisiones (revisado_por, revisado_at DESC);

COMMENT ON TABLE lead_revisiones IS
  'Repaso mensual de la base: quien miro que ficha, cuando y que dijo (#132).';
