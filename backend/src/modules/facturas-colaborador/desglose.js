import { AppError } from '../../shared/utils/AppError.js';
import { normalizarImporte } from './facturas-colaborador.validation.js';
import { conceptoSugerido } from './facturas.emails.js';

/*
  El desglose de una factura (#202, segunda parte, «Añadido 01/10 (tarde)»).

  · Fijo: el mismo importe cada mes. El desglose es una línea, ya rellena.
  · Por hora: las horas del mes por su tarifa (18 h × 22 €/h = 396 €).
  · Por proyecto (por horas): una línea por encargo, con el encargo, el
    proyecto o campus, las horas, la tarifa y el importe. La suma de las
    líneas da la base.

  El CRM añade el IVA y resta la retención de IRPF, según la ficha del
  colaborador, y compara el resultado con el total de su factura. Si no
  cuadra, se avisa y se deja enviar: la factura queda marcada «No cuadra».

  La tarifa es la de su ficha: el colaborador no la cambia. Todo se calcula
  aquí, en el servidor; lo que calcule la pantalla es solo para enseñarlo.
*/

const MAX_LINEAS = 30;
const centimos = (n) => Math.round(n * 100) / 100;

const MAL = (mensaje) => new AppError(mensaje, 400, 'VALIDATION_ERROR');

/** Horas tal como las escribe la persona («7,5», «7.5»): número con dos decimales, o error. */
function horasDe(texto, donde) {
  if (texto === undefined || texto === null || String(texto).trim() === '') {
    throw MAL(`Escribe las horas${donde}`);
  }
  const n = Number(normalizarImporte(texto));
  if (!Number.isFinite(n) || n <= 0 || n > 744) throw MAL(`Horas inválidas${donde}`);
  return centimos(n);
}

/** Las líneas que manda la pantalla (texto JSON, porque llega por multipart). */
function lineasDe(texto) {
  let lista;
  try { lista = JSON.parse(texto || '[]'); } catch { throw MAL('El desglose no se pudo leer'); }
  if (!Array.isArray(lista) || !lista.length) throw MAL('Añade al menos una línea al desglose');
  if (lista.length > MAX_LINEAS) throw MAL(`Como mucho ${MAX_LINEAS} líneas`);
  return lista;
}

/**
 * Calcula el desglose de una factura.
 *   cobro:   { modalidad, importe_fijo, tarifa_hora, iva_pct, irpf_pct } de su ficha
 *   area, periodo: para el concepto de la línea de fijo y de horas
 *   entrada: { horas, lineas } tal como llegan del formulario
 *   campus:  ids de proyecto que se pueden elegir en una línea
 * Devuelve null si su ficha no tiene modalidad (como en la primera parte).
 */
export function calcularDesglose({ cobro, area, periodo, entrada = {}, campus = [] }) {
  if (!cobro?.modalidad) return null;
  const tarifa = cobro.tarifa_hora === null || cobro.tarifa_hora === undefined ? null : Number(cobro.tarifa_hora);
  const concepto = conceptoSugerido(area, periodo);
  let lineas;

  if (cobro.modalidad === 'fijo') {
    lineas = [{ orden: 1, concepto, project_id: null, horas: null, tarifa: null, importe: centimos(Number(cobro.importe_fijo)) }];
  } else if (cobro.modalidad === 'hora') {
    const horas = horasDe(entrada.horas, '');
    lineas = [{ orden: 1, concepto, project_id: null, horas, tarifa, importe: centimos(horas * tarifa) }];
  } else {
    lineas = lineasDe(entrada.lineas).map((l, i) => {
      const donde = ` en la línea ${i + 1}`;
      const texto = String(l?.concepto ?? '').trim();
      if (!texto) throw MAL(`Escribe el encargo${donde}`);
      if (texto.length > 200) throw MAL(`El encargo${donde} es demasiado largo`);
      // El proyecto es opcional; si llega, tiene que ser un campus del CRM.
      const projectId = l?.project_id === null || l?.project_id === undefined || l?.project_id === '' ? null : Number(l.project_id);
      if (projectId !== null && !campus.includes(projectId)) throw MAL(`Ese campus no existe${donde}`);
      const horas = horasDe(l?.horas, donde);
      return { orden: i + 1, concepto: texto, project_id: projectId, horas, tarifa, importe: centimos(horas * tarifa) };
    });
  }

  const base = centimos(lineas.reduce((s, l) => s + l.importe, 0));
  const iva = centimos(base * Number(cobro.iva_pct) / 100);
  const irpf = centimos(base * Number(cobro.irpf_pct) / 100);
  const conHoras = lineas.filter((l) => l.horas !== null);
  return {
    lineas,
    base,
    iva,
    irpf,
    total: centimos(base + iva - irpf),
    horas: conHoras.length ? centimos(conHoras.reduce((s, l) => s + l.horas, 0)) : null,
  };
}

/** ¿Cuadra el total de su factura con el del desglose? (al céntimo) */
export const cuadra = (importe, desglose) => Math.abs(Number(importe) - desglose.total) < 0.005;
