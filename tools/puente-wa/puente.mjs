// Puente local de WhatsApp. VARIAS SESIONES A LA VEZ.
//
// Habla con WhatsApp usando Baileys —la misma libreria que Evolution API usa
// por dentro— y expone HACIA EL CRM los mismos endpoints que expondria
// Evolution. Asi el CRM no se entera de la diferencia: las mismas rutas, las
// mismas formas de payload.
//
// Existe porque Docker no arranca en esta maquina (la virtualizacion esta
// desactivada en la BIOS) y hacia falta poder probar con un numero de verdad
// sin esperar al VPS.
//
// Antes solo sostenia UNA sesion: un socket, una carpeta de credenciales, un
// numero. Eso significaba que el CRM entero compartia el WhatsApp de quien lo
// hubiera enlazado, y cualquier usuario leia las conversaciones privadas de esa
// persona. Ahora cada instancia —una por usuario del CRM— tiene su socket, su
// carpeta, su agenda y su cache, sin nada compartido entre ellas.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import makeWASocket, {
  useMultiFileAuthState, DisconnectReason, downloadMediaMessage,
} from '@whiskeysockets/baileys';
import qrTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import pino from 'pino';

// ── Convertir el audio a lo que WhatsApp entiende ────────────────────────────
//
// Una nota de voz tiene que ir en ogg/opus. Chrome graba webm —no sabe hacer
// ogg: `isTypeSupported('audio/ogg;codecs=opus')` devuelve false— asi que hay
// que convertirlo antes de mandarlo. Es exactamente lo que hace Evolution por
// dentro; el puente no lo hacia y las notas llegaban rotas.
import { spawn } from 'node:child_process';
import ffmpeg from '@ffmpeg-installer/ffmpeg';

/**
 * Cuanto dura DE VERDAD el audio que se va a mandar.
 *
 * La duracion no es un adorno: WhatsApp la usa para pedir el fichero, y si no
 * cuadra con lo que hay, al darle a reproducir sale «Este audio ya no esta
 * disponible». Comprobado con las mismas notas mandadas con la duracion buena
 * y con una inventada.
 *
 * Antes venia medida en el navegador con `Date.now()`, contando desde antes de
 * que el grabador arrancara de verdad — o sea que siempre sobraba o faltaba.
 * Aqui se mide del fichero, que es lo unico que no puede mentir.
 */
function duracionDe(buffer) {
  return new Promise((resolve) => {
    const p = spawn(ffmpeg.path, ['-i', 'pipe:0', '-f', 'null', '-']);
    const err = [];
    p.stderr.on('data', (d) => err.push(d));
    p.on('error', () => resolve(null));
    p.on('close', () => {
      // ffmpeg escribe «time=00:00:03.01» al terminar; se coge la ultima.
      const t = Buffer.concat(err).toString().match(/time=(\d+):(\d+):(\d+\.\d+)/g);
      if (!t?.length) return resolve(null);
      const m = t[t.length - 1].match(/time=(\d+):(\d+):(\d+\.\d+)/);
      const seg = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      // HACIA ABAJO, nunca hacia arriba.
      //
      // Aqui estaba el fallo que dejaba las notas mudas en el movil. Una de
      // 2,53 s redondeaba a 3, o sea que se prometia mas audio del que hay, y
      // la aplicacion del movil se niega a reproducirla: sale «Este audio ya no
      // esta disponible». WhatsApp de escritorio ni lo mira, y por eso ahi se
      // oia — que fue lo que despisto durante horas.
      //
      // Prometer de menos no molesta a nadie; prometer de mas la deja muda.
      resolve(seg > 0 ? Math.max(1, Math.floor(seg)) : null);
    });
    p.stdin.on('error', () => {});
    p.stdin.end(buffer);
  });
}

/**
 * La ONDA de la nota: 64 valores de 0 a 100, uno por trocito del audio.
 *
 * Es lo que dibuja las barritas debajo del boton de reproducir. Y no es
 * decoracion: las notas de voz que manda la aplicacion de verdad SIEMPRE la
 * llevan, y sin ella el movil se niega a reproducir la nota —«Este audio ya no
 * esta disponible»— mientras que WhatsApp de escritorio la reproduce sin
 * problema, porque usa el decodificador del navegador y no la mira.
 *
 * Ese es justo el sintoma que llevabamos persiguiendo: en el ordenador se oia,
 * en el movil no.
 *
 * Se saca decodificando a PCM y midiendo el volumen de cada trocito.
 */
function ondaDe(buffer) {
  return new Promise((resolve) => {
    // PCM crudo, 16 bits con signo, mono, 8 kHz: para medir volumen sobra, y
    // asi hay poco que recorrer.
    const p = spawn(ffmpeg.path, [
      '-i', 'pipe:0', '-vn', '-f', 's16le', '-acodec', 'pcm_s16le',
      '-ar', '8000', '-ac', '1', 'pipe:1',
    ]);
    const trozos = [];
    p.stdout.on('data', (d) => trozos.push(d));
    p.stderr.on('data', () => {});
    p.on('error', () => resolve(null));
    p.on('close', () => {
      const pcm = Buffer.concat(trozos);
      const muestras = Math.floor(pcm.length / 2);
      if (muestras < 64) return resolve(null);
      const onda = new Uint8Array(64);
      const porTrozo = Math.floor(muestras / 64);
      let tope = 1;
      const crudos = new Float64Array(64);
      for (let i = 0; i < 64; i++) {
        let suma = 0;
        for (let j = 0; j < porTrozo; j++) {
          const v = pcm.readInt16LE((i * porTrozo + j) * 2) / 32768;
          suma += v * v;
        }
        crudos[i] = Math.sqrt(suma / porTrozo);   // volumen eficaz del trozo
        if (crudos[i] > tope) tope = crudos[i];
      }
      // Se escala al mas alto: una nota bajita tiene que verse igual de bien.
      for (let i = 0; i < 64; i++) onda[i] = Math.round((crudos[i] / tope) * 100);
      resolve(onda);
    });
    p.stdin.on('error', () => {});
    p.stdin.end(buffer);
  });
}

/** ¿Esto ya es un Ogg? Los cuatro primeros bytes de un Ogg son «OggS». */
const yaEsOgg = (b) => Buffer.isBuffer(b) && b.length > 4 && b.subarray(0, 4).toString() === 'OggS';

function aOggOpus(entrada) {
  // TODO se reconvierte, incluso lo que ya viene en Ogg.
  //
  // Parece un desperdicio —es una vuelta de codificacion con perdida— y lo
  // quite por eso. Fue un error: desde ese momento, TODA nota que paso intacta
  // llego muda al movil («Este audio ya no esta disponible»), y toda la que
  // paso por ffmpeg sono. Mismo audio, mismo `ptt`, misma duracion, mismo
  // `fileLength`, y el media se recupera de WhatsApp en los dos casos: no hay
  // nada observable que los distinga, solo el resultado.
  //
  // Asi que se convierte siempre. La perdida de una vuelta a 32 kbps en una
  // nota de voz no la nota nadie; una nota muda si.
  if (yaEsOgg(entrada)) { /* se reconvierte igual, ver arriba */ }

  return new Promise((resolve, reject) => {
    const p = spawn(ffmpeg.path, [
      '-i', 'pipe:0',
      '-vn',                       // sin video: lo que graba el navegador no lo lleva
      '-c:a', 'libopus',
      '-b:a', '32k',               // de sobra para voz, y pesa poco
      '-ar', '48000', '-ac', '1',  // lo que espera WhatsApp: 48 kHz y mono
      // Como codifica WhatsApp sus propias notas: modo voz y tramas de 20 ms.
      // El modo por defecto de libopus es `audio`, pensado para musica; `voip`
      // es el que usa la aplicacion, y el tamaño de trama es el que espera su
      // reproductor.
      '-application', 'voip',
      '-frame_duration', '20',
      '-vbr', 'on',
      '-compression_level', '10',
      '-f', 'ogg', 'pipe:1',
    ]);
    const trozos = [];
    const errores = [];
    p.stdout.on('data', (d) => trozos.push(d));
    p.stderr.on('data', (d) => errores.push(d));
    // Si falla, NO se manda el original.
    //
    // Aqui habia un «mejor mandar el original que no mandar nada», y era falso:
    // lo que graba el navegador es webm, y mandarlo por el endpoint de notas de
    // voz lo etiqueta como ogg/opus. WhatsApp se traga el envio, el mensaje
    // aparece, y al darle a reproducir dice «este audio ya no esta disponible».
    // O sea que el fallo no se veia aqui, se veia en el movil un rato despues y
    // sin nada en el registro que lo relacionara.
    //
    // Mejor no mandar nada y decirlo: un error se arregla, un audio mudo no.
    p.on('error', (e) => reject(new Error(`ffmpeg no arranco: ${e.message}`)));
    p.on('close', (code) => {
      const salida = Buffer.concat(trozos);
      if (code !== 0 || !salida.length) {
        const porque = Buffer.concat(errores).toString().trim().slice(-200);
        return reject(new Error(`ffmpeg fallo (codigo ${code}): ${porque || 'sin detalle'}`));
      }
      // Un ogg de verdad empieza por «OggS». Si no, ffmpeg devolvio otra cosa y
      // vale mas cazarlo aqui que en el movil de alguien.
      if (salida.subarray(0, 4).toString() !== 'OggS') {
        return reject(new Error('la conversion no produjo un ogg'));
      }
      resolve(salida);
    });
    p.stdin.on('error', () => {});
    p.stdin.end(entrada);
  });
}


const AQUI = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.PUENTE_PUERTO || 8099);
const CRM_WEBHOOK = process.env.CRM_WEBHOOK || 'http://127.0.0.1:3056/api/whatsapp/webhook';
const RAIZ_SESIONES = path.join(AQUI, 'sesiones');

// WhatsApp caduca el codigo QR a los ~20 segundos y manda otro por el mismo
// canal. Si el socket se muere mientras habia uno pendiente, se quedaba
// guardado para siempre: el CRM lo seguia enseñando y quien lo escaneaba veia
// «no se pudo vincular el dispositivo» en el movil, sin ninguna pista de por
// que. Un codigo con mas de un minuto se da por muerto y se pide otro.
const QR_VIVE_MS = 60000;

// Que significa «lo reciente»: un mes y ni un dia mas.
//
// Antes se dejaba en manos de WhatsApp —syncFullHistory en false— y lo que
// mandaba era «lo que le pareciera»: en un movil con anos de uso llegaban
// decenas de miles de mensajes igualmente. Si la pantalla ofrece «los ultimos
// meses», eso tiene que ser verdad, asi que se recorta aqui.
const RECIENTE_MS = 30 * 24 * 60 * 60 * 1000;

const log = (...a) => console.log(new Date().toLocaleTimeString('es-ES'), ...a);

// El puente NO se puede morir a media sincronizacion.
//
// Paso: un adjunto viejo cuyo enlace de WhatsApp ya habia caducado lanzo
// «Failed to fetch stream» fuera de todo try/catch, y Node cierra el proceso
// por una promesa rechazada sin capturar. La sincronizacion se corto en el
// mensaje 218 de 5.600 y no habia forma de saber por que.
//
// Ahora ademas se llevaria por delante las sesiones de TODOS, no la de uno.
process.on('unhandledRejection', (e) => log('AVISO · promesa sin capturar:', e?.message || e));
process.on('uncaughtException', (e) => log('AVISO · excepcion sin capturar:', e?.message || e));

/**
 * El nombre de la instancia acaba siendo un NOMBRE DE CARPETA, asi que se
 * limpia. Sin esto, una instancia llamada «../../otra-cosa» escribiria fuera de
 * su sitio y podria llegar a las credenciales de otra sesion.
 */
const sanear = (nombre) =>
  String(nombre || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'crm';

/**
 * Personas y grupos si; canales, difusiones y estados no.
 *
 * `@lid` es el direccionamiento nuevo de WhatsApp: en vez del telefono usa un
 * identificador que no lo revela. Es una PERSONA, aunque no lo parezca por la
 * terminacion, y hasta ahora se tiraba con los canales — en silencio, ademas.
 * Ahi se perdian mensajes enteros sin dejar rastro.
 */
const esConversacion = (jid) =>
  Boolean(jid) && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@g.us') || jid.endsWith('@lid'));

/**
 * ¿Este «nombre» es en realidad el telefono?
 *
 * Un nombre tiene letras. Si no tiene NINGUNA, es el numero — y llega de varias
 * formas: «+34600111222», «+34 600-111-222», o enmascarado por el propio
 * WhatsApp como «+58********69» (con el operador punto U+2219, no con asteriscos
 * normales, que fue lo que costo verlo).
 *
 * Guardarlo tapa el nombre de verdad, que suele estar archivado bajo el
 * identificador de esa misma persona.
 *
 * Con letras se acepta: hay quien se pone «Ana 664» y eso si es un nombre.
 */
function esUnNumero(nombre) {
  const texto = String(nombre || '').trim();
  if (!texto) return true;
  return !/\p{L}/u.test(texto);
}

// Si ya viene un jid entero, se respeta. Antes esto hacia
// `replace(/[^0-9]/g,'') + '@s.whatsapp.net'` SIEMPRE, asi que un grupo
// —`1203634...@g.us`— se convertia en un jid de PERSONA con el numero del
// grupo: el mensaje no llegaba al grupo y el eco creaba una conversacion
// fantasma en el CRM. Es la trampa de la #63 otra vez: Evolution acepta el jid
// entero y el puente no, asi que lo que se prueba aqui no es lo que corre.
const jidDe = (numero) => {
  const v = String(numero);
  if (v.includes('@')) return v;
  return `${v.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
};

/**
 * De que tipo es un mensaje, para el registro.
 *
 * Antes se volcaba el JSON cortado a 50 caracteres, que ni decia el tipo ni
 * servia para nada: buscando por que no llegaba un audio, el registro solo
 * ensenaba trozos de urls de stickers. El contenido NO se registra a proposito
 * —son conversaciones de clientes—; con el tipo basta para diagnosticar.
 */
function tipoDe(m) {
  if (!m) return 'vacio';
  if (m.audioMessage) return m.audioMessage.ptt ? 'nota-de-voz' : 'audio';
  if (m.imageMessage) return 'imagen';
  if (m.videoMessage) return 'video';
  if (m.documentMessage) return 'documento';
  if (m.stickerMessage) return 'sticker';
  if (m.conversation || m.extendedTextMessage) return 'texto';
  if (m.reactionMessage) return 'reaccion';
  if (m.protocolMessage) return 'protocolo';
  if (m.senderKeyDistributionMessage) return 'claves';
  // Lo que no se reconoce se dice tal cual: es la pista de que falta un caso.
  return Object.keys(m).filter((k) => k !== 'messageContextInfo').join('+') || 'desconocido';
}

/**
 * A que mensaje responde este, si responde a alguno.
 *
 * WhatsApp lo mete en el contexto, dentro del tipo concreto: un texto citando
 * lo lleva en extendedTextMessage, una foto en imageMessage, y asi. Se busca en
 * todos en vez de solo en el texto, que era lo facil y dejaba fuera las
 * respuestas con foto o con audio.
 */
function aQueResponde(m) {
  if (!m) return null;
  for (const clave of Object.keys(m)) {
    const ctx = m[clave]?.contextInfo;
    if (ctx?.stanzaId) return ctx.stanzaId;
  }
  return null;
}

/** Los mensajes vienen envueltos de varias formas; el de dentro es el bueno. */
const desenvolver = (m) =>
  m?.ephemeralMessage?.message
  || m?.viewOnceMessage?.message
  || m?.viewOnceMessageV2?.message
  || m?.viewOnceMessageV2Extension?.message
  || m?.documentWithCaptionMessage?.message
  || m?.editedMessage?.message?.protocolMessage?.editedMessage
  || m;

/**
 * De `@lid` al numero de telefono de siempre.
 *
 * WhatsApp esta pasando a direccionar por identificador en vez de por telefono.
 * Si se guardara tal cual, la MISMA persona saldria dos veces en la lista —una
 * por su numero y otra por su identificador— y no habria forma de saber que son
 * la misma. Se traduce siempre que se pueda:
 *
 *   1. `remoteJidAlt`, que suele venir en el propio mensaje: gratis.
 *   2. La tabla de equivalencias de Baileys, que va preguntando y guardando.
 *
 * Si no se puede traducir se deja el identificador: peor es tirar el mensaje.
 */
async function aTelefono(s, jid, key) {
  if (!jid?.endsWith('@lid')) return jid;
  // Al traducir se aprovecha para llevarse el nombre. La mayoria de contactos
  // llegan bajo identificador —779 contra 332 en el caso real— y ahi el nombre
  // no lo encuentra nadie, porque las conversaciones se guardan por telefono.
  // Este es el momento en que se sabe que las dos llaves son la misma persona.
  const conNombre = (tel) => {
    const nom = s.agenda.get(jid);
    if (nom && !s.agenda.get(tel)) { s.agenda.set(tel, nom); s.guardarAgenda(); }
    return tel;
  };

  // Sin el numero de dispositivo.
  //
  // WhatsApp devuelve a veces `34722134659:0@s.whatsapp.net` —el `:0` es el
  // aparato desde el que se hablo— y las conversaciones se guardan sin el. Con
  // el sufijo no casan: se vio traduciendo el @lid de una etiqueta.
  const sinAparato = (j) => String(j).replace(/:\d+(?=@)/, '');

  const alterno = key?.remoteJidAlt || key?.senderPn;
  if (alterno?.endsWith('@s.whatsapp.net')) return conNombre(sinAparato(alterno));
  try {
    const pn = await s.sock?.signalRepository?.lidMapping?.getPNForLID?.(jid);
    if (pn) return conNombre(sinAparato(pn.includes('@') ? pn : `${pn}@s.whatsapp.net`));
  } catch { /* sin equivalencia conocida todavia */ }
  return jid;
}

/**
 * Apunta tambien el nombre bajo el telefono, no solo bajo el identificador.
 *
 * WhatsApp manda cada vez mas contactos como `@lid`, pero las conversaciones se
 * guardan por telefono: un nombre archivado solo bajo el identificador no lo
 * encuentra nunca nadie, y esa persona sale con su numero pelado.
 *
 * Se hace en segundo plano y de poco en poco: son cientos de traducciones y no
 * pueden retrasar el guardado de los mensajes que estan entrando.
 */
async function traducirYApuntar(s, pares) {
  let puestos = 0;
  for (const [lid, nombre] of pares) {
    try {
      const pn = await s.sock?.signalRepository?.lidMapping?.getPNForLID?.(lid);
      if (!pn) continue;
      const jid = pn.includes('@') ? pn : `${pn}@s.whatsapp.net`;
      if (!s.agenda.has(jid)) { s.agenda.set(jid, nombre); puestos++; }
    } catch { /* sin equivalencia conocida */ }
  }
  if (puestos) {
    s.guardarAgenda();
    log(`[${s.nombre}] agenda: ${puestos} nombres atados tambien a su telefono`);
  }
}

// ── Una sesion ───────────────────────────────────────────────────────────────

const sesiones = new Map();   // nombre -> sesion

function sesionDe(nombre) {
  const n = sanear(nombre);
  if (!sesiones.has(n)) sesiones.set(n, crearSesion(n));
  return sesiones.get(n);
}

/**
 * ¿Este nombre es el MIO?
 *
 * Cerrojo, no adorno. `pushName` es el nombre de quien escribe, y en un mensaje
 * que mandas tu ese eres tu: a un contacto que no estuviera en la agenda se le
 * ponia el nombre de uno mismo en cuanto se le escribia. Ya no se manda en ese
 * caso, pero si por lo que sea colara otra vez, aqui se para.
 *
 * Salvo en el chat de uno consigo mismo, donde tu nombre SI es el correcto.
 */
function esMiPropioNombre(s, jid, nombre) {
  if (!nombre || !s.miNombre) return false;
  if (jid.startsWith(`${s.miNumero}@`)) return false;   // el chat contigo mismo
  return nombre.trim().toLowerCase() === s.miNombre.trim().toLowerCase();
}

function crearSesion(nombre) {
  const s = {
    nombre,
    carpeta: path.join(RAIZ_SESIONES, nombre),
    sock: null,
    estado: 'cerrando',
    ultimoQR: null,
    qrDesde: 0,
    miNumero: null,
    miNombre: null,
    ultimaSenal: null,   // ultima vez que WhatsApp dio señales de vida
    conectando: false,
    // Sube en cada intento de conexion. Los manejadores del socket viejo
    // comparan con esto y se callan si ya no son los vigentes: es lo que corta
    // el bucle de conectar y desconectar.
    epoca: 0,
    esperaReconexion: 3000,
    // Cuanto historial traer al enlazar: 'cero' | 'rapido' | 'todo'. Se elige
    // en la pantalla del CRM y se guarda en disco junto a las credenciales,
    // porque `syncFullHistory` es una opcion del socket y hay que saberla ANTES
    // de abrirlo — tambien al reabrirlo tras reiniciar.
    modo: 'rapido',
    fallidos: 0,
    // Cada sesion con lo suyo. Compartir la agenda entre sesiones seria colar
    // los contactos de una persona en la pantalla de otra.
    agenda: new Map(),   // jid -> nombre
    fotos: new Map(),    // jid -> url de la foto de perfil
    // Las etiquetas de WhatsApp Business (#128, #138).
    //
    // Evolution las guarda en su base y las sirve por `/label/findLabels`. Aqui
    // se guardan en memoria: al reconectar, WhatsApp vuelve a mandar
    // `labels.edit` de todas en la sincronizacion del estado, asi que se
    // repueblan solas. Persistirlas seria inventarse un almacen que el original
    // no tiene y que aqui no hace falta.
    //
    // En una cuenta que NO sea Business esto se queda vacio, y es lo correcto:
    // las etiquetas son una funcion suya. Que aqui saliera algo seria
    // exactamente el «puente mas generoso» que la #63 prohibe.
    etiquetas: new Map(), // waId -> { id, name, color, predefinedId }
    // Los adjuntos hay que descifrarlos con el mensaje ORIGINAL, asi que se
    // guarda hasta que el CRM lo pide. El tope es alto a proposito: al
    // emparejar llegan miles de mensajes de historial de golpe, y con un cache
    // de 200 los primeros ya se habian caido cuando el CRM pedia sus fotos. Se
    // quedaron 56 imagenes sin descargar por eso.
    mensajes: new Map(), // wa_id -> mensaje completo
    // Quien esta escribiendo ahora mismo, por conversacion.
    //
    // WhatsApp NO manda esto por su cuenta: hay que suscribirse a cada
    // conversacion que se quiera vigilar, y el aviso caduca solo. Se guarda con
    // su hora de caducidad porque el «ha dejado de escribir» a veces no llega —
    // si el otro cierra la aplicacion de golpe, por ejemplo— y sin caducidad se
    // quedaria «escribiendo…» para siempre.
    presencias: new Map(),  // jid -> { quien, hasta }
    gruposFallidos: new Map(),  // jid -> cuando fallo la ultima consulta
    suscritos: new Set(),   // a que conversaciones ya se pidio la presencia
  };

  s.qrFresco = () => Boolean(s.ultimoQR) && (Date.now() - s.qrDesde) < QR_VIVE_MS;

  s.guardarModo = (modo) => {
    if (!['cero', 'rapido', 'todo'].includes(modo)) return;
    s.modo = modo;
    try {
      fs.mkdirSync(s.carpeta, { recursive: true });
      fs.writeFileSync(path.join(s.carpeta, 'modo.txt'), modo);
    } catch { /* si no se puede, se queda en memoria */ }
  };

  try {
    const guardado = fs.readFileSync(path.join(s.carpeta, 'modo.txt'), 'utf8').trim();
    if (['cero', 'rapido', 'todo'].includes(guardado)) s.modo = guardado;
  } catch { /* sesion nueva */ }

  // La agenda, guardada en disco.
  //
  // WhatsApp manda los contactos UNA VEZ, al emparejar. Vivian solo en memoria,
  // asi que cualquier reinicio del servicio los borraba — y a partir de ahi
  // todo el mundo salia con su numero pelado, o peor: con el nombre que esa
  // persona se haya puesto a si misma en vez del que tu le tienes guardado.
  // Volver a tenerlos obligaba a desvincular y emparejar otra vez.
  //
  // Va junto a las credenciales, en la carpeta de la sesion: es informacion de
  // esa persona y no se mezcla con la de nadie mas.
  const ficheroAgenda = path.join(s.carpeta, 'agenda.json');
  try {
    const guardada = JSON.parse(fs.readFileSync(ficheroAgenda, 'utf8'));
    for (const [jid, nombre] of guardada.agenda || []) s.agenda.set(jid, nombre);
    for (const [jid, url] of guardada.fotos || []) s.fotos.set(jid, url);
  } catch { /* todavia no hay */ }

  // Se escribe con retraso: al emparejar entran miles de contactos de golpe y
  // no tiene sentido guardar el fichero entero con cada uno.
  let pendienteGuardar = null;
  s.guardarAgenda = () => {
    if (pendienteGuardar) return;
    pendienteGuardar = setTimeout(() => {
      pendienteGuardar = null;
      try {
        fs.mkdirSync(s.carpeta, { recursive: true });
        fs.writeFileSync(ficheroAgenda, JSON.stringify({
          agenda: [...s.agenda.entries()],
          fotos: [...s.fotos.entries()],
        }));
      } catch { /* si no se puede, se queda en memoria */ }
    }, 4000);
  };

  s.recordar = (m) => {
    if (!m?.key?.id) return;
    s.mensajes.set(m.key.id, m);
    if (s.mensajes.size > 20000) s.mensajes.delete(s.mensajes.keys().next().value);
  };

  s.nombreDeJid = (jid) => s.agenda.get(jid) || null;

  /** El nombre de un grupo. Se pide una vez y se guarda con los demas. */
  s.nombreDeGrupo = async (jid) => {
    const yaEsta = s.agenda.get(jid);
    if (yaEsta) return yaEsta;
    // No preguntar mas de una vez por minuto por el mismo grupo, pero SI volver
    // a preguntar. Antes un fallo se guardaba como «sin nombre» y no se
    // reintentaba jamas: si la primera vez no habia conexion o no habia
    // llegado la lista de grupos, ese grupo se quedaba sin nombre para siempre
    // y en la lista salia el del ultimo que hubiera escrito.
    const hace = s.gruposFallidos.get(jid);
    if (hace && Date.now() - hace < 60000) return null;
    try {
      const meta = await s.sock.groupMetadata(jid);
      if (meta?.subject) {
        s.agenda.set(jid, meta.subject);
        s.gruposFallidos.delete(jid);
        s.guardarAgenda();
        return meta.subject;
      }
    } catch { /* sin permiso, grupo abandonado, o sin conexion ahora mismo */ }
    s.gruposFallidos.set(jid, Date.now());
    return null;
  };

  s.apuntarContactos = (lista) => {
    let n = 0;
    const porTraducir = [];
    for (const c of lista || []) {
      const jid = c.id || c.jid;
      // `@lid` tambien: es el direccionamiento nuevo de WhatsApp y tus
      // contactos empiezan a llegar asi. Descartarlos era tirar media agenda —
      // de hecho llegan MAS por ahi que por el telefono: 779 contra 332.
      if (!jid || !(jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'))) continue;
      const nom = c.name || c.notify || c.verifiedName || c.subject || null;
      // Un numero no es un nombre. Cuando WhatsApp no tiene el contacto por
      // esa via manda el telefono como si lo fuera —a veces con separadores
      // raros, «+34 600-111-222»— y guardarlo tapa el nombre de verdad, que
      // suele estar archivado bajo el identificador de esa misma persona.
      if (!nom || esUnNumero(nom)) continue;
      s.agenda.set(jid, nom);
      n++;
      // Guardado solo bajo su identificador, ese nombre no lo encuentra nadie:
      // las conversaciones se guardan por telefono. Se apunta con las DOS
      // llaves — la misma persona, buscada de las dos formas.
      if (jid.endsWith('@lid')) porTraducir.push([jid, nom]);
    }
    if (n) s.guardarAgenda();
    if (porTraducir.length) traducirYApuntar(s, porTraducir);
    return n;
  };

  /** La foto de perfil. WhatsApp da una URL temporal, hay que pedirla. */
  s.fotoDe = async (jid) => {
    if (s.fotos.has(jid)) return s.fotos.get(jid);
    try {
      const url = await s.sock.profilePictureUrl(jid, 'image');
      s.fotos.set(jid, url || null);
      s.guardarAgenda();
      return url || null;
    } catch {
      // Sin foto, o con la privacidad puesta para que no se vea.
      s.fotos.set(jid, null);
      return null;
    }
  };

  /**
   * Un aviso al CRM, con reintentos.
   *
   * Sin esto se perdieron 2.463 mensajes al emparejar: se mandaban miles de
   * peticiones seguidas sin pausa, se agoto la cola de conexiones y todas las
   * demas murieron con «fetch failed» sin dejar rastro en la base.
   */
  s.avisarCRM = async (cuerpo, intentos = 3) => {
    for (let i = 1; i <= intentos; i++) {
      try {
        const r = await fetch(CRM_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // La instancia va SIEMPRE: es lo unico que le dice al CRM de quien es
          // esta conversacion. Sin ella, los mensajes de todos caerian juntos.
          body: JSON.stringify({ ...cuerpo, instance: s.nombre }),
          signal: AbortSignal.timeout(20000),
        });
        if (r.ok) return true;
        if (r.status < 500) return false;  // 4xx no mejora reintentando
      } catch { /* red saturada: se reintenta */ }
      if (i < intentos) await new Promise((r) => setTimeout(r, 400 * i));
    }
    s.fallidos++;
    return false;
  };

  // Solo una conexion a la vez POR SESION.
  //
  // Si la pantalla pide codigo dos veces seguidas —o alguien pulsa dos veces—
  // se abririan dos sockets contra WhatsApp con las mismas credenciales. Se
  // pelean, se cierran el uno al otro y el numero acaba desconectado sin motivo
  // aparente.
  //
  // Ojo con cuando se libera la bandera: antes se soltaba en cuanto el socket
  // estaba CREADO, y crearlo tarda milisegundos mientras que conectarse tarda
  // segundos. Asi que no frenaba nada. Ahora se mantiene hasta que WhatsApp
  // contesta —abriendo o cerrando— o hasta que se agota la espera.
  s.conectar = async () => {
    if (s.conectando) { log(`[${s.nombre}] ya hay una conexion en marcha, no se abre otra`); return; }
    s.conectando = true;
    const miEpoca = s.epoca + 1;
    // Red de seguridad: si WhatsApp no contesta ni para bien ni para mal, no se
    // puede quedar bloqueado sin poder reintentar nunca.
    setTimeout(() => { if (s.epoca === miEpoca) s.conectando = false; }, 45000);
    try {
      await abrirSocket(s);
    } catch (e) {
      s.conectando = false;
      throw e;
    }
  };

  return s;
}

async function abrirSocket(s) {
  const miEpoca = ++s.epoca;

  // Al anterior se le quitan los manejadores ANTES de cerrarlo.
  //
  // Cerrar solo el ws no bastaba: los manejadores seguian enganchados, y el
  // 'close' que llegaba un instante despues marcaba la sesion como caida y
  // programaba otra reconexion, que se cargaba al socket nuevo. Ese cerraba y
  // vuelta a empezar: conectar y desconectar cada tres segundos, sin fin.
  const viejo = s.sock;
  s.sock = null;
  if (viejo) {
    try { viejo.ev.removeAllListeners?.(); } catch { /* version sin ese metodo */ }
    try { viejo.ws?.close?.(); } catch { /* ya estaba cerrado */ }
  }

  const { state, saveCreds } = await useMultiFileAuthState(s.carpeta);

  s.sock = makeWASocket({
    auth: state,
    // Como se ve el CRM en «Dispositivos vinculados» del movil.
    browser: ['CRM MultiProyecto', 'Chrome', '1.0.0'],
    logger: pino({ level: 'silent' }),
    // Marcar todo como en linea es justo lo que no hace una persona.
    markOnlineOnConnect: false,
    // Cuanto historial pedirle a WhatsApp.
    //
    // En `false`, WhatsApp manda «lo que le parezca»: una rebanada minima de
    // los chats mas recientes, y NO un mes. Se vio enlazando de verdad —
    // faltaban conversaciones de hoy y de ayer con «el ultimo mes» elegido—.
    //
    // Asi que se pide TODO tambien en «rapido», y el recorte a 30 dias lo hace
    // este puente unas lineas mas abajo, que es justo lo que dice el comentario
    // de RECIENTE_MS y lo que esta linea llevaba contradiciendo: «si la pantalla
    // ofrece los ultimos meses, eso tiene que ser verdad».
    //
    // Cuesta mas espera, y por eso ahora se manda el progreso real de Baileys a
    // la pantalla en vez de dejar a la gestora mirando un contador que sube.
    // En «cero» sigue apagado: ahi no se quiere nada del pasado.
    syncFullHistory: s.modo !== 'cero',
  });

  const sock = s.sock;

  // ¿Sigo siendo yo el socket bueno? Si no, callarse: lo que venga de un socket
  // ya sustituido no debe tocar el estado ni mandar nada al CRM.
  const vigente = () => s.epoca === miEpoca && s.sock === sock;

  sock.ev.on('creds.update', saveCreds);

  // Los nombres llegan por aqui, no con los mensajes.
  sock.ev.on('contacts.upsert', (c) => {
    if (!vigente()) return;
    const n = s.apuntarContactos(c);
    if (n) log(`[${s.nombre}] agenda: +${n} contactos`);
  });
  sock.ev.on('contacts.update', (c) => {
    if (!vigente()) return;
    const n = s.apuntarContactos(c);
    if (n) log(`[${s.nombre}] agenda: ${n} nombres actualizados`);
  });

  sock.ev.on('connection.update', async (u) => {
    if (!vigente()) return;
    const { connection, lastDisconnect, qr } = u;
    // WhatsApp ya ha contestado: se puede volver a intentar si hace falta.
    if (connection === 'open' || connection === 'close') s.conectando = false;
    if (qr) {
      s.ultimoQR = qr;
      s.qrDesde = Date.now();
      s.estado = 'esperando-qr';
      console.log(`\n──────── ESCANEA ESTE CODIGO · ${s.nombre} ────────`);
      console.log('  WhatsApp > Ajustes > Dispositivos vinculados');
      console.log('  > Vincular un dispositivo\n');
      qrTerminal.generate(qr, { small: true });
      // Tambien como PNG, por si la terminal no lo pinta bien.
      await QRCode.toFile(path.join(s.carpeta, 'qr.png'), qr, { width: 400 }).catch(() => {});
    }
    if (connection === 'open') {
      s.estado = 'open';
      s.ultimoQR = null;
      s.ultimaSenal = Date.now();
      s.esperaReconexion = 3000;   // conexion buena: se reinicia la espera
      s.miNumero = sock.user?.id?.split(':')[0]?.split('@')[0] || null;
      s.miNombre = sock.user?.name || null;
      log(`[${s.nombre}] CONECTADO como +${s.miNumero} (${s.miNombre || 'sin nombre'})`);
      // Tu lista de contactos.
      //
      // Los nombres que TU les pusiste no viajan con los mensajes: van en el
      // estado de la cuenta, y WhatsApp solo lo manda entero al emparejar.
      // Enlazando con «empezar de cero» no llegaba ninguno —la agenda tenia 106
      // grupos y CERO personas— y todo el mundo salia con su numero pelado.
      //
      // Y eso estaba mal planteado por mi parte: «empezar de cero» tiene que
      // significar sin mensajes viejos, no sin saber como se llama nadie. Se
      // piden aparte, que es donde viven.
      // isInitialSync en true: pide el estado ENTERO, no solo lo que haya
      // cambiado. Con false no llegaba nada, porque para WhatsApp ya estaba
      // sincronizado — aunque nosotros hubieramos perdido la agenda.
      sock.resyncAppState(['critical_unblock_low', 'regular_high', 'regular_low'], true)
        .then(() => log(`[${s.nombre}] pedida la lista de contactos`))
        .catch((e) => log(`[${s.nombre}] no se pudo pedir la agenda: ${e.message}`));

      // Los nombres de TODOS los grupos, de una vez.
      //
      // Preguntarlos de uno en uno cuando llega un mensaje sale mal: si falla
      // —o si el mensaje llega antes de que la conexion este del todo lista— el
      // grupo se queda con el nombre de quien escribio, que es lo que veia
      // todo el mundo. Esta llamada los trae todos y ya.
      sock.groupFetchAllParticipating()
        .then((grupos) => {
          let n = 0;
          for (const g of Object.values(grupos || {})) {
            if (g?.id && g?.subject) { s.agenda.set(g.id, g.subject); n++; }
          }
          if (n) { s.guardarAgenda(); log(`[${s.nombre}] nombres de ${n} grupos`); }
        })
        .catch((e) => log(`[${s.nombre}] no se pudieron traer los grupos: ${e.message}`));
    }
    if (connection === 'close') {
      s.estado = 'close';
      const motivo = lastDisconnect?.error?.output?.statusCode;
      if (motivo === DisconnectReason.loggedOut) {
        // Cerraron sesion desde el movil. Las credenciales ya no valen: si se
        // reconecta con ellas, WhatsApp vuelve a cerrar y la sesion se queda
        // muerta sin dar QR — y la pantalla del CRM se queda en «pidiendo
        // codigo» para siempre. Se borran y se empieza de cero.
        log(`[${s.nombre}] sesion cerrada desde el movil. Preparando un codigo nuevo…`);
        try { fs.rmSync(s.carpeta, { recursive: true, force: true }); } catch {}
        s.ultimoQR = null;
        s.esperaReconexion = 3000;
        setTimeout(() => { if (s.epoca === miEpoca) s.conectar(); }, 1500);
        return;
      }
      // El codigo que hubiera pendiente muere con el socket: si se deja, el
      // CRM lo sigue enseñando y no sirve para nada.
      s.ultimoQR = null;
      // Espera creciente hasta un minuto. Aunque algo vuelva a torcerse, no se
      // machaca a WhatsApp con un intento cada tres segundos — que es
      // exactamente el patron por el que suspenden un numero.
      const espera = s.esperaReconexion;
      s.esperaReconexion = Math.min(60000, Math.round(espera * 1.8));
      log(`[${s.nombre}] desconectado (${motivo}). reintentando en ${Math.round(espera / 1000)}s…`);
      setTimeout(() => { if (s.epoca === miEpoca) s.conectar(); }, espera);
    }
  });

  // Lo que llega. Se reenvia al CRM con la MISMA forma que usa Evolution, que
  // es lo que el webhook del CRM ya sabe leer.
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (!vigente()) return;
    s.ultimaSenal = Date.now();

    // «notify» es lo que te escriben. «append» es lo que mandas TU desde otro
    // dispositivo — el movil, sin ir mas lejos.
    //
    // Solo se aceptaba «notify», y ademas se descartaba en silencio: una foto
    // enviada desde el movil no aparecia en el CRM y en el registro no quedaba
    // ni rastro de que hubiera pasado nada. Los duplicados no son problema, que
    // para eso esta la barrera de wa_id en la base.
    if (type !== 'notify' && type !== 'append') {
      log(`[${s.nombre}] ← tanda descartada: tipo «${type}» (${messages?.length || 0} mensajes)`);
      return;
    }
    for (const m of messages) {
      if (!m.message) continue;
      // Personas y grupos. Fuera canales, difusiones y estados: son emisiones
      // de una via a las que no se puede contestar.
      const bruto = m.key.remoteJid;
      if (!esConversacion(bruto)) {
        log(`[${s.nombre}] ← descartado (${bruto?.split('@')[1] || bruto}): no es persona ni grupo`);
        continue;
      }
      // Se traduce ANTES de guardar y de avisar: si no, la misma persona acaba
      // partida en dos conversaciones que nadie puede juntar despues.
      const jid = await aTelefono(s, bruto, m.key);
      // Al traducir el @lid se GUARDA el original, no se pisa.
      //
      // Aqui se reescribia `remoteJid` con el telefono y `remoteJidAlt` se
      // quedaba con... el telefono tambien, porque de ahi salia la traduccion.
      // O sea que el par «este @lid es esta persona» se perdia justo en el paso
      // que lo habia averiguado, y el CRM no podia aprenderlo.
      //
      // Importa para las etiquetas (#138): WhatsApp las direcciona por @lid, y
      // sin el par no hay forma de saber en que chat va. Evolution manda las dos
      // llaves —`remoteJid` el @lid y `remoteJidAlt` el telefono—; aqui van al
      // reves porque este puente si traduce, pero las dos viajan igual.
      if (jid !== bruto) m.key = { ...m.key, remoteJid: jid, remoteJidAlt: bruto };
      // Se desenvuelve ANTES de guardar: si llega dentro de un sobre —efimero,
      // ver una vez, documento con pie— lo de fuera no tiene ni tipo ni datos,
      // y el mensaje acababa guardado como «otro» y sin adjunto.
      const contenido = desenvolver(m.message);
      const conDestino = { ...m, message: contenido };
      s.recordar(conDestino);
      const tipo = tipoDe(contenido);
      const enviado = await s.avisarCRM({
        event: 'messages.upsert',
        data: {
          key: m.key,
          // El nombre, y aqui habia DOS cosas mal.
          //
          // 1. En un grupo, `pushName` es el nombre de QUIEN ESCRIBE, no el del
          //    grupo. Asi que el grupo se iba renombrando solo con el ultimo
          //    que hablara: salia «Alejandro» donde tenia que salir el nombre
          //    del grupo.
          //
          // 2. Con una persona, `pushName` es como se llama ELLA a si misma.
          //    Pero tu la tienes guardada con el nombre que tu le pusiste, y ese
          //    es el que esperas ver. La agenda va primero.
          // El nombre, y aqui habia TRES cosas mal, no dos.
          //
          // 1. En un grupo, `pushName` es el nombre de QUIEN ESCRIBE. El grupo
          //    se renombraba solo con el ultimo que hablara.
          //
          // 2. Con una persona, `pushName` es como se llama ELLA a si misma,
          //    pero tu la tienes guardada con el nombre que TU le pusiste.
          //
          // 3. Y lo peor: en un mensaje que mandas TU, `pushName` es TU nombre.
          //    Asi que a un contacto que no estuviera en la agenda se le ponia
          //    el nombre de uno mismo en cuanto le escribias.
          pushName: jid.endsWith('@g.us')
            ? (s.nombreDeJid(jid) || await s.nombreDeGrupo(jid))
            : (() => {
                // El pushName del mensaje pasa por el MISMO filtro que la
                // agenda. Se comprobaba solo al guardar contactos, y por aqui
                // se volvia a colar el numero enmascarado —«+58∙∙∙∙∙∙∙∙69»—
                // pisando el nombre bueno en cuanto llegaba un mensaje.
                const suyo = m.key.fromMe || esUnNumero(m.pushName) ? null : m.pushName;
                const n = s.nombreDeJid(jid) || suyo || null;
                return esMiPropioNombre(s, jid, n) ? null : n;
              })(),
          avatar: await s.fotoDe(jid),
          message: contenido,
          respondeA: aQueResponde(contenido),
          // QUIEN escribio, y solo tiene sentido en un grupo.
          //
          // No se mandaba, asi que en el CRM todos los mensajes de un grupo
          // salian igual y era imposible saber quien habia dicho que. En un
          // chat de una persona sobra: el jid de la conversacion YA es ella.
          //
          // `pushName` no vale aqui: unas lineas mas arriba se sobrescribe con
          // el nombre del GRUPO, precisamente para que el grupo no se renombre
          // solo con el ultimo que hable. Asi que el nombre del que escribe hay
          // que sacarlo de la agenda por su jid.
          ...(jid.endsWith('@g.us') && m.key.participant ? {
            participante: m.key.participant,
            participanteNombre:
              s.nombreDeJid(m.key.participant)
              || (m.key.fromMe ? null : (esUnNumero(m.pushName) ? null : m.pushName))
              || null,
          } : {}),
          messageTimestamp: String(m.messageTimestamp),
        },
      });
      log(`[${s.nombre}] ${m.key.fromMe ? '→' : '←'} ${tipo} ${m.key.fromMe ? 'a' : 'de'} ${jid.endsWith('@g.us') ? 'grupo' : 'persona'} ${jid.split('@')[0]} [${type}]${enviado ? '' : ' · EL CRM NO LO ACEPTO'}`);
    }
  });

  // El historial. Baileys lo entrega aparte de los mensajes nuevos, en tandas y
  // por el evento `messaging-history.set`, no por `messages.upsert`.
    // `progress` lo manda Baileys en cada tanda —de 0 a 100— y aqui se estaba
  // tirando a la basura. Es el UNICO numero real que hay: WhatsApp no dice
  // cuantos mensajes va a mandar en total, asi que sin esto cualquier
  // porcentaje seria inventado.
  sock.ev.on('messaging-history.set', async ({ messages, contacts, chats, isLatest, progress }) => {
    if (!vigente()) return;
    // Empezar de cero: se queda la agenda —hace falta para poner nombres a
    // quien escriba— pero no se guarda ni un mensaje viejo.
    if (s.modo === 'cero') {
      s.apuntarContactos(contacts);
      for (const ch of chats || []) if (ch?.id && ch?.name) s.agenda.set(ch.id, ch.name);
      return;
    }
    // La agenda va PRIMERO: si no, los mensajes se mandan sin nombre.
    const nuevos = s.apuntarContactos(contacts);
    // Los chats traen el nombre con el que se ve la conversacion, y para los
    // grupos es la unica forma facil de saber como se llaman.
    for (const ch of chats || []) {
      if (ch?.id && ch?.name) s.agenda.set(ch.id, ch.name);
    }
    s.guardarAgenda();
    if (nuevos) log(`[${s.nombre}] agenda: +${nuevos} contactos del historial`);
    // El progreso se avisa SIEMPRE, aunque la tanda no traiga mensajes: hay
    // tandas de solo contactos, y sin esto la barra se quedaria parada.
    if (typeof progress === 'number') {
      s.avisarCRM({
        event: 'HISTORY_PROGRESS',
        instance: s.nombre,
        data: {
          progress: Math.max(0, Math.min(100, Math.round(progress))),
          isLatest: Boolean(isLatest),
        },
      }).catch(() => {});
    }
    if (!messages?.length) return;
    log(`[${s.nombre}] historial: ${messages.length} mensajes${isLatest ? ' (ultima tanda)' : ''}`);
    let metidos = 0;
    let desdeLaPausa = 0;
    // En «rapido», fuera lo que pase del mes. El recorte va aqui y no en el
    // CRM: asi lo viejo no llega a salir del movil ni a viajar por la red.
    const desde = s.modo === 'rapido' ? Date.now() - RECIENTE_MS : 0;
    let viejos = 0;

    // El historial va como `messages.set`, NO como `messages.upsert`.
    //
    // Asi es como lo manda Evolution —reenvia `messaging-history.set` con ese
    // nombre y un ARRAY de mensajes— y aqui iba mensaje a mensaje como si
    // fueran nuevos. Esa diferencia es justo la que escondio el fallo del #73
    // durante semanas: en local el historial entraba y en produccion no, porque
    // el CRM ni pedia ni atendia `messages.set`. Ya lo atiende; el puente tiene
    // que mandarselo igual o volvemos a probar una cosa y desplegar otra.
    //
    // Se manda por tandas de 25, que es el respiro que ya habia: en una sola
    // peticion con miles de mensajes, el CRM tardaria en contestar y este
    // puente se quedaria esperando, que es como se tumbo la conexion la otra
    // vez.
    const TANDA = 25;
    let tanda = [];
    const soltarTanda = async () => {
      if (!tanda.length) return;
      await s.avisarCRM({
        event: 'messages.set',
        // Que es historial y no algo que acaba de pasar. El CRM lo usa para
        // decidir que adjuntos baja ya y cuales pueden esperar.
        historial: true,
        data: tanda,
      });
      metidos += tanda.length;
      tanda = [];
      await new Promise((r) => setTimeout(r, 300));
    };

    for (const m of messages) {
      if (!m.message) continue;
      const bruto = m.key?.remoteJid;
      if (!esConversacion(bruto)) continue;
      const jid = await aTelefono(s, bruto, m.key);
      // Al traducir el @lid se GUARDA el original, no se pisa.
      //
      // Aqui se reescribia `remoteJid` con el telefono y `remoteJidAlt` se
      // quedaba con... el telefono tambien, porque de ahi salia la traduccion.
      // O sea que el par «este @lid es esta persona» se perdia justo en el paso
      // que lo habia averiguado, y el CRM no podia aprenderlo.
      //
      // Importa para las etiquetas (#138): WhatsApp las direcciona por @lid, y
      // sin el par no hay forma de saber en que chat va. Evolution manda las dos
      // llaves —`remoteJid` el @lid y `remoteJidAlt` el telefono—; aqui van al
      // reves porque este puente si traduce, pero las dos viajan igual.
      if (jid !== bruto) m.key = { ...m.key, remoteJid: jid, remoteJidAlt: bruto };
      if (desde && Number(m.messageTimestamp || 0) * 1000 < desde) { viejos++; continue; }
      // Guardar ANTES de avisar: el CRM pide el adjunto nada mas recibir el
      // aviso, y para descifrarlo hace falta el mensaje original.
      const contenido = desenvolver(m.message);
      s.recordar({ ...m, message: contenido });
      tanda.push({
        key: m.key,
        // En el historial el mensaje no trae nombre: se saca de la agenda.
        pushName: jid.endsWith('@g.us')
          ? (s.nombreDeJid(jid) || await s.nombreDeGrupo(jid))
          : (s.nombreDeJid(jid)
             || (m.key?.fromMe || esUnNumero(m.pushName) ? null : m.pushName)
             || null),
        // La foto solo la primera vez de cada uno: pedirla en cada mensaje
        // son cientos de llamadas de mas a WhatsApp.
        avatar: s.fotos.has(jid) ? s.fotos.get(jid) : await s.fotoDe(jid),
        message: contenido,
        respondeA: aQueResponde(contenido),
        messageTimestamp: String(m.messageTimestamp),
      });
      if (++desdeLaPausa >= TANDA) {
        desdeLaPausa = 0;
        await soltarTanda();
      }
    }
    await soltarTanda();
    log(`[${s.nombre}]   ${metidos} guardados${viejos ? `, ${viejos} descartados por viejos` : ''}, ${s.fallidos} fallidos`);
  });

  // «Escribiendo…» y «grabando audio…» del otro lado.
  // ── Las etiquetas (#128, #138) ──────────────────────────────────────────
  //
  // Existen en Evolution, asi que existen aqui — y con la MISMA forma, que es
  // donde este puente ya ha enganado dos veces (#63, #99).
  //
  // Baileys manda la asociacion como `{ association: {...}, type }` y Evolution
  // la aplana a `{ chatId, labelId, type }` antes de mandarla al webhook. Se
  // aplana igual: si aqui llegara la forma cruda, el CRM se escribiria para
  // entender dos formas y en produccion solo se probaria una.
  sock.ev.on('labels.edit', (l) => {
    if (!vigente() || !l?.id) return;
    log(`[${s.nombre}] etiqueta ${l.deleted ? 'borrada' : 'creada/renombrada'}: ${l.id} «${l.name}»`);
    if (l.deleted) s.etiquetas.delete(String(l.id));
    else {
      s.etiquetas.set(String(l.id), {
        id: String(l.id),
        // El nombre va ENTERO. Evolution lo pela al GUARDARLO —le quita lo que
        // no sea ASCII— pero manda el aviso antes de pelarlo, y el CRM se queda
        // con el del aviso. Pelarlo aqui seria mentir sobre lo que llega.
        name: String(l.name ?? ''),
        color: l.color ?? null,
        predefinedId: l.predefinedId ?? null,
      });
    }
    s.avisarCRM({
      event: 'labels.edit',
      data: { id: String(l.id), name: l.name ?? '', color: l.color ?? null, deleted: Boolean(l.deleted) },
    }).catch(() => {});
  });

  sock.ev.on('labels.association', async ({ association, type }) => {
    if (!vigente()) return;
    if (!association?.chatId || association?.labelId == null) return;

    // El chat de la etiqueta se traduce IGUAL que el de un mensaje.
    //
    // Este puente ha decidido que direcciona por telefono: traduce el `@lid` de
    // todos los mensajes (`aTelefono`). No hacerlo tambien aqui no era respetar
    // la paridad con Evolution — era ser incoherente consigo mismo: mandaba las
    // conversaciones con una llave y las etiquetas de esas mismas
    // conversaciones con otra, y el CRM no podia juntarlas.
    //
    // Evolution no traduce ninguna de las dos, asi que alli las dos llegan con
    // `@lid` y tambien casan. Cada uno coherente por su lado, que es lo que
    // hace que lo que se prueba aqui valga para alli.
    const chat = await aTelefono(s, association.chatId, null);
    log(`[${s.nombre}] etiqueta ${type}: ${association.labelId} en ${chat}`
      + (chat !== association.chatId ? ` (era ${association.chatId})` : ''));
    s.avisarCRM({
      event: 'labels.association',
      data: { type, chatId: chat, labelId: String(association.labelId) },
    }).catch(() => {});
  });

  // Lo que se sabe de `chats.update`, por si vuelve a hacer falta:
  //
  // En una cuenta NORMAL, marcar un chat como favorito llega por aqui —con la
  // clave `archived`, `muteEndTime` y companeras— y NO como `labels.association`.
  // Por eso los favoritos del movil no entran en el CRM: no son etiquetas.
  // Comprobado el 14/09/2026 con un numero real. No se escucha porque hoy el
  // CRM no hace nada con ello; para volver a diagnosticar, basta con volver a
  // suscribirse y sacar las claves de cada cambio por el registro.

  sock.ev.on('presence.update', ({ id, presences }) => {
    if (!vigente()) return;
    for (const [dequien, p] of Object.entries(presences || {})) {
      const est = p?.lastKnownPresence;
      if (est === 'composing' || est === 'recording') {
        s.presencias.set(id, {
          quien: s.nombreDeJid(dequien) || dequien.split('@')[0],
          que: est === 'recording' ? 'grabando' : 'escribiendo',
          // WhatsApp reenvia el aviso mientras se sigue escribiendo, asi que un
          // margen corto basta y evita quedarse colgado.
          hasta: Date.now() + 12000,
        });
      } else {
        s.presencias.delete(id);
      }
    }
  });

  // Acuses de entrega y lectura, para el doble tic.
  sock.ev.on('messages.update', async (ups) => {
    if (!vigente()) return;
    for (const u of ups) {
      const st = u.update?.status;
      if (!st) continue;
      const nombre = { 2: 'SERVER_ACK', 3: 'DELIVERY_ACK', 4: 'READ', 5: 'PLAYED' }[st];
      if (!nombre) continue;
      await s.avisarCRM({ event: 'messages.update', data: { key: u.key, status: nombre } });
    }
  });
}

// ── La cara que ve el CRM: los endpoints de Evolution ────────────────────────

const leerCuerpo = (req) => new Promise((res) => {
  let b = ''; req.on('data', (c) => { b += c; }); req.on('end', () => { try { res(JSON.parse(b || '{}')); } catch { res({}); } });
});

/** El nombre de la instancia sale del ultimo trozo de la ruta. */
const instanciaDeUrl = (url) => sanear(url.split('/').filter(Boolean).pop());

http.createServer(async (req, res) => {
  const json = (codigo, datos) => {
    res.writeHead(codigo, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(datos));
  };
  try {
    const [url, consulta] = req.url.split('?');

    // Emparejar desde la pantalla del CRM. Evolution devuelve el QR dentro de
    // `qrcode.base64` al crear la instancia, y suelto en `base64` al pedir la
    // conexion de una que ya existe. Se imitan las dos formas.
    if (url === '/instance/create' || url.includes('/instance/connect/')) {
      const cuerpo = url === '/instance/create' ? await leerCuerpo(req) : {};
      const s = sesionDe(url === '/instance/create' ? cuerpo.instanceName : instanciaDeUrl(url));
      // El modo se fija ANTES de abrir el socket: syncFullHistory es una opcion
      // de construccion, no se puede cambiar con la conexion ya hecha.
      if (cuerpo.modo) s.guardarModo(cuerpo.modo);

      // Si no hay un codigo FRESCO, se rehace la conexion para que WhatsApp
      // mande otro. Antes solo se hacia con estado 'close', y el caso malo era
      // justo el otro: el socket se quedaba en 'esperando-qr' con un codigo
      // viejo, no se reconectaba nunca, y la pantalla enseñaba un QR muerto.
      // `s.conectando` es la parte importante: la pantalla pregunta cada pocos
      // segundos, y sin esto cada pregunta abria otro socket encima del que ya
      // estaba negociando.
      if (s.estado !== 'open' && !s.qrFresco() && !s.conectando) {
        log(`[${s.nombre}] piden codigo y no hay uno fresco (estado ${s.estado}): se rehace la conexion`);
        s.ultimoQR = null;
        s.conectar().catch((e) => log(`[${s.nombre}] no se pudo reconectar:`, e.message));
      }
      // Esperar un poco al QR: si se acaba de arrancar puede no haber llegado.
      for (let i = 0; i < 40 && !s.qrFresco() && s.estado !== 'open'; i++) {
        await new Promise((r) => setTimeout(r, 400));
      }
      if (s.estado === 'open') {
        return json(200, { instance: { instanceName: s.nombre, status: 'open' } });
      }
      if (!s.qrFresco()) return json(503, { error: 'todavia no hay codigo QR' });
      const b64 = await QRCode.toDataURL(s.ultimoQR);
      return json(url === '/instance/create' ? 201 : 200, {
        instance: { instanceName: s.nombre, status: 'created' },
        qrcode: { base64: b64 },
        base64: b64,
      });
    }

    // Cerrar sesion desde el CRM, sin tener que ir al movil.
    //
    // logout() no es apagar el proceso: le dice a WhatsApp que este dispositivo
    // se va, y desaparece de «Dispositivos vinculados». Despues se borran las
    // credenciales y se pide un codigo nuevo, para que se pueda volver a
    // enlazar sin tocar nada.
    if (url.includes('/instance/logout')) {
      const s = sesionDe(instanciaDeUrl(url));
      try {
        if (s.estado === 'open') await s.sock.logout();
      } catch (e) {
        log(`[${s.nombre}] logout devolvio error:`, e.message);
      }
      try { fs.rmSync(s.carpeta, { recursive: true, force: true }); } catch {}
      // Todo lo que se sabia de esa persona se va con la sesion.
      s.agenda.clear(); s.fotos.clear(); s.mensajes.clear();
      // La carpeta ya se ha borrado entera, con la agenda dentro.
      s.miNumero = null; s.miNombre = null; s.ultimoQR = null; s.estado = 'close';
      log(`[${s.nombre}] sesion cerrada desde el CRM`);
      setTimeout(() => s.conectar(), 1500);
      return json(200, { cerrada: true });
    }

    if (url.includes('/instance/connectionState/')) {
      const s = sesionDe(instanciaDeUrl(url));
      return json(200, {
        instance: {
          state: s.estado,
          // Cuando el movil se queda sin internet la sesion sigue diciendo
          // «open» pero no llega ni sale nada. Se informa de cuando fue la
          // ultima señal para que la pantalla pueda avisar.
          ultimaSenal: s.ultimaSenal ? new Date(s.ultimaSenal).toISOString() : null,
          segundosSinSenal: s.ultimaSenal ? Math.round((Date.now() - s.ultimaSenal) / 1000) : null,
        },
      });
    }

    if (url.includes('/instance/fetchInstances')) {
      return json(200, [...sesiones.values()].map((s) => ({
        name: s.nombre,
        connectionStatus: s.estado,
        ownerJid: s.miNumero ? `${s.miNumero}@s.whatsapp.net` : null,
        profileName: s.miNombre,
      })));
    }

    // ── Enviar ───────────────────────────────────────────────────────────────
    // Todas piden sesion abierta: mandar contra un socket cerrado devolvia un
    // error feo y el CRM lo apuntaba como fallido sin decir por que.

    // Corregir un mensaje ya enviado (#75).
    //
    // No existia, asi que el CRM recibia un 404, apagaba la funcion para toda
    // la vida del proceso y contestaba «Este WhatsApp no permite corregir
    // mensajes». El apagado hizo lo que tenia que hacer; lo que faltaba era
    // esto. Otra vez el puente por detras de Evolution, como en la #63.
    //
    // En Baileys editar es mandar el mismo texto con `edit: key`. Las tres
    // condiciones —propio, texto y 15 minutos— las comprueba el CRM antes de
    // llegar aqui, asi que no se repiten.
    if (url.startsWith('/chat/updateMessage/')) {
      const s = sesionDe(instanciaDeUrl(url));
      const { number, text, key } = await leerCuerpo(req);
      if (s.estado !== 'open') return json(503, { error: 'sin sesion de WhatsApp' });
      if (!key?.id) return json(400, { error: 'falta la clave del mensaje' });
      const jid = jidDe(number);
      const r = await s.sock.sendMessage(jid, {
        text,
        edit: { id: key.id, remoteJid: jid, fromMe: key.fromMe !== false, ...(key.participant ? { participant: key.participant } : {}) },
      });
      log(`[${s.nombre}] ✎ corregido ${key.id} en ${jid.split('@')[0]}`);
      return json(200, { key: r?.key || null, status: 'PENDING' });
    }

    if (url.startsWith('/message/sendText/')) {
      const s = sesionDe(instanciaDeUrl(url));
      const { number, text, quoted } = await leerCuerpo(req);
      if (s.estado !== 'open') return json(503, { error: 'sin sesion de WhatsApp' });
      // La cita llega como el OBJETO que espera Evolution:
      //   { key: { id, remoteJid, fromMe }, message: { conversation } }
      //
      // Antes aqui se esperaba solo el identificador en texto, y al pasar el CRM
      // a mandar el objeto —que es lo que pide Evolution de verdad, tarea #62—
      // esto hacia `Map.get(objeto)`, no encontraba nada y mandaba el mensaje
      // SIN cita, diciendolo en el registro como si el mensaje fuera viejo. En
      // el CRM la cita se veia igual, porque la guarda por su cuenta; en
      // WhatsApp no aparecia. Otra vez el puente sin hacer lo que hace el
      // original.
      //
      // Se prefiere el mensaje entero del cache: WhatsApp mete dentro del que
      // se envia una copia del citado, y con el original queda completo. Si ya
      // no esta —es viejo— sirve el objeto tal cual, que Baileys sabe usarlo.
      const idCitado = typeof quoted === 'string' ? quoted : quoted?.key?.id;
      const citado = idCitado ? (s.mensajes.get(idCitado) || (typeof quoted === 'object' ? quoted : null)) : null;
      if (idCitado) {
        log(`[${s.nombre}] citar ${idCitado}: ${s.mensajes.get(idCitado) ? 'con el original' : 'con lo que mando el CRM'}`);
      }
      const r = await s.sock.sendMessage(jidDe(number), { text }, citado ? { quoted: citado } : {});
      if (citado) {
        // Que la cita viaje DE VERDAD, no solo que se haya intentado. Sin este
        // dato di por bueno el arreglo mirando solo nuestra base, y la cita se
        // veia en el CRM pero no en WhatsApp.
        const ci = r?.message?.extendedTextMessage?.contextInfo;
        log(`[${s.nombre}] cita en el mensaje: stanzaId=${ci?.stanzaId || 'NO'} participante=${ci?.participant || 'NO'} citado=${ci?.quotedMessage ? 'si' : 'NO'}`);
      }

      // Se guarda TAMBIEN lo que sale, no solo lo que entra.
      //
      // Evolution lo hace (`DATABASE_SAVE_DATA_NEW_MESSAGE`), y sin esto el
      // puente era mas pobre que el original: al pedirle de vuelta una nota de
      // voz recien enviada contestaba «mensaje no encontrado». El CRM la
      // necesita para quedarse con el ogg convertido en vez del webm que subio
      // el navegador — que en un movil no se puede reproducir.
      if (r?.key?.id) {
        s.mensajes.set(r.key.id, r);
        if (s.mensajes.size > 20000) s.mensajes.delete(s.mensajes.keys().next().value);
      }
      log(`[${s.nombre}] → ${number}: ${String(text).slice(0, 40)}`);
      return json(201, { key: r.key, messageTimestamp: String(Math.floor(Date.now() / 1000)) });
    }

    if (url.startsWith('/message/sendWhatsAppAudio/')) {
      const s = sesionDe(instanciaDeUrl(url));
      const { number, audio, seconds } = await leerCuerpo(req);
      if (s.estado !== 'open') return json(503, { error: 'sin sesion de WhatsApp' });
      // ptt:true es lo que la convierte en NOTA DE VOZ y no en un adjunto.
      const bruto = Buffer.from(audio, 'base64');
      // Y HAY QUE CONVERTIRLO.
      //
      // Chrome graba webm. Aqui se mandaba tal cual pero etiquetado como
      // «audio/ogg», y WhatsApp se cree la etiqueta: intenta decodificar ogg,
      // se encuentra webm, y en el movil de quien lo recibe sale «Este audio no
      // esta disponible porque algo fallo con el archivo de audio». O sea que la
      // nota de voz no funcionaba en absoluto.
      //
      // Evolution ya hace esto por dentro con ffmpeg (processAudioMp4), asi que
      // en produccion no pasa. Este puente es el que se lo saltaba.
      const listo = await aOggOpus(bruto);
      // Guarda las dos versiones para poder mirarlas cuando algo falla.
      try {
        const fs = await import('node:fs');
        fs.writeFileSync('../ultima-entrada.webm', bruto);
        fs.writeFileSync('../ultima-salida.ogg', listo);
      } catch {}
      log(`[${s.nombre}] → nota de voz a ${number}: ${bruto.length} → ${listo.length} bytes${seconds ? `, ${seconds}s` : ''}`);
      log(`[${s.nombre}]   params: seconds=${JSON.stringify(seconds)} (${typeof seconds}) bytes=${listo.length} jid=${jidDe(number)}`);
      // La duracion que se declara es la MEDIDA del fichero, no la que venga en
      // la peticion: una que no cuadre deja la nota muda en el movil.
      const segReal = await duracionDe(listo);
      const onda = await ondaDe(listo);
      const segFinal = segReal || (seconds ? Number(seconds) : null);
      log(`[${s.nombre}]   duracion=${segFinal} onda=${onda ? onda.length + ' valores' : 'NO'}`);
      const r = await s.sock.sendMessage(jidDe(number), {
        audio: listo,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true,
        // La duracion medida al grabar. Sin ella WhatsApp la saca del fichero, y
        // lo que graba Chrome es webm — un flujo en vivo, sin duracion en la
        // cabecera—: enseñaba una mas larga que la real.
        ...(segFinal ? { seconds: segFinal } : {}),
        // Sin esto el movil no la reproduce. Ver `ondaDe`.
        ...(onda ? { waveform: onda } : {}),
      });

      // Se guarda TAMBIEN lo que sale, no solo lo que entra.
      //
      // Evolution lo hace (`DATABASE_SAVE_DATA_NEW_MESSAGE`), y sin esto el
      // puente era mas pobre que el original: al pedirle de vuelta una nota de
      // voz recien enviada contestaba «mensaje no encontrado». El CRM la
      // necesita para quedarse con el ogg convertido en vez del webm que subio
      // el navegador — que en un movil no se puede reproducir.
      if (r?.key?.id) {
        s.mensajes.set(r.key.id, r);
        if (s.mensajes.size > 20000) s.mensajes.delete(s.mensajes.keys().next().value);
      }
      log(`[${s.nombre}]   nota de voz enviada, id ${r.key?.id}`);
      // Volcado completo del audioMessage, para poder comparar una que suena
      // con una que no. Todo lo demas ya se ha descartado midiendo.
      try {
        const am = r.message?.audioMessage || {};
        const resumen = Object.fromEntries(Object.entries(am).map(([k, v]) => [
          k,
          Buffer.isBuffer(v) || v?.type === 'Buffer' ? `<${(v.length ?? v.data?.length)} bytes>`
            : typeof v === 'object' && v !== null ? JSON.stringify(v).slice(0, 60)
            : v,
        ]));
        log(`[${s.nombre}]   AUDIOMESSAGE ${JSON.stringify(resumen)}`);
      } catch (e) { log(`[${s.nombre}]   no se pudo volcar: ${e.message}`); }
      try {
        const a = r.message?.audioMessage;
        log(`[${s.nombre}]   lo que quedo: mime=${a?.mimetype} ptt=${a?.ptt} seconds=${a?.seconds} len=${a?.fileLength} url=${a?.url ? 'si' : 'NO'}`);
      } catch {}
      return json(201, { key: r.key });
    }

    if (url.startsWith('/message/sendMedia/')) {
      const s = sesionDe(instanciaDeUrl(url));
      const { number, mediatype, media, fileName, mimetype, caption } = await leerCuerpo(req);
      if (s.estado !== 'open') return json(503, { error: 'sin sesion de WhatsApp' });
      const buf = Buffer.from(media, 'base64');
      // El `caption` va TAMBIEN en los documentos.
      //
      // Aqui solo se pasaba a imagen y video, asi que mandar un dossier con un
      // mensaje —«te paso el temario»— llegaba al movil como un PDF pelado: el
      // texto se guardaba en el CRM y no salia por WhatsApp. Peor que perderlo,
      // porque en la pantalla parecia enviado.
      //
      // Baileys lo soporta en documentos; era este puente el que no lo mandaba.
      const contenido = mediatype === 'image' ? { image: buf, caption }
        : mediatype === 'video' ? { video: buf, caption }
        : { document: buf, fileName, mimetype, ...(caption ? { caption } : {}) };
      const r = await s.sock.sendMessage(jidDe(number), contenido);

      // Se guarda TAMBIEN lo que sale, no solo lo que entra.
      //
      // Evolution lo hace (`DATABASE_SAVE_DATA_NEW_MESSAGE`), y sin esto el
      // puente era mas pobre que el original: al pedirle de vuelta una nota de
      // voz recien enviada contestaba «mensaje no encontrado». El CRM la
      // necesita para quedarse con el ogg convertido en vez del webm que subio
      // el navegador — que en un movil no se puede reproducir.
      if (r?.key?.id) {
        s.mensajes.set(r.key.id, r);
        if (s.mensajes.size > 20000) s.mensajes.delete(s.mensajes.keys().next().value);
      }
      log(`[${s.nombre}] → ${number}: (${mediatype} ${fileName || ''})`);
      return json(201, { key: r.key });
    }

    if (url.startsWith('/chat/getBase64FromMediaMessage/')) {
      const s = sesionDe(instanciaDeUrl(url));
      const { message } = await leerCuerpo(req);
      // Se busca SOLO en el cache de esta sesion: el adjunto de otra persona no
      // se sirve ni por accidente, aunque se acierte el identificador.
      const guardado = s.mensajes.get(message?.key?.id);
      if (!guardado) return json(404, { error: 'mensaje no encontrado' });
      let buf;
      try {
        buf = await downloadMediaMessage(guardado, 'buffer', {});
      } catch {
        // Los enlaces de WhatsApp caducan. En un historial de meses, parte de
        // las fotos viejas ya no se pueden bajar y no hay nada que hacer: se
        // dice y se sigue, en vez de tumbar la sincronizacion entera.
        return json(410, { error: 'el archivo ya no esta disponible en WhatsApp' });
      }
      const m = guardado.message;
      const info = m.audioMessage || m.imageMessage || m.videoMessage
        || m.documentMessage || m.stickerMessage || {};
      return json(200, {
        mediaType: m.audioMessage ? 'audio' : m.imageMessage ? 'image'
          : m.videoMessage ? 'video' : m.stickerMessage ? 'sticker' : 'document',
        fileName: info.fileName || `archivo.${(info.mimetype || '').split('/')[1]?.split(';')[0] || 'bin'}`,
        mimetype: info.mimetype,
        size: { fileLength: Number(info.fileLength || 0) },
        base64: buf.toString('base64'),
      });
    }

    // «Escribiendo…» / «grabando audio…», para que no parezca un robot.
    // Estaba sin implementar: el CRM lo pedia y aqui se contestaba 200 sin
    // hacer nada, asi que el mensaje salia de golpe y sin aviso previo.
    if (url.startsWith('/chat/sendPresence/')) {
      const s = sesionDe(instanciaDeUrl(url));
      const { number, presence, delay } = await leerCuerpo(req);
      if (s.estado !== 'open') return json(200, {});
      const jid = jidDe(number);
      try {
        await s.sock.sendPresenceUpdate(presence === 'recording' ? 'recording' : 'composing', jid);
        // El aviso tiene que durar algo: si se apaga al instante no lo ve nadie.
        setTimeout(() => { s.sock?.sendPresenceUpdate('paused', jid).catch(() => {}); },
          Math.min(4000, Number(delay) || 1200));
      } catch { /* no es critico */ }
      return json(200, {});
    }

    // Marcar como leido, para que al otro lado le salga el doble tic azul.
    if (url.startsWith('/chat/markMessageAsRead/')) {
      const s = sesionDe(instanciaDeUrl(url));
      const { readMessages } = await leerCuerpo(req);
      if (s.estado !== 'open' || !readMessages?.length) return json(200, {});
      try { await s.sock.readMessages(readMessages); } catch { /* no es critico */ }
      return json(200, {});
    }

    // ¿Existe este numero en WhatsApp, y cual es su direccion buena?
    //
    // Tecleando un telefono a mano es facil colar el cero de tronco nacional
    // —«0412...» en Venezuela, «06...» en Italia— y con el delante WhatsApp no
    // conoce a nadie: se abria una conversacion muerta contra 5804129543569 en
    // vez de 34600111222. Nadie deberia tener que saber estas reglas de
    // memoria, y menos ir anadiendolas pais por pais: se pregunta y ya.
    if (url.startsWith('/chat/whatsappNumbers/')) {
      const s = sesionDe(instanciaDeUrl(url));
      const { numbers } = await leerCuerpo(req);
      if (s.estado !== 'open') return json(503, { error: 'sin sesion de WhatsApp' });
      const salida = [];
      for (const n of numbers || []) {
        const limpio = String(n).replace(/[^0-9]/g, '');
        try {
          const [r] = await s.sock.onWhatsApp(limpio) || [];
          salida.push({ number: limpio, exists: Boolean(r?.exists), jid: r?.jid || null });
          log(`[${s.nombre}] ? ${limpio}: ${r?.exists ? 'existe -> ' + r.jid : 'no existe en WhatsApp'}`);
        } catch (e) {
          log(`[${s.nombre}] ? ${limpio}: no se pudo comprobar (${e.message})`);
          salida.push({ number: limpio, exists: null, jid: null });
        }
      }
      return json(200, salida);
    }

    // La agenda: como tienes apuntada a cada persona.
    //
    // Antes esto era `/agenda`, inventado aqui. Ese es justo el fallo que
    // levanto Diego: si el puente es mas generoso que el original, lo que
    // pruebas no es lo que corre. En Evolution el endpoint es este, es POST, y
    // devuelve la lista pelada —sin envolverla en nada—, asi que se imita.
    //
    // `pushName` aqui NO es como se llama la persona a si misma: Evolution
    // mete en esa columna `contact.name`, o sea el nombre de tu agenda. Se
    // reproduce igual para que el CRM lea lo mismo en los dos sitios.
    /**
     * La foto de perfil de un numero.
     *
     * Existe en Evolution, asi que existe aqui. El puente ya se la baja solo
     * —`s.fotoDe`— para meterla en el aviso del mensaje; esto es lo mismo pero
     * a peticion, que es como lo pide Evolution.
     */
    /**
     * El nombre y la foto de un grupo.
     *
     * Existe en Evolution, asi que existe aqui. El puente ya sabe el nombre
     * —`s.nombreDeGrupo`, que lo pide y lo guarda— y la foto por la misma via
     * que la de una persona.
     */
    /**
     * Las etiquetas de esta sesion (#128, #138).
     *
     * Existe en Evolution —`/label/findLabels/{instancia}`— asi que existe
     * aqui, y devuelve lo mismo: la lista pelada de `{ id, name, color,
     * predefinedId }`.
     *
     * En una cuenta que no sea WhatsApp Business sale vacia, igual que alli.
     */
    if (url.startsWith('/label/findLabels/')) {
      const s2 = sesionDe(instanciaDeUrl(url));
      return json(200, [...s2.etiquetas.values()]);
    }

    /**
     * Poner o quitar una etiqueta a un chat.
     *
     * Como Evolution: pide `{ number, labelId, action }` —el NUMERO, no el
     * jid—, comprueba antes que ese numero existe en WhatsApp y contesta 404 si
     * no. Si esto aceptara un jid, en local funcionaria y en produccion no.
     */
    if (url.startsWith('/label/handleLabel/')) {
      const s2 = sesionDe(instanciaDeUrl(url));
      if (s2.estado !== 'open') return json(503, { error: 'sin sesion de WhatsApp' });
      const cuerpo = await leerCuerpo(req);
      const limpio = String(cuerpo?.number || '').replace(/[^0-9]/g, '');
      const etiqueta = cuerpo?.labelId == null ? null : String(cuerpo.labelId);
      const accion = cuerpo?.action;
      if (!limpio || !etiqueta || !['add', 'remove'].includes(accion)) {
        return json(400, { error: 'falta number, labelId o action' });
      }
      let contacto = null;
      try { [contacto] = await s2.sock.onWhatsApp(limpio) || []; } catch { contacto = null; }
      if (!contacto?.exists) return json(404, { message: 'Number is not on WhatsApp' });
      try {
        if (accion === 'add') await s2.sock.addChatLabel(contacto.jid, etiqueta);
        else await s2.sock.removeChatLabel(contacto.jid, etiqueta);
      } catch (e) {
        return json(400, { message: `Unable to ${accion} label to chat`, error: e.message });
      }
      log(`[${s2.nombre}] etiqueta ${etiqueta} ${accion === 'add' ? '+' : '-'} ${contacto.jid}`);
      return json(200, accion === 'add'
        ? { numberJid: contacto.jid, labelId: etiqueta, add: true }
        : { numberJid: contacto.jid, labelId: etiqueta, remove: true });
    }

    if (url.startsWith('/group/findGroupInfos/')) {
      const s2 = sesionDe(instanciaDeUrl(url.split('?')[0]));
      const jid = new URL(url, 'http://x').searchParams.get('groupJid');
      if (!jid) return json(400, { error: 'falta groupJid' });
      const asunto = await s2.nombreDeGrupo(jid);
      const foto = s2.fotos.has(jid) ? s2.fotos.get(jid) : await s2.fotoDe(jid);
      return json(200, { id: jid, subject: asunto || null, pictureUrl: foto || null });
    }

    if (url.startsWith('/chat/fetchProfilePictureUrl/')) {
      const s2 = sesionDe(instanciaDeUrl(url));
      const cuerpo = await leerCuerpo(req);
      const digitos = String(cuerpo?.number || '').replace(/[^0-9]/g, '');
      if (!digitos) return json(400, { error: 'falta el numero' });
      const jid = `${digitos}@s.whatsapp.net`;
      const foto = s2.fotos.has(jid) ? s2.fotos.get(jid) : await s2.fotoDe(jid);
      return json(200, { wuid: jid, profilePictureUrl: foto || null });
    }

    if (url.startsWith('/chat/findContacts/')) {
      const s2 = sesionDe(instanciaDeUrl(url));
      return json(200, [...s2.agenda.entries()].map(([jid, nombre]) => ({
        id: jid, remoteJid: jid, pushName: nombre,
        profilePicUrl: s2.fotos.get(jid) || null,
      })));
    }

    /**
     * Los mensajes guardados de UN chat (#73).
     *
     * Existe en Evolution, asi que existe aqui. Un puente MENOS capaz que el
     * original tambien miente: si esto devolviera vacio, traer el historial de
     * un numero se probaria bien en local sin haberse probado nada.
     *
     * Se sirve de lo que ya hay en memoria —`s.mensajes`, hasta 20.000 por
     * sesion— filtrando por el chat. Evolution lo saca de su base y guarda mas;
     * aqui se guarda lo que ha pasado por el puente, que para probar sobra.
     */
    if (url.startsWith('/chat/findMessages/')) {
      const s2 = sesionDe(instanciaDeUrl(url));
      const cuerpo = await leerCuerpo(req);
      const jid = cuerpo?.where?.key?.remoteJid || null;
      const tope = Math.min(1000, Number(cuerpo?.limit) || 300);
      const suyos = [...s2.mensajes.values()]
        .filter((m) => !jid || m?.key?.remoteJid === jid)
        // Lo mas reciente primero, como lo devuelve Evolution.
        .sort((a, b) => Number(b?.messageTimestamp || 0) - Number(a?.messageTimestamp || 0))
        .slice(0, tope);
      // Envuelto en `messages.records`, que es una de las dos formas que usa
      // Evolution segun la version. El CRM acepta las dos.
      return json(200, { messages: { records: suyos, total: suyos.length } });
    }

    // Los ajustes de la sesion. Existen en Evolution, asi que existen aqui: al
    // quitar el comodin de arriba, sin esto darian 404 y el rechazo automatico
    // de llamadas no se podria probar en local — que es el otro lado del mismo
    // error, un puente MENOS capaz que el original tambien miente.
    //
    // Se imita lo que importa: `/settings/set` no parchea, reemplaza el bloque
    // entero. Si el CRM se olvidara de reenviar un campo, aqui se perderia
    // igual que en produccion.
    if (url.startsWith('/settings/find/')) {
      const s2 = sesionDe(instanciaDeUrl(url));
      return json(200, s2.ajustes || {});
    }
    if (url.startsWith('/settings/set/')) {
      const s2 = sesionDe(instanciaDeUrl(url));
      s2.ajustes = await leerCuerpo(req);
      // El rechazo automatico se aplica de verdad: Baileys lo hace colgando en
      // cuanto entra la llamada, que es lo que hace Evolution por dentro.
      log(`ajustes de ${s2.nombre}: rejectCall=${s2.ajustes.rejectCall === true}`);
      return json(200, { settings: s2.ajustes });
    }

    // A que avisos esta suscrita la sesion.
    //
    // El CRM los revisa y completa los que falten — las sesiones viejas se
    // quedaron con tres de siete y por eso en produccion no entraba ni una
    // llamada, ni una foto de perfil, ni un borrado. Aqui el puente avisa
    // SIEMPRE de todo, asi que estas dos rutas solo existen para que la
    // reparacion no de 404 en local y parezca rota: un puente menos capaz que
    // el original miente igual que uno mas generoso.
    if (url.startsWith('/webhook/find/')) {
      const s2 = sesionDe(instanciaDeUrl(url));
      return json(200, s2.webhook || { enabled: true, url: CRM_WEBHOOK, events: [], byEvents: false });
    }
    if (url.startsWith('/webhook/set/')) {
      const s2 = sesionDe(instanciaDeUrl(url));
      const cuerpo = await leerCuerpo(req);
      s2.webhook = cuerpo?.webhook || cuerpo;
      log(`avisos de ${s2.nombre}: ${(s2.webhook?.events || []).length}`);
      return json(201, { webhook: s2.webhook });
    }

    // Para mirar por encima como va todo, sin tocar la base.
    if (url === '/estado') {
      return json(200, {
        sesiones: [...sesiones.values()].map((s) => ({
          nombre: s.nombre, estado: s.estado, numero: s.miNumero, modo: s.modo,
          intentos: s.epoca, conectando: s.conectando,
          mensajesEnCache: s.mensajes.size, contactos: s.agenda.size,
          avisosFallidos: s.fallidos,
        })),
      });
    }

    // Nada de comodines. Aqui habia un `/chat/* -> 200 {}` que hacia pasar por
    // buena cualquier ruta inventada: el CRM pedia algo que en Evolution no
    // existe, el puente respondia que si, y el fallo no aparecia hasta
    // produccion. Lo que no este escrito arriba, 404, como en el original.
    json(404, { error: 'no existe' });
  } catch (e) {
    log('error:', e.message);
    json(500, { error: e.message });
  }
}).listen(PUERTO, '127.0.0.1', () => {
  log(`puente escuchando en http://127.0.0.1:${PUERTO}`);
  log(`avisara al CRM en ${CRM_WEBHOOK}`);
  reabrirLasQueYaEstaban();
});

/**
 * Al arrancar, volver a levantar las sesiones que ya tenian credenciales.
 *
 * Sin esto, reiniciar el puente dejaba a TODO el mundo desconectado hasta que
 * cada uno entrase en su pantalla a pedir un codigo — y encima el numero seguia
 * apareciendo como vinculado en el movil, asi que nadie entenderia por que.
 */
function reabrirLasQueYaEstaban() {
  let n = 0;
  try {
    for (const dir of fs.readdirSync(RAIZ_SESIONES, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      if (!fs.existsSync(path.join(RAIZ_SESIONES, dir.name, 'creds.json'))) continue;
      sesionDe(dir.name).conectar().catch(() => {});
      n++;
    }
  } catch { /* todavia no hay ninguna */ }
  log(n ? `reabriendo ${n} sesiones ya emparejadas` : 'sin sesiones previas: esperando a que alguien enlace');
}
