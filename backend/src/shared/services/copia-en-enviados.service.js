import { ImapFlow } from 'imapflow';
import { logger } from '../utils/logger.js';

/**
 * Dejar una copia del correo en la carpeta «Enviados» del buzón de verdad.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ HACE FALTA ESTO
 *
 * Ángel: «también debe mantenerse el servicio normal: si se manda el correo,
 * aparece en la bandeja de salida».
 *
 * Y hoy no aparece. Brevo manda EN NOMBRE de `facturacion@cediaidsl.com`, no
 * DESDE ella: el mensaje no pasa por Hostinger y su carpeta de enviados no se
 * entera. Para quien recibe es indistinguible de un correo normal; para quien
 * lo manda, es como si no hubiera existido.
 *
 * Eso no lo arregla cambiar de proveedor: **SMTP tampoco guarda en Enviados**.
 * Quien guarda ahí es el CLIENTE de correo, y lo hace con un comando IMAP
 * —APPEND— después de mandar. Esto es exactamente eso: lo que hace Thunderbird
 * o el webmail por debajo.
 *
 * ES OPCIONAL Y NO PUEDE TUMBAR UN ENVÍO
 *
 * Sin credenciales configuradas no hace nada y el CRM funciona igual que hoy.
 * Y si falla —buzón lleno, contraseña cambiada, Hostinger caído— se anota y ya:
 * el correo YA SE MANDÓ. Tirar un envío porque no se pudo archivar la copia
 * sería romper lo importante por lo accesorio.
 */

const HOST = process.env.IMAP_HOST || 'imap.hostinger.com';
const PUERTO = Number(process.env.IMAP_PORT || 993);
const USUARIO = process.env.IMAP_USER || '';
const CLAVE = process.env.IMAP_PASSWORD || '';

/** ¿Está configurado? Sin esto, ni se intenta. */
export function hayBuzon() {
  return Boolean(USUARIO && CLAVE);
}

/**
 * La carpeta de enviados, preguntándosela al servidor.
 *
 * No se escribe «Sent» a pelo: cada servidor la llama distinto —«Sent»,
 * «INBOX.Sent», «Enviados», «Elementos enviados»— y acertar por casualidad en
 * uno significa crear una carpeta nueva y vacía en el siguiente. IMAP tiene una
 * marca para esto, `\Sent`, y es la única forma de saberlo de verdad.
 */
async function carpetaDeEnviados(cliente) {
  for (const b of await cliente.list()) {
    if (b.specialUse === '\\Sent' || /^(sent|enviados)$/i.test(b.name)) return b.path;
  }
  return null;
}

/**
 * La fecha como la escribe un cliente de correo.
 *
 * `toUTCString()` termina en «GMT», que el estandar admite pero por compatible
 * con lo viejo. Hay lectores que no lo parsean —el webmail de Hostinger, sin ir
 * mas lejos— y entonces la copia sale en «Enviados» SIN HORA, con el hueco en
 * blanco al lado del asunto. Lo que entienden todos es el desfase en numeros.
 */
export function fechaRFC(d) {
  return d.toUTCString().replace(/GMT$/, '+0000');
}

/** El mensaje en crudo, que es lo que IMAP guarda: cabeceras y cuerpo. */
function comoMensaje({ de, deNombre, para, asunto, html, fecha, messageId }) {
  const destinos = Array.isArray(para) ? para.join(', ') : para;
  // El asunto puede llevar tildes y eñes, y una cabecera es ASCII: se codifica
  // en base64 con la forma que entienden todos los lectores (RFC 2047). Sin
  // esto, «Tus comisiones de agosto» llega bien y «Información» no.
  const asuntoSeguro = /[^\x20-\x7E]/.test(asunto || '')
    ? `=?UTF-8?B?${Buffer.from(asunto || '', 'utf8').toString('base64')}?=`
    : (asunto || '');
  return [
    `From: ${deNombre ? `"${deNombre}" ` : ''}<${de}>`,
    `To: ${destinos}`,
    `Subject: ${asuntoSeguro}`,
    `Date: ${fechaRFC(fecha || new Date())}`,
    // El MISMO identificador que llevo el correo al salir. Es lo que hace que
    // la copia y la respuesta del tutor queden en la misma conversacion en vez
    // de sueltas; sin el, cada lector se lo inventa y no casan.
    ...(messageId ? [`Message-ID: ${messageId}`] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html || '',
  ].join('\r\n');
}

/**
 * Deja la copia. Devuelve `true` si se guardó, `false` si no — y NUNCA lanza:
 * quien llama ya ha mandado el correo y no puede deshacerlo.
 */
export async function guardarEnEnviados({ de, deNombre, para, asunto, html, fecha, messageId } = {}) {
  if (!hayBuzon()) return false;

  let cliente;
  try {
    cliente = new ImapFlow({
      host: HOST, port: PUERTO, secure: true,
      auth: { user: USUARIO, pass: CLAVE },
      logger: false,
    });

    // Lo mismo que en correo-entrante: el corte de red llega por el evento
    // 'error' y no como rechazo de la promesa. Sin escucharlo, Node lo toma por
    // excepcion sin capturar y se lleva por delante el proceso entero.
    //
    // ANTES de connect(), que es cuando mas falla. Y guardar la copia en
    // Enviados es lo accesorio de mandar un correo: que falle no puede costar
    // la API.
    cliente.on('error', (err) => {
      logger.warn({ err: err?.message, host: HOST }, 'Copia en Enviados: la conexion IMAP se corto');
    });

    await cliente.connect();

    const carpeta = await carpetaDeEnviados(cliente);
    if (!carpeta) {
      logger.warn({ host: HOST }, 'Copia en Enviados: el buzón no dice cuál es su carpeta de enviados');
      return false;
    }

    // `\Seen` porque ya se ha leído: es nuestro. Sin esa marca, la carpeta de
    // enviados sale con un contador de no leídos que no significa nada.
    //
    // Y la fecha se le da al servidor, en vez de dejar que ponga la de cuando
    // le llegó: son cosas distintas —la copia se archiva después de mandar— y
    // los lectores que ordenan por la del servidor la colocarían mal.
    const cuando = fecha || new Date();
    await cliente.append(
      carpeta,
      comoMensaje({ de, deNombre, para, asunto, html, fecha: cuando, messageId }),
      ['\\Seen'],
      cuando,
    );
    return true;
  } catch (err) {
    logger.warn({ err: err.message, host: HOST }, 'Copia en Enviados: no se pudo guardar');
    return false;
  } finally {
    try { await cliente?.logout(); } catch { /* da igual: la copia es lo accesorio */ }
  }
}
