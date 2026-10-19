import { AppError } from '../../shared/utils/AppError.js';
import { logger } from '../../shared/utils/logger.js';
import * as model from './certifex.model.js';
import { certifex, recorrer } from './certifex.cliente.js';
import { programasPara, datosDeCandidato, tieneEdicion } from './certifex.programa.js';
import { alcanceDe, exigirMatriculas } from './certifex.alcance.js';
import { firmasParaEmitir } from './certifex.firma.js';

/**
 * EMITIR CON EL PROGRAMA DEL CRM, desde cualquier pestaña (#272).
 *
 * Lo usan «Aprobar y emitir» y «Emitir» de Diplomas y el «Emitir» de la pestaña antigua
 * Certificaciones/Emisiones: una misma matricula se imprime igual la emita quien la
 * emita y desde donde la emita.
 *
 * Aqui no hay modo laxo. Si la base del CRM no contesta, se para ANTES de llamar a
 * Certifex (ni /decisiones ni /emitir): un diploma no se borra, y emitirlo con lo de
 * Moodle porque la base se cayo un momento seria imprimir lo que no era.
 */

/**
 * Lo que hace falta para buscar el programa de cada matricula: primero lo que guardo el
 * CRM al recibir la solicitud (con lo revisado a mano); lo que falte, de Certifex (lo
 * mas reciente primero). Si de una matricula el CRM solo tiene lo revisado (fila a
 * medias, sin campus), lo de Certifex se completa SIN perder lo revisado.
 *
 * Lanza si la base no contesta.
 */
export async function datosPara(ids) {
  let datos;
  try {
    datos = await model.datosDeSolicitudes(ids);
  } catch (e) {
    logger.warn({ err: e.message }, 'Certifex: no se pudieron leer las solicitudes guardadas');
    throw new AppError('No se pudieron leer las solicitudes guardadas en el CRM: no se ha aprobado ni emitido nada. Prueba de nuevo en un momento.', 503, 'CRM_NO_CONTESTA');
  }
  const faltan = new Set(ids.filter((id) => !datos.get(id)?.centro));
  if (faltan.size) {
    const r = await recorrer('/candidatos', { estado: 'todas' }, {
      filtro: (c) => faltan.has(c.matriculaId),
      completo: (hallados) => hallados.length >= faltan.size,
    });
    for (const c of r.filas) {
      const guardada = datos.get(c.matriculaId);
      const edicion = tieneEdicion(guardada)
        ? { emailCrm: guardada.emailCrm, productoId: guardada.productoId, programaEditado: guardada.programaEditado }
        : c.edicion;
      datos.set(c.matriculaId, datosDeCandidato({ ...c, edicion }));
    }
    // Lo que ni el CRM ni Certifex saben de que campus es, no se usa: «no encontrada».
    for (const id of faltan) if (!datos.get(id)?.centro) datos.delete(id);
  }
  return datos;
}

/**
 * Antes de decidir o emitir nada: los datos y el programa de cada matricula, en modo
 * estricto (lanza si el CRM no contesta). `bloqueadas`: las que tienen algo revisado a
 * mano y aun asi no sale programa. Esas NO se aprueban ni se emiten: alguien quiso
 * otra cosa que lo de Moodle, y caer a Moodle en silencio seria perder lo revisado.
 */
export async function prepararEmision(ids) {
  const datos = await datosPara(ids);
  const programas = await programasPara(ids.map((id) => datos.get(id)).filter(Boolean), { estricto: true });
  const bloqueadas = new Map();
  for (const id of ids) {
    const p = programas.get(id);
    if (tieneEdicion(datos.get(id)) && !p?.programa) {
      bloqueadas.set(id, `No se ha emitido: tiene datos revisados a mano y con ellos no sale el programa (${p?.motivo || 'sin motivo'}). Revísalo con «Editar».`);
    }
  }
  // La firma del alumno (CRM #349), como el programa: si la base no contesta, no se emite
  // nada (un diploma no se borra, y saldría sin la firma que sí tenía).
  let firmas;
  try {
    firmas = await firmasParaEmitir(ids.map((id) => datos.get(id)).filter(Boolean));
  } catch (e) {
    logger.warn({ err: e.message }, 'Certifex: no se pudo mirar la firma del alumno');
    throw new AppError('No se pudo mirar la firma del alumno en el CRM: no se ha aprobado ni emitido nada. Prueba de nuevo en un momento.', 503, 'CRM_NO_CONTESTA');
  }
  return { datos, programas, bloqueadas, firmas };
}

/**
 * Emite con el programa oficial de la formacion vendida, si se encuentra sin dudas. Lo
 * que no lo tiene (y no se reviso a mano) se emite igual, con lo de Moodle, y se marca
 * con `sinPrograma`. Las bloqueadas vuelven con `fase: 'emitir_bloqueado'` sin llegar a
 * Certifex.
 *
 * Devuelve los resultados por matricula y, si la llamada entera fallo, el error tal cual
 * (con su codigo HTTP) para quien quiera relanzarlo.
 */
export async function emitirConPrograma(emitidaPor, ids, { programas, bloqueadas, firmas = new Map() }) {
  const porId = new Map();
  for (const id of ids) {
    if (bloqueadas.has(id)) porId.set(id, { matriculaId: id, ok: false, fase: 'emitir_bloqueado', error: bloqueadas.get(id) });
  }
  const aEmitir = ids.filter((id) => !bloqueadas.has(id));
  if (!aEmitir.length) return { porId, error: null };
  // `firmaAlumno` (data:image/png;base64): la firma sobre «El interesado». Un Certifex que
  // aún no la conoce la ignora, y el diploma sale con el nombre impreso, como antes.
  const items = aEmitir.map((matriculaId) => {
    const p = programas.get(matriculaId)?.programa;
    const firma = firmas.get(matriculaId);
    return { matriculaId, ...(p ? { programa: p } : {}), ...(firma ? { firmaAlumno: firma } : {}) };
  });
  // Solo se dice que programa se mando si se emitio de verdad: con `yaExistia` (un doble
  // clic, o ya estaba emitido) el diploma es el de antes, no el de ahora.
  const marca = (r) => {
    if (!r.ok || r.yaExistia) return {};
    const p = programas.get(r.matriculaId);
    const firma = { firmaAlumno: firmas.has(r.matriculaId) };
    return p?.programa
      ? { ...firma, programa: { horas: p.programa.horas ?? null, modulos: p.programa.modulos.length, formacion: p.formacion?.nombre ?? null, ...(p.editado ? { editado: true } : {}) } }
      : { ...firma, sinPrograma: p?.motivo ?? 'No se encontró la matrícula para buscar su venta.' };
  };
  try {
    const em = await certifex('POST', '/emitir', { items, emitidaPor }, { timeoutMs: 180_000 });
    for (const r of em?.resultados ?? []) porId.set(r.matriculaId, { ...r, ...marca(r) });
    return { porId, error: null };
  } catch (e) {
    return { porId, error: e };
  }
}

/**
 * Emitir lo ya aprobado, con su programa, comprobando antes que cada matricula es de
 * los campus de quien emite. Si Certifex falla entero y no hay nada que contar, su
 * error sale tal cual (mismo codigo y mensaje).
 */
export async function emitirMatriculas(user, ids) {
  const alcance = await alcanceDe(user);
  const preparado = await prepararEmision(ids);
  exigirMatriculas(alcance, ids, (id) => preparado.datos.get(id)?.centro);
  const { porId, error } = await emitirConPrograma(user.email, ids, preparado);
  if (error && porId.size === 0) throw error;
  return ids.map((matriculaId) => porId.get(matriculaId) ?? { matriculaId, ok: false, error: error?.message || 'Certifex no contestó por esta matrícula' });
}
