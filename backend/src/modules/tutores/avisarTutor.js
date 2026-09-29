import { query } from '../../shared/config/db.js';
import { sendEmail } from '../../shared/services/brevo.service.js';
import { renderTemplate } from '../email-templates/email-templates.service.js';
import { comisiones, resumenComisiones } from './tutor.model.js';
import { AppError } from '../../shared/utils/AppError.js';
import { NO_ESCRIBIR_A_TUTORES } from '../../shared/config/frenoTutores.js';

/**
 * «Avisar tutor»: el correo mensual de comisiones. Diego, 14/09:
 *
 *     «En el apartado de comisiones necesito un apartado que sea "Avisar
 *      tutor", que envie un correo desde facturacion@cediaidsl.com. El punto es
 *      que yo de un clic pueda avisar y cambie el status a "avisado". La
 *      plantilla por definir — es decir que sea editable.»
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DONDE SALE CADA NUMERO
 *
 * De `comisiones()` y `resumenComisiones()`, que son las MISMAS que pinta el
 * panel. Si el correo dijera una cifra y la pantalla otra, no habria forma de
 * saber cual vale — y la que se queda el tutor es la del correo.
 *
 * Se manda lo PENDIENTE del mes, no todo lo generado: es por lo que tiene que
 * facturar. Pedirle factura por algo que ya se le pago es como se hacen las
 * facturas que hay que devolver.
 *
 * LA CUENTA VA DENTRO, Y ESO NO ES ADORNO
 *
 * El documento es tajante: decirle «mandame tu factura +IVA -Retencion» sin
 * darle el numero es justo lo que provoca las facturas mal hechas. Asi que el
 * correo lleva la resta hecha.
 *
 * El redondeo es POR LINEA, no al final: con 17,82 el IVA sale 3,7422 y la
 * retencion 2,673; redondeando al final el total se va un centimo y el tutor
 * factura otra cosa.
 *
 * Y el 15 % es UNA SUPOSICION. Hay profesionales con el 7 % de los primeros
 * años. Por eso el aviso de que cada uno aplica la suya sale siempre, y no como
 * nota al pie escondida.
 */

/** Los dos porcentajes, en un solo sitio. */
export const IVA_PCT = 21;
export const RETENCION_PCT = 15;

/**
 * El remitente. Es una cuenta de Hostinger, y tiene que estar VERIFICADA EN
 * BREVO o los correos no salen — y no salen en silencio, que es lo peor.
 * Configurable para no tener que tocar codigo el dia que cambie.
 */
const REMITENTE = process.env.AVISO_TUTOR_FROM || 'facturacion@cediaidsl.com';
const REMITENTE_NOMBRE = process.env.AVISO_TUTOR_FROM_NAME || 'Facturación CEDIA';

const PLANTILLA = 'Avisar tutor · comisiones del mes';

const eur = (v) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })
  .format(Number(v) || 0);

const dosDecimales = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Comision + IVA − retencion, redondeando CADA LINEA. */
export function cuentaAFacturar(comision) {
  const base = dosDecimales(comision);
  const iva = dosDecimales(base * (IVA_PCT / 100));
  const retencion = dosDecimales(base * (RETENCION_PCT / 100));
  return { base, iva, retencion, total: dosDecimales(base + iva - retencion) };
}

/** «2026-08» → «agosto de 2026». */
export function mesEnLetra(periodo) {
  const [a, m] = String(periodo || '').split('-');
  const nombres = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const nombre = nombres[Number(m) - 1];
  return nombre ? `${nombre} de ${a}` : String(periodo || '');
}

/** Lo que va a salir en el correo, sin mandarlo. Es lo que pinta la vista previa. */
export async function datosDelAviso({ tutorId, periodo }) {
  const resumen = (await resumenComisiones({ periodo, tutorId }))
    .find((r) => Number(r.tutor_id) === Number(tutorId));
  if (!resumen) throw new AppError('Ese tutor no tiene comisiones en ese mes.', 404, 'SIN_COMISIONES');
  if (!resumen.tutor_email) {
    throw new AppError(`${resumen.tutor} no tiene correo en su ficha.`, 400, 'SIN_CORREO');
  }

  const pendiente = Number(resumen.pendiente) || 0;
  if (pendiente <= 0) {
    throw new AppError('No hay nada pendiente que reclamar en ese mes.', 400, 'NADA_PENDIENTE');
  }

  // Las formaciones, sin repetir: si cobro tres veces del mismo curso, el tutor
  // no necesita verlo tres veces — necesita saber de que curso viene.
  const lineas = await comisiones({ periodo, tutorId, estado: 'pendiente' });
  const formaciones = [...new Set(lineas.map((l) => l.formacion).filter(Boolean))];

  return {
    tutorId: Number(tutorId),
    nombre: resumen.tutor,
    email: resumen.tutor_email,
    tieneIban: Boolean(resumen.tutor_iban),
    periodo,
    mes: mesEnLetra(periodo),
    pendiente,
    formaciones,
    cuenta: cuentaAFacturar(pendiente),
  };
}

/**
 * La cuenta, con aspecto de factura.
 *
 * Es lo que evita las facturas mal hechas: el tutor copia estas cuatro lineas
 * en la suya. Por eso se parece a una factura y no a un parrafo — se lee de un
 * vistazo y se distingue del texto que la rodea.
 *
 * TODO EL ESTILO VA EN LINEA, y las separaciones con `border` de celda en vez
 * de con clases: Gmail borra las hojas de estilo y Outlook ignora la mitad de
 * lo que no sea una tabla. Una tabla con estilos en linea es lo unico que se ve
 * igual en todos los lectores de correo.
 */
export function tablaDeLaCuenta({ base, iva, retencion, total }) {
  const GRIS = '#e4e4e7';
  const celda = 'padding:9px 14px;font-size:14px';
  const fila = (rotulo, valor, o = {}) => `<tr${o.fondo ? ` style="background:${o.fondo}"` : ''}>`
    + `<td style="${celda};border-top:1px solid ${GRIS};color:${o.color || '#3f3f46'}">`
    + `${o.fuerte ? `<strong>${rotulo}</strong>` : rotulo}</td>`
    + `<td style="${celda};border-top:1px solid ${GRIS};text-align:right;white-space:nowrap;`
    + `font-variant-numeric:tabular-nums;color:${o.color || '#18181b'}">`
    + `${o.fuerte ? `<strong>${valor}</strong>` : valor}</td></tr>`;

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:14px 0;width:100%;max-width:420px;border:1px solid ${GRIS};border-radius:6px">
    <tr style="background:#fafafa">
      <th align="left" style="${celda};font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#71717a;font-weight:600">Concepto</th>
      <th align="right" style="${celda};font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#71717a;font-weight:600">Importe</th>
    </tr>
    ${fila('Comisión del mes', eur(base))}
    ${fila(`IVA ${IVA_PCT} %`, `+ ${eur(iva)}`)}
    ${fila(`Retención IRPF ${RETENCION_PCT} %`, `− ${eur(retencion)}`, { color: '#b91c1c' })}
    ${fila('Total a facturar', eur(total), { fuerte: true, fondo: '#fafafa' })}
  </table>
  <p style="font-size:12px;color:#71717a;margin:0 0 14px;max-width:420px">
    Comisión sujeta a IVA (${IVA_PCT} %). La retención de IRPF es orientativa:
    cada profesional aplica la suya, y el ${RETENCION_PCT} % es la más común.
  </p>`;
}

/** La plantilla comun, la que se edita desde el CRM. */
async function plantilla() {
  const { rows } = await query(
    `SELECT subject, body_html FROM email_templates
      WHERE name = $1 AND active AND project_id IS NULL LIMIT 1`,
    [PLANTILLA],
  );
  if (!rows[0]) {
    throw new AppError(
      `No existe la plantilla «${PLANTILLA}». La crea la migracion 160.`,
      500, 'SIN_PLANTILLA',
    );
  }
  return rows[0];
}

/** Lo que se va a mandar, ya con los huecos rellenos. */
/**
 * Rellena la plantilla con los datos de un tutor. Sin base y sin red: es una
 * funcion, y por eso se puede ver el correo exacto sin mandarlo ni sembrar
 * nada — que es como se revisa un texto que va a salir a un tercero.
 */
/**
 * El mismo correo, en texto plano.
 *
 * Un correo de verdad lleva las dos versiones. Mandar solo HTML es lo que hace
 * un boletin, y se nota: puntua peor en los filtros, y quien lee sin formato
 * —un movil viejo, un lector de pantalla, quien lo tiene desactivado— recibe
 * una pagina de etiquetas.
 *
 * Se saca DEL HTML ya compuesto, no de la plantilla. Asi las dos versiones
 * dicen lo mismo siempre, aunque alguien edite la plantilla desde el CRM y
 * nadie se acuerde de tocar nada mas.
 */
export function comoTexto(html) {
  const salto = String.fromCharCode(10);
  return String(html || '')
    // La tabla de la cuenta se lee «Concepto ... importe», que es como se dicta
    // por telefono. Se hace ANTES de quitar etiquetas, que es cuando aun se
    // sabe donde acababa cada celda.
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ': ')
    .replace(/<\/tr>/gi, salto)
    .replace(/<li[^>]*>/gi, `${salto}  - `)
    .replace(/<(br|\/p|\/div|\/h[1-6]|\/ul|\/table)[^>]*>/gi, salto)
    .replace(/<[^>]+>/g, '')
    // Las entidades que de verdad salen en este correo: el euro, las comillas
    // españolas, el menos de la retencion.
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .split(salto).map((l) => l.trim())
    // Tres lineas en blanco seguidas son las que dejaba el HTML, no el texto.
    .join(salto).replace(new RegExp(`${salto}{3,}`, 'g'), salto + salto)
    .trim();
}

export function componerCorreo({ datos, subject, cuerpo }) {
  const ctx = {
    mes: datos.mes,
    total: eur(datos.pendiente),
    tutor: { nombre: datos.nombre, email: datos.email },
  };
  // `formaciones` y `calculo` son HTML a proposito —una lista y una tabla— y por
  // eso NO pasan por `renderTemplate`, que escapa los valores. Bien hecho por su
  // parte: un nombre con `<` no puede romper el correo.
  //
  // Y se ponen ANTES, no despues. Despues no funcionaba: `renderTemplate`
  // sustituye TODO lo que tenga la forma `{{algo}}`, y lo que no encuentra en su
  // contexto lo deja VACIO. Asi que se llevaba por delante los dos huecos y el
  // correo salia pidiendo la factura sin decir de que formaciones ni cuanto.
  // Al ponerlos antes, lo inyectado no lleva llaves y le pasa por delante.
  const conHtml = cuerpo
    .replace('{{formaciones}}', `<ul>${datos.formaciones.map((f) => `<li>${f}</li>`).join('')}</ul>`)
    .replace('{{calculo}}', tablaDeLaCuenta(datos.cuenta));
  // El asunto sin escapar —es texto plano— y el cuerpo escapado, que es HTML.
  const html = renderTemplate(conHtml, ctx);
  return {
    asunto: renderTemplate(subject, ctx, { escapar: false }),
    html,
    texto: comoTexto(html),
  };
}

export async function previsualizar({ tutorId, periodo }) {
  const datos = await datosDelAviso({ tutorId, periodo });
  const { subject, body_html: cuerpo } = await plantilla();
  return { ...datos, ...componerCorreo({ datos, subject, cuerpo }) };
}

/**
 * Manda el correo y deja anotado cuando y quien.
 *
 * Se puede reenviar: un tutor que no contesta o que perdio el correo necesita
 * que se le vuelva a mandar, y bloquearlo obliga a salirse del CRM para eso. Lo
 * que se guarda es la ULTIMA vez.
 *
 * El aviso NO toca `estado`. Diego lo pidio como «que cambie el status a
 * avisado», pero ese campo dice donde esta el dinero —pendiente, pagada,
 * revertida— y una comision avisada sigue sin pagarse: si entrara ahi,
 * desapareceria de los «Por pagar» y el tutor se quedaria sin cobrar.
 */
/**
 * El texto retocado a mano, si lo hay.
 *
 * Se admite porque la plantilla no puede preverlo todo: un mes con una
 * devolucion, un tutor al que hay que explicarle algo, una errata. Antes habia
 * que salirse del CRM y escribirle desde el webmail — y entonces el envio no
 * quedaba anotado en ningun sitio.
 *
 * LO QUE NO SE TOCA ES A QUIEN VA. El destinatario sale del tutor, siempre, y
 * por eso esto no sirve para mandar un correo cualquiera a cualquiera: el unico
 * correo que puede salir de aqui es el de este tutor.
 */
const MAX_HTML = 200_000;

export function loRetocado({ asunto, html }) {
  const a = typeof asunto === 'string' ? asunto.trim() : '';
  const h = typeof html === 'string' ? html.trim() : '';
  if (!a && !h) return null;
  // Si se retoca, tiene que venir entero: mandar un correo con el asunto nuevo
  // y el cuerpo viejo —o al reves— es peor que no dejar retocarlo.
  if (!a || !h) {
    throw new AppError('Para mandar el aviso retocado hacen falta el asunto y el cuerpo.',
      400, 'RETOQUE_INCOMPLETO');
  }
  if (h.length > MAX_HTML) {
    throw new AppError('El cuerpo del aviso es demasiado largo.', 400, 'RETOQUE_ENORME');
  }
  return { asunto: a, html: h, texto: comoTexto(h) };
}

export async function avisar({ tutorId, periodo, userId, asunto, html }) {
  const compuesto = await previsualizar({ tutorId, periodo });
  // Lo retocado pisa al compuesto, pero solo el texto: el resto del aviso
  // —a quien, cuanto, de que formaciones— sigue saliendo de la base.
  const aviso = { ...compuesto, ...(loRetocado({ asunto, html }) || {}) };

  // El freno del 15/09. Se corta AQUI, despues de calcular el aviso, para que
  // la vista previa siga funcionando: se puede repasar lo que se le mandaria y
  // la cuenta que lleva, sin que salga nada.
  if (NO_ESCRIBIR_A_TUTORES) {
    throw new AppError(
      'Los correos a tutores estan parados. Puedes ver la vista previa, pero no se envia nada hasta que Diego lo levante.',
      423, 'CORREOS_A_TUTORES_PARADOS');
  }

  // SIN `clave`, y es la decision de poder reenviar: `sendEmail` deduplica por
  // esa clave, asi que pasarla bloquearia el segundo envio del mes. Un tutor que
  // no contesta o que perdio el correo necesita que se le vuelva a mandar.
  const r = await sendEmail({
    to: aviso.email,
    subject: aviso.asunto,
    htmlContent: aviso.html,
    textContent: aviso.texto,
    tags: ['aviso-tutor'],
    fromEmail: REMITENTE,
    fromName: REMITENTE_NOMBRE,
    // El correo le pide que CONTESTE con su factura: la respuesta tiene que
    // caer en ese buzon, y no depender de a quien responda Brevo por defecto.
    replyTo: REMITENTE,
  });

  if (!r?.sent) {
    // Cada motivo se dice con sus palabras: «no se pudo enviar» a secas manda a
    // mirar el sitio equivocado, y estos tres se arreglan en sitios distintos.
    const porque = {
      FRENO_DE_PRUEBAS: `Fuera de produccion solo salen correos a la lista blanca, y ${aviso.email} no esta en ella. Se añade en EMAIL_LISTA_BLANCA.`,
      NO_API_KEY: 'No hay clave de Brevo configurada en este entorno.',
      YA_ENVIADO: 'Brevo lo tiene por repetido.',
    }[r?.reason] || r?.motivo || r?.detalle
      || `Brevo no lo acepto desde ${REMITENTE}. Lo primero que hay que mirar es si ese remitente esta verificado alli: sin verificar, no sale y no avisa.`;
    throw new AppError(porque, 502, r?.reason || 'NO_ENVIADO');
  }

  // Queda «notificada», que es lo que pidio Diego, y ademas se anota CUANDO.
  //
  // Puede hacerse porque `notificada` sigue contando como que se le debe —lo
  // que se debe es lo que no esta pagada ni revertida—, asi que avisar a un
  // tutor ya no lo saca de «Por pagar». Antes de la 163 habria sido justo eso.
  //
  // El estado dice POR DONDE VA; `avisado_at`, CUANDO fue. No sobra ninguno: si
  // alguien lo mueve a «falta factura» a mano, la fecha del aviso se conserva.
  await query(
    `UPDATE tutor_commissions
        SET estado = 'notificada', avisado_at = NOW(), avisado_por = $3
      WHERE tutor_id = $1 AND periodo = $2 AND estado NOT IN ('pagada', 'revertida')`,
    [tutorId, periodo, userId || null],
  );

  return { enviado: true, a: aviso.email, total: aviso.cuenta.total };
}
