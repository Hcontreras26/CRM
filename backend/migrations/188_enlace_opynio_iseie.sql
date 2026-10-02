-- 188 · El enlace de Opynio de ISEIE (#209)
--
-- La 152 escribió https://web.opynio.com/es/empresa/iseie en la plantilla
-- «Día 2 · Opiniones · 2 de 3». Esa página da 404: la buena es
-- …/empresa/iseie_innovation_school. Carlos la corrigió a mano en la producción
-- de ISEIE el 02/10, pero cualquier base montada desde las migraciones volvía a
-- nacer con el enlace roto (ISEIE staging lo tenía todavía).
--
-- La 152 no se toca: es historia. Esta la corrige detrás, en cualquier base.
--
-- Idempotente: solo cambia lo que todavía lleva el enlace malo. El (?![_a-z])
-- es para no tocar el bueno, que empieza igual.
UPDATE whatsapp_templates
   SET body = regexp_replace(body, 'opynio\.com/es/empresa/iseie(?![_a-z])',
                             'opynio.com/es/empresa/iseie_innovation_school', 'g'),
       updated_at = NOW()
 WHERE body ~ 'opynio\.com/es/empresa/iseie(?![_a-z])';
