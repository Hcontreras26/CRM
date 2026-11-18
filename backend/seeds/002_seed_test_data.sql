-- ============================================================
-- Seed 002: Datos ficticios para testing QA
-- Ejecutar en crm_test_db (staging)
-- ============================================================

BEGIN;

-- Gestores adicionales (password: CrmTemp2026!)
INSERT INTO users (nombre, email, password_hash, role) VALUES
  ('Laura Garcia', 'laura@empresa.com', '$2b$12$djqxmZQ9GGhZJVYgy7bp4uVO2YkTm3sff5Eug0O7ll7SgaDayW5Ge', 'gestor'),
  ('Carlos Ruiz', 'carlos@empresa.com', '$2b$12$djqxmZQ9GGhZJVYgy7bp4uVO2YkTm3sff5Eug0O7ll7SgaDayW5Ge', 'gestor')
ON CONFLICT (email) DO NOTHING;

-- Asignar gestores a proyectos
INSERT INTO user_projects (user_id, project_id, orden_cola)
SELECT u.id, 1, 3 FROM users u WHERE u.email = 'laura@empresa.com'
ON CONFLICT (user_id, project_id) DO NOTHING;
INSERT INTO user_projects (user_id, project_id, orden_cola)
SELECT u.id, 2, 2 FROM users u WHERE u.email = 'laura@empresa.com'
ON CONFLICT (user_id, project_id) DO NOTHING;
INSERT INTO user_projects (user_id, project_id, orden_cola)
SELECT u.id, 1, 4 FROM users u WHERE u.email = 'carlos@empresa.com'
ON CONFLICT (user_id, project_id) DO NOTHING;
INSERT INTO user_projects (user_id, project_id, orden_cola)
SELECT u.id, 3, 2 FROM users u WHERE u.email = 'carlos@empresa.com'
ON CONFLICT (user_id, project_id) DO NOTHING;

-- ============================================================
-- 20 LEADS PSIKO APRENDE (project_id=1)
-- ============================================================
INSERT INTO leads (project_id, nombre, email, telefono, status, responsable_id, producto_interes_id, fecha_solicitud) VALUES
(1, 'Maria Lopez', 'maria.lopez@gmail.com', '+34611111111', 'nuevo', 2, 1, NOW() - interval '1 day'),
(1, 'Juan Martinez', 'juan.martinez@hotmail.com', '+34622222222', 'contactado', 3, 1, NOW() - interval '2 days'),
(1, 'Ana Fernandez', 'ana.fdez@yahoo.es', '+34633333333', 'en_seguimiento', 2, 2, NOW() - interval '3 days'),
(1, 'Pedro Sanchez', 'pedro.s@gmail.com', '+34644444444', 'convertido', 3, 2, NOW() - interval '5 days'),
(1, 'Elena Gomez', 'elena.gomez@outlook.com', '+34655555555', 'no_interesado', 2, 3, NOW() - interval '4 days'),
(1, 'David Torres', 'david.t@gmail.com', '+34666666666', 'nuevo', 3, 1, NOW() - interval '6 hours'),
(1, 'Sofia Ruiz', 'sofia.r@hotmail.com', '+34677777777', 'por_contactar', 2, 2, NOW() - interval '12 hours'),
(1, 'Carlos Diaz', 'carlos.d@gmail.com', '+34688888888', 'contactado', 3, 1, NOW() - interval '1 day'),
(1, 'Laura Moreno', 'laura.m@yahoo.es', '+34699999999', 'en_seguimiento', 2, 3, NOW() - interval '2 days'),
(1, 'Pablo Jimenez', 'pablo.j@gmail.com', '+34610101010', 'nuevo', 3, 1, NOW() - interval '3 hours'),
(1, 'Carmen Alvarez', 'carmen.a@hotmail.com', '+34620202020', 'contactado', 2, 2, NOW() - interval '4 days'),
(1, 'Raul Hernandez', 'raul.h@gmail.com', '+34630303030', 'convertido', 3, 1, NOW() - interval '7 days'),
(1, 'Isabel Navarro', 'isabel.n@outlook.com', '+34640404040', 'por_contactar', 2, 3, NOW() - interval '1 day'),
(1, 'Miguel Romero', 'miguel.r@gmail.com', '+34650505050', 'nuevo', 3, 2, NOW() - interval '5 hours'),
(1, 'Lucia Serrano', 'lucia.s@yahoo.es', '+34660606060', 'en_seguimiento', 2, 1, NOW() - interval '6 days'),
(1, 'Andres Molina', 'andres.m@gmail.com', NULL, 'nuevo', 3, 2, NOW() - interval '2 hours'),
(1, 'Patricia Gil', 'patricia.g@hotmail.com', '+34680808080', 'contactado', 2, 1, NOW() - interval '3 days'),
(1, 'Fernando Castro', 'fernando.c@gmail.com', '+34690909090', 'convertido', 3, 3, NOW() - interval '10 days'),
(1, 'Rosa Ortega', 'rosa.o@outlook.com', '+34611112222', 'no_interesado', 2, 1, NOW() - interval '8 days'),
(1, 'Javier Rubio', 'javier.r@gmail.com', '+34622223333', 'nuevo', 3, 2, NOW() - interval '1 hour');

-- ============================================================
-- 15 LEADS ISEIH (project_id=2)
-- ============================================================
INSERT INTO leads (project_id, nombre, email, telefono, status, responsable_id, producto_interes_id, fecha_solicitud) VALUES
(2, 'Marta Vega', 'marta.v@gmail.com', '+34633334444', 'nuevo', 2, 4, NOW() - interval '2 days'),
(2, 'Alberto Flores', 'alberto.f@hotmail.com', '+34644445555', 'contactado', 2, 4, NOW() - interval '3 days'),
(2, 'Cristina Marquez', 'cristina.m@yahoo.es', '+34655556666', 'en_seguimiento', 2, 5, NOW() - interval '5 days'),
(2, 'Roberto Iglesias', 'roberto.i@gmail.com', '+34666667777', 'convertido', 2, 4, NOW() - interval '8 days'),
(2, 'Beatriz Ramos', 'beatriz.r@outlook.com', '+34677778888', 'nuevo', 2, 5, NOW() - interval '1 day'),
(2, 'Daniel Cano', 'daniel.c@gmail.com', '+34688889999', 'por_contactar', 2, 4, NOW() - interval '4 hours'),
(2, 'Teresa Prieto', 'teresa.p@hotmail.com', '+34699990000', 'contactado', 2, 5, NOW() - interval '6 days'),
(2, 'Alejandro Soto', 'alejandro.s@gmail.com', '+34611113333', 'nuevo', 2, 4, NOW() - interval '8 hours'),
(2, 'Natalia Cruz', 'natalia.c@yahoo.es', '+34622224444', 'en_seguimiento', 2, 5, NOW() - interval '4 days'),
(2, 'Oscar Perez', 'oscar.p@gmail.com', '+34633335555', 'no_interesado', 2, 4, NOW() - interval '9 days'),
(2, 'Silvia Martin', 'silvia.m@outlook.com', '+34644446666', 'nuevo', 2, 5, NOW() - interval '3 hours'),
(2, 'Victor Lozano', 'victor.l@gmail.com', NULL, 'contactado', 2, 4, NOW() - interval '2 days'),
(2, 'Paula Herrero', 'paula.h@hotmail.com', '+34666668888', 'convertido', 2, 5, NOW() - interval '12 days'),
(2, 'Marcos Fuentes', 'marcos.f@gmail.com', '+34677779999', 'nuevo', 2, 4, NOW() - interval '30 minutes'),
(2, 'Alicia Medina', 'alicia.m@yahoo.es', '+34688880000', 'por_contactar', 2, 5, NOW() - interval '1 day');

-- ============================================================
-- 10 LEADS FONO APRENDE (project_id=3)
-- ============================================================
INSERT INTO leads (project_id, nombre, email, telefono, status, responsable_id, producto_interes_id, fecha_solicitud) VALUES
(3, 'Eva Caballero', 'eva.c@gmail.com', '+34699991111', 'nuevo', 3, 6, NOW() - interval '1 day'),
(3, 'Hugo Pascual', 'hugo.p@hotmail.com', '+34611114444', 'contactado', 3, 7, NOW() - interval '3 days'),
(3, 'Irene Delgado', 'irene.d@yahoo.es', '+34622225555', 'en_seguimiento', 3, 6, NOW() - interval '5 days'),
(3, 'Adrian Bravo', 'adrian.b@gmail.com', '+34633336666', 'convertido', 3, 8, NOW() - interval '10 days'),
(3, 'Sandra Pena', 'sandra.p@outlook.com', '+34644447777', 'nuevo', 3, 6, NOW() - interval '6 hours'),
(3, 'Diego Campos', 'diego.c@gmail.com', NULL, 'por_contactar', 3, 7, NOW() - interval '2 days'),
(3, 'Nuria Reyes', 'nuria.r@hotmail.com', '+34666660000', 'no_interesado', 3, 8, NOW() - interval '7 days'),
(3, 'Sergio Vidal', 'sergio.v@gmail.com', '+34677771111', 'nuevo', 3, 6, NOW() - interval '4 hours'),
(3, 'Claudia Leon', 'claudia.l@yahoo.es', '+34688882222', 'contactado', 3, 7, NOW() - interval '1 day'),
(3, 'Ivan Mora', 'ivan.m@gmail.com', '+34699993333', 'en_seguimiento', 3, 8, NOW() - interval '4 days');

-- ============================================================
-- UTMs (canales de adquisicion)
-- ============================================================
INSERT INTO lead_utms (lead_id, utm_source, utm_medium, utm_campaign, canal_detectado)
SELECT id, 'facebook', 'cpc', 'psiko-master-2026', 'meta_ads' FROM leads WHERE email IN ('maria.lopez@gmail.com', 'juan.martinez@hotmail.com', 'david.t@gmail.com', 'pablo.j@gmail.com', 'marta.v@gmail.com', 'eva.c@gmail.com');

INSERT INTO lead_utms (lead_id, utm_source, utm_medium, utm_campaign, canal_detectado)
SELECT id, 'google', 'cpc', 'iseih-grado-superior', 'google_ads' FROM leads WHERE email IN ('ana.fdez@yahoo.es', 'carlos.d@gmail.com', 'alberto.f@hotmail.com', 'hugo.p@hotmail.com');

INSERT INTO lead_utms (lead_id, utm_source, utm_medium, utm_campaign, canal_detectado)
SELECT id, 'google', 'organic', NULL, 'organico' FROM leads WHERE email IN ('pedro.s@gmail.com', 'elena.gomez@outlook.com', 'cristina.m@yahoo.es', 'irene.d@yahoo.es');

INSERT INTO lead_utms (lead_id, utm_source, utm_medium, utm_campaign, canal_detectado)
SELECT id, 'instagram', 'cpc', 'fono-taller-2026', 'meta_ads' FROM leads WHERE email IN ('sofia.r@hotmail.com', 'carmen.a@hotmail.com', 'sandra.p@outlook.com');

INSERT INTO lead_utms (lead_id, utm_source, utm_medium, utm_campaign, canal_detectado)
SELECT id, 'chatgpt', 'referral', NULL, 'chatgpt_ia' FROM leads WHERE email IN ('andres.m@gmail.com', 'silvia.m@outlook.com');

-- ============================================================
-- INTERACCIONES
-- ============================================================
INSERT INTO lead_interactions (lead_id, tipo, nota, created_by, fecha)
SELECT id, 'llamada', 'Primer contacto telefonico, muy interesada en el master', 2, NOW() - interval '2 days' FROM leads WHERE email = 'ana.fdez@yahoo.es';
INSERT INTO lead_interactions (lead_id, tipo, nota, created_by, fecha)
SELECT id, 'email', 'Enviado dossier informativo por email', 2, NOW() - interval '1 day' FROM leads WHERE email = 'ana.fdez@yahoo.es';
INSERT INTO lead_interactions (lead_id, tipo, nota, created_by, fecha)
SELECT id, 'whatsapp', 'Confirmo asistencia a jornada de puertas abiertas', 2, NOW() - interval '6 hours' FROM leads WHERE email = 'ana.fdez@yahoo.es';
INSERT INTO lead_interactions (lead_id, tipo, nota, created_by, fecha)
SELECT id, 'llamada', 'Contactado, pide mas info sobre precio y plazos', 3, NOW() - interval '1 day' FROM leads WHERE email = 'juan.martinez@hotmail.com';
INSERT INTO lead_interactions (lead_id, tipo, nota, created_by, fecha)
SELECT id, 'nota', 'Cliente potencial alto, trabaja en educacion infantil', 3, NOW() - interval '12 hours' FROM leads WHERE email = 'juan.martinez@hotmail.com';
INSERT INTO lead_interactions (lead_id, tipo, nota, created_by, fecha)
SELECT id, 'llamada', 'Matriculado, todo OK. Pago con tarjeta', 2, NOW() - interval '8 days' FROM leads WHERE email = 'roberto.i@gmail.com';
INSERT INTO lead_interactions (lead_id, tipo, nota, created_by, fecha)
SELECT id, 'email', 'Enviada factura y confirmacion de matricula', 2, NOW() - interval '7 days' FROM leads WHERE email = 'roberto.i@gmail.com';
INSERT INTO lead_interactions (lead_id, tipo, nota, created_by, fecha)
SELECT id, 'llamada', 'No contesta, dejar mensaje de voz', 3, NOW() - interval '3 days' FROM leads WHERE email = 'elena.gomez@outlook.com';
INSERT INTO lead_interactions (lead_id, tipo, nota, created_by, fecha)
SELECT id, 'whatsapp', 'Dice que no le interesa por horarios incompatibles', 3, NOW() - interval '2 days' FROM leads WHERE email = 'elena.gomez@outlook.com';

-- ============================================================
-- STATUS HISTORY
-- ============================================================
INSERT INTO lead_status_history (lead_id, status_anterior, status_nuevo, changed_by, changed_at)
SELECT id, 'nuevo', 'contactado', 3, NOW() - interval '1 day' FROM leads WHERE email = 'juan.martinez@hotmail.com';
INSERT INTO lead_status_history (lead_id, status_anterior, status_nuevo, changed_by, changed_at)
SELECT id, 'nuevo', 'contactado', 2, NOW() - interval '2 days' FROM leads WHERE email = 'ana.fdez@yahoo.es';
INSERT INTO lead_status_history (lead_id, status_anterior, status_nuevo, changed_by, changed_at)
SELECT id, 'contactado', 'en_seguimiento', 2, NOW() - interval '1 day' FROM leads WHERE email = 'ana.fdez@yahoo.es';
INSERT INTO lead_status_history (lead_id, status_anterior, status_nuevo, changed_by, changed_at)
SELECT id, 'nuevo', 'contactado', 3, NOW() - interval '4 days' FROM leads WHERE email = 'pedro.s@gmail.com';
INSERT INTO lead_status_history (lead_id, status_anterior, status_nuevo, changed_by, changed_at)
SELECT id, 'contactado', 'convertido', 3, NOW() - interval '3 days' FROM leads WHERE email = 'pedro.s@gmail.com';
INSERT INTO lead_status_history (lead_id, status_anterior, status_nuevo, changed_by, changed_at)
SELECT id, 'nuevo', 'contactado', 3, NOW() - interval '3 days' FROM leads WHERE email = 'elena.gomez@outlook.com';
INSERT INTO lead_status_history (lead_id, status_anterior, status_nuevo, changed_by, changed_at)
SELECT id, 'contactado', 'no_interesado', 3, NOW() - interval '2 days' FROM leads WHERE email = 'elena.gomez@outlook.com';

-- ============================================================
-- CONVERSIONES
-- ============================================================
INSERT INTO conversions (lead_id, project_id, producto_contratado, importe_total, importe_pagado, metodo_pago, fecha_conversion)
SELECT l.id, 1, 'Master Neuroeducacion', 2500.00, 2500.00, 'tarjeta', CURRENT_DATE - 3 FROM leads l WHERE l.email = 'pedro.s@gmail.com';
INSERT INTO conversions (lead_id, project_id, producto_contratado, importe_total, importe_pagado, metodo_pago, fecha_conversion)
SELECT l.id, 1, 'Curso Psicologia Infantil', 1800.00, 900.00, 'fraccionado', CURRENT_DATE - 8 FROM leads l WHERE l.email = 'raul.h@gmail.com';
INSERT INTO conversions (lead_id, project_id, producto_contratado, importe_total, importe_pagado, metodo_pago, fecha_conversion)
SELECT l.id, 1, 'Taller Mindfulness Educativo', 650.00, 650.00, 'transferencia', CURRENT_DATE - 5 FROM leads l WHERE l.email = 'fernando.c@gmail.com';
INSERT INTO conversions (lead_id, project_id, producto_contratado, importe_total, importe_pagado, metodo_pago, fecha_conversion)
SELECT l.id, 2, 'Grado Superior Educacion Infantil', 4200.00, 2800.00, 'fraccionado', CURRENT_DATE - 10 FROM leads l WHERE l.email = 'roberto.i@gmail.com';
INSERT INTO conversions (lead_id, project_id, producto_contratado, importe_total, importe_pagado, metodo_pago, fecha_conversion)
SELECT l.id, 2, 'Curso Atencion Temprana', 890.00, 890.00, 'tarjeta', CURRENT_DATE - 6 FROM leads l WHERE l.email = 'paula.h@hotmail.com';
INSERT INTO conversions (lead_id, project_id, producto_contratado, importe_total, importe_pagado, metodo_pago, fecha_conversion)
SELECT l.id, 3, 'Master Terapia Miofuncional', 3200.00, 3200.00, 'transferencia', CURRENT_DATE - 4 FROM leads l WHERE l.email = 'adrian.b@gmail.com';

-- Pagos parciales
INSERT INTO conversion_payments (conversion_id, importe, fecha)
SELECT c.id, 900.00, CURRENT_DATE - 8 FROM conversions c JOIN leads l ON l.id = c.lead_id WHERE l.email = 'raul.h@gmail.com';
INSERT INTO conversion_payments (conversion_id, importe, fecha)
SELECT c.id, 1400.00, CURRENT_DATE - 10 FROM conversions c JOIN leads l ON l.id = c.lead_id WHERE l.email = 'roberto.i@gmail.com';
INSERT INTO conversion_payments (conversion_id, importe, fecha)
SELECT c.id, 1400.00, CURRENT_DATE - 5 FROM conversions c JOIN leads l ON l.id = c.lead_id WHERE l.email = 'roberto.i@gmail.com';

-- ============================================================
-- REMINDERS
-- ============================================================
INSERT INTO lead_reminders (lead_id, fecha_recordatorio, nota, created_by)
SELECT id, CURRENT_DATE + 1, 'Llamar para seguimiento del master', 2 FROM leads WHERE email = 'ana.fdez@yahoo.es';
INSERT INTO lead_reminders (lead_id, fecha_recordatorio, nota, created_by)
SELECT id, CURRENT_DATE + 3, 'Enviar propuesta de precio personalizada', 3 FROM leads WHERE email = 'juan.martinez@hotmail.com';
INSERT INTO lead_reminders (lead_id, fecha_recordatorio, nota, created_by)
SELECT id, CURRENT_DATE, 'Confirmar matricula - ultimo dia', 2 FROM leads WHERE email = 'cristina.m@yahoo.es';
INSERT INTO lead_reminders (lead_id, fecha_recordatorio, nota, created_by, completado)
SELECT id, CURRENT_DATE - 2, 'Enviar dossier informativo', 3, true FROM leads WHERE email = 'pedro.s@gmail.com';

-- ============================================================
-- ACTIVITY LOG
-- ============================================================
INSERT INTO user_activity_log (user_id, action, details, ip_address) VALUES
(1, 'login', '{"method":"password"}', '192.168.1.100'),
(2, 'login', '{"method":"password"}', '192.168.1.101'),
(3, 'login', '{"method":"password"}', '192.168.1.102'),
(2, 'login', '{"method":"password"}', '10.0.0.50'),
(2, 'logout', NULL, '10.0.0.50');

-- ============================================================
-- INCIDENCIAS (#253)
-- Las seis primeras de la tabla de la issue (06/10), solo como datos de
-- prueba en local: Diego, 27/10, «en el seed local y nunca en una migración».
-- Los campus y las personas de entonces (ISSLOGG, ICTESS, Dayana, Yolanda) no
-- existen en esta base: el campus va por nombre si está y la persona, en el
-- texto. La hora de «la 87» (12:00) y las gravedades no las dice la issue: son
-- de relleno. Este bloque no duplica si se repite (cada una entra solo si no
-- está), pero el fichero entero va en una transacción y lo de arriba no es
-- repetible: en una base ya sembrada, lanzar solo este bloque.
-- ============================================================
INSERT INTO incidencias (ocurrio_at, crm, project_id, tipos, entidad_tipo, entidad_id,
                         que_paso, impacto, como_se_arreglo, gravedad, estado)
SELECT v.ocurrio_at::timestamptz, 'multicrm', (SELECT id FROM projects WHERE nombre = v.campus),
       v.tipos::text[], v.entidad_tipo, v.entidad_id, v.que_paso, v.impacto, v.como, v.gravedad, v.estado
  FROM (VALUES
    ('2026-10-06 15:10+02', 'ISEIH', '{capa8}', 'lead', 4033,
     'Alta a mano (Dayana): Irene se dio de alta en ISSLOGG en vez de ISEIH. El buscador de programas solo mira el campus del prospecto, así que no aparecía el «Diplomado en Terapia Craneosacral y Regulación Nerviosa».',
     'No se podía convertir.',
     'Diego la pasó a ISEIH con su diplomado (9417), con copia y registro en su ficha.', 'medium', 'resolved'),
    ('2026-10-06 17:04+02', 'ISEIH', '{capa8}', 'lead', 4033,
     'Dayana, al no poder convertirla, borró a Irene con el motivo «test», aunque era un prospecto real.',
     'Se perdió la ficha original.',
     'No se restaura (Diego, 06/10). Dayana la volvió a dar de alta en ISEIH (ficha 4042), con su venta y su factura, la 2026/0182.', 'medium', 'resolved'),
    ('2026-10-05 16:34+02', NULL, '{dato_mal}', 'factura', NULL,
     'Yolanda (ICTESS): factura 2026/0086 (COOPERATIVAS AGRO-ALIMENTARIAS, 200 €, sin venta) emitida con la emisora duplicada (id 11: sin logo ni forma de pago).',
     'Factura con datos de emisora incorrectos.',
     'Borrada el 06/10. Yolanda la volvió a emitir a las 17:10 con la emisora buena (id 9). Después no le salía en su lista: eso era fallo del CRM, arreglado en #254.', 'medium', 'resolved'),
    ('2026-10-06 12:00+02', NULL, '{capa8,fallo_crm}', 'venta', 569,
     'ICTESS: la 2.ª cuota de Carlos (curso de 333 € en plazos de 111) se facturó a mano por los 333 enteros. La 1.ª cuota ya tenía la suya, la 0077.',
     'Factura por un importe de más.',
     'Borrada. Se vuelve a emitir desde la cola, por 111 €. El CRM ya no lo deja pasar sin confirmar (#254).', 'high', 'resolved'),
    ('2026-10-06 16:02+02', 'Psiko Aprende', '{capa8,fallo_crm}', 'factura', NULL,
     'Dayana (CEDIA, Psiko Aprende): factura de Delia García Moratilla numerada a mano 0188 en vez de 0180, y con el IVA sumado encima: 345,45 € por un cobro de 285,50. La serie quedó con huecos (180, 185, 186, 187).',
     'El cobro de Delia, atascado en la cola.',
     'Pendiente: se borra y se emite desde la cola como 0180 por 285,50 €. El 185 se rellenó con «Emitir la que falta». El CRM ya avisa (#254).', 'high', 'open'),
    ('2026-10-05 19:24+02', NULL, '{capa8,fallo_crm}', 'lead', 3916,
     'Yolanda (ICTESS): Orlando Villalobos. Se registró su venta (Diplomado en Mecánico Naval, 1.780 €) y a las 19:24 se borró como «Error al cargar». Igual Eric García (11/08) y Tomás Franco (23/06).',
     'Su cobro de Stripe de 400 € quedó suelto y la ficha dejó de salir en Prospectos y en Clientes.',
     'Pendiente: volver a registrar la venta sin el pago y asociar el cobro de Stripe. El CRM no devuelve la ficha a su estado al borrar la última venta.', 'high', 'open')
  ) AS v(ocurrio_at, campus, tipos, entidad_tipo, entidad_id, que_paso, impacto, como, gravedad, estado)
 WHERE NOT EXISTS (SELECT 1 FROM incidencias i WHERE i.que_paso = v.que_paso);

COMMIT;
