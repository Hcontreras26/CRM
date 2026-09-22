import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { logger } from '../utils/logger.js';
import { query } from '../config/db.js';

/**
 * Leer el buzón y guardar lo que ha llegado. Segunda mitad del #146.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ
 *
 * El aviso al tutor le pide que CONTESTE con su factura. Esa respuesta cae en
 * el buzón de Hostinger y hasta ahora el CRM no se enteraba: la conversación que
 * él mismo empieza, se terminaba fuera.
 *
 * POR QUÉ IMAP Y NO BREVO INBOUND
 *
 * Brevo Inbound obliga a apuntar un subdominio entero a Brevo, y solo ve lo que
 * llegue por ahí: el correo normal del buzón —el que se quiere mirar— se queda
 * fuera. IMAP lee el buzón de verdad, es el MISMO que ya usa la copia en
 * «Enviados», y no mete un proveedor más donde ya hay uno que funciona.
 *
 * LO QUE NO HACE
 *
 * No borra, no marca como leído y no mueve nada. Se abre el buzón en modo
 * SOLO LECTURA a propósito: quien lo tenga abierto en el webmail no puede
 * encontrarse con que el CRM le ha tocado sus correos. Que el CRM lea no puede
 * cambiar lo que ve una persona.
 *
 * Y NO se le pide el buzón entero cada vez: se pregunta por lo que hay desde el
 * último que se guardó. Aun así, releerlo no duplica —ver `clave`—, que es lo
 * que permite recuperarse de un corte sin llevar la cuenta por dónde iba.
 */

const HOST = process.env.IMAP_HOST || 'imap.hostinger.com';
const PUERTO = Number(process.env.IMAP_PORT || 993);
const USUARIO = process.env.SMTP_USER || process.env.IMAP_USER || '';
const CLAVE = process.env.SMTP_PASSWORD || process.env.IMAP_PASSWORD || '';

/** Cuántos se traen de una tacada. Un buzón con años detrás no cabe en memoria. */
const TOPE = 200;

/** ¿Hay buzón que leer? Sin esto, ni se intenta. */
export function hayBuzonQueLeer() {
  return Boolean(USUARIO && CLAVE);
}

/**
 * La clave de idempotencia de un correo que entra.
 *
 * Es el `Message-ID`, que lo pone quien manda y no cambia nunca. Con el índice
 * único que ya tiene la columna, leer el buzón dos veces no duplica nada.
 *
 * Si un correo llegara sin Message-ID —raro, pero los hay— se compone uno con
 * lo que sí tiene. Dos correos distintos del mismo remitente, en el mismo
 * segundo y con el mismo asunto son, a todos los efectos, el mismo.
 */
export function claveDeEntrada({ messageId, de, asunto, fecha }) {
  if (messageId) return `entrada:${messageId}`;
  const cuando = fecha instanceof Date ? fecha.toISOString() : String(fecha || '');
  return `entrada:sin-id:${de || '?'}:${cuando}:${asunto || ''}`.slice(0, 500);
}

/** La dirección de un `from` de mailparser, que llega como objeto. */
function direccionDe(campo) {
  const uno = campo?.value?.[0];
  return uno?.address || campo?.text || null;
}

/** Los destinatarios, en la cadena que usa el resto de la tabla. */
function destinatariosDe(mensaje) {
  const de = (c) => (c?.value || []).map((v) => v.address).filter(Boolean);
  const todos = [...de(mensaje.to), ...de(mensaje.cc)];
  // Si un correo no dice a quién va —copia oculta— el destinatario somos
  // nosotros, que para eso ha llegado a este buzón.
  return todos.length ? todos.join(',') : USUARIO;
}

/**
 * Guarda uno. Devuelve `true` si era nuevo.
 *
 * `ON CONFLICT DO NOTHING` sobre la clave: releer el buzón no duplica y no hay
 * que consultar antes si ya estaba.
 */
async function guardar(mensaje) {
  const de = direccionDe(mensaje.from);
  const clave = claveDeEntrada({
    messageId: mensaje.messageId, de, asunto: mensaje.subject, fecha: mensaje.date,
  });

  const { rowCount } = await query(
    `INSERT INTO email_envios
       (clave, direccion, remitente, destinatarios, asunto, cuerpo_html,
        estado, intentos, created_at)
     VALUES ($1, 'entrada', $2, $3, $4, $5, 'recibido', 1, $6)
     -- El WHERE no sobra: el indice unico de clave es PARCIAL —solo cuando no
     -- es nula, porque casi ningun envio lleva clave— y Postgres no lo reconoce
     -- si no se le repite aqui la misma condicion.
     ON CONFLICT (clave) WHERE clave IS NOT NULL DO NOTHING`,
    [
      clave,
      de,
      destinatariosDe(mensaje),
      mensaje.subject || '(sin asunto)',
      // El HTML si lo trae; si no, el texto plano envuelto, que es lo que hay.
      // `textAsHtml` lo da ya escapado, así que un correo no puede meter
      // etiquetas en la pantalla por venir en texto.
      mensaje.html || mensaje.textAsHtml || '',
      mensaje.date || new Date(),
    ],
  );
  return rowCount > 0;
}

/**
 * Lee el buzón y guarda lo nuevo. Devuelve `{ leidos, nuevos }`.
 *
 * NUNCA lanza: esto lo llama un cron y una pantalla, y que el buzón esté caído
 * no puede tumbar ninguno de los dos.
 */
export async function leerBuzon({ desde = null } = {}) {
  if (!hayBuzonQueLeer()) return { leidos: 0, nuevos: 0, motivo: 'SIN_BUZON' };

  let cliente;
  try {
    cliente = new ImapFlow({
      host: HOST, port: PUERTO, secure: true,
      auth: { user: USUARIO, pass: CLAVE },
      logger: false,
    });

    // UN CORTE DE RED NO ES UN FALLO DE PROGRAMACION.
    //
    // ImapFlow avisa de los cortes por el evento 'error', no rechazando la
    // promesa que se esta esperando. Sin nadie escuchandolo, Node lo trata como
    // excepcion sin capturar y el manejador de app.js cierra el proceso a
    // proposito: un ECONNRESET del servidor de correo tumbaba la API entera, y
    // el try/catch de aqui abajo no lo veia pasar.
    //
    // Va ANTES de connect() a proposito. Puesto despues, un corte durante el
    // propio connect vuelve a tumbarlo — y esa ventana es justo la que falla
    // cuando el servidor de correo va mal.
    //
    // Anotar basta: el fallo real lo sigue recogiendo el catch de siempre
    // cuando la operacion en curso se rompe.
    cliente.on('error', (err) => {
      logger.warn({ err: err?.message, host: HOST }, 'Correo entrante: la conexion IMAP se corto');
    });

    await cliente.connect();

    // SOLO LECTURA. Sin esto, abrir el buzón marca correos como vistos y a
    // quien lo tenga abierto en el webmail le desaparecen los no leídos.
    await cliente.mailboxOpen('INBOX', { readOnly: true });

    // Desde el último que se guardó, no desde el principio. Se resta un día de
    // margen: `SINCE` va por días y el reloj del servidor no es el nuestro.
    const corte = desde || await ultimaEntrada();
    const criterio = corte
      ? { since: new Date(corte.getTime() - 24 * 60 * 60 * 1000) }
      : { all: true };

    const uids = await cliente.search(criterio, { uid: true });
    if (!uids || !uids.length) return { leidos: 0, nuevos: 0 };

    // Los más recientes. Un buzón de años no cabe de una vez, y lo que interesa
    // es lo último.
    const aLeer = uids.slice(-TOPE);

    // Se recoge TODO antes de tocar la base: imapflow no admite otro comando
    // mientras el `fetch` sigue abierto y se queda colgado sin decir nada.
    const crudos = [];
    for await (const m of cliente.fetch(aLeer, { source: true }, { uid: true })) {
      if (m.source) crudos.push(m.source);
    }
    await cliente.logout();
    cliente = null;

    let nuevos = 0;
    for (const crudo of crudos) {
      try {
        if (await guardar(await simpleParser(crudo))) nuevos += 1;
      } catch (err) {
        // Un correo raro —un adjunto roto, una codificación imposible— no puede
        // impedir que se guarden los otros doscientos.
        logger.warn({ err: err.message }, 'Correo entrante: uno no se pudo leer');
      }
    }

    logger.info({ leidos: crudos.length, nuevos }, 'Correo entrante: buzón leído');
    return { leidos: crudos.length, nuevos };
  } catch (err) {
    logger.warn({ err: err.message, host: HOST }, 'Correo entrante: no se pudo leer el buzón');
    return { leidos: 0, nuevos: 0, motivo: 'ERROR', detalle: err.message };
  } finally {
    try { await cliente?.logout(); } catch { /* da igual */ }
  }
}

/** La fecha del último correo entrante guardado, para no pedir el buzón entero. */
async function ultimaEntrada() {
  const { rows } = await query(
    `SELECT MAX(created_at) AS ultima FROM email_envios WHERE direccion = 'entrada'`);
  return rows[0]?.ultima || null;
}
