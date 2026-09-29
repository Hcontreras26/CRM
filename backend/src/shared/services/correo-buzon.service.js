import nodemailer from 'nodemailer';
import { logger } from '../utils/logger.js';

/**
 * Salida por el buzon propio, hablando SMTP con Hostinger.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE EXISTE, SI YA ESTA BREVO
 *
 * Angel: «que no llegue a promocion, cuidado».
 *
 * No era, como llegue a decir, que el dominio no estuviera autenticado: se
 * comprobo leyendo un correo nuestro en crudo y firma bien —`dkim=pass
 * header.d=cediaidsl.com`, `dmarc=pass`—. Lo que lo manda a Promociones son las
 * cabeceras que Brevo engancha a TODO lo que sale por ahi:
 *
 *     List-Unsubscribe: <https://...sendibt3.com/tr/un/li/...>
 *     List-Unsubscribe-Post: List-Unsubscribe=One-Click
 *     X-CSA-Complaints: csa-complaints@eco.de
 *     Feedback-ID: ...:Sendinblue
 *
 * Eso es la firma de una lista de correo, y Gmail la lee como tal. No se puede
 * quitar desde el mensaje: se intento pisar `List-Unsubscribe` por el parametro
 * `headers` de la API y Brevo la devolvio a poner igual. Es ajuste de cuenta.
 *
 * Y aunque se pudiera, seguiria siendo el tubo equivocado. Brevo esta para el
 * correo en masa. El aviso al tutor es un correo de una persona a otra, con su
 * factura, pidiendo respuesta — de los que van a la bandeja de siempre.
 *
 * Por aqui sale desde la direccion de verdad, con la firma del dominio, sin
 * enlaces reescritos y sin cabeceras de lista.
 *
 * NO SUSTITUYE A BREVO. Solo se usa para los correos que salen DESDE este
 * buzon; lo demas —avisos de lead, bienvenidas, lo que va en volumen— sigue por
 * donde iba. Y sin credenciales configuradas, esto no existe y todo se comporta
 * como antes.
 */

const HOST = process.env.SMTP_HOST || 'smtp.hostinger.com';
const PUERTO = Number(process.env.SMTP_PORT || 465);
// El mismo buzon que ya se usa para dejar la copia en «Enviados»: es una sola
// cuenta de correo y pedir las credenciales dos veces solo sirve para que un dia
// una este cambiada y la otra no.
const USUARIO = process.env.SMTP_USER || process.env.IMAP_USER || '';
const CLAVE = process.env.SMTP_PASSWORD || process.env.IMAP_PASSWORD || '';

/** ¿Hay buzon de salida configurado? */
export function haySalidaPropia() {
  return Boolean(USUARIO && CLAVE);
}

/**
 * ¿Sale ESTE correo por el buzon?
 *
 * Solo si va firmado por la direccion del buzon. No es una preferencia: es lo
 * unico que se puede hacer. Un servidor SMTP autentica al remitente, y mandar
 * desde `facturacion@` un correo que dice venir de otra direccion es
 * exactamente lo que los filtros estan mirando.
 */
export function saleDelBuzon(remitente) {
  if (!haySalidaPropia()) return false;
  return String(remitente || '').trim().toLowerCase() === USUARIO.toLowerCase();
}

// Una sola conexion reutilizada. Abrir un TLS nuevo por correo funciona, pero
// con varios avisos seguidos son varios saludos completos al servidor para
// nada, y Hostinger cuenta conexiones.
let transporte = null;
function elTransporte() {
  if (!transporte) {
    transporte = nodemailer.createTransport({
      host: HOST,
      port: PUERTO,
      secure: PUERTO === 465,
      auth: { user: USUARIO, pass: CLAVE },
      pool: true,
      maxConnections: 2,
    });
  }
  return transporte;
}

/** Los adjuntos vienen en el formato de Brevo; aqui se dicen de la otra forma. */
function comoAdjuntos(attachment) {
  if (!Array.isArray(attachment) || attachment.length === 0) return undefined;
  return attachment
    .filter((a) => a && a.content)
    .map((a) => ({ filename: a.name, content: a.content, encoding: 'base64' }));
}

/**
 * Manda el correo. Devuelve `{ sent, messageId }` o `{ sent:false, reason }`.
 *
 * NO lanza: quien llama tiene a Brevo detras y un fallo aqui debe poder caer
 * hacia alla, no tumbar el aviso.
 */
export async function mandarDesdeBuzon({ to, subject, htmlContent, textContent, fromName, replyTo, attachment } = {}) {
  if (!haySalidaPropia()) return { sent: false, reason: 'SIN_BUZON' };

  const destinos = Array.isArray(to)
    ? to.map((d) => (d?.name ? `"${d.name}" <${d.email}>` : (d?.email || d))).filter(Boolean).join(', ')
    : (to?.email || to || '');

  try {
    const r = await elTransporte().sendMail({
      from: fromName ? { name: fromName, address: USUARIO } : USUARIO,
      to: destinos,
      subject,
      html: htmlContent,
      // El texto plano no es decoracion: un correo que solo trae HTML puntua
      // peor en todos los filtros, y es lo que ve quien lee sin formato.
      text: textContent || undefined,
      replyTo: typeof replyTo === 'string' ? replyTo : replyTo?.email,
      attachments: comoAdjuntos(attachment),
    });
    return { sent: true, messageId: r.messageId };
  } catch (err) {
    logger.error({ err: err.message, host: HOST, to: destinos, subject }, 'Buzon: no se pudo mandar');
    return { sent: false, reason: 'SMTP_ERROR', details: err.message };
  }
}
