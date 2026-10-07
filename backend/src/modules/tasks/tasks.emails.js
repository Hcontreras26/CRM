// Los correos del tablero de tareas (#210, fase 3), con la plantilla comun del
// CRM: la misma cabecera, el mismo boton y el pie para apagarlo en «Mis
// preferencias». Cada uno lleva su clave de idempotencia: un reintento o un
// reinicio no lo manda dos veces.
import { sendEmail } from '../../shared/services/brevo.service.js';
import {
  correo, parrafo, boton, nota, seccion, esc, enlace,
} from '../../shared/services/email-plantilla.service.js';

// Los nombres con los que se apagan en «Mis preferencias» (avisos_apagados).
export const AVISO_TAREA_ASIGNADA = 'tarea_asignada';
export const AVISO_TAREAS_DEL_DIA = 'tareas_del_dia';

const ESTADOS = {
  por_hacer: 'Por hacer', en_curso: 'En curso', en_revision: 'En revisión', hecha: 'Hecha',
};
const PRIORIDADES = { baja: 'Baja', media: 'Media', alta: 'Alta' };

const tz = () => process.env.APP_TIMEZONE || 'Europe/Madrid';
const fechaCorta = (d) => new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: tz() });

/** El correo «te han asignado una tarea». */
export function armarCorreoAsignada({ persona, tarea, quien }) {
  const datos = [
    `Prioridad: <strong>${esc(PRIORIDADES[tarea.priority] || tarea.priority)}</strong>`,
    tarea.due_date ? `Fecha límite: <strong>${esc(fechaCorta(tarea.due_date))}</strong>` : null,
    tarea.project_name ? `Proyecto: <strong>${esc(tarea.project_name)}</strong>` : null,
  ].filter(Boolean).join('<br>');

  const { htmlContent, textContent } = correo({
    titulo: 'Tienes una tarea nueva',
    saludo: persona.nombre,
    resumen: `${quien?.nombre || 'Alguien'} te ha asignado «${tarea.title}»`,
    bloques: [
      parrafo(`${esc(quien?.nombre || 'Alguien del equipo')} te ha asignado esta tarea en el tablero:`),
      nota(`<strong>${esc(tarea.title)}</strong><br>${datos}`),
      boton({ texto: 'Abrir la tarea', url: enlace(`tareas?id=${tarea.id}`) }),
    ],
    apagar: { texto: 'Recibes este aviso porque te han asignado una tarea.' },
  });
  return { asunto: `Tarea asignada: ${tarea.title}`, htmlContent, textContent };
}

export async function enviarCorreoAsignada({ persona, tarea, quien }) {
  const c = armarCorreoAsignada({ persona, tarea, quien });
  return sendEmail({
    to: [{ email: persona.email, name: persona.nombre }],
    subject: c.asunto,
    htmlContent: c.htmlContent,
    textContent: c.textContent,
    tags: ['tareas', 'tarea-asignada'],
    // Por tarea y persona: reasignarla a la misma persona no repite el correo.
    clave: `${AVISO_TAREA_ASIGNADA}-${tarea.id}-${persona.id}`,
  });
}

/** El correo de cada mañana: lo que vence hoy y lo vencido. */
export function armarCorreoDelDia({ persona, tareas, hoy = new Date() }) {
  const inicioHoy = new Date(hoy);
  inicioHoy.setHours(0, 0, 0, 0);
  const vencidas = tareas.filter((t) => new Date(t.due_date) < inicioHoy);
  const deHoy = tareas.filter((t) => new Date(t.due_date) >= inicioHoy);

  const linea = (t) => `<li style="margin:0 0 6px"><a href="${esc(enlace(`tareas?id=${t.id}`))}">${esc(t.title)}</a>`
    + ` · ${esc(ESTADOS[t.status] || t.status)}`
    + ` · vence el ${esc(fechaCorta(t.due_date))}</li>`;
  const lista = (ts) => parrafo(`<ul style="padding-left:18px;margin:0">${ts.map(linea).join('')}</ul>`);

  const { htmlContent, textContent } = correo({
    titulo: 'Tus tareas de hoy',
    saludo: persona.nombre,
    resumen: `${deHoy.length} para hoy y ${vencidas.length} ${vencidas.length === 1 ? 'vencida' : 'vencidas'}`,
    bloques: [
      deHoy.length ? seccion(`Vencen hoy (${deHoy.length})`) : null,
      deHoy.length ? lista(deHoy) : null,
      vencidas.length ? seccion(`Vencidas (${vencidas.length})`) : null,
      vencidas.length ? lista(vencidas) : null,
      boton({ texto: 'Ir a mi tablero', url: enlace('tareas') }),
    ],
    apagar: { texto: 'Recibes este resumen porque tienes tareas para hoy o vencidas.' },
  });

  const n = (k, uno, varios) => `${k} ${k === 1 ? uno : varios}`;
  const asunto = vencidas.length
    ? `Tus tareas de hoy: ${deHoy.length} para hoy, ${n(vencidas.length, 'vencida', 'vencidas')}`
    : `Tus tareas de hoy: ${deHoy.length}`;
  return { asunto, htmlContent, textContent };
}
