import { logger } from '../utils/logger.js';
import { getDecryptedValue } from '../../modules/credentials/credentials.model.js';
import { query } from '../config/db.js';
import { yaSeEnvio, registrar } from './email-log.service.js';
import { dejaPasar, porQueSeParo } from './email-freno.service.js';
import { guardarEnEnviados, hayBuzon } from './copia-en-enviados.service.js';
import { mandarDesdeBuzon, saleDelBuzon } from './correo-buzon.service.js';

const BREVO_API_URL = 'https://api.brevo.com/v3';
const FROM_EMAIL = process.env.BREVO_FROM_EMAIL || 'no-reply@crm-test.local';
const FROM_NAME = process.env.BREVO_FROM_NAME || 'CRM MultiProyecto';

/** La cuenta del CRM: la clave global de la base y, si no hay, la del .env. */
async function getApiKey() {
  try {
    const fromDb = await getDecryptedValue('brevo', null);
    if (fromDb) return fromDb;
  } catch (err) {
    logger.warn({ err: err.message }, 'Brevo: error leyendo credencial DB');
  }
  const envKey = process.env.BREVO_API_KEY;
  if (!envKey || envKey === 'test') return null;
  return envKey;
}

/**
 * La cuenta de Brevo de la MARCA, si la tiene (Diego, 28/09).
 *
 * Los dominios de los campus (fonoaprende.com, ictess.com...) no estan en la
 * cuenta del CRM, donde vive 360crm.tech, sino en otra. Cada marca guarda la
 * suya en «Configurar esta marca → APIs → Brevo» —cifrada, en la base: se
 * cambia desde el panel sin tocar codigo ni servidor— y su «no contestar» en
 * «General». Con las dos, sus correos salen por su cuenta y con su remitente.
 *
 * Una cuenta de marca solo sirve con un remitente de la marca: sin remitente,
 * nada (y el correo sale por la del CRM, como siempre).
 */
async function cuentaDeLaMarca(projectId, fromEmail) {
  if (!projectId) return null;
  try {
    const apiKey = await getDecryptedValue('brevo', projectId);
    if (!apiKey) return null;
    let remitente = fromEmail;
    if (!remitente) {
      // to_jsonb: la columna es de la migracion 177; sin ella, null y no rompe.
      const { rows } = await query(
        "SELECT to_jsonb(p) ->> 'remitente_no_contestar' AS r FROM projects p WHERE p.id = $1", [projectId]);
      remitente = rows[0]?.r || null;
    }
    return remitente ? { apiKey, remitente } : null;
  } catch (err) {
    logger.warn({ err: err.message, projectId }, 'Brevo: error leyendo la cuenta de la marca');
    return null;
  }
}

// Cuantas veces se intenta y cuanto se espera entre intentos. Tres intentos con
// esperas de 1 s y 3 s cubren el caso normal —un corte de red, un 502 de paso—
// sin dejar colgada la peticion que lo llamo.
const INTENTOS = 3;
const ESPERAS_MS = [1000, 3000];

// Un 4xx no se reintenta: significa que el correo esta mal (direccion invalida,
// remitente sin verificar, plantilla rota). Reintentarlo es perder el tiempo y
// gastar cuota. Solo se reintenta lo que puede arreglarse solo: 5xx, 429 y los
// fallos de red.
const merecePenaReintentar = (estado) => estado === null || estado === 429 || estado >= 500;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * La copia en la carpeta «Enviados» del buzon, que es lo que hace un cliente de
 * correo despues de mandar. Hace falta salga por donde salga: **SMTP tampoco
 * guarda en Enviados**, eso lo hace siempre el cliente con un APPEND.
 *
 * NO se espera a que termine ni se mira si salio bien: el correo YA se mando y
 * eso no se deshace. Archivar la copia es lo accesorio — si falla, queda en el
 * registro y punto.
 */
function dejarCopiaEnEnviados({ de, deNombre, para, asunto, html, messageId }) {
  if (!hayBuzon()) return;
  guardarEnEnviados({ de, deNombre, para, asunto, html, messageId })
    .then((ok) => { if (!ok) logger.info({ para, asunto }, 'Copia en Enviados: no se guardo'); });
}

/**
 * Manda un correo. Es la unica puerta de salida del CRM.
 *
 * Sale por el buzon propio si va firmado por su direccion, y por Brevo en todo
 * lo demas. Quien llama no elige ni se entera: pasa el remitente que le toca y
 * el tubo se decide aqui.
 *
 * Un parametro opcional que no existia antes:
 *   · clave  — de idempotencia. Si ya salio un correo con esa clave, NO se manda
 *              otro. Es lo que evita lo del vigilante del catalogo, que mando el
 *              mismo aviso cinco veces en una tarde porque cada reinicio del
 *              proceso lo disparaba de nuevo.
 *
 * Es el UNICO parametro nuevo: el «de donde sale» ya lo dicen las `tags` que
 * todos los llamadores pasan ya, y se guardan tal cual.
 *
 * Quien no la pase se comporta exactamente igual que antes, salvo que ahora
 * queda anotado el intento.
 *
 *   · cuenta — 'crm' obliga a salir por la cuenta del CRM aunque la marca
 *              tenga la suya. Sin nada: la de la marca si la tiene
 *              (`cuentaDeLaMarca`), la del CRM si no.
 */
async function sendEmail({ to, subject, htmlContent, textContent, tags = [], projectId = null, fromEmail, fromName, replyTo, attachment, clave = null, cuenta = null }) {
  // `to` llega de cuatro formas: cadena, objeto, lista de objetos, y una cadena
  // con varios correos separados por comas (los avisos a administradores).
  const destinatarios = Array.isArray(to)
    ? to.map((d) => d?.email || d).filter(Boolean).join(',')
    : (to?.email || to || '');
  let remitente = fromEmail || FROM_EMAIL;

  // EL FRENO, antes que nada.
  //
  // Fuera de produccion no sale ni un correo a un cliente real. Va lo primero a
  // proposito: comprobar la clave o pedir la API key antes seria trabajo para
  // algo que no se va a mandar, y sobre todo, cualquier cosa que se añada
  // despues nace ya frenada sin que nadie se acuerde.
  const freno = dejaPasar(destinatarios);
  if (!freno.pasa) {
    const porque = porQueSeParo(freno.motivo, freno.bloqueados);
    logger.warn({ to: destinatarios, subject, motivo: freno.motivo }, `Brevo: ${porque}`);
    // Se anota como `bloqueado`, NO como `fallido`: no es que Brevo lo
    // rechazara, es que aqui se decidio no mandarlo. Confundirlos haria que el
    // registro de fallos pareciera roto en cada entorno de pruebas.
    await registrar({
      clave, destinatarios, asunto: subject, etiquetas: tags, projectId,
      estado: 'bloqueado', intentos: 0, error: porque,
      // Tambien el bloqueado: saber QUE se iba a mandar es justo lo que hace
      // falta cuando el freno para algo y no se entiende por que.
      cuerpoHtml: htmlContent, remitente,
    });
    return { sent: false, reason: 'FRENO_DE_PRUEBAS', motivo: freno.motivo, detalle: porque };
  }

  // Si ya salio, no se vuelve a mandar.
  if (await yaSeEnvio(clave)) {
    logger.info({ clave, to: destinatarios, subject }, 'Brevo: ya se envio antes, no se repite');
    return { sent: false, reason: 'YA_ENVIADO', repetido: true };
  }

  // ¿Por que cuenta de Brevo? La de la marca, si la tiene; entonces tambien su
  // remitente, si quien llama no puso otro.
  const marca = cuenta === 'crm' ? null : await cuentaDeLaMarca(projectId, fromEmail);
  if (marca) remitente = marca.remitente;

  // ¿SALE POR EL BUZON PROPIO?
  //
  // Va aqui, despues del freno y de la idempotencia y antes de Brevo, porque lo
  // de arriba vale para cualquier correo del CRM salga por donde salga: que no
  // se escape uno en pruebas, y que no salga dos veces. Cambiar el tubo no puede
  // saltarse ninguna de las dos.
  //
  // Lo que se gana: sin `List-Unsubscribe`, sin `Feedback-ID`, sin enlaces
  // reescritos — las cabeceras que hacen que Gmail lo archive en Promociones.
  // Ver `correo-buzon.service.js`, que lo cuenta con las cabeceras delante.
  if (saleDelBuzon(remitente)) {
    const r = await mandarDesdeBuzon({
      to, subject, htmlContent, textContent,
      fromName: fromName || FROM_NAME, replyTo, attachment,
    });
    if (r.sent) {
      logger.info({ messageId: r.messageId, to: destinatarios, subject }, 'Correo enviado por el buzon');
      await registrar({ clave, destinatarios, asunto: subject, etiquetas: tags, projectId,
        cuerpoHtml: htmlContent, remitente, estado: 'enviado', intentos: 1, brevoMsgId: r.messageId });
      dejarCopiaEnEnviados({
        de: remitente, deNombre: fromName || FROM_NAME,
        para: destinatarios, asunto: subject, html: htmlContent,
        messageId: r.messageId,
      });
      return { sent: true, messageId: r.messageId, intentos: 1, via: 'buzon' };
    }
    // Si el buzon no esta —Hostinger caido, contraseña cambiada— se sigue por
    // Brevo. Llegar a Promociones es un fastidio; no llegar es un problema.
    logger.warn({ motivo: r.reason, to: destinatarios, subject }, 'Buzon: no salio, se intenta por Brevo');
  }

  const apiKey = marca?.apiKey || await getApiKey();
  if (!apiKey) {
    logger.warn({ to, subject }, 'Brevo: sin API key configurada, email no enviado');
    await registrar({ clave, destinatarios, asunto: subject, etiquetas: tags, projectId,
      cuerpoHtml: htmlContent, remitente,
      estado: 'fallido', intentos: 0, error: 'NO_API_KEY' });
    return { sent: false, reason: 'NO_API_KEY' };
  }

  const payload = {
    sender: { email: remitente, name: fromName || FROM_NAME },
    to: Array.isArray(to) ? to : [{ email: to.email || to, name: to.name }],
    subject,
    htmlContent,
    textContent,
  };
  // A donde contesta quien lo recibe. Brevo, si no se dice, responde al
  // remitente — que casi siempre es lo que se quiere. Se deja poner aparte
  // porque hay correos cuyo sentido ES la respuesta: el aviso al tutor le pide
  // «contesta a este mismo correo con tu factura», y ahi no puede depender de
  // que nadie cambie el remitente por un `no-reply` mas adelante.
  if (replyTo) payload.replyTo = typeof replyTo === 'string' ? { email: replyTo } : replyTo;
  // Las etiquetas solo si las hay. Mandar la lista vacia hace que Brevo
  // conteste «400 · tags is blank» y NO envie el correo — y como casi ninguna
  // llamada pasa etiquetas, eso era todos los correos del CRM.
  if (Array.isArray(tags) && tags.length > 0) {
    payload.tags = tags;
  }
  // Brevo acepta `attachment: [{ name, content }]` con content en base64.
  // PDFs de facturas/certs estan muy por debajo del limite de 10MB.
  if (Array.isArray(attachment) && attachment.length > 0) {
    payload.attachment = attachment;
  }

  let ultimoFallo = { reason: 'DESCONOCIDO', details: null };
  // Los intentos que se hicieron DE VERDAD, no el tope. Un 4xx corta a la
  // primera, y anotar un 3 ahi haria creer que Brevo estuvo fallando.
  let hechos = 0;

  for (let intento = 1; intento <= INTENTOS; intento++) {
    hechos = intento;
    let estadoHttp = null;
    try {
      const res = await fetch(`${BREVO_API_URL}/smtp/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
          'accept': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      estadoHttp = res.status;

      if (res.ok) {
        const data = await res.json();
        logger.info({ messageId: data.messageId, to, subject, intento }, 'Brevo email enviado');
        await registrar({ clave, destinatarios, asunto: subject, etiquetas: tags, projectId,
      cuerpoHtml: htmlContent, remitente,
          estado: 'enviado', intentos: intento, brevoMsgId: data.messageId });

        dejarCopiaEnEnviados({
          de: remitente, deNombre: fromName || FROM_NAME,
          para: destinatarios, asunto: subject, html: htmlContent,
          messageId: data.messageId,
        });

        return { sent: true, messageId: data.messageId, intentos: intento, via: 'brevo' };
      }

      const err = await res.text();
      ultimoFallo = { reason: `HTTP_${res.status}`, details: err };
      logger.error({ status: res.status, err, to, subject, intento }, 'Brevo error');
    } catch (err) {
      ultimoFallo = { reason: 'FETCH_ERROR', details: err.message };
      logger.error({ err: err.message, to, subject, intento }, 'Brevo fetch error');
    }

    // Un fallo permanente no mejora esperando: se corta aqui.
    if (!merecePenaReintentar(estadoHttp)) break;
    if (intento < INTENTOS) await esperar(ESPERAS_MS[intento - 1] ?? 3000);
  }

  // Que no salio ya no se queda solo en el log: queda escrito.
  await registrar({ clave, destinatarios, asunto: subject, etiquetas: tags, projectId,
      cuerpoHtml: htmlContent, remitente,
    estado: 'fallido', intentos: hechos, error: `${ultimoFallo.reason} · ${ultimoFallo.details ?? ''}` });
  // Con un remitente que no es el del CRM —el de la marca—, una vez mas por la
  // cuenta del CRM y con su remitente: que llegue desde 360crm.tech es mejor
  // que no llegue. Suele ser un dominio aun sin autenticar o una clave caducada.
  if (cuenta !== 'crm' && remitente !== FROM_EMAIL) {
    logger.warn({ remitente, to: destinatarios, subject, fallo: ultimoFallo.reason },
      'Brevo: no salio con el remitente de la marca; se intenta por la cuenta del CRM');
    const otra = await sendEmail({ to, subject, htmlContent, textContent, tags, projectId,
      fromEmail: undefined, fromName, replyTo, attachment, clave, cuenta: 'crm' });
    return { ...otra, primerFallo: ultimoFallo.reason };
  }
  return { sent: false, ...ultimoFallo, intentos: hechos };
}

// ============================================================
// TEMPLATES
// ============================================================

export async function sendWelcomeUserEmail({ nombre, email, setPasswordToken, baseUrl }) {
  const link = `${baseUrl}/set-password?token=${encodeURIComponent(setPasswordToken)}`;
  const subject = 'Bienvenido al CRM - Establece tu contrasena';
  const htmlContent = `
    <!DOCTYPE html>
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #1f2937; max-width: 560px; margin: 0 auto; padding: 24px;">
      <div style="background: linear-gradient(135deg, #3b82f6, #8b5cf6); padding: 32px; border-radius: 12px; color: white; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Bienvenido al CRM</h1>
      </div>
      <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <p>Hola <strong>${nombre}</strong>,</p>
        <p>Se ha creado tu cuenta en el CRM MultiProyecto. Para empezar, establece tu contrasena haciendo click en el siguiente boton:</p>
        <p style="text-align: center; margin: 32px 0;">
          <a href="${link}" style="background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Establecer contrasena</a>
        </p>
        <p style="font-size: 13px; color: #6b7280;">O copia este enlace en tu navegador:<br><code style="background: #f3f4f6; padding: 4px 8px; border-radius: 4px; word-break: break-all;">${link}</code></p>
        <p style="font-size: 13px; color: #6b7280;">Este enlace expira en 24 horas.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
        <p style="font-size: 12px; color: #9ca3af;">Si no esperabas este email, ignoralo.</p>
      </div>
    </body></html>`;
  const textContent = `Hola ${nombre},\n\nSe ha creado tu cuenta en el CRM. Establece tu contrasena aqui:\n${link}\n\nEste enlace expira en 24 horas.`;

  return await sendEmail({
    to: [{ email, name: nombre }],
    subject,
    htmlContent,
    textContent,
    tags: ['welcome-user', 'crm'],
  });
}

export async function sendLeadAssignedEmail({ gestor, lead, proyecto, baseUrl }) {
  const link = `${baseUrl}/leads/${lead.id}`;
  const subject = `Nuevo lead asignado: ${lead.nombre}`;
  const htmlContent = `
    <!DOCTYPE html>
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #1f2937; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #3b82f6;">Nuevo lead asignado</h2>
      <p>Hola <strong>${gestor.nombre}</strong>, te han asignado un nuevo lead.</p>
      <div style="background: #f9fafb; padding: 16px; border-radius: 8px; border-left: 4px solid #3b82f6;">
        <p style="margin: 0 0 8px;"><strong>${lead.nombre}</strong></p>
        <p style="margin: 0 0 4px; font-size: 14px;">${lead.email}</p>
        ${lead.telefono ? `<p style="margin: 0 0 4px; font-size: 14px;">${lead.telefono}</p>` : ''}
        <p style="margin: 8px 0 0; font-size: 13px; color: #6b7280;">Proyecto: ${proyecto.nombre}</p>
      </div>
      <p style="text-align: center; margin: 24px 0;">
        <a href="${link}" style="background: #3b82f6; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">Ver lead</a>
      </p>
      <p style="font-size: 12px; color: #9ca3af;">Contactalo lo antes posible para maximizar la conversion.</p>
    </body></html>`;
  const textContent = `Hola ${gestor.nombre},\nNuevo lead asignado:\n${lead.nombre} <${lead.email}>\nProyecto: ${proyecto.nombre}\nVer: ${link}`;

  return await sendEmail({
    to: [{ email: gestor.email, name: gestor.nombre }],
    subject,
    htmlContent,
    textContent,
    tags: ['lead-assigned', 'crm'],
  });
}

export async function sendTestEmail(apiKey, toEmail) {
  // Para test manual de credencial
  try {
    const res = await fetch(`${BREVO_API_URL}/account`, {
      method: 'GET',
      headers: { 'api-key': apiKey, 'accept': 'application/json' },
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data = await res.json();
    return { ok: true, account: data.email };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export { sendEmail };

/**
 * MCP de Claude (#192): una conexión se ha bloqueado por fallar el código de
 * desbloqueo. Va al dueño de la conexión y a quien vigila (MCP_AVISO_EMAIL o
 * los super admin). Puede ser un despiste o alguien probando códigos con una
 * URL que no es suya: el correo lo dice para que lo mire quien sabe.
 */
export async function sendMcpBloqueoEmail({ para, persona, hasta, maxFallos }) {
  const cuando = new Date(hasta).toLocaleString('es-ES', { timeZone: process.env.APP_TIMEZONE || 'Europe/Madrid' });
  const conexion = `${persona.conexion} (${persona.prefijo}…)`;
  const subject = `MCP de Claude bloqueado: ${persona.nombre}`;
  const htmlContent = `
    <!DOCTYPE html>
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #1f2937; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 12px;">Conexión de Claude bloqueada</h2>
      <p>La conexión <strong>${conexion}</strong> de <strong>${persona.nombre}</strong> ha fallado el código de desbloqueo ${maxFallos} veces seguidas.</p>
      <p>Queda bloqueada hasta las <strong>${cuando}</strong>: hasta entonces no da datos ni acepta códigos.</p>
      <p>Si no has sido tú, revoca esa URL en el CRM → Conexión → MCP: alguien podría tenerla.</p>
    </body></html>`;
  const textContent = `La conexión ${conexion} de ${persona.nombre} ha fallado el código de desbloqueo ${maxFallos} veces seguidas.\n`
    + `Queda bloqueada hasta las ${cuando}.\nSi no has sido tú, revoca esa URL en el CRM → Conexión → MCP.`;
  return await sendEmail({ to: para, subject, htmlContent, textContent, tags: ['mcp-bloqueo', 'crm'] });
}

/**
 * MCP de Claude (#194): sus URLs van a caducar pronto. Un correo por persona,
 * con todas las que le caducan, y el enlace al panel para crear otra.
 */
export async function sendMcpCaducidadEmail({ persona, urls, enlace }) {
  const tz = process.env.APP_TIMEZONE || 'Europe/Madrid';
  const fecha = (d) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: tz });
  const lista = urls.map((u) => `<li><strong>${u.nombre}</strong> (${u.prefijo}…): caduca el ${fecha(u.expires_at)}</li>`).join('');
  const listaTexto = urls.map((u) => `- ${u.nombre} (${u.prefijo}…): caduca el ${fecha(u.expires_at)}`).join('\n');
  const una = urls.length === 1;
  const subject = una ? 'Tu URL de Claude para el CRM caduca pronto' : `${urls.length} URLs de Claude para el CRM caducan pronto`;
  const htmlContent = `
    <!DOCTYPE html>
    <html><body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #1f2937; max-width: 560px; margin: 0 auto; padding: 24px;">
      <p>Hola ${persona.nombre},</p>
      <p>${una ? 'Esta URL con la que Claude consulta el CRM va a caducar' : 'Estas URLs con las que Claude consulta el CRM van a caducar'}:</p>
      <ul>${lista}</ul>
      <p>Cuando caduque, Claude dejará de poder consultar. Para seguir, crea una URL nueva y cámbiala en tu Claude
         (Configuración → Conectores):</p>
      <p style="margin: 24px 0;"><a href="${enlace}" style="background: #3b82f6; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-weight: bold;">Ir a Conexión → MCP</a></p>
      <p style="font-size: 13px; color: #6b7280;">Si ya no la usas, no hace falta hacer nada: se apagará sola.</p>
    </body></html>`;
  const textContent = `Hola ${persona.nombre},\n\n${una ? 'Esta URL de Claude caduca' : 'Estas URLs de Claude caducan'} pronto:\n${listaTexto}\n\n`
    + `Crea una nueva en ${enlace} y cámbiala en tu Claude (Configuración → Conectores).\nSi ya no la usas, no hace falta hacer nada.`;
  return await sendEmail({ to: [{ email: persona.email, name: persona.nombre }], subject, htmlContent, textContent, tags: ['mcp-caducidad', 'crm'] });
}
