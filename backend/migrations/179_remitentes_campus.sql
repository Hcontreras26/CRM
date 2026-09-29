-- 179 · El «no responder» de cada campus, para el correo de feedback
--
-- Diego, 28/09: los dominios de los campus están autenticados en la cuenta de
-- Brevo de los campus (la de Psicólogo IA, clave BREVO_CAMPUS_API_KEY en el
-- .env; NO en la de siempre, donde vive 360crm.tech). Estos son los remitentes
-- que esa cuenta tiene dados de alta.
--
-- Faltan Psiko Aprende y ACADEMIA IA: su DNS aún se está propagando. ISEIH no
-- tiene dominio en ninguna de las dos cuentas. Los tres salen, mientras tanto,
-- con noresponder@360crm.tech y el nombre del campus.
--
-- Por nombre y solo si está vacío: no pisa lo que alguien haya puesto a mano.

UPDATE projects SET remitente_no_contestar = 'no-responder@fonoaprende.com'
 WHERE nombre = 'Fono Aprende' AND remitente_no_contestar IS NULL;
UPDATE projects SET remitente_no_contestar = 'no-responder@ictess.com'
 WHERE nombre = 'ICTESS' AND remitente_no_contestar IS NULL;
UPDATE projects SET remitente_no_contestar = 'noreply@isaeg.com'
 WHERE nombre = 'ISAEG' AND remitente_no_contestar IS NULL;
UPDATE projects SET remitente_no_contestar = 'no-responder@isslogg.com'
 WHERE nombre = 'ISSLOGG' AND remitente_no_contestar IS NULL;
UPDATE projects SET remitente_no_contestar = 'no-responder@isecd.com'
 WHERE nombre = 'ISECD' AND remitente_no_contestar IS NULL;
UPDATE projects SET remitente_no_contestar = 'no-responder@institutoisef.com'
 WHERE nombre = 'ISEF' AND remitente_no_contestar IS NULL;
