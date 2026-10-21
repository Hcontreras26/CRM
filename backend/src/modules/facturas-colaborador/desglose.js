import { AppError } from '../../shared/utils/AppError.js';
import { conceptoSugerido } from './facturas.emails.js';

/*
  El desglose de una factura (#202, segunda parte, «Añadido 01/10 (tarde)»).

  · Fijo: el mismo importe cada mes. El desglose es una línea, ya rellena.
  · Por hora: las horas del mes por su tarifa (18 h × 22 €/h = 396 €).
  · Por proyecto (por horas): una línea por encargo, con el encargo, el
    proyecto o campus, las horas, la tarifa y el importe. La suma de las
    líneas da la base.

  El CRM añade el IVA y resta la retención de IRPF, según la ficha del
  colaborador. El total sirve para sugerirle el importe y la base, para
  compararla con lo acordado. Ya NO decide si la factura cuadra: desde la
  corrección de Diego del 13/10 («el monto es que coincida el PDF y lo que se
  escribió de factura ahí»), cuadra cuando el total del PDF es el importe
  escrito. Eso lo mira importePdf.js.

  La tarifa es la de su ficha: el colaborador no la cambia. Todo se calcula
  aquí, en el servidor; lo que calcule la pantalla es solo para enseñarlo.
*/

const MAX_LINEAS = 30;
// Todo en céntimos enteros: con decimales, 16,275 € salía 16,27 (el medio céntimo se
// redondeaba hacia abajo) y el total sugerido no era el de su factura.
/** A centésimas enteras: 7,5 → 750; 21,7 → 2170 (horas, tarifas, importes y porcentajes). */
const aCentesimas = (n) => Math.round(Number(n) * 100);
/** a × b, los dos en centésimas, al céntimo; el medio céntimo, hacia arriba. */
const por = (aC, bC) => Math.round((aC * bC) / 100);
/** El porcentaje (en centésimas) de una cantidad en céntimos, al céntimo. */
const porciento = (baseC, pctC) => Math.round((baseC * pctC) / 10000);

const MAL = (mensaje) => new AppError(mensaje, 400, 'VALIDATION_ERROR');

/**
 * Horas tal como las escribe la persona («7,5», «7.5»): número con dos decimales, o error.
 * Sin separador de miles (como en el importe, «0.500» serían 500 horas) y sin redondear
 * a escondidas («7,335» no es «7,33»).
 */
function horasDe(texto, donde) {
  if (texto === undefined || texto === null || String(texto).trim() === '') {
    throw MAL(`Escribe las horas${donde}`);
  }
  const t = String(texto).trim();
  if (!/^\d+([.,]\d{1,2})?$/.test(t)) throw MAL(`Horas inválidas${donde}: con dos decimales como mucho`);
  const n = Number(t.replace(',', '.'));
  if (n <= 0) throw MAL(`Horas inválidas${donde}: tienen que ser más de 0`);
  if (n > 744) throw MAL(`Horas inválidas${donde}: como mucho 744 (las de un mes entero)`);
  return aCentesimas(n);
}

// Lo que cabe en NUMERIC(12, 2): una tarifa alta por muchas horas no puede romper al guardar.
const MAX_IMPORTE_C = 999_999_999_999;

/** Las líneas que manda la pantalla (texto JSON, porque llega por multipart). */
function lineasDe(texto) {
  let lista;
  try { lista = JSON.parse(texto || '[]'); } catch { throw MAL('El desglose no se pudo leer'); }
  // «Encargo», como en la pantalla («Encargo 1», «Añadir encargo»), y no «línea».
  if (!Array.isArray(lista) || !lista.length) throw MAL('Añade al menos un encargo al desglose');
  if (lista.length > MAX_LINEAS) throw MAL(`Como mucho ${MAX_LINEAS} encargos`);
  return lista;
}

/**
 * Calcula el desglose de una factura.
 *   cobro:   { modalidad, importe_fijo, tarifa_hora, iva_pct, irpf_pct } de su ficha
 *   area, periodo: para el concepto de la línea de fijo y de horas
 *   entrada: { horas, lineas } tal como llegan del formulario
 *   campus:  ids de los campus de la empresa de la factura (los que se pueden elegir)
 * Devuelve null si su ficha no tiene modalidad (como en la primera parte).
 */
export function calcularDesglose({ cobro, area, periodo, entrada = {}, campus = [] }) {
  if (!cobro?.modalidad) return null;
  const tarifaC = cobro.tarifa_hora === null || cobro.tarifa_hora === undefined ? null : aCentesimas(cobro.tarifa_hora);
  const tarifa = tarifaC === null ? null : tarifaC / 100;
  const concepto = conceptoSugerido(area, periodo);
  let lineas;

  if (cobro.modalidad === 'fijo') {
    lineas = [{ orden: 1, concepto, project_id: null, horasC: null, tarifa: null, importeC: aCentesimas(cobro.importe_fijo) }];
  } else if (cobro.modalidad === 'hora') {
    const horasC = horasDe(entrada.horas, '');
    lineas = [{ orden: 1, concepto, project_id: null, horasC, tarifa, importeC: por(horasC, tarifaC) }];
  } else {
    lineas = lineasDe(entrada.lineas).map((l, i) => {
      const donde = ` en el encargo ${i + 1}`;
      const texto = String(l?.concepto ?? '').trim();
      if (!texto) throw MAL(`Escribe qué hiciste${donde}`);
      if (texto.length > 200) throw MAL(`El texto del encargo ${i + 1} es demasiado largo`);
      // El proyecto es opcional; si llega, tiene que ser un campus de la empresa de la factura.
      const projectId = l?.project_id === null || l?.project_id === undefined || l?.project_id === '' ? null : Number(l.project_id);
      if (projectId !== null && !campus.includes(projectId)) throw MAL(`Ese campus no es de esta empresa${donde}`);
      const horasC = horasDe(l?.horas, donde);
      return { orden: i + 1, concepto: texto, project_id: projectId, horasC, tarifa, importeC: por(horasC, tarifaC) };
    });
  }

  const baseC = lineas.reduce((s, l) => s + l.importeC, 0);
  const ivaC = porciento(baseC, aCentesimas(cobro.iva_pct));
  const irpfC = porciento(baseC, aCentesimas(cobro.irpf_pct));
  if (baseC + ivaC > MAX_IMPORTE_C) throw MAL('El importe del desglose es demasiado grande');
  const conHoras = lineas.filter((l) => l.horasC !== null);
  return {
    lineas: lineas.map(({ horasC, importeC, ...l }) => ({ ...l, horas: horasC === null ? null : horasC / 100, importe: importeC / 100 })),
    base: baseC / 100,
    iva: ivaC / 100,
    irpf: irpfC / 100,
    total: (baseC + ivaC - irpfC) / 100,
    horas: conHoras.length ? conHoras.reduce((s, l) => s + l.horasC, 0) / 100 : null,
  };
}
