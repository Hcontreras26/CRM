import crypto from 'node:crypto';
import { query } from '../../shared/config/db.js';
import { logger } from '../../shared/utils/logger.js';
import { saveLocal, deleteLocal } from '../../shared/services/localStorage.service.js';
import * as leadModel from '../leads/lead.model.js';
import { firmaTransparente } from '../certifex/certifex.firma.js';
import { applyMapping } from '../webhook-tokens/mapeo.js';
import * as model from './matricula.model.js';
import { obtenerArchivo, conArchivos } from './admision.archivos.js';

/**
 * EL WEBHOOK DE ADMISIÓN (#198).
 *
 * Diego (WhatsApp, 20/10): «Hay formularios de admisión que envían esos datos de
 * admisión. Se requiere un webhook que también reciba esos datos de admisión. Es
 * decir, un webhook abierto que reciba y luego se pueda mapear. Por campus». Y a
 * Carlos: «para que se puedan sincronizar con el mail».
 *
 * Cada campus tiene su webhook de matrículas (`project_webhook_tokens`, kind
 * 'matriculas') con su mapeo (`field_mapping`), que se hace en Matrículas →
 * Webhooks con el modo escucha. Lo que llega:
 *   1. Los datos de la persona, en campos propios (#198, Diego 01/10).
 *   2. Los documentos (DNI por las dos caras, foto, título, firma), como archivo,
 *      URL o imagen en texto (admision.archivos.js). La firma, transparente y
 *      recortada al trazo, como la del diploma (#349).
 *   3. Se une a la persona: su prospecto por el correo y, si no, por el teléfono;
 *      si no existe, se crea SIN GESTORA (ver `prospectoDe`). Y su venta, si la hay.
 *   4. El mismo envío dos veces no crea dos matrículas (`envio_huella`).
 *
 * Un documento que no vale (no es imagen ni PDF, pasa de 10 MB, la URL no
 * responde…) no pierde la solicitud: se guarda sin él y la respuesta dice cuál y
 * por qué, para que quien conecta el formulario lo vea.
 */

/** Los datos del CRM a los que se mapea, con el nombre del contrato de la #198. */
export const CAMPOS_PERSONA = ['nombre', 'email', 'telefono', 'documento_tipo', 'dni', 'fecha_nacimiento',
  'direccion', 'pais', 'estudios', 'curso_solicitado', 'titulo', 'notas'];
/** Destino del mapeo → tipo de documento de la matrícula (matricula.controller.js). */
export const DOCUMENTOS = { dni_frente: 'dni', dni_dorso: 'dni_dorso', foto: 'foto', titulo_doc: 'titulo', firma: 'firma' };
const CLAVE = { dni: 'dni_doc_key', dni_dorso: 'dni_dorso_key', foto: 'foto_key', titulo: 'titulo_doc_key', firma: 'firma_key' };
const URL_DOC = { dni: 'dni_doc_url', dni_dorso: 'dni_dorso_url', foto: 'foto_url', titulo: 'titulo_doc_url', firma: 'firma_url' };

const LARGO = { nombre: 200, email: 200, telefono: 50, documento_tipo: 30, dni: 40, pais: 80, curso_solicitado: 255 };

/** ¿Es un archivo del multipart o una imagen en texto, no un dato? */
const esArchivo = (v) => (v && typeof v === 'object' && !Array.isArray(v) && v.__archivo)
  || (typeof v === 'string' && /^data:[\w.+/-]+;base64,/i.test(v.trim()));

/**
 * Para el `titulo` del contrato, que puede ser el archivo o el texto «Título /
 * Programa»: además de lo anterior, un enlace al archivo (lo normal en Gravity y
 * Elementor) o una lista de archivos o enlaces (`titulo[]`).
 */
const pareceArchivo = (v) => esArchivo(v)
  || (typeof v === 'string' && /^https?:\/\/\S+$/i.test(v.trim()))
  || (Array.isArray(v) && v.length > 0 && v.every((x) => x == null || x === '' || pareceArchivo(x)) && v.some(pareceArchivo));

/**
 * Un texto limpio, recortado a lo que cabe en su columna; null si viene vacío.
 * Gravity manda algunos campos compuestos (el nombre como `{ first, last }`, la
 * dirección por partes): se juntan sus partes, en el orden en que llegan.
 */
function texto(v, campo) {
  if (v == null || esArchivo(v)) return null;
  const partes = (x) => (x == null || x === '' ? [] : typeof x === 'object' ? Object.values(x).flatMap(partes) : [String(x).trim()]);
  const t = (Array.isArray(v) ? v.flatMap(partes).filter(Boolean).join(', ')
    : typeof v === 'object' ? partes(v).filter(Boolean).join(' ') : String(v)).trim();
  if (!t) return null;
  return LARGO[campo] ? t.slice(0, LARGO[campo]) : t;
}

/** «1990-05-17», «17/05/1990» o «17-05-1990» → 'AAAA-MM-DD'; null si no es una fecha. */
export function fechaDeNacimiento(v) {
  const t = texto(v);
  if (!t) return null;
  let a, m, d;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (r) [, a, m, d] = r;
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) [, d, m, a] = r;
  else return null;
  const f = new Date(Date.UTC(+a, +m - 1, +d));
  if (f.getUTCFullYear() !== +a || f.getUTCMonth() !== +m - 1 || f.getUTCDate() !== +d) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** La huella del envío: lo que llegó (con las claves ordenadas) y sus archivos. */
export function huellaDelEnvio(body, archivos = []) {
  const ordenado = (x) => (Array.isArray(x) ? x.map(ordenado)
    : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, ordenado(x[k])])) : x);
  const h = crypto.createHash('sha256').update(JSON.stringify(ordenado(body || {})));
  for (const f of [...archivos].sort((p, q) => String(p.fieldname).localeCompare(q.fieldname))) {
    h.update(`|${f.fieldname}:`).update(crypto.createHash('sha256').update(f.buffer).digest('hex'));
  }
  return h.digest('hex');
}

/**
 * El prospecto de la persona en ese campus: primero por el correo, luego por el
 * teléfono (findDuplicateByEmailOrPhone ya ordena así). Si no existe y llegan
 * nombre y correo, se crea.
 *
 * SIN GESTORA (decidido el 20/10, Diego lo puede cambiar): quien rellena la
 * solicitud de admisión ya se está matriculando, no hay nada que venderle. Si
 * entrara en el reparto, a una gestora le caería «un prospecto nuevo» que ya
 * compró, contaría en su cola y en sus cifras, y podría llamar a alguien ya
 * matriculado. Si existe, se une a su ficha con su gestora de siempre; la
 * solicitud sale igualmente en Matrículas, y se le puede asignar gestora a mano.
 */
async function prospectoDe(projectId, persona, huella) {
  if (!persona.email && !persona.telefono) return { leadId: null, creado: false };
  const existente = await leadModel.findDuplicateByEmailOrPhone(persona.email, persona.telefono, projectId);
  if (existente) return { leadId: existente.id, creado: false };
  if (!persona.nombre || !persona.email) return { leadId: null, creado: false };
  const lead = await leadModel.createLeadWithRoundRobin({
    projectId,
    nombre: persona.nombre,
    email: persona.email,
    telefono: persona.telefono,
    productoInteresId: null,
    notas: 'Creado por la solicitud de admisión',
    landingUrl: null,
    utms: { utm_source: 'admision', utm_medium: 'webhook' },
    customFields: {},
    skipRoundRobin: true,
    idempotencyKey: `admision:${huella}`,
  });
  return { leadId: lead.id, creado: true };
}

/** La venta de ese prospecto en ese campus que aún no tiene matrícula (la más reciente). */
async function ventaDe(projectId, leadId) {
  if (!leadId) return null;
  const { rows } = await query(
    `SELECT c.id FROM conversions c
      WHERE c.lead_id = $1 AND c.project_id = $2
        AND NOT EXISTS (SELECT 1 FROM matriculas m WHERE m.conversion_id = c.id)
      ORDER BY c.fecha_conversion DESC, c.id DESC
      LIMIT 1`,
    [leadId, projectId]);
  return rows[0]?.id ?? null;
}

/** Guarda un documento de la matrícula, como la subida a mano (uploadDoc), con su línea del historial. */
async function guardarDocumento(matricula, tipo, archivo) {
  let { buffer, ext } = archivo;
  if (tipo === 'firma') {
    if (ext === 'pdf') throw Object.assign(new Error('La firma tiene que ser una imagen, no un PDF.'), { isOperational: true });
    buffer = await firmaTransparente(buffer);
    ext = 'png';
  }
  const key = `matriculas/${matricula.project_id}/m-${matricula.id}-${tipo}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  await saveLocal(key, buffer);
  try {
    await model.conTransaccion(async (db) => {
      await model.update(matricula.id, { [CLAVE[tipo]]: key, [URL_DOC[tipo]]: `/api/matriculas/${matricula.id}/doc/${tipo}?v=${Date.now()}` }, db);
      await model.registrarEvento({ matriculaId: matricula.id, evento: 'documento', documento: tipo, reemplazo: false, db });
    });
  } catch (err) {
    await deleteLocal(key).catch(() => {});
    throw err;
  }
}

/**
 * Una solicitud de admisión que llega por el webhook de matrículas de un campus.
 * `archivos`: los del multipart (multer). `opcionesArchivo`: para las pruebas.
 * Devuelve lo que contesta el webhook.
 */
export async function recibirAdmision(token, body, archivos = [], opcionesArchivo = {}) {
  const projectId = token.project_id;
  const envio = conArchivos(body, archivos);
  // Copia: sin mapeo, applyMapping devuelve el mismo objeto, y abajo se le añaden alias.
  const mapeado = { ...applyMapping(envio, token.field_mapping || {}) };
  const huella = huellaDelEnvio(body, archivos);

  const repetido = await query('SELECT id FROM matriculas WHERE project_id = $1 AND envio_huella = $2', [projectId, huella]);
  if (repetido.rows[0]) return { status: 200, data: { matricula_id: repetido.rows[0].id, action: 'duplicate_skipped' } };

  // El contrato de Diego (01/10) llama `titulo` al ARCHIVO del título y `documento`
  // al número; el CRM ya usaba `titulo` para el texto «Título / Programa» y `dni`
  // para el número. Se aceptan los dos: un `titulo` que es un archivo va como
  // documento, y `documento` vale como `dni`.
  if (mapeado.titulo_doc == null && pareceArchivo(mapeado.titulo)) {
    mapeado.titulo_doc = mapeado.titulo;
    delete mapeado.titulo; // no es el texto «Título / Programa»
  }
  if (mapeado.dni == null && mapeado.documento != null) mapeado.dni = mapeado.documento;

  const persona = {};
  for (const campo of CAMPOS_PERSONA) persona[campo] = texto(mapeado[campo], campo);
  if (persona.email) persona.email = persona.email.toLowerCase();
  persona.fecha_nacimiento = fechaDeNacimiento(mapeado.fecha_nacimiento);

  // Lo de antes (#198, ya en marcha): no repetir la de la misma persona por su DNI o correo.
  const dedupe = persona.dni || persona.email || null;
  if (dedupe) {
    const existente = await model.findByDedupe(projectId, dedupe);
    if (existente) return { status: 200, data: { matricula_id: existente.id, action: 'duplicate_skipped' } };
  }

  let prospecto = { leadId: null, creado: false };
  try {
    prospecto = await prospectoDe(projectId, persona, huella);
  } catch (err) {
    // Sin prospecto la solicitud se guarda igual; se puede vincular después.
    logger.warn({ err: err.message, projectId }, 'Admisión: no se pudo unir ni crear el prospecto');
  }
  let conversionId = await ventaDe(projectId, prospecto.leadId);

  const crear = () => model.create({
    project_id: projectId,
    conversion_id: conversionId,
    lead_id: prospecto.leadId,
    ...persona,
    // El envío tal cual llegó (Diego, 01/10), también las imágenes en texto; los
    // archivos del multipart, como su marca «📎». En la lista no sale (va en la ficha).
    datos_admision: envio,
    source: 'webhook',
    dedupe_key: dedupe,
    envio_huella: huella,
    estado: 'solicitud_admision',
  });

  let matricula;
  try {
    matricula = await crear();
  } catch (err) {
    if (err.code !== '23505') throw err;
    // Dos envíos a la vez: el índice único deja entrar solo uno, y el otro es
    // «repetido», no un 500. Puede chocar en la huella (el mismo envío), en el DNI o
    // correo (la misma persona, con un envío algo distinto) o en la venta (dos
    // solicitudes del mismo prospecto a la vez: la segunda entra sin venta).
    if (err.constraint === 'uq_matricula_conversion' && conversionId) {
      conversionId = null;
      matricula = await crear();
    } else {
      const otra = (await query('SELECT id FROM matriculas WHERE project_id = $1 AND envio_huella = $2', [projectId, huella])).rows[0]
        || (dedupe ? await model.findByDedupe(projectId, dedupe) : null);
      if (!otra) throw err;
      return { status: 200, data: { matricula_id: otra.id, action: 'duplicate_skipped' } };
    }
  }

  // Los documentos se descargan A LA VEZ (un formulario puede mandar cinco
  // enlaces: uno detrás de otro, la web daba el envío por fallido esperando) y se
  // guardan después, de uno en uno, cada uno con su línea del historial.
  const pendientes = Object.entries(DOCUMENTOS).filter(([destino]) => mapeado[destino] != null && mapeado[destino] !== '');
  const obtenidos = await Promise.all(pendientes.map(([destino]) => obtenerArchivo(mapeado[destino], archivos, opcionesArchivo)
    .then((archivo) => ({ archivo }), (error) => ({ error }))));

  const guardados = [];
  const rechazados = [];
  for (let i = 0; i < pendientes.length; i++) {
    const [destino, tipo] = pendientes[i];
    try {
      if (obtenidos[i].error) throw obtenidos[i].error;
      if (!obtenidos[i].archivo) continue;
      await guardarDocumento(matricula, tipo, obtenidos[i].archivo);
      guardados.push(destino);
    } catch (err) {
      const motivo = err.isOperational ? err.message : 'No se ha podido guardar.';
      if (!err.isOperational) logger.error({ err, matriculaId: matricula.id, destino }, 'Admisión: fallo al guardar un documento');
      rechazados.push({ documento: destino, motivo });
    }
  }

  return {
    status: 201,
    data: {
      matricula_id: matricula.id,
      action: 'created',
      lead_id: prospecto.leadId,
      lead_creado: prospecto.creado,
      conversion_id: conversionId,
      documentos: { guardados, rechazados },
    },
  };
}
