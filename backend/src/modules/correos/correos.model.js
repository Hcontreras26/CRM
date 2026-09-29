import { query } from '../../shared/config/db.js';

/**
 * Los correos del CRM: los que manda y los que recibe (#146).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE EXISTE ESTA PANTALLA SI YA ESTA EL REGISTRO
 *
 * El Registro es un log: una linea por suceso, mezclada con fichas, tareas y
 * webhooks. Sirve para «que paso el martes».
 *
 * Esto es otra cosa: una bandeja. Se entra sabiendo a quien se escribio y
 * queriendo LEER lo que se le mando. Angel lo pidio asi — «un panel para ver
 * mensajes enviados, recibidos» — y nacio de una pregunta muy concreta: los
 * correos del CRM no aparecen en la bandeja de salida del webmail, porque Brevo
 * los manda EN NOMBRE de la direccion y no DESDE ella.
 *
 * Aquello ya esta resuelto aparte: lo que sale del buzon va por su SMTP y se
 * archiva en «Enviados». Pero alli solo esta lo de ESA direccion y solo lo que
 * llego a salir; aqui esta todo lo que manda el CRM, frenado y fallido incluido.
 *
 * LO RECIBIDO YA ESTA: se lee el buzon por IMAP —la misma conexion que deja la
 * copia en «Enviados»— y entra en esta misma tabla con `direccion = 'entrada'`.
 * Se descarto Brevo Inbound porque obliga a apuntar un subdominio a Brevo y
 * deja fuera el correo normal del buzon, que es justo el que se quiere ver.
 *
 * Por eso la consulta filtra por `direccion` en vez de devolverla escrita a
 * mano, que es como estaba mientras solo habia envios.
 */

/** Lo que se puede filtrar. Cualquier otra cosa se ignora. */
const ESTADOS = ['enviado', 'fallido', 'bloqueado', 'recibido'];
const DIRECCIONES = ['salida', 'entrada'];

/**
 * La lista. SIN el cuerpo, y a proposito: son cien correos por pagina y el
 * cuerpo de cada uno pesa mas que todo lo demas junto. Se pide al abrir uno.
 */
export async function listar({ estado = null, direccion = null, busca = null, desde = null,
  hasta = null, projectIds = null, limite = 100, pagina = 1 } = {}) {
  const par = [];
  const cond = ['1=1'];

  if (ESTADOS.includes(estado)) { par.push(estado); cond.push(`estado = $${par.length}`); }
  if (DIRECCIONES.includes(direccion)) { par.push(direccion); cond.push(`direccion = $${par.length}`); }
  const termino = typeof busca === 'string' ? busca.trim() : '';
  if (termino) {
    par.push(`%${termino}%`);
    // Tambien por REMITENTE: en lo que entra, el destinatario somos siempre
    // nosotros, asi que buscar solo por ahi no encontraria a nadie.
    cond.push(`(destinatarios ILIKE $${par.length} OR asunto ILIKE $${par.length}`
      + ` OR remitente ILIKE $${par.length})`);
  }
  if (desde) { par.push(desde); cond.push(`created_at >= $${par.length}::date`); }
  // `+ 1 dia` porque `hasta` es un dia, no un instante: sin eso, pedir «hasta
  // hoy» deja fuera todo lo de hoy salvo lo de las 00:00.
  if (hasta) { par.push(hasta); cond.push(`created_at < $${par.length}::date + INTERVAL '1 day'`); }
  if (Array.isArray(projectIds) && projectIds.length) {
    par.push(projectIds.map(Number));
    // Los que no son de ningun proyecto —el aviso al tutor, que cruza varios—
    // salen siempre: esconderlos seria esconder justo los que mas se buscan.
    cond.push(`(project_id = ANY($${par.length}::int[]) OR project_id IS NULL)`);
  }

  const donde = cond.join(' AND ');
  const { rows: [{ total }] } = await query(
    `SELECT COUNT(*)::int AS total FROM email_envios WHERE ${donde}`, par);

  const lim = Math.min(Number(limite) || 100, 200);
  const desplaza = (Math.max(Number(pagina) || 1, 1) - 1) * lim;
  par.push(lim, desplaza);

  const { rows } = await query(
    `SELECT id, created_at AS cuando, direccion,
            remitente, destinatarios, asunto, estado, intentos, etiquetas,
            project_id, error,
            -- Solo si LO HAY, para que la pantalla pueda decir «este es
            -- anterior a que se guardara el texto» en vez de enseñar un hueco.
            (cuerpo_html IS NOT NULL) AS tiene_cuerpo
       FROM email_envios
      WHERE ${donde}
      ORDER BY created_at DESC, id DESC
      LIMIT $${par.length - 1} OFFSET $${par.length}`, par);

  return { total, pagina: Math.max(Number(pagina) || 1, 1), limite: lim, filas: rows };
}

/** Uno, con su cuerpo. Es la unica consulta que lo trae. */
export async function uno(id) {
  const { rows } = await query(
    `SELECT id, created_at AS cuando, direccion,
            remitente, destinatarios, asunto, estado, intentos, etiquetas,
            project_id, error, brevo_msg_id, cuerpo_html
       FROM email_envios WHERE id = $1`, [Number(id)]);
  return rows[0] || null;
}

/** Cuantos hay de cada estado, para las pestañas. */
export async function recuento() {
  const { rows } = await query(
    `SELECT estado, COUNT(*)::int AS n FROM email_envios GROUP BY estado`);
  const r = { enviado: 0, fallido: 0, bloqueado: 0, recibido: 0 };
  for (const x of rows) r[x.estado] = x.n;
  return r;
}
