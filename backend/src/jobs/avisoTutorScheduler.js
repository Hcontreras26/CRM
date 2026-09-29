import { logger } from '../shared/utils/logger.js';
import { query } from '../shared/config/db.js';
import { sendEmail } from '../shared/services/brevo.service.js';
import * as tutores from '../modules/tutores/tutor.model.js';
import {
  correo, parrafo, seccion, boton, tarjetas, nota, enlace, esc, etiqueta, T,
} from '../shared/services/email-plantilla.service.js';
import { vigilar } from './latido.js';
import { NO_ESCRIBIR_A_TUTORES } from '../shared/config/frenoTutores.js';

/**
 * «Hoy te han comprado.» El aviso al tutor, tarea #82.
 *
 * Un tutor no se enteraba de que habia vendido hasta que alguien se lo decia.
 *
 * Va AL CIERRE de la jornada y no en el momento de cada pago, y es a proposito:
 * un tutor con cuatro ventas en un dia no necesita cuatro correos, necesita uno
 * con las cuatro.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * La regla de este fichero: **no calcula ni un euro.**
 *
 * Todo sale de `tutor_commissions`, que es lo que ya deja escrito
 * `tutorCommissionsScheduler` al reconciliar, leido con las MISMAS funciones que
 * pinta el panel de comisiones —`comisiones()` y `resumenComisiones()`—. Si el
 * numero del correo y el del panel no coincidieran, no habria forma de saber
 * cual es el bueno; asi coinciden por construccion.
 *
 * De ahi se hereda gratis la regla del dinero: `tutor_commissions.payment_id`
 * apunta a `conversion_payments`, o sea a lo COBRADO de verdad, y no a
 * `conversions.importe_pagado`, que declara de mas y habria inflado cada
 * comision.
 */

const HORA = parseInt(process.env.AVISO_TUTOR_HORA || process.env.RESUMEN_HORA || '19', 10);
const TICK_MS = parseInt(process.env.AVISO_TUTOR_TICK_MS || String(30 * 60 * 1000), 10);

let corriendo = false;

const hoy = () => new Date().toISOString().slice(0, 10);
const periodoDe = (fecha) => String(fecha).slice(0, 7);

const eur = (v) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
    .format(Number(v) || 0);

/**
 * Los tutores que han cobrado algo hoy, con su correo.
 *
 * Se pregunta por los que TIENEN movimiento en vez de recorrer todos: si hoy no
 * ha vendido nadie, esto devuelve vacio y no se manda ni un correo — que es lo
 * que pide el ticket. Un aviso diario que casi siempre dice «hoy nada» se deja
 * de leer, y el dia que trae algo tampoco se lee.
 */
async function tutoresConMovimiento(fecha) {
  const { rows } = await query(
    `SELECT DISTINCT u.id, u.nombre, u.email
       FROM tutor_commissions tc
       JOIN users u ON u.id = tc.tutor_id
       JOIN conversion_payments cp ON cp.id = tc.payment_id
      WHERE cp.fecha = $1::date
        AND u.active
        AND u.email IS NOT NULL
        -- La revertida no es una venta: avisar de ella seria decirle que ha
        -- cobrado algo que se le ha quitado.
        AND tc.estado <> 'revertida'
        AND NOT EXISTS (
          SELECT 1 FROM avisos_apagados a
           WHERE a.user_id = u.id AND a.aviso = 'venta_tutor'
        )
      ORDER BY u.nombre`,
    [fecha]
  );
  return rows;
}

/** Una fila por venta del dia. */
function filaVenta(c) {
  const cuota = c.cuota_numero && c.cuotas_total > 1
    ? `<div style="font-family:${T.fuente};font-size:12px;line-height:18px;color:${T.tenue}">
         Cuota ${c.cuota_numero} de ${c.cuotas_total}
       </div>`
    : '';
  return `
    <tr>
      <td style="padding:12px 10px 12px 0;border-bottom:1px solid ${T.borde};
                 font-family:${T.fuente};font-size:14px;line-height:20px;color:${T.texto}">
        <div style="font-weight:600">${esc(c.alumno)}</div>
        <div style="font-size:13px;line-height:19px;color:${T.tenue}">${esc(c.formacion || '—')}</div>
        ${cuota}
      </td>
      <td align="right" style="padding:12px 0;border-bottom:1px solid ${T.borde};
                 font-family:${T.fuente};font-size:14px;line-height:20px;
                 color:${T.texto};white-space:nowrap;vertical-align:top">
        <div style="font-weight:600;font-variant-numeric:tabular-nums">${esc(eur(c.importe))}</div>
        <div style="font-size:12px;line-height:18px;color:${T.tenue};font-variant-numeric:tabular-nums">
          ${esc(eur(c.cobro))} · ${Number(c.pct)} %
        </div>
      </td>
    </tr>`;
}

/**
 * El correo de un tutor.
 *
 * @param {object} tutor    `{ nombre }`
 * @param {object[]} ventas lo cobrado hoy, de `comisiones()`
 * @param {object} mes      su fila de `resumenComisiones()`
 */
export function cuerpo(tutor, ventas, mes = {}) {
  const delDia = ventas.reduce((t, c) => t + (Number(c.importe) || 0), 0);
  const cobradoDia = ventas.reduce((t, c) => t + (Number(c.cobro) || 0), 0);
  const pendiente = Number(mes.pendiente) || 0;
  const pagada = Number(mes.pagada) || 0;

  return correo({
    titulo: ventas.length === 1 ? 'Has vendido hoy' : `Has vendido ${ventas.length} veces hoy`,
    saludo: tutor.nombre,
    resumen: `${eur(delDia)} de comisión hoy · ${eur(pendiente)} pendiente este mes`,
    bloques: [
      parrafo(ventas.length === 1
        ? 'Se ha registrado un cobro de una de tus formaciones.'
        : `Se han registrado ${ventas.length} cobros de tus formaciones.`),

      tarjetas([
        { etiqueta: 'Tu comisión hoy', valor: eur(delDia) },
        { etiqueta: 'Cobrado hoy', valor: eur(cobradoDia) },
      ]),

      seccion('Lo de hoy'),
      `<table cellpadding="0" cellspacing="0" border="0" width="100%"
              style="border-collapse:collapse;margin:0 0 4px">
         ${ventas.map(filaVenta).join('')}
       </table>`,

      seccion('Este mes'),
      // Pendiente y pagada por separado: «llevas 800 €» sin decir cuanto has
      // cobrado ya no sirve para saber que esperar en la transferencia.
      `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px">
         <tr>
           <td style="padding:0 12px 0 0">${etiqueta(`${eur(pendiente)} pendiente`, pendiente > 0 ? 'aviso' : 'neutro')}</td>
           <td>${etiqueta(`${eur(pagada)} ya pagada`, pagada > 0 ? 'exito' : 'neutro')}</td>
         </tr>
       </table>`,

      // `/mis-cursos` y NO `/tutores/comisiones`: la segunda es la pantalla de
      // ADMINISTRACION, donde se ven las comisiones de todo el mundo. La del
      // tutor es esta, que carga solo las suyas. Mandarle a la otra seria, en
      // el mejor caso, un 403.
      boton({ texto: 'Ver mis comisiones', url: enlace('mis-cursos') }),

      nota('Lo que ves aquí sale de los pagos registrados en el CRM. Si algo no cuadra, díselo a administración antes de que se liquide el mes.'),
    ],
    apagar: { texto: 'Recibes este aviso el día que se cobra algo tuyo.' },
  });
}

async function vuelta() {
  if (corriendo) return;
  corriendo = true;
  try {
    if (new Date().getHours() !== HORA) return;

    const fecha = hoy();
    const gente = await tutoresConMovimiento(fecha);
    // Si hoy no ha vendido nadie, aqui se acaba: ni una consulta mas ni un
    // correo. Es la mitad del valor del aviso.
    if (!gente.length) return;

    let mandados = 0;
    // El freno del 15/09. Hoy este cron no lo arranca nadie --no esta en
    // `app.js`-- pero el dia que se enchufe tiene que nacer callado: es el
    // unico camino al tutor que no necesita que alguien pulse un boton.
    if (NO_ESCRIBIR_A_TUTORES) {
      logger.warn({ tutores: gente.length }, 'Aviso de venta a tutores: PARADO, no se manda nada');
      return;
    }

    for (const tutor of gente) {
      try {
        // Las mismas funciones que el panel. Ver la cabecera del fichero.
        const [ventas, resumen] = await Promise.all([
          tutores.comisiones({ tutorId: tutor.id, fechaCobro: fecha }),
          tutores.resumenComisiones({ tutorId: tutor.id, periodo: periodoDe(fecha) }),
        ]);
        // Puede quedar vacio si lo unico de hoy estaba revertido: la consulta
        // de arriba ya las excluye, pero mas vale no mandar un correo de cero.
        const suyas = ventas.filter((c) => c.estado !== 'revertida');
        if (!suyas.length) continue;

        const { htmlContent, textContent } = cuerpo(tutor, suyas, resumen[0] || {});
        const r = await sendEmail({
          to: tutor.email,
          subject: '[CRM] Has vendido hoy',
          htmlContent,
          textContent,
          tags: ['tutor', 'venta'],
          // La clave que pide el ticket. Con la fecha dentro: llega el dia que
          // hay algo, pero un reinicio a las 19:05 no lo repite.
          clave: `venta_tutor-${tutor.id}-${fecha}`,
        });
        if (r?.sent) mandados++;
      } catch (err) {
        // Que falle el de un tutor no puede dejar sin aviso a los demas.
        logger.error({ err: err.message, tutorId: tutor.id }, 'Fallo avisando al tutor');
      }
    }
    logger.info({ tutores: gente.length, mandados, fecha }, 'Aviso de venta a tutores');
  } catch (err) {
    logger.error({ err: err.message }, 'Fallo en el aviso de venta a tutores');
  } finally {
    corriendo = false;
  }
}

export function startAvisoTutorScheduler() {
  if (process.env.AVISO_TUTOR_DISABLED === '1') {
    logger.info('Aviso de venta a tutores desactivado (AVISO_TUTOR_DISABLED=1)');
    return;
  }
  vigilar('aviso_tutor', 'Aviso de venta al tutor', vuelta, TICK_MS);
  logger.info({ tickMs: TICK_MS, hora: HORA }, 'Aviso de venta a tutores iniciado');
}

export const _internos = { tutoresConMovimiento, cuerpo, vuelta, filaVenta };
