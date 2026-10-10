import crypto from 'crypto';
import * as model from './certifex.model.js';
import { recibirSchema, listarSchema, actualizarSchema, solicitudSchema, completadoSchema, mensajeDeValidacion } from './certifex.validation.js';
import { AppError } from '../../shared/utils/AppError.js';
import { logger } from '../../shared/utils/logger.js';
import { notifyAdmins, notifyUsers } from '../notifications/notifications.service.js';

function parsear(schema, datos) {
  const r = schema.safeParse(datos);
  if (!r.success) throw new AppError(mensajeDeValidacion(r.error), 400, 'VALIDATION_ERROR');
  return r.data;
}

/**
 * ¿La peticion trae el secreto que compartimos con Certifex?
 *
 * Comparacion en tiempo constante, sobre el sha256 de los dos para que la longitud
 * no se filtre. Sin `CERTIFEX_WEBHOOK_SECRETO` en el .env la entrada esta CERRADA:
 * un 404, como si no existiera. Mejor que aceptar cualquier cosa por olvido.
 */
export function secretoValido(presentado) {
  const esperado = (process.env.CERTIFEX_WEBHOOK_SECRETO || '').trim();
  if (!esperado || typeof presentado !== 'string' || !presentado) return false;
  const a = crypto.createHash('sha256').update(presentado).digest();
  const b = crypto.createHash('sha256').update(esperado).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * La puerta de lo que entrega el servidor de Certifex: sin `CERTIFEX_WEBHOOK_SECRETO`
 * configurado, 404 (como si no existiera); con otro secreto, 401.
 */
function puertaDeCertifex(req) {
  if (!(process.env.CERTIFEX_WEBHOOK_SECRETO || '').trim()) {
    throw new AppError('No encontrado', 404, 'NOT_FOUND');
  }
  if (!secretoValido(req.get('X-Certifex-Secreto'))) {
    throw new AppError('No autorizado', 401, 'UNAUTHORIZED');
  }
}

/**
 * PUBLICO, con secreto: Certifex entrega aqui cada consulta de su web.
 *
 * El aviso va por la CAMPANA, no por correo, igual que los tickets de soporte: el
 * equipo mira la campana cada dia, y un correo a un buzon que no existe seria dar el
 * aviso por hecho sin que llegue a nadie. Entra como ACCION (ver notifications/tipos.js):
 * alguien tiene que contestar.
 *
 * Un reintento de Certifex con la misma consulta no la duplica ni vuelve a avisar.
 */
export async function recibir(req, res, next) {
  try {
    puertaDeCertifex(req);
    const d = parsear(recibirSchema, req.body);
    const { consulta, nueva } = await model.recibir(d);

    if (nueva) {
      const quien = consulta.tipo === 'centro' && consulta.organizacion ? consulta.organizacion : consulta.nombre;
      notifyAdmins({
        type: 'certifex_consulta',
        title: consulta.tipo === 'centro' ? `Certifex: ${quien} quiere inscribir su campus` : `Certifex: consulta de ${quien}`,
        message: consulta.mensaje.slice(0, 180),
        link_path: '/clientes/matriculas/certificaciones?vista=consultas',
        metadata: { consultaId: consulta.id, certifexId: consulta.certifexId, tipo: consulta.tipo },
      }).catch((e) => logger.error({ err: e.message, consultaId: consulta.id }, 'Aviso de consulta Certifex: error'));
    }

    res.status(nueva ? 201 : 200).json({ success: true, data: { id: consulta.id, duplicada: !nueva } });
  } catch (err) { next(err); }
}

export async function listar(req, res, next) {
  try {
    const f = parsear(listarSchema, req.query);
    const [data, nuevas] = await Promise.all([model.listar(f), model.recuentoNuevas()]);
    res.json({ success: true, data: { ...data, nuevas } });
  } catch (err) { next(err); }
}

export async function actualizar(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new AppError('Consulta no encontrada', 404, 'NOT_FOUND');
    const d = parsear(actualizarSchema, req.body);
    const c = await model.actualizar(id, d, req.user.userId);
    if (!c) throw new AppError('Consulta no encontrada', 404, 'NOT_FOUND');
    res.json({ success: true, data: c });
  } catch (err) { next(err); }
}

/**
 * PUBLICO, con secreto: Certifex avisa aqui de cada solicitud de diploma que un
 * alumno hace desde Moodle (#272). Misma puerta que las consultas: sin el secreto
 * configurado, 404; con otro, 401.
 *
 * Suena la campana de ADMINISTRACION de ese campus (super admin, y los admin con el
 * proyecto del campus activo, que son quienes lo pueden aprobar): va dirigida a ellos y
 * no al reparto general, que tambien ve soporte. Un reintento
 * identico de Certifex no duplica ni vuelve a avisar; si el alumno lo vuelve a pedir,
 * se actualiza la solicitud y si avisa, porque hay algo nuevo que mirar.
 *
 * Aqui no se aprueba nada ni sale ningun correo: eso lo hace una persona desde el
 * panel Diplomas.
 */
export async function recibirSolicitud(req, res, next) {
  try {
    puertaDeCertifex(req);
    const d = parsear(solicitudSchema, req.body);
    const { solicitud: s, estado } = await model.recibirSolicitud(d);

    if (estado !== 'repetida') {
      const otraVez = s.veces > 1;
      const curso = s.curso?.nombre ? ` · ${s.curso.nombre}` : '';
      // Sin nombre para el diploma tambien entra (se revisa antes de aprobar).
      const quien = s.nombreDiploma || s.nombreMoodle || 'Un alumno';
      const distinto = s.nombreMoodle && s.nombreDiploma && s.nombreMoodle.trim().toLowerCase() !== s.nombreDiploma.trim().toLowerCase()
        ? ` (en Moodle: ${s.nombreMoodle})` : '';
      const nombre = s.nombreDiploma ? `Nombre para el diploma: «${s.nombreDiploma}»${distinto}.` : 'Sin nombre para el diploma: revísalo antes de aprobar.';
      model.idsAdministracionDeCentro(s.centro)
        .then((ids) => notifyUsers({
          targetUserIds: ids,
          type: 'certifex_solicitud',
          title: otraVez ? `Diploma: ${quien} lo vuelve a pedir` : `Diploma: ${quien} lo pide`,
          message: `${s.centro}${curso}. ${nombre}${s.leadId ? '' : ' Su correo no está en el CRM.'}`.slice(0, 300),
          link_path: '/clientes/matriculas/diplomas',
          metadata: { matriculaId: s.matriculaId, centro: s.centro, leadId: s.leadId, solicitudId: s.id },
        }))
        .catch((e) => logger.error({ err: e.message, matriculaId: s.matriculaId }, 'Aviso de solicitud de diploma: error'));
    }

    res.status(estado === 'nueva' ? 201 : 200).json({
      success: true,
      data: { id: s.id, estado, duplicada: estado === 'repetida', enCrm: !!s.leadId },
    });
  } catch (err) { next(err); }
}

/**
 * PUBLICO, con secreto: Certifex avisa aqui de que Moodle da una formacion por
 * terminada y el alumno aun no ha pedido su diploma (ni lo tiene). Una vez por
 * matricula; si no contestamos 2xx, Certifex lo reintenta en la siguiente puesta al dia.
 *
 * Solo informa: suena la campana de la administracion de ese campus, con enlace a
 * «Terminaron sin pedir». No se aprueba ni se emite nada: lo que se imprime sale de la
 * solicitud del alumno, cuando la haga. Un reintento no duplica ni vuelve a avisar.
 */
export async function recibirCompletado(req, res, next) {
  try {
    puertaDeCertifex(req);
    const d = parsear(completadoSchema, req.body);
    const { completado: c, estado } = await model.recibirCompletado(d);

    if (estado === 'nueva') {
      const curso = c.curso?.nombre ? ` · ${c.curso.nombre}` : '';
      const quien = c.nombreMoodle || c.email || 'Un alumno';
      model.idsAdministracionDeCentro(c.centro)
        .then((ids) => notifyUsers({
          targetUserIds: ids,
          type: 'certifex_completado',
          title: `Terminó sin pedir el diploma: ${quien}`,
          message: `${c.centro}${curso}. Moodle da la formación por terminada y aún no ha pedido su diploma.${c.leadId ? '' : ' Su correo no está en el CRM.'}`.slice(0, 300),
          link_path: '/clientes/matriculas/diplomas?pestana=terminados',
          metadata: { matriculaId: c.matriculaId, centro: c.centro, leadId: c.leadId },
        }))
        .catch((e) => logger.error({ err: e.message, matriculaId: c.matriculaId }, 'Aviso de formacion terminada: error'));
    }

    res.status(estado === 'nueva' ? 201 : 200).json({
      success: true,
      data: { id: c.id, estado, duplicada: estado === 'repetida', enCrm: !!c.leadId },
    });
  } catch (err) { next(err); }
}
